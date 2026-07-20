/**
 * Image Vectorizer (v2 - 고품질)
 * 업로드된 이미지를 분석하여 CAD 품질의 벡터 경로를 추출하는 엔진
 *
 * 파이프라인:
 *  1) 그레이스케일 + 3x3 블러 → Bradley 적응형 이진화 (조명 불균일에 강함)
 *  2) 미세 노이즈 성분 제거 (despeckle)
 *  3) Zhang-Suen 세선화 (1px 스켈레톤)
 *  4) 경로 추적 (끝점/분기점 기반)
 *  5) 잔가지(spur) 제거 + 교차점 클러스터링 (십자 교차를 한 점으로)
 *  6) 방향 연속성 기반 경로 병합 (교차로 쪼개진 긴 선 복원)
 *  7) 최소제곱 직선 적합 + 모서리 교점 계산 (곧은 선, 또렷한 꼭짓점)
 *  8) 수평/수직 스냅
 *
 * 순수 JavaScript로 브라우저에서 직접 동작 (서버 불필요)
 * made by KSN
 */

// ============================================================
// 1. 이진화: Bradley 적응형 임계값 (적분 이미지 기반)
// ============================================================
export function binarize(rgba, w, h) {
  const n = w * h;

  // 그레이스케일
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    gray[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0;
  }

  // 극성 감지: 어두운 픽셀이 절반 이상이면 '밝은 선/어두운 배경'으로 보고 반전
  let darkCount = 0;
  for (let i = 0; i < n; i++) if (gray[i] < 128) darkCount++;
  if (darkCount > n * 0.5) {
    for (let i = 0; i < n; i++) gray[i] = 255 - gray[i];
  }

  // 3x3 박스 블러 (JPEG 노이즈 완화)
  const blur = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      blur[i] = ((gray[i - w - 1] + gray[i - w] + gray[i - w + 1] +
                  gray[i - 1] + gray[i] + gray[i + 1] +
                  gray[i + w - 1] + gray[i + w] + gray[i + w + 1]) / 9) | 0;
    }
  }

  // 적분 이미지
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += blur[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }

  // Bradley: 픽셀이 주변 평균보다 충분히 어두우면 선
  // 비교는 블러 전 '원본' 픽셀로 수행 (블러는 주변 평균 계산에만 사용)
  // → 밝기가 옅은 1px 선도 희석되지 않고 안정적으로 검출됨
  const s = Math.max(8, (Math.min(w, h) / 8) | 0); // 윈도 반경
  const t = 0.85;                                   // 평균 대비 임계 비율
  const bin = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - s), y2 = Math.min(h - 1, y + s);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - s), x2 = Math.min(w - 1, x + s);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)] - integral[y1 * (w + 1) + (x2 + 1)] -
                  integral[(y2 + 1) * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
      if (gray[y * w + x] * count < sum * t) bin[y * w + x] = 1;
    }
  }

  // 테두리 1px 제거
  for (let x = 0; x < w; x++) { bin[x] = 0; bin[(h - 1) * w + x] = 0; }
  for (let y = 0; y < h; y++) { bin[y * w] = 0; bin[y * w + w - 1] = 0; }

  return bin;
}

// ============================================================
// 2. 미세 성분 제거 (연결 요소 면적 < minArea 삭제)
// ============================================================
export function despeckle(bin, w, h, minArea = 12) {
  const n = w * h;
  const labeled = new Uint8Array(n); // 방문 여부
  const stack = [];
  const comp = [];

  for (let i = 0; i < n; i++) {
    if (!bin[i] || labeled[i]) continue;
    comp.length = 0;
    stack.push(i);
    labeled[i] = 1;
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      const cx = c % w, cy = (c / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (bin[ni] && !labeled[ni]) { labeled[ni] = 1; stack.push(ni); }
        }
      }
    }
    if (comp.length < minArea) {
      for (const c of comp) bin[c] = 0;
    }
  }
  return bin;
}

// ============================================================
// 3. Zhang-Suen 세선화 → 1px 스켈레톤
// ============================================================
export function thin(bin, w, h) {
  const img = new Uint8Array(bin);
  const toDelete = [];
  let changed = true;
  let guard = 0;

  const pass = (sub) => {
    toDelete.length = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!img[i]) continue;
        const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1];
        const p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        let A = 0;
        if (!p2 && p3) A++; if (!p3 && p4) A++; if (!p4 && p5) A++; if (!p5 && p6) A++;
        if (!p6 && p7) A++; if (!p7 && p8) A++; if (!p8 && p9) A++; if (!p9 && p2) A++;
        if (A !== 1) continue;
        if (sub === 1) {
          if (p2 * p4 * p6 !== 0) continue;
          if (p4 * p6 * p8 !== 0) continue;
        } else {
          if (p2 * p4 * p8 !== 0) continue;
          if (p2 * p6 * p8 !== 0) continue;
        }
        toDelete.push(i);
      }
    }
    for (const i of toDelete) img[i] = 0;
    return toDelete.length > 0;
  };

  while (changed && guard++ < 100) {
    const c1 = pass(1);
    const c2 = pass(2);
    changed = c1 || c2;
  }
  return img;
}

