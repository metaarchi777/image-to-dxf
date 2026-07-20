/**
 * Text Recognizer (OCR)
 * Tesseract.js(웹어셈블리)로 이미지 속 문자를 인식하여
 * DXF의 진짜 TEXT 엔티티로 변환할 수 있게 하는 모듈
 * - 한국어(kor) + 영어(eng) 동시 인식
 * - PSM 11(흩어진 텍스트 모드): 도면 라벨에 최적
 * - 단어 신뢰도 필터(75+) → 라인 단위 그룹핑 → 간격 기반 공백 결합
 * - 라이브러리/모델은 CDN에서 로드, 실패 시 빈 결과 반환(형상 추적만 수행)
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
      await worker.setParameters({ tessedit_pageseg_mode: '11' }); // 흩어진 텍스트
      return worker;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

const hasContent = (t) => /[0-9A-Za-z\uAC00-\uD7A3]/.test(t);

/**
 * Tesseract 결과(lines→words)를 정제된 텍스트 라인으로 변환 (순수 함수, 테스트 가능)
 * @param lines  [{ words: [{ text, confidence, bbox:{x0,y0,x1,y1} }] }]
 * @returns [{ text, x0, y0, x1, y1, wordBoxes }]
 */
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

    out.push({ text, x0, y0, x1, y1, wordBoxes: kept.map((w) => ({ ...w.bbox })) });
  }
  return out;
}

/**
 * 캔버스에서 문자 인식 실행
 * 실패(네트워크·미지원 등) 시 빈 배열을 반환하여 파이프라인이 계속 진행되게 함
 */
export async function recognizeText(canvas, opts = {}) {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(canvas);
    return refineLines(data.lines, canvas.height, opts.minConf ?? 75);
  } catch (e) {
    console.warn('문자 인식을 사용할 수 없어 형상 추적만 수행합니다:', e);
    return [];
  }
}
