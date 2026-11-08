/*
 * matcher.js · 把 AI 画的 10×10 模板吸附到真实亮星上（预览版）
 *
 * 做法：
 * 1. 把候选亮星投到"抬头看天"的平面上（以天顶为中心的球极投影，北上东左，保角，形状不变形）
 * 2. 取模板里相距最远的两点 A、B，枚举所有星对 (i, j) 当作 A、B 的落点，
 *    由此唯一确定一次 平移 + 缩放 + 旋转
 * 3. 其余模板点按这个变换落到天上，各自吸附最近的、还没被用过的星
 * 4. 打分 = 吸附误差(相对图形尺寸的 RMS) + 歪头惩罚(图形"上方"偏离天顶太多) + 太低惩罚 + 亮度偏好
 * 5. 取分最低的一组
 * 不做镜像翻转（会改变图形的手性）。同样的输入永远得到同样的结果。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Matcher = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const D2R = Math.PI / 180;

  function toPlane(v) {
    const k = 2 / (1 + v[2]);
    return [-v[0] * k, v[1] * k]; // x = 西→右（抬头看时东在左），y = 北
  }

  function matchTemplate(points, candidates, opts = {}) {
    // 一笔路径可以回访同一顶点；重复坐标必须复用同一颗星。
    const unique = [], indices = [], seen = new Map();
    for (const p of points) {
      const key = `${p.x},${p.y}`;
      if (!seen.has(key)) { seen.set(key, unique.length); unique.push(p); }
      indices.push(seen.get(key));
    }
    if (unique.length !== points.length) {
      const result = matchTemplate(unique, candidates, opts);
      return result ? { ...result, stars: indices.map(i => result.stars[i]), ghostPlane: indices.map(i => result.ghostPlane[i]) } : null;
    }
    const minSpan = opts.minSpan ?? 0.45; // 图形最长跨度下限（≈弧度，约 26°）
    const maxSpan = opts.maxSpan ?? 1.35; // 上限（约 75°）
    const freeTilt = (opts.freeTiltDeg ?? 40) * D2R;
    const n = points.length;
    const N = candidates.length;
    if (n < 2 || N < n) return null;

    const T = points.map(p => [p.x, p.y]);
    const P = candidates.map(c => toPlane(c.v));
    const M = candidates.map(c => c.magApp);

    let A = 0, B = 1, Dt = 0;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const d = Math.hypot(T[b][0] - T[a][0], T[b][1] - T[a][1]);
      if (d > Dt) { Dt = d; A = a; B = b; }
    }
    if (Dt === 0) return null;
    const tAng = Math.atan2(T[B][1] - T[A][1], T[B][0] - T[A][0]);
    const tc = [T.reduce((s, p) => s + p[0], 0) / n, T.reduce((s, p) => s + p[1], 0) / n];
    const rest = [];
    for (let k = 0; k < n; k++) if (k !== A && k !== B) rest.push(k);
    const m = rest.length || 1;

    const used = new Uint8Array(N);
    const pick = new Int32Array(n);
    let best = null, bestCost = Infinity;
    let tried = 0;

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1];
        const span = Math.hypot(dx, dy);
        if (span < minSpan || span > maxSpan) continue;
        tried++;
        const s = span / Dt;
        const th = Math.atan2(dy, dx) - tAng;
        const c = Math.cos(th) * s, sn = Math.sin(th) * s;
        const ox = P[i][0] - (c * T[A][0] - sn * T[A][1]);
        const oy = P[i][1] - (sn * T[A][0] + c * T[A][1]);

        // 图形中心落点；"上方"应大致朝向天顶（平面原点）
        const cx = ox + c * tc[0] - sn * tc[1], cy = oy + sn * tc[0] + c * tc[1];
        const r = Math.hypot(cx, cy);
        let pen = 0;
        if (r > 1e-3) {
          const ux = -Math.sin(th), uy = Math.cos(th);
          const dev = Math.acos(Math.max(-1, Math.min(1, (ux * -cx + uy * -cy) / r)));
          pen += Math.max(0, dev - freeTilt) / (Math.PI - freeTilt) * 0.22;
          const zen = 2 * Math.atan(r / 2);
          pen += Math.max(0, zen - 55 * D2R) / (30 * D2R) * 0.06;
        }
        pen += (M[i] + M[j]) * 0.004;
        if (pen >= bestCost) continue;

        used[i] = 1; used[j] = 1;
        pick[A] = i; pick[B] = j;
        let sum = 0, magSum = 0, ok = true;
        const span2 = span * span;
        const limit2 = (bestCost - pen) * (bestCost - pen) * m;
        for (let q = 0; q < rest.length; q++) {
          const k = rest[q];
          const px = ox + c * T[k][0] - sn * T[k][1];
          const py = oy + sn * T[k][0] + c * T[k][1];
          let bi = -1, bd = Infinity;
          for (let u = 0; u < N; u++) {
            if (used[u]) continue;
            const ex = P[u][0] - px, ey = P[u][1] - py;
            const d2 = ex * ex + ey * ey;
            if (d2 < bd) { bd = d2; bi = u; }
          }
          if (bi < 0) { ok = false; break; }
          used[bi] = 1; pick[k] = bi;
          sum += bd / span2;
          magSum += M[bi];
          if (sum > limit2) { ok = false; break; }
        }
        for (let k = 0; k < n; k++) used[pick[k]] = 0;
        used[i] = 0; used[j] = 0;
        if (!ok) continue;

        const cost = Math.sqrt(sum / m) + pen + (magSum / m) * 0.004;
        if (cost < bestCost) {
          bestCost = cost;
          best = { pick: Array.from(pick), scale: s, theta: th, ox, oy, span };
        }
      }
    }
    if (!best) return null;

    const stars = best.pick.map(idx => candidates[idx]);
    const ghost = T.map(p => [best.ox + Math.cos(best.theta) * best.scale * p[0] - Math.sin(best.theta) * best.scale * p[1],
      best.oy + Math.sin(best.theta) * best.scale * p[0] + Math.cos(best.theta) * best.scale * p[1]]);
    return {
      stars,
      cost: bestCost,
      spanDeg: best.span / D2R,
      tiltDeg: best.theta / D2R,
      tried,
      candidates: N,
      ghostPlane: ghost, // 模板理想落点（调试用）
    };
  }

  return { matchTemplate, toPlane };
});