// ============================================================
// 3-2. 스켈레톤 정리: Zhang-Suen이 남기는 잉여 픽셀 제거
//   - 이웃이 정확히 2개이고 그 둘이 서로 인접(8방향)하면 잉여 모서리
//   - 이웃이 정확히 3개이고 셋이 사슬로 서로 연결되어 있으면 2px 두께 잔재
//   삭제해도 연결성이 유지되는 픽셀만 순차 제거 → 깨끗한 1px 골격
// ============================================================
export function cleanupSkeleton(skel, w, h) {
  const NB = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
  const adj = (a, b) => {
    const ax = a % w, ay = (a / w) | 0, bx = b % w, by = (b / w) | 0;
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1;
  };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!skel[i]) continue;
        const nbs = [];
        for (const o of NB) if (skel[i + o]) nbs.push(i + o);
        if (nbs.length === 2) {
          if (adj(nbs[0], nbs[1])) { skel[i] = 0; changed = true; }
        } else if (nbs.length === 3) {
          // 셋이 사슬로 연결되어 있는지 (연결 그래프 검사)
          const a01 = adj(nbs[0], nbs[1]), a02 = adj(nbs[0], nbs[2]), a12 = adj(nbs[1], nbs[2]);
          const links = (a01 ? 1 : 0) + (a02 ? 1 : 0) + (a12 ? 1 : 0);
          if (links >= 2) { skel[i] = 0; changed = true; }
        }
      }
    }
  }
  return skel;
}

// ============================================================
// 4. 스켈레톤 경로 추적 (양 끝의 차수 정보 포함)
//    반환: [{ pts: [[x,y]...], degA, degB }]
// ============================================================
export function tracePaths(skel, w, h) {
  const n = w * h;
  const deg = new Uint8Array(n);
  const NB = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!skel[i]) continue;
      let d = 0;
      for (const o of NB) if (skel[i + o]) d++;
      deg[i] = d;
    }
  }

  const used = new Uint8Array(n);
  const nodeEdges = new Set();
  const items = [];
  const toXY = (i) => [i % w, (i / w) | 0];

  const walk = (start, first) => {
    const path = [toXY(start), toXY(first)];
    let prev = start, cur = first;
    while (deg[cur] === 2) {
      used[cur] = 1;
      let next = -1;
      for (const o of NB) {
        const c = cur + o;
        if (skel[c] && c !== prev) {
          if (next === -1 || !used[c]) next = c;
        }
      }
      if (next === -1) break;
      path.push(toXY(next));
      prev = cur;
      cur = next;
      if (used[cur] && deg[cur] === 2) break;
    }
    return { path, end: cur };
  };

  // 노드(deg 1 또는 3+)에서 출발
  for (let i = 0; i < n; i++) {
    if (!skel[i] || deg[i] === 2 || deg[i] === 0) continue;
    for (const o of NB) {
      const nb = i + o;
      if (!skel[nb]) continue;
      if (deg[nb] !== 2) {
        const key = i < nb ? i * n + nb : nb * n + i;
        if (!nodeEdges.has(key)) {
          nodeEdges.add(key);
          items.push({ pts: [toXY(i), toXY(nb)], degA: deg[i], degB: deg[nb] });
        }
      } else if (!used[nb]) {
        const { path, end } = walk(i, nb);
        items.push({ pts: path, degA: deg[i], degB: deg[end] || 1 });
      }
    }
  }

  // 순수 루프 (모두 deg==2)
  for (let i = 0; i < n; i++) {
    if (!skel[i] || deg[i] !== 2 || used[i]) continue;
    used[i] = 1;
    let first = -1;
    for (const o of NB) if (skel[i + o]) { first = i + o; break; }
    if (first === -1) continue;
    const { path } = walk(i, first);
    if (path.length > 2) {
      const [sx, sy] = toXY(i);
      const last = path[path.length - 1];
      if (Math.abs(last[0] - sx) <= 1 && Math.abs(last[1] - sy) <= 1) path.push([sx, sy]);
      items.push({ pts: path, degA: 2, degB: 2 });
    }
  }

  return items;
}

