/*
 * chart.js · 天体制图风格的星图渲染（Canvas 2D）
 * 视角：站在城市里抬头看向星座所在方向，天顶朝上（球极投影，保角）。
 * 静态层（底色/纸纹/银河/经纬网/暗星/地面）只在视角变化时重画；
 * 动态层（闪烁亮星/私人星座/流光）每帧画。
 */
(function () {
  const D2R = Math.PI / 180;
  const CREAM = '246,241,227';
  const FONT_SERIF = '"IM Fell English", "Songti SC", "Noto Serif SC", "STSong", "SimSun", serif';
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // 尖角星形（雕版星图那种）
  function starPath(ctx, x, y, r, rot = 0) {
    const spikes = 8;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = rot + i * Math.PI / spikes - Math.PI / 2;
      const rr = i % 2 === 0 ? (i % 4 === 0 ? r : r * 0.62) : r * 0.2;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  function makeGlowSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, `rgba(${CREAM},1)`);
    grd.addColorStop(0.18, `rgba(${CREAM},0.55)`);
    grd.addColorStop(0.45, `rgba(200,215,255,0.16)`);
    grd.addColorStop(1, 'rgba(200,215,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  function makeNoise() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    const rng = mulberry32(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const r = rng();
      if (r < 0.035) { img.data[i] = 235; img.data[i + 1] = 232; img.data[i + 2] = 220; img.data[i + 3] = 18 + rng() * 40; }
      else { img.data[i] = 6; img.data[i + 1] = 14; img.data[i + 2] = 40; img.data[i + 3] = rng() * 22; }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function create(canvas, data) {
    const { sky, match, title, zhNames } = data;
    let ctx = canvas.getContext('2d');
    let layer = document.createElement('canvas');
    let lctx = layer.getContext('2d');
    const glow = makeGlowSprite();
    const noise = makeNoise();
    let noisePattern = null;
    let W = 0, H = 0, dpr = 1;
    let dirty = true;
    const t0 = performance.now();
    const listeners = {};

    const obs = sky.observer;
    const selected = match ? match.stars : [];
    const selectedIds = new Set(selected.map(s => s.id));
    const closed = !!data.closed;

    // ---------- 预计算：银河、经纬网、黄道 ----------
    const mw = [];
    {
      const rng = mulberry32(20261108);
      let guard = 0;
      while (mw.length < 9000 && guard++ < 60000) {
        const l = rng() * 360;
        const dl = Math.min(l, 360 - l);
        if (rng() > 0.3 + 0.7 * Math.exp(-dl * dl / (2 * 60 * 60))) continue;
        const sigma = 3.2 + 5.5 * Math.exp(-dl * dl / (2 * 28 * 28));
        const b = gauss(rng) * sigma;
        // 银河暗隙（天鹅座—天鹰座一带）
        if (l > 15 && l < 75 && Math.abs(b - 1.2) < 1.8 && rng() < 0.75) continue;
        const e = Sky.galToEqu(l, b);
        const v = Sky.equToVec(obs, e.ra, e.dec);
        if (v[2] <= 0) continue;
        mw.push({ v, a: 0.18 + rng() * 0.5, r: 0.45 + rng() * 0.7 });
      }
    }
    function line(fn, from, to, step) {
      const pts = [];
      for (let x = from; x <= to + 1e-9; x += step) { const e = fn(x); pts.push({ v: Sky.equToVec(obs, e.ra, e.dec), x }); }
      return pts;
    }
    const decLines = [];
    for (let d = -80; d <= 80; d += 10) decLines.push({ d, pts: line(ra => ({ ra, dec: d }), 0, 24, 0.08) });
    const raLines = [];
    for (let h = 0; h < 24; h++) raLines.push({ h, pts: line(dec => ({ ra: h, dec }), -88, 88, 1.5) });
    const ecliptic = line(l => Sky.eclToEqu(l), 0, 360, 1.5);
    const poleN = Sky.equToVec(obs, 0, 90), poleS = Sky.equToVec(obs, 0, -90);

    // 星星分组
    const bright = [], faint = [];
    const rng = mulberry32(42);
    for (const s of sky.stars) {
      if (selectedIds.has(s.id)) continue;
      s.ph = rng() * Math.PI * 2;
      s.sp = 0.6 + rng() * 2.2;
      (s.magApp <= 4.4 ? bright : faint).push(s);
    }
    const twinkleRng = mulberry32(99);
    selected.forEach(s => { s.ph = twinkleRng() * Math.PI * 2; s.sp = 1.2 + twinkleRng(); });

    // ---------- 视角 ----------
    const view = { az: 180, alt: 45, k: 300 };
    let basis = null;
    function updateBasis() {
      const f = Sky.altAzToVec(view.alt, view.az);
      const az = view.az * D2R;
      const r = [Math.cos(az), -Math.sin(az), 0];
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      basis = { f, r, u };
    }
    function proj(v) {
      const d = dot(v, basis.f);
      if (d < -0.55) return null;
      const m = 2 / (1 + d);
      return [W / 2 + dot(v, basis.r) * m * view.k, H / 2 - dot(v, basis.u) * m * view.k, d];
    }

    function fitView() {
      if (!selected.length) { view.az = 180; view.alt = 50; view.k = Math.min(W, H) / 2.2; return; }
      const c = [0, 0, 0];
      selected.forEach(s => { c[0] += s.v[0]; c[1] += s.v[1]; c[2] += s.v[2]; });
      const cl = Math.hypot(c[0], c[1], c[2]) || 1;
      const { alt, az } = Sky.vecToAltAz(c.map(x => x / cl));
      view.alt = clamp(alt, 5, 90); view.az = az;
      view.k = 1; updateBasis();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      selected.forEach(s => { const p = proj(s.v); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      const bw = Math.max(1e-3, x1 - x0), bh = Math.max(1e-3, y1 - y0);
      const mobile = W < 640;
      view.k = Math.min(W * (mobile ? 0.7 : 0.5) / bw, H * 0.5 / bh);
      view.k = clamp(view.k, Math.min(W, H) / 4, Math.min(W, H) * 2.2);
      // 星座中心略高于画面中心，给标题和地平线留空间
      // 星座包围盒中心放在画面中心略偏下，给上方标题留空间
      updateBasis();
      let yy0 = Infinity, yy1 = -Infinity;
      selected.forEach(s => { const p = proj(s.v); yy0 = Math.min(yy0, p[1]); yy1 = Math.max(yy1, p[1]); });
      const shiftY = (yy0 + yy1) / 2 - (H / 2 + H * 0.05);
      view.alt = clamp(view.alt - shiftY / view.k * 57.2958, -5, 90);
      updateBasis();
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      for (const c of [canvas, layer]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      noisePattern = lctx.createPattern(noise, 'repeat');
      dirty = true;
    }

    // ---------- 静态层 ----------
    function polyline(g, pts, cb) {
      let started = false, prev = null;
      g.beginPath();
      for (const p of pts) {
        const q = p.v[2] > -0.02 ? proj(p.v) : null;
        if (!q || (prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) > Math.max(W, H))) { started = false; prev = q; continue; }
        if (!started) { g.moveTo(q[0], q[1]); started = true; } else g.lineTo(q[0], q[1]);
        prev = q;
        if (cb) cb(p, q);
      }
      g.stroke();
    }
    let placed = [];
    function labelAlong(g, text, cand, size = 13) {
      if (!cand) return;
      const { q, q2 } = cand;
      let ang = Math.atan2(q2[1] - q[1], q2[0] - q[0]);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      g.font = `italic ${size}px ${FONT_SERIF}`;
      const tw = g.measureText(text).width + 8;
      // 沿文字取几个点做碰撞检查：不出画面、不压星座、不互相叠、避开左下提示和右下按钮
      const samples = [];
      for (let i = 0; i <= 4; i++) samples.push([q[0] + Math.cos(ang) * tw * i / 4, q[1] + Math.sin(ang) * tw * i / 4]);
      for (const [x, y] of samples) {
        if (x < 8 || x > W - 8 || y < 14 || y > H - 8) return;
        if (y > H - 100 && (x < Math.min(W * 0.75, 380) || x > W - 130)) return;
        if (selScreen.some(p => p && Math.hypot(p.x - x, p.y - y) < 46)) return;
        if (placed.some(p => Math.hypot(p[0] - x, p[1] - y) < 34)) return;
      }
      placed.push(...samples);
      g.save();
      g.translate(q[0], q[1]); g.rotate(ang);
      g.font = `italic ${size}px ${FONT_SERIF}`;
      g.fillStyle = `rgba(${CREAM},0.78)`;
      g.textBaseline = 'bottom';
      g.fillText(text, 4, -3);
      g.restore();
    }

    function renderStatic() {
      const g = lctx;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grd = g.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      grd.addColorStop(0, '#2b51b0'); grd.addColorStop(0.55, '#1f4099'); grd.addColorStop(1, '#14296b');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      g.fillStyle = noisePattern; g.fillRect(0, 0, W, H);

      const zoom = clamp(view.k / (Math.min(W, H) / 1.6), 0.7, 2.2);

      // 银河点刻
      g.fillStyle = `rgb(${CREAM})`;
      for (const p of mw) {
        const q = proj(p.v);
        if (!q || q[0] < -4 || q[0] > W + 4 || q[1] < -4 || q[1] > H + 4) continue;
        g.globalAlpha = p.a;
        g.fillRect(q[0], q[1], p.r * zoom, p.r * zoom);
      }
      g.globalAlpha = 1;

      // 赤经赤纬网
      g.lineWidth = 0.8;
      g.strokeStyle = `rgba(${CREAM},0.3)`;
      const pad = 26;
      placed = [];
      const poles = [poleN, poleS].filter(v => v[2] > -0.1).map(proj).filter(Boolean);
      const nearPole = q => poles.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 140);
      const inView = q => q[0] > pad && q[0] < W - pad && q[1] > pad + 10 && q[1] < H - pad;
      for (const L of decLines) {
        let best = null, prevQ = null;
        g.strokeStyle = L.d === 0 ? `rgba(${CREAM},0.5)` : `rgba(${CREAM},0.28)`;
        polyline(g, L.pts, (p, q) => {
          if (prevQ && inView(q) && p.v[2] > 0.03) {
            // 偏好：靠左、且这一段接近水平（字好读）
            const sc = q[0] + 600 * Math.abs(Math.sin(Math.atan2(q[1] - prevQ[1], q[0] - prevQ[0])));
            if (!best || sc < best.sc) best = { q, q2: prevQ, sc };
          }
          prevQ = q;
        });
        const txt = L.d === 0 ? 'Celestial Equator · 天赤道' : `${Math.abs(L.d)}° ${L.d > 0 ? 'North' : 'South'} Declination`;
        if (best && L.d % 20 === 0) labelAlong(g, txt, best, 12);
      }
      g.strokeStyle = `rgba(${CREAM},0.28)`;
      for (const L of raLines) {
        let best = null, prevQ = null;
        polyline(g, L.pts, (p, q) => {
          if (prevQ && inView(q) && q[1] < H * 0.2 && p.v[2] > 0.03 && !nearPole(q) && (!best || q[1] < best.q[1])) best = { q, q2: prevQ };
          prevQ = q;
        });
        if (best && L.h % 2 === 0) labelAlong(g, `${L.h} hours`, best, 12);
      }
      // 黄道
      g.save();
      g.setLineDash([2, 5]);
      g.strokeStyle = `rgba(${CREAM},0.45)`;
      let eBest = null, ePrev = null;
      polyline(g, ecliptic, (p, q) => {
        if (ePrev && inView(q) && p.v[2] > 0.05 && (!eBest || Math.abs(q[0] - W * 0.7) < Math.abs(eBest.q[0] - W * 0.7))) eBest = { q, q2: ePrev };
        ePrev = q;
      });
      g.restore();
      if (eBest) labelAlong(g, 'Ecliptic · 黄道', eBest, 12);

      // 天极
      for (const [pv, txt] of [[poleN, 'NORTH POLE'], [poleS, 'SOUTH POLE']]) {
        if (pv[2] <= 0.02) continue;
        const q = proj(pv);
        if (!q || !inView(q)) continue;
        g.strokeStyle = `rgba(${CREAM},0.7)`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(q[0] - 7, q[1]); g.lineTo(q[0] + 7, q[1]); g.moveTo(q[0], q[1] - 7); g.lineTo(q[0], q[1] + 7); g.stroke();
        g.font = `12px ${FONT_SERIF}`; g.fillStyle = `rgba(${CREAM},0.8)`; g.textAlign = 'center';
        g.fillText(txt, q[0], q[1] - 12); g.textAlign = 'left';
      }

      // 暗星
      g.fillStyle = `rgb(${CREAM})`;
      for (const s of faint) {
        const q = proj(s.v);
        if (!q || q[0] < -2 || q[0] > W + 2 || q[1] < -2 || q[1] > H + 2) continue;
        const r = (0.4 + (6.4 - s.magApp) * 0.3) * zoom * 0.9;
        g.globalAlpha = clamp(0.35 + (6.3 - s.magApp) * 0.25, 0.3, 0.85);
        g.beginPath(); g.arc(q[0], q[1], r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;

      renderGround(g);

      // 暗角
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, 'rgba(8,16,48,0)'); vg.addColorStop(1, 'rgba(8,16,48,0.38)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }

    function renderGround(g) {
      const a = view.az;
      const p1 = proj(Sky.altAzToVec(0, a)), p2 = proj(Sky.altAzToVec(0, a + 90)), p3 = proj(Sky.altAzToVec(0, a - 90));
      const zq = proj([0, 0, 1]);
      if (!p1 || !p2 || !p3 || !zq) return;
      const ax = p1[0], ay = p1[1], bx = p2[0], by = p2[1], cx = p3[0], cy = p3[1];
      const dd = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      g.save();
      g.beginPath();
      let circle = null;
      if (Math.abs(dd) < 1e-6) {
        // 地平线是直线（视线水平）
        g.rect(0, ay, W, H - ay + 2);
      } else {
        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / dd;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / dd;
        const R = Math.hypot(ax - ux, ay - uy);
        circle = { ux, uy, R };
        const zenInside = Math.hypot(zq[0] - ux, zq[1] - uy) < R;
        if (zenInside) { g.rect(-2, -2, W + 4, H + 4); g.arc(ux, uy, R, 0, Math.PI * 2, true); }
        else g.arc(ux, uy, R, 0, Math.PI * 2);
      }
      g.fillStyle = 'rgba(14,30,82,0.94)';
      g.fill('evenodd');
      g.clip('evenodd');
      // 雕版斜线
      g.strokeStyle = `rgba(${CREAM},0.07)`; g.lineWidth = 1;
      g.beginPath();
      for (let x = -H; x < W; x += 7) { g.moveTo(x, H); g.lineTo(x + H, 0); }
      g.stroke();
      g.restore();

      g.strokeStyle = `rgba(${CREAM},0.85)`; g.lineWidth = 1.3;
      g.beginPath();
      if (circle) g.arc(circle.ux, circle.uy, circle.R, 0, Math.PI * 2); else { g.moveTo(0, ay); g.lineTo(W, ay); }
      g.stroke();

      // 方位刻度
      const names = { 0: 'N · 北', 45: 'NE', 90: 'E · 东', 135: 'SE', 180: 'S · 南', 225: 'SW', 270: 'W · 西', 315: 'NW' };
      g.font = `italic 13px ${FONT_SERIF}`; g.textAlign = 'center';
      for (let az = 0; az < 360; az += 5) {
        const q = proj(Sky.altAzToVec(0, az));
        if (!q || q[2] < 0 || q[0] < 0 || q[0] > W || q[1] < 0 || q[1] > H) continue;
        const qi = proj(Sky.altAzToVec(-1.2, az));
        const len = az % 45 === 0 ? 1 : (az % 15 === 0 ? 0.55 : 0.3);
        g.strokeStyle = `rgba(${CREAM},0.7)`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + (qi[0] - q[0]) * len * 1.6, q[1] + (qi[1] - q[1]) * len * 1.6); g.stroke();
        if (names[az] !== undefined) {
          const ql = proj(Sky.altAzToVec(-4.5, az));
          if (ql) { g.fillStyle = `rgba(${CREAM},0.85)`; g.fillText(names[az], ql[0], ql[1] + 4); }
        }
      }
      const hq = proj(Sky.altAzToVec(0, view.az - 28));
      if (hq && hq[1] < H - 10 && hq[1] > 20 && !(hq[1] > H - 100 && hq[0] < Math.min(W * 0.75, 380))) {
        g.font = `italic 12px ${FONT_SERIF}`; g.fillStyle = `rgba(${CREAM},0.6)`;
        g.fillText('Horizon · 地平线', hq[0], hq[1] - 6);
      }
      g.textAlign = 'left';
    }

    // ---------- 动态层 ----------
    let hitList = [];
    let selScreen = [];
    let snapshotting = false;
    function frame(now) {
      if (!snapshotting) {
        if (dirty) { cacheScreen(); renderStatic(); dirty = false; }
        drawFrame((now - t0) / 1000);
      }
      requestAnimationFrame(frame);
    }

    // 把当前视角按指定尺寸完整画一张（保存图片用），动画按「已画完」的状态
    function snapshot(w, h, scale = 2) {
      const saved = { ctx, layer, lctx, W, H, dpr, k: view.k, noisePattern };
      snapshotting = true;
      try {
        const out = document.createElement('canvas');
        out.width = Math.round(w * scale); out.height = Math.round(h * scale);
        layer = document.createElement('canvas');
        layer.width = out.width; layer.height = out.height;
        lctx = layer.getContext('2d');
        ctx = out.getContext('2d');
        view.k = saved.k * Math.min(w, h) / Math.min(saved.W, saved.H);
        W = w; H = h; dpr = scale;
        noisePattern = lctx.createPattern(noise, 'repeat');
        updateBasis(); cacheScreen(); renderStatic();
        drawFrame(60, true);
        return out;
      } finally {
        ({ ctx, layer, lctx, W, H, dpr, noisePattern } = saved);
        view.k = saved.k;
        updateBasis(); dirty = true;
        snapshotting = false;
      }
    }

    function drawFrame(t, still = false) {
      const calm = reduceMotion || still;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const zoom = clamp(view.k / (Math.min(W, H) / 1.6), 0.75, 1.8);

      // 未选中的亮星：闪烁
      ctx.fillStyle = `rgb(${CREAM})`;
      for (const h of hitList) {
        if (h.sel) continue;
        const s = h.s;
        const tw = calm ? 0.85 : 0.6 + 0.4 * Math.sin(t * s.sp + s.ph) * Math.sin(t * s.sp * 0.37 + s.ph * 1.7);
        const r = (0.9 + (4.6 - s.magApp) * 0.62) * zoom;
        ctx.globalAlpha = clamp(tw, 0.15, 1) * 0.55;
        const gr = r * 4.2;
        ctx.drawImage(glow, h.x - gr, h.y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = clamp(0.55 + tw * 0.45, 0.2, 1);
        if (s.magApp < 1.9) { starPath(ctx, h.x, h.y, r * 1.9, 0); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(h.x, h.y, r * 0.75, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;

      drawConstellation(t, zoom, still);
    }

    function cacheScreen() {
      hitList = [];
      for (const s of bright) {
        const q = proj(s.v);
        if (!q || q[0] < -10 || q[0] > W + 10 || q[1] < -10 || q[1] > H + 10) continue;
        hitList.push({ s, x: q[0], y: q[1], sel: false });
      }
      selScreen = selected.map(s => { const q = proj(s.v); return q ? { s, x: q[0], y: q[1] } : null; });
      selScreen.forEach(p => p && hitList.push({ s: p.s, x: p.x, y: p.y, sel: true }));
    }

    function drawConstellation(t, zoom, still) {
      const calm = reduceMotion || still;
      const pts = selScreen;
      if (!pts.length || pts.some(p => !p)) return;
      const n = pts.length;
      const segs = closed ? n : n - 1;
      const DRAW = 2.8, DELAY = 0.6;
      const prog = calm ? segs : clamp((t - DELAY) / DRAW, 0, 1) * segs;
      const radius = s => (5.2 + (3.2 - clamp(s.magApp, -1, 4)) * 1.25) * zoom;

      // 连线
      ctx.lineCap = 'round';
      const path = [];
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        const ra = radius(a.s) * 1.25, rb = radius(b.s) * 1.25;
        if (L < ra + rb + 2) continue;
        const f = clamp(prog - i, 0, 1);
        if (f <= 0) continue;
        const sx = a.x + dx / L * ra, sy = a.y + dy / L * ra;
        const ex = a.x + dx / L * (ra + (L - ra - rb) * f), ey = a.y + dy / L * (ra + (L - ra - rb) * f);
        path.push([sx, sy, ex, ey]);
      }
      const shimmer = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 1.6);
      ctx.strokeStyle = `rgba(255,248,226,${0.16 * shimmer})`; ctx.lineWidth = 6;
      ctx.beginPath(); path.forEach(p => { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); }); ctx.stroke();
      ctx.strokeStyle = `rgba(255,250,236,${0.92 * shimmer})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); path.forEach(p => { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); }); ctx.stroke();

      // 沿线流光
      if (!calm && prog >= segs) {
        const u = ((t - DELAY - DRAW) / 7) % 1 * segs;
        const i = Math.floor(u), f = u - i;
        const a = pts[i % n], b = pts[(i + 1) % n];
        if (closed || i < n - 1) {
          const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
          ctx.globalAlpha = 0.9;
          ctx.drawImage(glow, x - 11, y - 11, 22, 22);
          ctx.globalAlpha = 1;
        }
      }

      // 选中的星
      ctx.font = `italic ${Math.round(13 * clamp(zoom, 0.9, 1.2))}px ${FONT_SERIF}`;
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const appear = calm ? 1 : clamp((prog - i + 0.35) * 2.5, 0, 1);
        if (appear <= 0) continue;
        const r = radius(p.s) * (0.6 + 0.4 * appear);
        const pulse = calm ? 1 : 1 + 0.14 * Math.sin(t * 2.1 * p.s.sp + p.s.ph);
        const gr = r * 5.2 * pulse;
        ctx.globalAlpha = 0.75 * appear;
        ctx.drawImage(glow, p.x - gr, p.y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = appear;
        ctx.fillStyle = '#fffaf0';
        starPath(ctx, p.x, p.y, r * pulse, calm ? 0 : Math.sin(t * 0.4 + p.s.ph) * 0.08);
        ctx.fill();
        const label = zhNames[p.s.name] || p.s.name;
        if (label) {
          ctx.fillStyle = `rgba(${CREAM},${0.82 * appear})`;
          ctx.fillText(label, p.x + r + 5, p.y - r * 0.6);
        }
      }
      ctx.globalAlpha = 1;

      // 星座名
      const tf = calm ? 1 : clamp((t - DELAY - DRAW + 0.4) / 1.4, 0, 1);
      if (tf > 0 && title) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
        pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); });
        const size = Math.round(clamp(Math.min(W, H) / 18, 22, 40));
        ctx.font = `italic ${size}px ${FONT_SERIF}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(${CREAM},${0.95 * tf})`;
        const ty = Math.max(size + 14, y0 - 50);
        ctx.fillText(title, (x0 + x1) / 2, ty + (1 - tf) * 8);
        ctx.font = `italic 12px ${FONT_SERIF}`;
        ctx.fillStyle = `rgba(${CREAM},${0.6 * tf})`;
        const sub = data.to ? `a private constellation · for ${data.to}` : 'a private constellation';
        ctx.fillText(sub, (x0 + x1) / 2, ty + 18 + (1 - tf) * 8);
        ctx.textAlign = 'left';
      }
    }

    // ---------- 交互：拖动 / 缩放 / 点击 ----------
    const pointers = new Map();
    let downPos = null, pinch0 = null, moved = false;
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downPos = { x: e.clientX, y: e.clientY }; moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      }
      emit('interact');
    });
    canvas.addEventListener('pointermove', e => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      if (Math.hypot(cur.x - downPos.x, cur.y - downPos.y) > 5) moved = true;
      if (pointers.size === 2 && pinch0) {
        const [a, b] = [...pointers.values()];
        view.k = clamp(pinch0.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d, Math.min(W, H) / 5, Math.min(W, H) * 4);
      } else if (pointers.size === 1) {
        const dx = cur.x - prev.x, dy = cur.y - prev.y;
        view.az = (view.az - dx / view.k * 57.2958 / Math.max(Math.cos(view.alt * D2R), 0.35) + 360) % 360;
        view.alt = clamp(view.alt + dy / view.k * 57.2958, -5, 90);
      }
      canvas.classList.add('dragging');
      updateBasis(); dirty = true;
    });
    const up = e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch0 = null;
      canvas.classList.remove('dragging');
      if (!moved && pointers.size === 0 && e.type === 'pointerup') handleClick(e);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      view.k = clamp(view.k * Math.exp(-e.deltaY * 0.0012), Math.min(W, H) / 5, Math.min(W, H) * 4);
      updateBasis(); dirty = true;
    }, { passive: false });
    canvas.addEventListener('dblclick', () => { fitView(); dirty = true; });

    function handleClick(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let best = null, bd = Infinity;
      for (const h of hitList) {
        const d = Math.hypot(h.x - x, h.y - y) - (h.sel ? 12 : 0);
        if (d < bd) { bd = d; best = h; }
      }
      if (best && bd < (e.pointerType === 'touch' ? 22 : 14)) {
        const order = best.sel ? selected.indexOf(best.s) + 1 : 0;
        emit('star', { star: best.s, x: best.x + rect.left, y: best.y + rect.top, order });
      } else emit('star', null);
    }

    function emit(name, payload) { (listeners[name] || []).forEach(fn => fn(payload)); }

    // ---------- 启动 ----------
    resize(); updateBasis(); fitView();
    window.addEventListener('resize', () => { resize(); fitView(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dirty = true; });
    requestAnimationFrame(frame);

    return {
      on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
      reset() { fitView(); dirty = true; },
      snapshot,
      // 给故事卡用：星座在画面上的形状（归一化）
      shape() {
        const pts = selScreen.filter(Boolean);
        if (!pts.length) return [];
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
        const s = Math.max(x1 - x0, y1 - y0) || 1;
        return pts.map(p => ({ x: (p.x - (x0 + x1) / 2) / s, y: (p.y - (y0 + y1) / 2) / s, mag: p.s.magApp }));
      },
    };
  }

  window.StarChart = { create };
})();
