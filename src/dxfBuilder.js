/**
 * Image to DXF Builder
 * 브라우저에서 직접 실행되는 DXF 생성 로직
 * - DXF R12(AC1009) 형식: AutoCAD, LibreCAD, DraftSight 등에서 호환성 최대화
 * - 갈고리는 fillet 방식(두 직선에 접하는 90° 원호)의 정식 ARC 엔티티로 생성
 * - 좌표는 원본 이미지(664x607px) 실측 기반, 픽셀 좌표계(y 아래방향)로 정의
 * made by KSN
 */

// ============================================================
// 1. 기준 측정값 (철근 정착길이 표준갈고리 도면, 664x607px 실측)
// ============================================================
export function getDefaultMeasurements() {
  const W = 664;   // 원본 이미지 너비(px)
  const H = 607;   // 원본 이미지 높이(px)
  const SW = 570;  // DXF 출력 너비(mm)
  const k = SW / W;

  return {
    W, H, k,
    scaleW: SW,
    scaleH: H * k,

    // 보 외곽 (왼쪽 변은 지그재그 절단선으로 대체)
    beam: { x1: 59, y1: 206, x2: 556, y2: 395 },

    // 상단 철근 2줄 (굽힘 시작점 x=529까지)
    topRebar: [
      { y: 219.0, x1: 59, x2: 529 },
      { y: 224.5, x1: 59, x2: 529 },
    ],

    // 하단 철근 2줄
    bottomRebar: [
      { y: 376.0, x1: 59, x2: 544 },
      { y: 381.5, x1: 59, x2: 544 },
    ],

    // 갈고리: fillet 방식 90° 접원호
    // 중심 (cx, cy), 외부/내부 반경. 수평 철근과 수직 꼬리에 접함.
    hook: {
      cx: 529, cy: 233.5,
      rOuter: 14.5,   // 윗줄(y=219)과 바깥 꼬리(x=543.5)에 접함
      rInner: 9.0,    // 아랫줄(y=224.5)과 안쪽 꼬리(x=538)에 접함
      tailBottom: 315,
    },

    // 스터럽 8개 (보 상하변 사이 수직선)
    stirrups: [349, 374, 399, 423.5, 448, 473.5, 498, 523].map((x) => ({
      x, y1: 206, y2: 395,
    })),

    // 왼쪽 지그재그 절단선
    zigzag: {
      x: 59, yTop: 206, yBottom: 395,
      pts: [[59, 290], [52, 298], [67, 307], [59, 315]],
    },

    // A-A 단면선 (얇은 수직선 + 화살표 + 라벨)
    sectionLine: { x: 413, y1: 181, y2: 423 },

    // ldh 치수 (상단)
    dimLdh: {
      y: 143, x1: 347, x2: 540,
      extLeft: { x: 347, y1: 143, y2: 201 },
      extRight: { x: 544, y1: 143, y2: 179 },
      label: { x: 512, y: 138, text: 'ldh', h: 16 },
    },

    // 하단 3db / 2db 치수 (좁은 구간이라 바깥 화살표 방식)
    dimBottom: {
      lineY: 433, lineX1: 455, lineX2: 559,
      exts: [
        { x: 473, y1: 400, y2: 440 },
        { x: 499, y1: 400, y2: 426 },
        { x: 523, y1: 400, y2: 426 },
        { x: 542, y1: 400, y2: 443 },
      ],
      labels: [
        { x: 467, y: 463, text: '3db', h: 18 },
        { x: 517, y: 461, text: '2db', h: 18 },
      ],
    },

    // 철근 직경 지시선 + 라벨
    leader: { x: 128, y1: 227, y2: 256 },
    texts: [
      { x: 138, y: 264, text: '철근 직경', h: 17, layer: 'TXT1' },
      { x: 170, y: 293, text: 'db', h: 15, layer: 'TXT1' },
      { x: 380, y: 197, text: 'A', h: 17, layer: 'TEXT' },
      { x: 380, y: 431, text: 'A', h: 17, layer: 'TEXT' },
      { x: 66, y: 518, text: '정착길이 구간에 수직으로 둘러싼 경우', h: 21, layer: 'TEXT' },
    ],
  };
}