// ============================================================
// 유틸: 경로 길이
// ============================================================
function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return L;
}

// ============================================================
// 5-1. 잔가지(spur) 제거: 분기점에 매달린 짧은 끝가지
// ============================================================
export function pruneSpurs(items, spurLen = 7) {
  return items.filter((it) => {
    const isSpur =
      ((it.degA === 1 && it.degB >= 3) || (it.degB === 1 && it.degA >= 3)) &&
      pathLength(it.pts) < spurLen;
    return !isSpur;
  });
}

// ============================================================
// 5-2. 교차점 클러스터링: 가까운 분기점들을 한 점으로 통합
//      (십자 교차가 두 개의 Y분기로 갈라지는 현상 해결)
// ============================================================
export function clusterJunctions(items, radius = 3) {
  // 분기점 좌표 수집
  const junctions = [];
  for (const it of items) {
    if (it.degA >= 3) junctions.push(it.pts[0]);
    if (it.degB >= 3) junctions.push(it.pts[it.pts.length - 1]);
  }
  // 단순 클러스터링 (기존 클러스터 중심과 radius 이내면 편입)
  const clusters = []; // {x, y, cnt}
  const findCluster = (p) => {
    for (const c of clusters) {
      if (Math.hypot(c.x / c.cnt - p[0], c.y / c.cnt - p[1]) <= radius) return c;
    }
    return null;
  };
  for (const p of junctions) {
    const c = findCluster(p);
    if (c) { c.x += p[0]; c.y += p[1]; c.cnt++; }
    else clusters.push({ x: p[0], y: p[1], cnt: 1 });
  }
  const centroid = (p) => {
    const c = findCluster(p);
    return c ? [c.x / c.cnt, c.y / c.cnt] : p;
  };

  // 경로 끝점을 클러스터 중심으로 이동
  const out = [];
  for (const it of items) {
    const pts = it.pts.map((p) => [p[0], p[1]]);
    if (it.degA >= 3) pts[0] = centroid(pts[0]);
    if (it.degB >= 3) pts[pts.length - 1] = centroid(pts[pts.length - 1]);
    // 클러스터링으로 길이가 사라진 조각(교차점 내부 잔여물) 제거
    if (pathLength(pts) < 2.5 && it.degA >= 3 && it.degB >= 3) continue;
    out.push({ ...it, pts });
  }
  return out;
}

// ============================================================
// 6. 방향 연속성 기반 경로 병합
//    교차점에서 거의 일직선으로 이어지는 경로 쌍을 하나로 연결
// ============================================================
export function mergeContinuations(items, angleTolDeg = 35) {
  const cosTol = -Math.cos((angleTolDeg * Math.PI) / 180); // dot <= cosTol이면 직선 연속
  let paths = items.map((it) => it.pts);

  const endKey = (p) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  // 끝점에서 경로 안쪽으로 향하는 단위 방향
  const inwardDir = (pts, atStart) => {
    const a = atStart ? pts[0] : pts[pts.length - 1];
    const idx = atStart ? Math.min(4, pts.length - 1) : Math.max(0, pts.length - 5);
    const b = pts[idx];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1e-9;
    return [dx / L, dy / L];
  };

  let merged = true;
  let guard = 0;
  while (merged && guard++ < 12) {
    merged = false;
    // 끝점 맵 구성
    const map = new Map(); // key → [{i, start:bool}]
    paths.forEach((pts, i) => {
      const kA = endKey(pts[0]);
      const kB = endKey(pts[pts.length - 1]);
      if (!map.has(kA)) map.set(kA, []);
      map.get(kA).push({ i, start: true });
      if (!map.has(kB)) map.set(kB, []);
      map.get(kB).push({ i, start: false });
    });

    const consumed = new Set();
    const newPaths = [];

    for (const ends of map.values()) {
      if (ends.length < 2) continue;
      // 가장 곧게 이어지는 쌍 찾기
      let best = null, bestDot = 1;
      for (let a = 0; a < ends.length; a++) {
        for (let b = a + 1; b < ends.length; b++) {
          const ea = ends[a], eb = ends[b];
          if (ea.i === eb.i) continue;
          if (consumed.has(ea.i) || consumed.has(eb.i)) continue;
          const da = inwardDir(paths[ea.i], ea.start);
          const dbv = inwardDir(paths[eb.i], eb.start);
          const dot = da[0] * dbv[0] + da[1] * dbv[1];
          if (dot < bestDot) { bestDot = dot; best = [ea, eb]; }
        }
      }
      if (best && bestDot <= cosTol) {
        const [ea, eb] = best;
        const A = paths[ea.i], B = paths[eb.i];
        // A는 접점이 끝이 되도록, B는 접점이 시작이 되도록 정렬
        const left = ea.start ? [...A].reverse() : A;
        const right = eb.start ? B : [...B].reverse();
        newPaths.push([...left, ...right.slice(1)]);
        consumed.add(ea.i);
        consumed.add(eb.i);
        merged = true;
      }
    }

    if (merged) {
      paths.forEach((pts, i) => { if (!consumed.has(i)) newPaths.push(pts); });
      paths = newPaths;
    }
  }
  return paths;
}

