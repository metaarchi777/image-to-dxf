/**
 * Image to DXF Builder
 * 브라우저에서 직접 실행되는 DXF 생성 로직
 * DXF R12(AC1009) 형식으로 생성 — AutoCAD, LibreCAD, DraftSight 등에서 호환성 최대화
 * (R12는 핸들/서브클래스 마커가 필요 없어 가장 널리 읽히는 형식)
 * made by KSN
 */

// 픽셀 → mm 변환 (이미지 크기 기준)
function px(pixelVal, imgWidth = 760, scaleWidth = 570) {
  return (pixelVal / imgWidth) * scaleWidth;
}

// 시계방향 호 포인트 생성 (POLYLINE 근사)
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

/**
 * 비ASCII 문자(한글 등)를 \U+XXXX 형태로 인코딩
 * → DXF 파일이 순수 ASCII가 되어 코드페이지와 무관하게
 *   AutoCAD/LibreCAD에서 한글이 깨지지 않음
 */
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

// DXF 헤더 (R12 최소 구성)
function dxfHeader() {
  return `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  0\nENDSEC\n`;
}

// DXF 테이블 (LTYPE + LAYER)
// LTYPE 테이블에 CONTINUOUS를 정의해야 레이어에서 참조 시 오류가 나지 않음
function dxfTables() {
  const layers = [
    { name: '4ELE', color: 7 },
    { name: '2SEC', color: 2 },
    { name: 'DIM', color: 3 },
    { name: 'TEXT', color: 7 },
    { name: 'TXT1', color: 7 },
  ];

  let s = `  0\nSECTION\n  2\nTABLES\n`;

  // LTYPE 테이블
  s += `  0\nTABLE\n  2\nLTYPE\n 70\n1\n`;
  s += `  0\nLTYPE\n  2\nCONTINUOUS\n 70\n64\n  3\nSolid line\n 72\n65\n 73\n0\n 40\n0.0\n`;
  s += `  0\nENDTAB\n`;

  // LAYER 테이블
  s += `  0\nTABLE\n  2\nLAYER\n 70\n${layers.length}\n`;
  for (const l of layers) {
    s += `  0\nLAYER\n  2\n${l.name}\n 70\n64\n 62\n${l.color}\n  6\nCONTINUOUS\n`;
  }
  s += `  0\nENDTAB\n`;

  s += `  0\nENDSEC\n`;
  return s;
}

// LINE 엔티티
function dxfLine(x1, y1, x2, y2, layer = '4ELE') {
  return `  0\nLINE\n  8\n${layer}\n 10\n${x1.toFixed(4)}\n 20\n${y1.toFixed(4)}\n 30\n0.0\n 11\n${x2.toFixed(4)}\n 21\n${y2.toFixed(4)}\n 31\n0.0\n`;
}

// POLYLINE 엔티티 (R12 클래식 폴리라인: POLYLINE + VERTEX... + SEQEND)
function dxfPolyline(points, layer = '2SEC', closed = false) {
  let s = `  0\nPOLYLINE\n  8\n${layer}\n 66\n1\n 70\n${closed ? 1 : 0}\n 10\n0.0\n 20\n0.0\n 30\n0.0\n`;
  for (const [x, y] of points) {
    s += `  0\nVERTEX\n  8\n${layer}\n 10\n${x.toFixed(4)}\n 20\n${y.toFixed(4)}\n 30\n0.0\n`;
  }
  s += `  0\nSEQEND\n  8\n${layer}\n`;
  return s;
}