// ============================================================
// 2. 기하 요소 생성 (픽셀 좌표계, y 아래방향)
//    - lines: { x1, y1, x2, y2, layer }
//    - arcs:  { cx, cy, r, layer }  ※ 모두 우상단 사분면 fillet 호
//             (위쪽 접점 (cx, cy-r) → 오른쪽 접점 (cx+r, cy))
//    - texts: { x, y, text, h, layer }  ※ y는 베이스라인
// ============================================================
export function buildGeometry(m) {
  const lines = [];
  const arcs = [];
  const texts = [];
  const L = (x1, y1, x2, y2, layer) => lines.push({ x1, y1, x2, y2, layer });

  // --- 보 외곽 (위/오른쪽/아래 3변) ---
  const b = m.beam;
  L(b.x1, b.y1, b.x2, b.y1, '4ELE');   // 윗변
  L(b.x2, b.y1, b.x2, b.y2, '4ELE');   // 오른쪽 변
  L(b.x2, b.y2, b.x1, b.y2, '4ELE');   // 아랫변

  // --- 왼쪽 지그재그 절단선 ---
  const z = m.zigzag;
  L(z.x, z.yTop, z.x, z.pts[0][1], '4ELE');
  for (let i = 0; i < z.pts.length - 1; i++) {
    L(z.pts[i][0], z.pts[i][1], z.pts[i + 1][0], z.pts[i + 1][1], '4ELE');
  }
  L(z.x, z.pts[z.pts.length - 1][1], z.x, z.yBottom, '4ELE');

  // --- 상단/하단 철근 ---
  for (const r of m.topRebar) L(r.x1, r.y, r.x2, r.y, '2SEC');
  for (const r of m.bottomRebar) L(r.x1, r.y, r.x2, r.y, '2SEC');

  // --- 갈고리 (fillet 원호 2개 + 수직 꼬리 2줄 + 끝 마감) ---
  const h = m.hook;
  arcs.push({ cx: h.cx, cy: h.cy, r: h.rOuter, layer: '2SEC' });
  arcs.push({ cx: h.cx, cy: h.cy, r: h.rInner, layer: '2SEC' });
  L(h.cx + h.rOuter, h.cy, h.cx + h.rOuter, h.tailBottom, '2SEC'); // 바깥 꼬리
  L(h.cx + h.rInner, h.cy, h.cx + h.rInner, h.tailBottom, '2SEC'); // 안쪽 꼬리
  L(h.cx + h.rInner, h.tailBottom, h.cx + h.rOuter, h.tailBottom, '2SEC'); // 끝 마감

  // --- 스터럽 ---
  for (const s of m.stirrups) L(s.x, s.y1, s.x, s.y2, '2SEC');

  // --- A-A 단면선 + 화살표 ---
  const sl = m.sectionLine;
  L(sl.x, sl.y1, sl.x, sl.y2, 'DIM');
  // 상단 화살표 (오른쪽으로 단면선을 가리킴)
  L(399, 189, 412, 189, 'DIM');
  L(406, 186, 412, 189, 'DIM');
  L(406, 192, 412, 189, 'DIM');
  // 하단 화살표
  L(399, 423, 412, 423, 'DIM');
  L(406, 420, 412, 423, 'DIM');
  L(406, 426, 412, 423, 'DIM');

  // --- ldh 치수 ---
  const d = m.dimLdh;
  L(d.x1, d.y, d.x2, d.y, 'DIM');
  L(d.extLeft.x, d.extLeft.y1, d.extLeft.x, d.extLeft.y2, 'DIM');
  L(d.extRight.x, d.extRight.y1, d.extRight.x, d.extRight.y2, 'DIM');
  // 양끝 화살촉
  L(d.x1, d.y, d.x1 + 7, d.y - 3, 'DIM');
  L(d.x1, d.y, d.x1 + 7, d.y + 3, 'DIM');
  L(d.x2, d.y, d.x2 - 7, d.y - 3, 'DIM');
  L(d.x2, d.y, d.x2 - 7, d.y + 3, 'DIM');
  texts.push({ x: d.label.x, y: d.label.y, text: d.label.text, h: d.label.h, layer: 'DIM' });

  // --- 하단 3db / 2db 치수 (바깥 화살표 방식) ---
  const db = m.dimBottom;
  L(db.lineX1, db.lineY, db.lineX2, db.lineY, 'DIM');
  for (const e of db.exts) L(e.x, e.y1, e.x, e.y2, 'DIM');
  // 3db: 473←→499 안쪽을 가리키는 바깥 화살촉
  L(467, db.lineY - 3, 473, db.lineY, 'DIM');
  L(467, db.lineY + 3, 473, db.lineY, 'DIM');
  L(505, db.lineY - 3, 499, db.lineY, 'DIM');
  L(505, db.lineY + 3, 499, db.lineY, 'DIM');
  // 2db: 523←→542
  L(517, db.lineY - 3, 523, db.lineY, 'DIM');
  L(517, db.lineY + 3, 523, db.lineY, 'DIM');
  L(548, db.lineY - 3, 542, db.lineY, 'DIM');
  L(548, db.lineY + 3, 542, db.lineY, 'DIM');
  for (const t of db.labels) texts.push({ ...t, layer: 'DIM' });

  // --- 철근 직경 지시선 ---
  L(m.leader.x, m.leader.y1, m.leader.x, m.leader.y2, 'DIM');

  // --- 텍스트 ---
  for (const t of m.texts) texts.push({ ...t });

  return { lines, arcs, texts, W: m.W, H: m.H, k: m.k, scaleH: m.scaleH };
}

// ============================================================
// 3. DXF 문자열 생성 (R12 / AC1009)
//    픽셀 좌표 → mm 변환 + y축 반전(DXF는 y가 위로 증가)
// ============================================================