// ============================================================
// 7. 최소제곱 직선 적합 + 모서리 교점 계산
//    RDP 분할 → 구간별 총최소제곱(TLS) 직선 → 인접 직선 교점을 꼭짓점으로
// ============================================================
function rdpBreaks(pts, eps) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    let maxD = -1, maxI = -1;
    if (len < 1e-6) {
      // 퇴화 현(폐곡선의 시작=끝): 시작점에서 가장 먼 점으로 분할
      for (let i = a + 1; i < b; i++) {
        const d = Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
        if (d > maxD) { maxD = d; maxI = i; }
      }
    } else {
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs(dx * (ay - pts[i][1]) - (ax - pts[i][0]) * dy) / len;
        if (d > maxD) { maxD = d; maxI = i; }
      }
    }
    if (maxD > eps) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  const idx = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) idx.push(i);
  return idx;
}

// 총최소제곱 직선: {px, py(평균점), dx, dy(단위방향)}
function tlsFit(pts, a, b) {
  let mx = 0, my = 0;
  const cnt = b - a + 1;
  for (let i = a; i <= b; i++) { mx += pts[i][0]; my += pts[i][1]; }
  mx /= cnt; my /= cnt;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = a; i <= b; i++) {
    const ux = pts[i][0] - mx, uy = pts[i][1] - my;
    sxx += ux * ux; sxy += ux * uy; syy += uy * uy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { px: mx, py: my, dx: Math.cos(theta), dy: Math.sin(theta) };
}

function projectOnLine(L, p) {
  const t = (p[0] - L.px) * L.dx + (p[1] - L.py) * L.dy;
  return [L.px + t * L.dx, L.py + t * L.dy];
}

function lineIntersect(L1, L2) {
  const det = L1.dx * L2.dy - L1.dy * L2.dx;
  if (Math.abs(det) < 1e-9) return null;
  const bx = L2.px - L1.px, by = L2.py - L1.py;
  const t = (bx * L2.dy - by * L2.dx) / det;
  return [L1.px + t * L1.dx, L1.py + t * L1.dy];
}

export function fitPath(pts, tol = 1.3) {
  if (pts.length <= 2) return pts.map((p) => [p[0], p[1]]);
  const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 1.6;
  const br = rdpBreaks(pts, tol);
  if (br.length === 2) {
    const L = tlsFit(pts, 0, pts.length - 1);
    return [projectOnLine(L, pts[0]), projectOnLine(L, pts[pts.length - 1])];
  }

  // 구간별 TLS 직선
  const lines = [];
  for (let r = 0; r < br.length - 1; r++) {
    lines.push(tlsFit(pts, br[r], br[r + 1]));
  }

  // 인접 직선의 꼭짓점 계산 (또렷한 모서리 또는 곡선 연결점)
  const cornerOf = (L1, L2, joint) => {
    const dot = Math.abs(L1.dx * L2.dx + L1.dy * L2.dy);
    const angle = Math.acos(Math.min(1, dot)) * 180 / Math.PI;
    if (angle > 12) {
      const ix = lineIntersect(L1, L2);
      if (ix && Math.hypot(ix[0] - joint[0], ix[1] - joint[1]) < 5) return ix;
    }
    const p1 = projectOnLine(L1, joint);
    const p2 = projectOnLine(L2, joint);
    return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  };

  const out = [];
  out.push(projectOnLine(lines[0], pts[0]));
  for (let r = 0; r < lines.length - 1; r++) {
    out.push(cornerOf(lines[r], lines[r + 1], pts[br[r + 1]]));
  }
  out.push(projectOnLine(lines[lines.length - 1], pts[pts.length - 1]));

  // 폐곡선이면 마지막↔첫 직선의 꼭짓점으로 양끝을 통일해 정확히 닫음
  if (closed && lines.length >= 2) {
    const v = cornerOf(lines[lines.length - 1], lines[0], pts[0]);
    out[0] = v;
    out[out.length - 1] = [v[0], v[1]];
  }
  return out;
}

