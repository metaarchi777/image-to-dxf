/**
 * DXF Builder - 이미지 측정값으로 DXF 파일 생성
 * build_final_v4.py 로직을 Node.js로 이식
 */
import { DxfWriter, point3d } from '@tarikjabiri/dxf';

// ── 픽셀 → mm 변환 ────────────────────────────────────────────
// 이미지 크기: 851×537px, 도면 박스: 약 600×295px → 1px ≈ 0.5mm
const SCALE = 0.5;

function px(pixelVal, imgH = 537, boxBottom = 417) {
  // Y축 반전: 이미지 좌상단 기준 → DXF 좌하단 기준
  return (boxBottom - pixelVal) * SCALE;
}

function pxX(pixelVal, boxLeft = 110) {
  return (pixelVal - boxLeft) * SCALE;
}

// ── 기본 측정값 (원본 이미지 픽셀 좌표) ──────────────────────
export function getDefaultMeasurements() {
  return {
    imgW: 851, imgH: 537,
    // 외곽 박스
    boxLeft: 110, boxRight: 720, boxTop: 122, boxBottom: 417,
    // 상단 철근 (2줄)
    topRebarTop: 152, topRebarBot: 175,
    // 하단 철근 (3줄)
    botRebarTop: 359, botRebarMid: 366, botRebarBot: 382,
    // 갈고리
    hookHorizEnd: 679, hookVertX: 582, hookBottom: 315,
    // 스터럽 8쌍
    stirrups: [
      [462, 476], [476, 490], [490, 504], [504, 518],
      [518, 532], [532, 546], [546, 560], [560, 574],
    ],
    // 좌측 단면선
    sectionLineX: 110,
    zzLeft: 90, zzRight: 130,
    zzTop: 245, zzBottom: 290, zzMidY: 267,
    // 치수선
    dimTopY: 100, dimArrowA_X: 400, dimArrowB_X: 679,
    dim3db_X1: 490, dim3db_X2: 546,
    dim2db_X1: 546, dim2db_X2: 582,
    secLineX: 400,
  };
}

// ── LLM 응답 파싱 ─────────────────────────────────────────────
export function parseLlmMeasurements(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const required = [
    'imgW','imgH','boxLeft','boxRight','boxTop','boxBottom',
    'topRebarTop','topRebarBot','botRebarTop','botRebarMid','botRebarBot',
    'hookHorizEnd','hookVertX','hookBottom','stirrups',
    'sectionLineX','zzLeft','zzRight','zzTop','zzBottom','zzMidY',
  ];
  for (const f of required) {
    if (raw[f] === undefined) {
      console.log(`[parseLlmMeasurements] Missing field: ${f}`);
      return null;
    }
  }
  return raw;
}

// ── 갈고리 호 포인트 생성 (90→180도 CCW) ─────────────────────
function hookArcPoints(cx, cy, r, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const angleDeg = 90 + (90 * i / n);
    const angle = angleDeg * Math.PI / 180;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts;
}

// ── DXF 문자열 직접 생성 ──────────────────────────────────────
function addLine(lines, layer, x1, y1, x2, y2) {
  lines.push(`  0\nLINE\n  8\n${layer}\n 10\n${x1.toFixed(4)}\n 20\n${y1.toFixed(4)}\n 30\n0.0\n 11\n${x2.toFixed(4)}\n 21\n${y2.toFixed(4)}\n 31\n0.0`);
}

function addText(lines, layer, x, y, height, text) {
  lines.push(`  0\nTEXT\n  8\n${layer}\n 10\n${x.toFixed(4)}\n 20\n${y.toFixed(4)}\n 30\n0.0\n 40\n${height.toFixed(4)}\n  1\n${text}`);
}

function addPolyline(lines, layer, pts) {
  const ptLines = pts.map(([x, y]) => ` 10\n${x.toFixed(4)}\n 20\n${y.toFixed(4)}\n 30\n0.0000`).join('\n 70\n0\n');
  lines.push(`  0\nLWPOLYLINE\n  8\n${layer}\n 90\n${pts.length}\n 70\n0\n${ptLines}\n 70\n0`);
}

