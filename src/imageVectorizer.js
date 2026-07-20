/**
 * Image Vectorizer
 * 업로드된 이미지를 실제로 분석하여 벡터 경로를 추출하는 엔진
 * 파이프라인: 그레이스케일 → Otsu 이진화 → Zhang-Suen 세선화(skeleton)
 *             → 경로 추적 → RDP 단순화 → 수평/수직 스냅
 * 순수 JavaScript로 브라우저에서 직접 동작 (서버 불필요)
 * made by KSN
 */

// ============================================================
// 1. 이진화 (Otsu 자동 임계값)
// ============================================================
function otsuThreshold(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxVar = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) { maxVar = v; threshold = t; }
  }
  return threshold;
}

export function binarize(rgba, w, h) {
  const n = w * h;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const g = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0;
    gray[i] = g;
    hist[g]++;
  }
  const t = otsuThreshold(hist, n);

  const bin = new Uint8Array(n);
  let dark = 0;
  for (let i = 0; i < n; i++) {
    if (gray[i] <= t) { bin[i] = 1; dark++; }
  }
  // 어두운 픽셀이 절반을 넘으면 '밝은 선/어두운 배경' 이미지로 보고 반전
  if (dark > n * 0.5) {
    for (let i = 0; i < n; i++) bin[i] = bin[i] ? 0 : 1;
  }
  // 테두리 1px 제거 (세선화 경계 처리 단순화)
  for (let x = 0; x < w; x++) { bin[x] = 0; bin[(h - 1) * w + x] = 0; }
  for (let y = 0; y < h; y++) { bin[y * w] = 0; bin[y * w + w - 1] = 0; }
  // 고립 픽셀(노이즈) 제거
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!bin[i]) continue;
      const s = bin[i - 1] + bin[i + 1] + bin[i - w] + bin[i + w] +
                bin[i - w - 1] + bin[i - w + 1] + bin[i + w - 1] + bin[i + w + 1];
      if (s === 0) bin[i] = 0;
    }
  }
  return bin;
}

// ============================================================
// 2. Zhang-Suen 세선화 → 1px 두께 스켈레톤
// ============================================================
export function thin(bin, w, h) {
  const img = new Uint8Array(bin); // 복사
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
        // A: 시계방향 0→1 전이 횟수
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
// 3. 스켈레톤 경로 추적
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

  const used = new Uint8Array(n);       // deg==2 체인 픽셀 소비 여부
  const nodeEdges = new Set();          // 노드-노드 직접 연결 중복 방지
  const paths = [];
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
          // deg2 픽셀의 남은 이웃 (대각 중복 회피: prev와 인접한 대각 이웃 제외)
          if (next === -1 || !used[c]) next = c;
        }
      }
      if (next === -1) break;
      path.push(toXY(next));
      prev = cur;
      cur = next;
      if (used[cur] && deg[cur] === 2) break; // 안전장치
    }
    return { path, end: cur };
  };

  // 3-1. 노드(끝점 deg==1, 분기점 deg>=3)에서 출발하는 경로
  for (let i = 0; i < n; i++) {
    if (!skel[i] || deg[i] === 2 || deg[i] === 0) continue;
    for (const o of NB) {
      const nb = i + o;
      if (!skel[nb]) continue;
      if (deg[nb] !== 2) {
        // 노드-노드 직접 연결
        const key = i < nb ? i * n + nb : nb * n + i;
        if (!nodeEdges.has(key)) {
          nodeEdges.add(key);
          paths.push([toXY(i), toXY(nb)]);
        }
      } else if (!used[nb]) {
        const { path } = walk(i, nb);
        paths.push(path);
      }
    }
  }

  // 3-2. 순수 루프 (모두 deg==2인 닫힌 곡선)
  for (let i = 0; i < n; i++) {
    if (!skel[i] || deg[i] !== 2 || used[i]) continue;
    used[i] = 1;
    let first = -1;
    for (const o of NB) if (skel[i + o]) { first = i + o; break; }
    if (first === -1) continue;
    const { path, end } = walk(i, first);
    // 루프 닫기
    if (path.length > 2) {
      const [sx, sy] = toXY(i);
      const last = path[path.length - 1];
      if (Math.abs(last[0] - sx) <= 1 && Math.abs(last[1] - sy) <= 1) path.push([sx, sy]);
      paths.push(path);
    }
  }

  return paths;
}

// ============================================================
// 4. RDP 경로 단순화
// ============================================================
export function simplifyPath(pts, eps) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let maxD = -1, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dx * (ay - pts[i][1]) - (ax - pts[i][0]) * dy) / len;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

// ============================================================
// 5. 수평/수직 스냅 (CAD다운 직선 정리)
// ============================================================
export function snapOrtho(pts, angleTolDeg = 5, minLen = 12) {
  const tol = Math.tan((angleTolDeg * Math.PI) / 180);
  const out = pts.map((p) => [p[0], p[1]]);
  for (let i = 0; i < out.length - 1; i++) {
    const dx = out[i + 1][0] - out[i][0];
    const dy = out[i + 1][1] - out[i][1];
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.hypot(dx, dy) < minLen) continue;
    if (ady <= adx * tol) {
      const y = (out[i][1] + out[i + 1][1]) / 2;
      out[i][1] = y; out[i + 1][1] = y;          // 수평 스냅
    } else if (adx <= ady * tol) {
      const x = (out[i][0] + out[i + 1][0]) / 2;
      out[i][0] = x; out[i + 1][0] = x;          // 수직 스냅
    }
  }
  return out;
}

// ============================================================
// 6. 전체 파이프라인 (픽셀 입력 → 벡터 경로)
// ============================================================
export function vectorizePixels(rgba, width, height, opts = {}) {
  const eps = opts.epsilon ?? 1.6;
  const minPathLen = opts.minPathLen ?? 6;      // 이보다 짧은 경로는 노이즈로 간주(px)
  const maxPoints = opts.maxPoints ?? 24000;

  const bin = binarize(rgba, width, height);
  const skel = thin(bin, width, height);
  let paths = tracePaths(skel, width, height);

  // 짧은 노이즈 경로 제거
  const pathLen = (p) => {
    let L = 0;
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    return L;
  };
  paths = paths.filter((p) => pathLen(p) >= minPathLen);

  // 단순화 + 스냅
  let simplified = paths.map((p) => snapOrtho(simplifyPath(p, eps)));

  // 포인트가 과도하면 epsilon을 키워 재단순화 (사진 등 복잡한 입력 대비)
  let total = simplified.reduce((s, p) => s + p.length, 0);
  let e = eps;
  while (total > maxPoints && e < 8) {
    e *= 1.6;
    simplified = paths.map((p) => snapOrtho(simplifyPath(p, e)));
    total = simplified.reduce((s, p) => s + p.length, 0);
  }

  return { paths: simplified, width, height, pointCount: total };
}

// ============================================================
// 7. 브라우저 파일 로더 (File → 픽셀 → 벡터)
// ============================================================
export async function vectorizeImageFile(file, opts = {}) {
  const maxDim = opts.maxDim ?? 1100;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(2, Math.round(bmp.width * scale));
  const h = Math.max(2, Math.round(bmp.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  bmp.close?.();

  return vectorizePixels(data, w, h, opts);
}
