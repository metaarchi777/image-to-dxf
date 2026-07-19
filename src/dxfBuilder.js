/**
 * Image to DXF Builder
 * 브라우저에서 직접 실행되는 DXF 생성 로직
 * 기존 build_final_v4.py 로직을 JavaScript로 이식
 * made by KSN
 */

// 픽셀 → mm 변환 (이미지 크기 기준)
function px(pixelVal, imgWidth = 760, scaleWidth = 570) {
  return (pixelVal / imgWidth) * scaleWidth;
}

// 시계방향 호 포인트 생성 (LWPOLYLINE 근사)
function cwArcPoints(cx, cy, r, startDeg, endDeg, steps = 32) {
  const points = [];
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  let delta = endRad - startRad;
  if (delta > 0) delta -= 2 * Math.PI;
  for (let i = 0; i <= steps; i++) {
    const angle = startRad + (delta * i) / steps;
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return points;
}

// DXF 헤더 생성
function dxfHeader() {
  return `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  9\n$INSUNITS\n 70\n     4\n  0\nENDSEC\n`;
}

// DXF 레이어 테이블 생성
function dxfTables() {
  const layers = [
    { name: '4ELE', color: 7 },
    { name: '2SEC', color: 2 },
    { name: 'DIM', color: 3 },
    { name: 'TEXT', color: 7 },
    { name: 'TXT1', color: 7 },
  ];

  let table = `  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n 70\n${layers.length}\n`;
  for (const l of layers) {
    table += `  0\nLAYER\n  2\n${l.name}\n 70\n0\n 62\n${l.color}\n  6\nCONTINUOUS\n`;
  }
  table += `  0\nENDTAB\n  0\nENDSEC\n`;
  return table;
}

// LINE 엔티티
function dxfLine(x1, y1, x2, y2, layer = '4ELE') {
  return `  0\nLINE\n  8\n${layer}\n 10\n${x1.toFixed(4)}\n 20\n${y1.toFixed(4)}\n 30\n0.0\n 11\n${x2.toFixed(4)}\n 21\n${y2.toFixed(4)}\n 31\n0.0\n`;
}

// LWPOLYLINE 엔티티 (호 근사)
function dxfLwpolyline(points, layer = '2SEC', closed = false) {
  let s = `  0\nLWPOLYLINE\n  8\n${layer}\n 90\n${points.length}\n 70\n${closed ? 1 : 0}\n`;
  for (const [x, y] of points) {
    s += ` 10\n${x.toFixed(4)}\n 20\n${y.toFixed(4)}\n`;
  }
  return s;
}

// TEXT 엔티티
function dxfText(x, y, text, height = 10, layer = 'TEXT') {
  return `  0\nTEXT\n  8\n${layer}\n 10\n${x.toFixed(4)}\n 20\n${y.toFixed(4)}\n 30\n0.0\n 40\n${height.toFixed(4)}\n  1\n${text}\n`;
}

// MTEXT 엔티티
function dxfMtext(x, y, text, height = 10, layer = 'TEXT') {
  return `  0\nMTEXT\n  8\n${layer}\n 10\n${x.toFixed(4)}\n 20\n${y.toFixed(4)}\n 30\n0.0\n 40\n${height.toFixed(4)}\n  1\n${text}\n`;
}

/**
 * 기본 측정값 (철근 정착길이 도면 기준)
 * 이미지 픽셀 좌표 → mm 변환
 */
export function getDefaultMeasurements() {
  const W = 760; // 이미지 너비 픽셀
  const H = 480; // 이미지 높이 픽셀
  const SW = 570; // DXF 출력 너비 mm
  const SH = (H / W) * SW; // DXF 출력 높이 mm

  const p = (v) => px(v, W, SW);
  const py = (v) => (v / H) * SH;

  return {
    // 외곽 사각형
    outerRect: {
      x1: p(78), y1: py(120),
      x2: p(700), y2: py(420),
    },
    // 상단 철근 (2줄)
    topRebar: [
      { y: py(152), x1: p(78), x2: p(590) },
      { y: py(175), x1: p(78), x2: p(590) },
    ],
    // 하단 철근 (3줄)
    bottomRebar: [
      { y: py(359), x1: p(78), x2: p(700) },
      { y: py(366), x1: p(78), x2: p(700) },
      { y: py(382), x1: p(78), x2: p(700) },
    ],
    // 갈고리 수직 하강부
    hookVertical: {
      x: p(590), y1: py(175), y2: py(340),
    },
    // 갈고리 호 (외부/내부)
    hookArc: {
      cx: p(590), cy: py(152),
      rOuter: p(87), rInner: p(63),
      startDeg: 180, endDeg: 270, // CCW: 180→270 = 아래로 꺾임
    },
    // 스터럽 (수직 띠철근)
    stirrups: Array.from({ length: 8 }, (_, i) => ({
      x: p(370 + i * 30),
      y1: py(152),
      y2: py(382),
    })),
    // 좌측 단면 지그재그선
    leftSection: {
      x: p(110),
      y1: py(120), y2: py(420),
      zigzagY1: py(257), zigzagY2: py(290),
      zigzagAmp: p(15),
    },
    // 치수선
    dimensions: {
      ldh: { x1: p(340), x2: p(700), y: py(80), text: 'ldh' },
      threeDb: { x1: p(620), x2: p(650), y: py(440), text: '3db' },
      twoDb: { x1: p(650), x2: p(700), y: py(440), text: '2db' },
    },
    // 텍스트
    texts: [
      { x: p(150), y: py(260), text: '철근 직경', height: 12, layer: 'TXT1' },
      { x: p(185), y: py(285), text: 'db', height: 10, layer: 'TXT1' },
      { x: p(340), y: py(105), text: 'A', height: 12, layer: 'TEXT' },
      { x: p(340), y: py(450), text: 'A', height: 12, layer: 'TEXT' },
      { x: p(150), y: py(470), text: '정착길이 구간에 수직으로 둘러싼 경우', height: 11, layer: 'TEXT' },
    ],
    scaleW: SW,
    scaleH: SH,
  };
}

/**
 * 측정값으로 DXF 문자열 생성
 */
export function buildDxfFromMeasurements(m) {
  let entities = '';

  // 1. 외곽 사각형
  const r = m.outerRect;
  entities += dxfLine(r.x1, r.y1, r.x2, r.y1, '4ELE');
  entities += dxfLine(r.x2, r.y1, r.x2, r.y2, '4ELE');
  entities += dxfLine(r.x2, r.y2, r.x1, r.y2, '4ELE');
  entities += dxfLine(r.x1, r.y2, r.x1, r.y1, '4ELE');

  // 2. 상단 철근 (각 1줄 LINE)
  for (const rb of m.topRebar) {
    entities += dxfLine(rb.x1, rb.y, rb.x2, rb.y, '2SEC');
  }

  // 3. 하단 철근 (각 1줄 LINE)
  for (const rb of m.bottomRebar) {
    entities += dxfLine(rb.x1, rb.y, rb.x2, rb.y, '2SEC');
  }

  // 4. 갈고리 수직 하강부
  const hv = m.hookVertical;
  entities += dxfLine(hv.x, hv.y1, hv.x, hv.y2, '2SEC');

  // 5. 갈고리 호 (외부 + 내부) - LWPOLYLINE으로 근사
  const ha = m.hookArc;
  const outerPts = cwArcPoints(ha.cx, ha.cy, ha.rOuter, ha.startDeg, ha.endDeg, 32);
  const innerPts = cwArcPoints(ha.cx, ha.cy, ha.rInner, ha.startDeg, ha.endDeg, 32);
  entities += dxfLwpolyline(outerPts, '2SEC');
  entities += dxfLwpolyline(innerPts, '2SEC');

  // 6. 스터럽
  for (const st of m.stirrups) {
    entities += dxfLine(st.x, st.y1, st.x, st.y2, '2SEC');
  }

  // 7. 좌측 단면 지그재그선
  const ls = m.leftSection;
  entities += dxfLine(ls.x, ls.y1, ls.x, ls.zigzagY1, '4ELE');
  // 지그재그 부분
  const zigzagPts = [
    [ls.x, ls.zigzagY1],
    [ls.x - ls.zigzagAmp, ls.zigzagY1 + (ls.zigzagY2 - ls.zigzagY1) * 0.25],
    [ls.x + ls.zigzagAmp, ls.zigzagY1 + (ls.zigzagY2 - ls.zigzagY1) * 0.5],
    [ls.x - ls.zigzagAmp, ls.zigzagY1 + (ls.zigzagY2 - ls.zigzagY1) * 0.75],
    [ls.x, ls.zigzagY2],
  ];
  entities += dxfLwpolyline(zigzagPts, '4ELE');
  entities += dxfLine(ls.x, ls.zigzagY2, ls.x, ls.y2, '4ELE');

  // 8. 치수선
  const dim = m.dimensions;
  // ldh
  entities += dxfLine(dim.ldh.x1, dim.ldh.y, dim.ldh.x2, dim.ldh.y, 'DIM');
  entities += dxfLine(dim.ldh.x1, dim.ldh.y - 5, dim.ldh.x1, dim.ldh.y + 5, 'DIM');
  entities += dxfLine(dim.ldh.x2, dim.ldh.y - 5, dim.ldh.x2, dim.ldh.y + 5, 'DIM');
  entities += dxfText((dim.ldh.x1 + dim.ldh.x2) / 2, dim.ldh.y + 8, dim.ldh.text, 12, 'DIM');
  // 3db
  entities += dxfLine(dim.threeDb.x1, dim.threeDb.y, dim.threeDb.x2, dim.threeDb.y, 'DIM');
  entities += dxfText((dim.threeDb.x1 + dim.threeDb.x2) / 2 - 8, dim.threeDb.y + 8, dim.threeDb.text, 9, 'DIM');
  // 2db
  entities += dxfLine(dim.twoDb.x1, dim.twoDb.y, dim.twoDb.x2, dim.twoDb.y, 'DIM');
  entities += dxfText((dim.twoDb.x1 + dim.twoDb.x2) / 2 - 5, dim.twoDb.y + 8, dim.twoDb.text, 9, 'DIM');

  // 9. 텍스트
  for (const t of m.texts) {
    entities += dxfText(t.x, t.y, t.text, t.height || 10, t.layer || 'TEXT');
  }

  // DXF 조립
  return (
    dxfHeader() +
    dxfTables() +
    `  0\nSECTION\n  2\nENTITIES\n` +
    entities +
    `  0\nENDSEC\n  0\nEOF\n`
  );
}

/**
 * 이미지에서 DXF 생성 (기본 측정값 사용)
 * LLM 없이 순수 클라이언트에서 동작
 */
export function generateDxfFromImage(fileName) {
  const measurements = getDefaultMeasurements();
  const dxfContent = buildDxfFromMeasurements(measurements);
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return {
    content: dxfContent,
    fileName: `${baseName}.dxf`,
  };
}
