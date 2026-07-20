/**
 * DXF Builder
 * 이미지에서 추출한 벡터 경로를 DXF R12(AC1009) 파일로 변환
 * - R12 형식: AutoCAD, LibreCAD, DraftSight 등에서 호환성 최대화
 * - 문자 스타일 MALGUN(맑은 고딕, malgun.ttf)을 기본으로 정의
 * - 실제 변환 로직은 imageVectorizer.js가 담당하고, 이 모듈은 DXF/SVG 출력 담당
 * made by KSN
 */

import { vectorizeImageFile } from './imageVectorizer.js';

// ============================================================
// 공통: 비ASCII 문자(한글 등)를 \U+XXXX로 인코딩
// → 순수 ASCII 파일이 되어 코드페이지와 무관하게 한글이 깨지지 않음
// ============================================================
export function encodeDxfText(text) {
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

// ============================================================
// DXF 헤더 / 테이블
// ============================================================
function dxfHeader() {
  return `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  9\n$TEXTSTYLE\n  7\nMALGUN\n  0\nENDSEC\n`;
}

// LTYPE에 CONTINUOUS, STYLE에 맑은 고딕(malgun.ttf) 정의
function dxfTables() {
  let s = `  0\nSECTION\n  2\nTABLES\n`;
  s += `  0\nTABLE\n  2\nLTYPE\n 70\n1\n`;
  s += `  0\nLTYPE\n  2\nCONTINUOUS\n 70\n64\n  3\nSolid line\n 72\n65\n 73\n0\n 40\n0.0\n`;
  s += `  0\nENDTAB\n`;
  s += `  0\nTABLE\n  2\nSTYLE\n 70\n2\n`;
  s += `  0\nSTYLE\n  2\nSTANDARD\n 70\n0\n 40\n0.0\n 41\n1.0\n 50\n0.0\n 71\n0\n 42\n2.5\n  3\ntxt\n  4\n\n`;
  s += `  0\nSTYLE\n  2\nMALGUN\n 70\n0\n 40\n0.0\n 41\n1.0\n 50\n0.0\n 71\n0\n 42\n2.5\n  3\nmalgun.ttf\n  4\n\n`;
  s += `  0\nENDTAB\n`;
  s += `  0\nTABLE\n  2\nLAYER\n 70\n1\n`;
  s += `  0\nLAYER\n  2\nDRAW\n 70\n64\n 62\n7\n  6\nCONTINUOUS\n`;
  s += `  0\nENDTAB\n  0\nENDSEC\n`;
  return s;
}

// ============================================================
// 추출 경로 → 기하 구조
// 픽셀 좌표(y 아래방향) 유지, DXF 변환 시 mm 스케일 + y축 반전
// ============================================================
export function pathsToGeometry(paths, W, H, targetWidthMm = 570) {
  const k = targetWidthMm / W;
  return {
    polylines: paths.map((pts) => ({ pts, layer: 'DRAW' })),
    W, H, k,
    scaleH: H * k,
  };
}

// ============================================================
// DXF 문자열 생성 (R12)
// ============================================================
export function geometryToDxf(geo) {
  const { k, scaleH } = geo;
  const X = (x) => (x * k).toFixed(3);
  const Y = (y) => (scaleH - y * k).toFixed(3);

  let e = '';
  for (const pl of geo.polylines) {
    const pts = pl.pts;
    if (pts.length < 2) continue;
    if (pts.length === 2) {
      // 2점 경로는 LINE으로 (파일 크기 절약)
      e += `  0\nLINE\n  8\n${pl.layer}\n 10\n${X(pts[0][0])}\n 20\n${Y(pts[0][1])}\n 30\n0.0\n 11\n${X(pts[1][0])}\n 21\n${Y(pts[1][1])}\n 31\n0.0\n`;
    } else {
      // 3점 이상은 R12 클래식 POLYLINE
      e += `  0\nPOLYLINE\n  8\n${pl.layer}\n 66\n1\n 70\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n`;
      for (const [x, y] of pts) {
        e += `  0\nVERTEX\n  8\n${pl.layer}\n 10\n${X(x)}\n 20\n${Y(y)}\n 30\n0.0\n`;
      }
      e += `  0\nSEQEND\n  8\n${pl.layer}\n`;
    }
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
// SVG 미리보기 생성 (픽셀 좌표 그대로, CAD 스타일 다크 테마)
// ============================================================
export function geometryToSvg(geo) {
  let s = `<svg viewBox="0 0 ${geo.W} ${geo.H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#0d1117">`;
  for (const pl of geo.polylines) {
    const pts = pl.pts;
    if (pts.length < 2) continue;
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
    }
    s += `<path d="${d}" fill="none" stroke="#e6edf3" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  s += `</svg>`;
  return s;
}

// ============================================================
// 메인 진입점: 업로드된 이미지 파일 → DXF + 미리보기
// ============================================================
export async function generateDxfFromImage(file) {
  const { paths, width, height, pointCount } = await vectorizeImageFile(file);
  const geo = pathsToGeometry(paths, width, height);
  const baseName = (file.name || 'drawing').replace(/\.[^.]+$/, '');
  return {
    content: geometryToDxf(geo),
    fileName: `${baseName}.dxf`,
    svg: geometryToSvg(geo),
    stats: { pathCount: paths.length, pointCount },
  };
}
