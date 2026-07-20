/**
 * Text Recognizer (OCR, v2 - 다중 패스)
 * Tesseract.js(웹어셈블리)로 이미지 속 문자를 인식하여
 * DXF의 진짜 TEXT 엔티티로 변환할 수 있게 하는 모듈
 *
 * 다중 패스 구성 (숫자·세로 문자 정확도 개선):
 *  1) kor+eng 패스: 한글 라벨 인식
 *  2) eng 전용 패스: 숫자·영문 인식 (한글 모델 간섭으로 인한 숫자 오독 방지)
 *  3) 90° 회전 2방향 패스(eng): 세로로 쓰인 치수 숫자 인식
 *  → 결과를 지능적으로 병합 (한글 라인 우선, 숫자는 eng 우선, 회전은 빈 영역만)
 *
 * 라이브러리/모델은 CDN에서 로드, 실패 시 빈 결과 반환(형상 추적만 수행)
 * made by KSN
 */

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let libPromise = null;
let workerPromise = null;

function loadLib() {
  if (typeof window !== 'undefined' && window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_CDN;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => { libPromise = null; reject(new Error('Tesseract.js 로드 실패')); };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

async function getWorker() {
  const T = await loadLib();
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await T.createWorker(['kor', 'eng']);
      return worker;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

const hasContent = (t) => /[0-9A-Za-z\uAC00-\uD7A3]/.test(t);
const hasHangul = (t) => /[\uAC00-\uD7A3]/.test(t);

// ============================================================
// 라인 정제: 신뢰도 필터 → 간격 기반 결합 (순수 함수, 테스트 가능)
// ============================================================
export function refineLines(lines, imageHeight, minConf = 75) {
  const out = [];
  for (const line of lines || []) {
    const kept = (line.words || []).filter((w) => {
      const t = (w.text || '').trim();
      return t && hasContent(t) && (w.confidence ?? 0) >= minConf;
    });
    if (!kept.length) continue;
    kept.sort((a, b) => a.bbox.x0 - b.bbox.x0);

    // 간격 기반 공백 결합 (한글 음절끼리는 간격이 커도 붙임)
    const isHangul = (c) => /[\uAC00-\uD7A3]/.test(c);
    let text = kept[0].text.trim();
    for (let i = 1; i < kept.length; i++) {
      const prevWord = kept[i - 1].text.trim();
      const curWord = kept[i].text.trim();
      const prev = kept[i - 1].bbox, cur = kept[i].bbox;
      const gap = cur.x0 - prev.x1;
      const hh = Math.max(prev.y1 - prev.y0, cur.y1 - cur.y0);
      const bothHangul = isHangul(prevWord[prevWord.length - 1]) && isHangul(curWord[0]);
      const spaceGap = bothHangul ? 0.7 * hh : 0.25 * hh;
      text += (gap > spaceGap ? ' ' : '') + curWord;
    }

    const x0 = Math.min(...kept.map((w) => w.bbox.x0));
    const y0 = Math.min(...kept.map((w) => w.bbox.y0));
    const x1 = Math.max(...kept.map((w) => w.bbox.x1));
    const y1 = Math.max(...kept.map((w) => w.bbox.y1));
    const h = y1 - y0;
    if (h < 8 || h > imageHeight * 0.12) continue; // 비정상 크기 배제

    out.push({ text, x0, y0, x1, y1, rot: 0, wordBoxes: kept.map((w) => ({ ...w.bbox })) });
  }
  return out;
}

// ============================================================
// 회전 패스 결과 처리 (순수 함수)
// ============================================================

// 숫자 위주 라인만 통과 (회전 패스의 도형 오인식 차단)
const DIGIT_LINE = /^[0-9][0-9 .,xX×@()+\-/]*$/;
export function filterDigitLines(refined) {
  return refined.filter((t) => DIGIT_LINE.test(t.text.trim()));
}

// 회전 이미지에서의 좌표 → 원본 좌표 복원
// dir 'cw': 시계방향 회전 이미지에서 인식됨 = 원본에서 아래→위로 쓰인 글자 (DXF 회전 90°)
// dir 'ccw': 반시계 회전 이미지에서 인식됨 = 원본에서 위→아래로 쓰인 글자 (DXF 회전 270°)
export function unrotateLines(refined, W, H, dir) {
  const map = (b) => dir === 'cw'
    ? { x0: b.y0, x1: b.y1, y0: H - b.x1, y1: H - b.x0 }
    : { x0: W - b.y1, x1: W - b.y0, y0: b.x0, y1: b.x1 };
  return refined.map((t) => ({
    text: t.text,
    ...map(t),
    rot: dir === 'cw' ? 90 : 270,
    wordBoxes: t.wordBoxes.map(map),
  }));
}

// ============================================================
// 패스 병합 (순수 함수)
// 우선순위: 한글 라인 > eng 숫자·영문 > kor의 ASCII 라인 > 회전 숫자
// ============================================================
function overlapFrac(a, b) {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  const areaA = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
  const areaB = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
  return inter / Math.min(areaA, areaB);
}

export function mergeRecognitionResults({ korLines = [], engLines = [], cwLines = [], ccwLines = [] }) {
  const final = [];
  const addIfFree = (t) => {
    if (!final.some((f) => overlapFrac(f, t) > 0.4)) final.push(t);
  };
  // 1) 한글 포함 라인 (kor 패스, 최우선)
  for (const t of korLines) if (hasHangul(t.text)) final.push(t);
  // 2) eng 패스 (숫자·영문 정확)
  for (const t of engLines) addIfFree(t);
  // 3) kor 패스의 ASCII 라인 (eng가 못 잡은 것만)
  for (const t of korLines) if (!hasHangul(t.text)) addIfFree(t);
  // 4) 세로(회전) 숫자
  for (const t of cwLines) addIfFree(t);
  for (const t of ccwLines) addIfFree(t);
  return final;
}

// ============================================================
// 브라우저: 캔버스 회전
// ============================================================
function rotateCanvas(src, deg) {
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext('2d');
  if (deg === 90) {           // 시계방향
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
  } else {                    // 반시계방향
    ctx.translate(0, c.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(src, 0, 0);
  return c;
}

// ============================================================
// 메인: 캔버스에서 다중 패스 문자 인식 실행
// 실패(네트워크·미지원 등) 시 빈 배열 반환 → 형상 추적만 진행
// ============================================================
export async function recognizeText(canvas, opts = {}) {
  try {
    const worker = await getWorker();
    const minConf = opts.minConf ?? 75;
    const W = canvas.width, H = canvas.height;

    const runPass = async (langs, cv) => {
      await worker.reinitialize(langs);
      await worker.setParameters({ tessedit_pageseg_mode: '11' }); // 흩어진 텍스트
      const { data } = await worker.recognize(cv);
      return refineLines(data.lines, cv.height, minConf);
    };

    const korLines = await runPass('kor+eng', canvas);
    const engLines = await runPass('eng', canvas);
    const cwLines = unrotateLines(filterDigitLines(await runPass('eng', rotateCanvas(canvas, 90))), W, H, 'cw');
    const ccwLines = unrotateLines(filterDigitLines(await runPass('eng', rotateCanvas(canvas, -90))), W, H, 'ccw');

    return mergeRecognitionResults({ korLines, engLines, cwLines, ccwLines });
  } catch (e) {
    console.warn('문자 인식을 사용할 수 없어 형상 추적만 수행합니다:', e);
    return [];
  }
}