// 비ASCII 문자(한글 등)를 \U+XXXX로 인코딩 → 순수 ASCII 파일이 되어
// 코드페이지와 무관하게 AutoCAD/LibreCAD에서 한글이 깨지지 않음
function encodeDxfText(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code > 126) {
      out += '\\U+' + code.toString(16).toUpperCase().padStart(4, '0');
    } else {
      out += ch;
    }
  }
  return out;
}

function dxfHeader() {
  return `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  0\nENDSEC\n`;
}

// LTYPE 테이블에 CONTINUOUS를 정의해야 레이어 참조 시 오류가 없음
function dxfTables() {
  const layers = [
    { name: '4ELE', color: 7 },
    { name: '2SEC', color: 2 },
    { name: 'DIM', color: 3 },
    { name: 'TEXT', color: 7 },
    { name: 'TXT1', color: 7 },
  ];
  let s = `  0\nSECTION\n  2\nTABLES\n`;
  s += `  0\nTABLE\n  2\nLTYPE\n 70\n1\n`;
  s += `  0\nLTYPE\n  2\nCONTINUOUS\n 70\n64\n  3\nSolid line\n 72\n65\n 73\n0\n 40\n0.0\n`;
  s += `  0\nENDTAB\n`;
  s += `  0\nTABLE\n  2\nLAYER\n 70\n${layers.length}\n`;
  for (const l of layers) {
    s += `  0\nLAYER\n  2\n${l.name}\n 70\n64\n 62\n${l.color}\n  6\nCONTINUOUS\n`;
  }
  s += `  0\nENDTAB\n  0\nENDSEC\n`;
  return s;
}

export function geometryToDxf(geo) {
  const { k, scaleH } = geo;
  const X = (x) => (x * k).toFixed(4);
  const Y = (y) => (scaleH - y * k).toFixed(4);

  let e = '';

  for (const l of geo.lines) {
    e += `  0\nLINE\n  8\n${l.layer}\n 10\n${X(l.x1)}\n 20\n${Y(l.y1)}\n 30\n0.0\n 11\n${X(l.x2)}\n 21\n${Y(l.y2)}\n 31\n0.0\n`;
  }

  // fillet 호: 픽셀 공간 우상단 사분면 → DXF에서도 시각적으로 동일한 우상단
  // = DXF 각도 0°(오른쪽 접점) → 90°(위쪽 접점), 반시계 방향
  for (const a of geo.arcs) {
    e += `  0\nARC\n  8\n${a.layer}\n 10\n${X(a.cx)}\n 20\n${Y(a.cy)}\n 30\n0.0\n 40\n${(a.r * geo.k).toFixed(4)}\n 50\n0\n 51\n90\n`;
  }

  for (const t of geo.texts) {
    e += `  0\nTEXT\n  8\n${t.layer}\n 10\n${X(t.x)}\n 20\n${Y(t.y)}\n 30\n0.0\n 40\n${(t.h * geo.k).toFixed(4)}\n  1\n${encodeDxfText(t.text)}\n`;
  }

  return (
    dxfHeader() +
    dxfTables() +
    `  0\nSECTION\n  2\nENTITIES\n` +
    e +
    `  0\nENDSEC\n  0\nEOF\n`
  );
}

// ============================================================
// 4. SVG 미리보기 생성 (픽셀 좌표 그대로, CAD 스타일 다크 테마)
// ============================================================
const LAYER_COLORS = {
  '4ELE': '#e6edf3',
  '2SEC': '#e8d44d',
  'DIM': '#4ade80',
  'TEXT': '#e6edf3',
  'TXT1': '#e6edf3',
};

export function geometryToSvg(geo) {
  const c = (layer) => LAYER_COLORS[layer] || '#e6edf3';
  let s = `<svg viewBox="0 0 ${geo.W} ${geo.H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#0d1117">`;

  for (const l of geo.lines) {
    const w = l.layer === 'DIM' ? 1.0 : 1.4;
    s += `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${c(l.layer)}" stroke-width="${w}" stroke-linecap="round"/>`;
  }

  // fillet 호: (cx, cy-r) → (cx+r, cy), 화면 좌표계에서 시계방향(sweep=1)
  for (const a of geo.arcs) {
    s += `<path d="M ${a.cx} ${a.cy - a.r} A ${a.r} ${a.r} 0 0 1 ${a.cx + a.r} ${a.cy}" fill="none" stroke="${c(a.layer)}" stroke-width="1.4" stroke-linecap="round"/>`;
  }

  for (const t of geo.texts) {
    s += `<text x="${t.x}" y="${t.y}" fill="${c(t.layer)}" font-size="${t.h}" font-family="'Noto Sans KR','Inter',sans-serif">${t.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
  }

  s += `</svg>`;
  return s;
}

// ============================================================
// 5. 메인 진입점
// ============================================================
export function generateDxfFromImage(fileName) {
  const measurements = getDefaultMeasurements();
  const geometry = buildGeometry(measurements);
  const dxfContent = geometryToDxf(geometry);
  const svg = geometryToSvg(geometry);
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return {
    content: dxfContent,
    fileName: `${baseName}.dxf`,
    svg,
  };
}