// ── 메인 DXF 빌더 ─────────────────────────────────────────────
export function buildDxfFromMeasurements(m) {
  const entities = [];

  // 좌표 변환 헬퍼
  const X = (px_) => pxX(px_, m.boxLeft);
  const Y = (px_) => (m.boxBottom - px_) * SCALE;

  const BL = X(m.boxLeft);   // 0
  const BR = X(m.boxRight);
  const BB = Y(m.boxBottom); // 0
  const BT = Y(m.boxTop);

  // ── 1. 외곽 박스 (4ELE) ──
  addLine(entities, '4ELE', BL, BB, BR, BB);
  addLine(entities, '4ELE', BR, BB, BR, BT);
  addLine(entities, '4ELE', BR, BT, BL, BT);
  addLine(entities, '4ELE', BL, BT, BL, BB);

  // ── 2. 좌측 단면 지그재그 (2SEC) ──
  const ZL = X(m.zzLeft);
  const ZR = X(m.zzRight);
  const ZT = Y(m.zzTop);
  const ZB = Y(m.zzBottom);
  const ZM = Y(m.zzMidY);
  const SX = X(m.sectionLineX);

  // 단면선 위아래 수직
  addLine(entities, '2SEC', SX, BT, SX, ZT);
  addLine(entities, '2SEC', SX, ZB, SX, BB);
  // 지그재그
  addLine(entities, '2SEC', SX, ZT, ZR, Y((m.zzTop + m.zzMidY) / 2));
  addLine(entities, '2SEC', ZR, Y((m.zzTop + m.zzMidY) / 2), ZL, ZM);
  addLine(entities, '2SEC', ZL, ZM, ZR, Y((m.zzMidY + m.zzBottom) / 2));
  addLine(entities, '2SEC', ZR, Y((m.zzMidY + m.zzBottom) / 2), SX, ZB);

  // ── 3. 상단 철근 2줄 (2SEC) ──
  const Y_TOP1 = Y(m.topRebarTop);
  const Y_TOP2 = Y(m.topRebarBot);
  const HH_X   = X(m.hookHorizEnd);
  const HV_X   = X(m.hookVertX);

  addLine(entities, '2SEC', BL, Y_TOP1, HH_X, Y_TOP1);
  addLine(entities, '2SEC', BL, Y_TOP2, HH_X, Y_TOP2);

  // ── 4. 갈고리 (2SEC) ──
  // 외부 호: 중심 = (HH_X, Y_TOP1 - R_out), R_out
  const R_OUT = (HH_X - HV_X);
  const R_IN  = R_OUT * 0.73;
  const HC_Y  = Y_TOP1 - R_OUT;

  // 외부 호 (90→180 CCW)
  const outerPts = hookArcPoints(HH_X, HC_Y, R_OUT);
  addPolyline(entities, '2SEC', outerPts);

  // 내부 호
  const innerPts = hookArcPoints(HH_X, HC_Y, R_IN);
  addPolyline(entities, '2SEC', innerPts);

  // 갈고리 수직 하강
  const hookBotY = Y(m.hookBottom);
  addLine(entities, '2SEC', HH_X - R_OUT, HC_Y, HH_X - R_OUT, hookBotY);
  addLine(entities, '2SEC', HH_X - R_IN,  HC_Y, HH_X - R_IN,  hookBotY);
  // 갈고리 하단 수평
  addLine(entities, '2SEC', HH_X - R_OUT, hookBotY, HH_X - R_IN, hookBotY);

  // ── 5. 하단 철근 3줄 (2SEC) ──
  const Y_BOT1 = Y(m.botRebarTop);
  const Y_BOT2 = Y(m.botRebarMid);
  const Y_BOT3 = Y(m.botRebarBot);

  addLine(entities, '2SEC', BL, Y_BOT1, BR, Y_BOT1);
  addLine(entities, '2SEC', BL, Y_BOT2, BR, Y_BOT2);
  addLine(entities, '2SEC', BL, Y_BOT3, BR, Y_BOT3);

  // ── 6. 스터럽 (2SEC) ──
  for (const [x1px, x2px] of m.stirrups) {
    const SX1 = X(x1px);
    const SX2 = X(x2px);
    // 좌측 수직선
    addLine(entities, '2SEC', SX1, Y_TOP1, SX1, Y_BOT3);
    // 우측 수직선
    addLine(entities, '2SEC', SX2, Y_TOP1, SX2, Y_BOT3);
  }

  // ── 7. 치수선 (DIM) ──
  const DIM_Y  = Y(m.dimTopY);
  const DIM_AX = X(m.dimArrowA_X);
  const DIM_BX = X(m.dimArrowB_X);
  const SEC_X  = X(m.secLineX);

  // l_dh 치수선
  addLine(entities, 'DIM', DIM_AX, DIM_Y, DIM_BX, DIM_Y);
  addLine(entities, 'DIM', DIM_AX, DIM_Y + 3, DIM_AX, DIM_Y - 3);
  addLine(entities, 'DIM', DIM_BX, DIM_Y + 3, DIM_BX, DIM_Y - 3);
  addLine(entities, 'DIM', DIM_AX, DIM_Y, DIM_AX, BT + 5);
  addLine(entities, 'DIM', DIM_BX, DIM_Y, DIM_BX, BT + 5);

  // A-A 단면 위치선
  addLine(entities, 'DIM', SEC_X, BT + 5, SEC_X, BT + 20);
  addLine(entities, 'DIM', SEC_X, BB - 5, SEC_X, BB - 20);

  // 3db, 2db 치수선
  const D3X1 = X(m.dim3db_X1);
  const D3X2 = X(m.dim3db_X2);
  const D2X1 = X(m.dim2db_X1);
  const D2X2 = X(m.dim2db_X2);
  const DIM_BOT = BB - 15;

  addLine(entities, 'DIM', D3X1, DIM_BOT, D3X2, DIM_BOT);
  addLine(entities, 'DIM', D3X1, DIM_BOT + 3, D3X1, DIM_BOT - 3);
  addLine(entities, 'DIM', D3X2, DIM_BOT + 3, D3X2, DIM_BOT - 3);

  addLine(entities, 'DIM', D2X1, DIM_BOT - 8, D2X2, DIM_BOT - 8);
  addLine(entities, 'DIM', D2X1, DIM_BOT - 5, D2X1, DIM_BOT - 11);
  addLine(entities, 'DIM', D2X2, DIM_BOT - 5, D2X2, DIM_BOT - 11);

  // ── 8. 텍스트 (TEXT) ──
  const midDimX = (DIM_AX + DIM_BX) / 2;
  addText(entities, 'TEXT', midDimX - 5, DIM_Y + 5, 8, 'l_dh');
  addText(entities, 'TEXT', SEC_X - 3, BT + 22, 7, 'A');
  addText(entities, 'TEXT', SEC_X - 3, BB - 25, 7, 'A');
  addText(entities, 'TEXT', (D3X1 + D3X2) / 2 - 5, DIM_BOT - 10, 6, '3d_b');
  addText(entities, 'TEXT', (D2X1 + D2X2) / 2 - 5, DIM_BOT - 22, 6, '2d_b');

  // 철근 직경 지시선
  const dotX = BL + 15;
  const dotY = Y_TOP1;
  addLine(entities, 'TXT1', dotX, dotY, dotX + 30, dotY - 20);
  addLine(entities, 'TXT1', dotX + 30, dotY - 20, dotX + 80, dotY - 20);
  addText(entities, 'TEXT', dotX + 5, dotY - 18, 6, '철근 직경');
  addText(entities, 'TEXT', dotX + 20, dotY - 28, 6, 'd_b');

  // 제목
  addText(entities, 'TEXT', BL, BB - 40, 9, '정착길이 구간에 수직으로 둘러싼 경우');

  // ── DXF 파일 조립 ──
  const header = `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  9\n$INSUNITS\n 70\n4\n  0\nENDSEC\n`;
  const layers = [
    `  0\nLAYER\n  2\n4ELE\n 62\n4\n  6\nCONTINUOUS`,
    `  0\nLAYER\n  2\n2SEC\n 62\n2\n  6\nCONTINUOUS`,
    `  0\nLAYER\n  2\nDIM\n 62\n1\n  6\nCONTINUOUS`,
    `  0\nLAYER\n  2\nTXT1\n 62\n3\n  6\nCONTINUOUS`,
    `  0\nLAYER\n  2\nTEXT\n 62\n3\n  6\nCONTINUOUS`,
  ].join('\n');
  const tables = `  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n${layers}\n  0\nENDTAB\n  0\nENDSEC\n`;
  const entSection = `  0\nSECTION\n  2\nENTITIES\n${entities.join('\n')}\n  0\nENDSEC\n  0\nEOF`;

  return header + tables + entSection;
}