// TEXT 엔티티
function dxfText(x, y, text, height = 10, layer = 'TEXT') {
  return `  0\nTEXT\n  8\n${layer}\n 10\n${x.toFixed(4)}\n 20\n${y.toFixed(4)}\n 30\n0.0\n 40\n${height.toFixed(4)}\n  1\n${encodeDxfText(text)}\n`;
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
 * 이미지 픽셀 좌표는 y가 아래로 증가하지만 DXF는 y가 위로 증가하므로,
 * 최종 출력 시 y축을 반전(F)하여 이미지와 동일한 방향으로 도면이 생성되게 함
 */
export function buildDxfFromMeasurements(m) {
  let entities = '';

  // y축 반전: 픽셀 좌표계(아래 방향) → DXF 좌표계(위 방향)
  const F = (y) => m.scaleH - y;
  const line = (x1, y1, x2, y2, layer) => dxfLine(x1, F(y1), x2, F(y2), layer);
  const poly = (pts, layer) => dxfPolyline(pts.map(([x, y]) => [x, F(y)]), layer);
  const text = (x, y, t, h, layer) => dxfText(x, F(y), t, h, layer);

  // 1. 외곽 사각형
  const r = m.outerRect;
  entities += line(r.x1, r.y1, r.x2, r.y1, '4ELE');
  entities += line(r.x2, r.y1, r.x2, r.y2, '4ELE');
  entities += line(r.x2, r.y2, r.x1, r.y2, '4ELE');
  entities += line(r.x1, r.y2, r.x1, r.y1, '4ELE');

  // 2. 상단 철근 (각 1줄 LINE)
  for (const rb of m.topRebar) {
    entities += line(rb.x1, rb.y, rb.x2, rb.y, '2SEC');
  }

  // 3. 하단 철근 (각 1줄 LINE)
  for (const rb of m.bottomRebar) {
    entities += line(rb.x1, rb.y, rb.x2, rb.y, '2SEC');
  }

  // 4. 갈고리 수직 하강부
  const hv = m.hookVertical;
  entities += line(hv.x, hv.y1, hv.x, hv.y2, '2SEC');

  // 5. 갈고리 호 (외부 + 내부) - POLYLINE으로 근사
  //    (호 포인트는 픽셀 좌표계에서 생성 후 일괄 y반전 → 형태 유지)
  const ha = m.hookArc;
  const outerPts = cwArcPoints(ha.cx, ha.cy, ha.rOuter, ha.startDeg, ha.endDeg, 32);
  const innerPts = cwArcPoints(ha.cx, ha.cy, ha.rInner, ha.startDeg, ha.endDeg, 32);
  entities += poly(outerPts, '2SEC');
  entities += poly(innerPts, '2SEC');

  // 6. 스터럽
  for (const st of m.stirrups) {
    entities += line(st.x, st.y1, st.x, st.y2, '2SEC');
  }

  // 7. 좌측 단면 지그재그선
  const ls = m.leftSection;
  entities += line(ls.x, ls.y1, ls.x, ls.zigzagY1, '4ELE');
  // 지그재그 부분
  const zigzagPts = [
    [ls.x, ls.zigzagY1],
    [ls.x - ls.zigzagAmp, ls.zigzagY1 + (ls.zigzagY2 - ls.zigzagY1) * 0.25],
    [ls.x + ls.zigzagAmp, ls.zigzagY1 + (ls.zigzagY2 - ls.zigzagY1) * 0.5],
    [ls.x - ls.zigzagAmp, ls.zigzagY1 + (ls.zigzagY2 - ls.zigzagY1) * 0.75],
    [ls.x, ls.zigzagY2],
  ];
  entities += poly(zigzagPts, '4ELE');
  entities += line(ls.x, ls.zigzagY2, ls.x, ls.y2, '4ELE');

  // 8. 치수선
  const dim = m.dimensions;
  // ldh
  entities += line(dim.ldh.x1, dim.ldh.y, dim.ldh.x2, dim.ldh.y, 'DIM');
  entities += line(dim.ldh.x1, dim.ldh.y - 5, dim.ldh.x1, dim.ldh.y + 5, 'DIM');
  entities += line(dim.ldh.x2, dim.ldh.y - 5, dim.ldh.x2, dim.ldh.y + 5, 'DIM');
  entities += text((dim.ldh.x1 + dim.ldh.x2) / 2, dim.ldh.y + 8, dim.ldh.text, 12, 'DIM');
  // 3db
  entities += line(dim.threeDb.x1, dim.threeDb.y, dim.threeDb.x2, dim.threeDb.y, 'DIM');
  entities += text((dim.threeDb.x1 + dim.threeDb.x2) / 2 - 8, dim.threeDb.y + 8, dim.threeDb.text, 9, 'DIM');
  // 2db
  entities += line(dim.twoDb.x1, dim.twoDb.y, dim.twoDb.x2, dim.twoDb.y, 'DIM');
  entities += text((dim.twoDb.x1 + dim.twoDb.x2) / 2 - 5, dim.twoDb.y + 8, dim.twoDb.text, 9, 'DIM');

  // 9. 텍스트
  for (const t of m.texts) {
    entities += text(t.x, t.y, t.text, t.height || 10, t.layer || 'TEXT');
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