// ============================================================
// 8. 수평/수직 스냅
// ============================================================
export function snapOrtho(pts, angleTolDeg = 4, minLen = 10) {
  const tol = Math.tan((angleTolDeg * Math.PI) / 180);
  const out = pts.map((p) => [p[0], p[1]]);
  for (let i = 0; i < out.length - 1; i++) {
    const dx = out[i + 1][0] - out[i][0];
    const dy = out[i + 1][1] - out[i][1];
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.hypot(dx, dy) < minLen) continue;
    if (ady <= adx * tol) {
      const y = (out[i][1] + out[i + 1][1]) / 2;
      out[i][1] = y; out[i + 1][1] = y;
    } else if (adx <= ady * tol) {
      const x = (out[i][0] + out[i + 1][0]) / 2;
      out[i][0] = x; out[i + 1][0] = x;
    }
  }
  return out;
}

// ============================================================
// 9. 전체 파이프라인 (픽셀 입력 → 벡터 경로)
// ============================================================
export function vectorizePixels(rgba, width, height, opts = {}) {
  const fitTol = opts.fitTol ?? 1.3;
  const minPathLen = opts.minPathLen ?? 6;
  const maxPoints = opts.maxPoints ?? 24000;

  const bin = binarize(rgba, width, height);
  despeckle(bin, width, height, opts.minArea ?? 12);
  const skel = thin(bin, width, height);
  cleanupSkeleton(skel, width, height);

  let items = tracePaths(skel, width, height);
  items = pruneSpurs(items, opts.spurLen ?? 7);
  items = clusterJunctions(items, opts.junctionRadius ?? 3);
  let paths = mergeContinuations(items, opts.mergeAngle ?? 35);

  // 노이즈 경로 제거
  paths = paths.filter((p) => pathLength(p) >= minPathLen);

  // 직선 적합 + 스냅
  let tol = fitTol;
  const doFit = (t) =>
    paths.map((p) => snapOrtho(fitPath(p, t))).filter((p) => pathLength(p) >= 2);
  let fitted = doFit(tol);
  let total = fitted.reduce((s, p) => s + p.length, 0);
  while (total > maxPoints && tol < 8) {
    tol *= 1.5;
    fitted = doFit(tol);
    total = fitted.reduce((s, p) => s + p.length, 0);
  }

  return { paths: fitted, width, height, pointCount: total };
}

// ============================================================
// 10. 브라우저 파일 로더 (File → 작업 해상도 캔버스)
// ============================================================
export async function loadImageToCanvas(file, opts = {}) {
  const maxDim = opts.maxDim ?? 1200;
  const bmp = await createImageBitmap(file);
  const maxSide = Math.max(bmp.width, bmp.height);

  // 큰 이미지는 축소, 작은 이미지는 확대(세부 디테일 보존: 희미한 선, 글자, 화살촉)
  let scale;
  if (maxSide > maxDim) scale = maxDim / maxSide;
  else if (maxSide < 900) scale = Math.min(2, maxDim / maxSide);
  else scale = 1;

  const w = Math.max(2, Math.round(bmp.width * scale));
  const h = Math.max(2, Math.round(bmp.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  return { canvas, ctx, width: w, height: h };
}

export async function vectorizeImageFile(file, opts = {}) {
  const { ctx, width, height } = await loadImageToCanvas(file, opts);
  const { data } = ctx.getImageData(0, 0, width, height);
  return vectorizePixels(data, width, height, opts);
}

// ============================================================
// 11. 텍스트 영역 지우기 (OCR로 인식된 글자를 래스터에서 제거)
//     각 박스를 테두리 중앙값 색으로 채워 형상 추적에서 제외
// ============================================================
export function blankRegions(rgba, w, h, boxes, pad = 3) {
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x0 - pad));
    const y0 = Math.max(0, Math.floor(b.y0 - pad));
    const x1 = Math.min(w - 1, Math.ceil(b.x1 + pad));
    const y1 = Math.min(h - 1, Math.ceil(b.y1 + pad));
    if (x1 <= x0 || y1 <= y0) continue;

    // 테두리 링에서 배경색 샘플 → 중앙값
    const rs = [], gs = [], bs = [];
    const sample = (x, y) => {
      const i = (y * w + x) * 4;
      rs.push(rgba[i]); gs.push(rgba[i + 1]); bs.push(rgba[i + 2]);
    };
    for (let x = x0; x <= x1; x += 2) { sample(x, y0); sample(x, y1); }
    for (let y = y0; y <= y1; y += 2) { sample(x0, y); sample(x1, y); }
    const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const mr = med(rs), mg = med(gs), mb = med(bs);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = mr; rgba[i + 1] = mg; rgba[i + 2] = mb; rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
}
