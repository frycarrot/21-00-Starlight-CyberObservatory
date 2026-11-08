/*
 * poster.js · 生成两张可保存的明信片：星图（当前视角 + 双方署名）和故事卡
 * 只画 canvas，不引用外部图片，所以本地 file:// 打开也能导出。
 * 预览浮层左右滑动切换，底下「保存这张」只保存当前那张。
 */
(function () {
  const SERIF = '"IM Fell English", "Songti SC", "Noto Serif SC", "STSong", "SimSun", serif';
  const SANS = '"Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  const INK = '#1a2d68', PAPER = '#eee5cf', WHITE = '#f3f3f0';
  const W = 1000, P = 48, SCALE = 2;     // 明信片宽度、浅色边框宽度、导出倍率
  const HEAD = 76;                       // 顶部文字带高度
  const LICENSE = '星表 Celeris / HYG v4.1 · CC BY-SA 4.0';

  function spaced(g, px) { if ('letterSpacing' in g) g.letterSpacing = px + 'px'; }

  // 中文按字断行，英文单词不拆
  function wrap(g, text, maxW) {
    const lines = [];
    for (const para of String(text).split(/\n+|\\n/)) {
      const tokens = para.trim().match(/[A-Za-z0-9'’\-]+|\s+|./gu) || [];
      let line = '';
      for (const tk of tokens) {
        const test = line + tk;
        if (g.measureText(test).width > maxW && line.trim()) {
          lines.push(line.trimEnd());
          line = /^\s+$/.test(tk) ? '' : tk;
        } else line = test;
      }
      if (line.trim()) lines.push(line.trim());
      lines.push(null); // 段落间距
    }
    while (lines.length && lines[lines.length - 1] === null) lines.pop();
    return lines;
  }

  function burst(g, x, y, R, r, n, fill, stroke) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / n;
      const rr = i % 2 === 0 ? (i % 4 === 0 ? R : R * 0.85) : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.3; g.stroke(); }
  }

  function orbitPoint(cx, cy, rx, ry, rot, th) {
    const x = rx * Math.cos(th), y = ry * Math.sin(th);
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  }

  // 截断过长的文字
  function fit(g, str, maxW) {
    if (g.measureText(str).width <= maxW) return str;
    let s = str;
    while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // ---------- 明信片底板：浅色纸 + 双线边框 + 四角小星 ----------
  function paper(H) {
    const out = document.createElement('canvas');
    out.width = W * SCALE; out.height = H * SCALE;
    const g = out.getContext('2d');
    g.scale(SCALE, SCALE);
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, W);
    glow.addColorStop(0, 'rgba(255,255,255,.35)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    for (let i = 0; i < W * H / 100; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(120,95,50,.08)' : 'rgba(255,255,255,.14)';
      g.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }
    g.strokeStyle = INK;
    g.globalAlpha = 0.55; g.lineWidth = 1; g.strokeRect(16, 16, W - 32, H - 32);
    g.globalAlpha = 0.3; g.strokeRect(21, 21, W - 42, H - 42);
    g.globalAlpha = 0.6;
    for (const [x, y] of [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]]) {
      g.fillStyle = PAPER; g.fillRect(x - 7, y - 7, 14, 14);
      burst(g, x, y, 6, 1.6, 4, INK);
    }
    g.globalAlpha = 1;
    return { out, g };
  }

  function header(g, info) {
    g.fillStyle = INK; g.textBaseline = 'alphabetic';
    g.textAlign = 'center'; g.font = `italic 32px ${SERIF}`;
    g.fillText(info.title, W / 2, P + 42);
    g.font = `11px ${SERIF}`; spaced(g, 1); g.globalAlpha = 0.72;
    g.textAlign = 'left'; g.fillText('21:00 Starlight·CyberObservatory', P, P + 36, W / 2 - P - 110);
    g.textAlign = 'right'; g.fillText(info.cityLine, W - P, P + 36, W / 2 - P - 110);
    g.globalAlpha = 1; spaced(g, 0);
  }

  function footer(g, info, H) {
    g.fillStyle = INK; g.globalAlpha = 0.8; g.font = `italic 13px ${SERIF}`;
    g.textAlign = 'left'; g.fillText(fit(g, info.footLeft, W / 2 - P), P, H - P + 6);
    g.textAlign = 'right'; g.fillText(LICENSE, W - P, H - P + 6);
    g.globalAlpha = 1;
  }

  function frameRect(g, x, y, w, h) {
    g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
    g.globalAlpha = 0.5; g.lineWidth = 1; g.strokeRect(x - 6, y - 6, w + 12, h + 12); g.globalAlpha = 1;
  }

  // ---------- 第一张：星图 + 双方署名 ----------
  async function makeMap(info) {
    const mw = W - P * 2, mapH = mw;
    const mapTop = P + HEAD;
    const signTop = mapTop + mapH + 6;
    const H = signTop + 150 + P;
    const { out, g } = paper(H);
    header(g, info);

    const map = info.chart.snapshot(mw, mapH, SCALE);
    g.drawImage(map, P, mapTop, mw, mapH);
    frameRect(g, P, mapTop, mw, mapH);

    // 署名，像明信片的收件人/寄件人两栏
    const lineY = signTop + 92, colW = 330;
    const sign = (label, name, x, align) => {
      g.textAlign = align; g.fillStyle = INK;
      g.globalAlpha = 0.62; g.font = `12px ${SERIF}`; spaced(g, 3.5);
      g.fillText(label, x, signTop + 44);
      spaced(g, 0); g.globalAlpha = 1;
      g.font = `italic 30px ${SERIF}`;
      g.fillText(fit(g, name, colW), x, lineY - 10);
      g.globalAlpha = 0.45; g.lineWidth = 1; g.strokeStyle = INK;
      g.beginPath();
      const x0 = align === 'left' ? x : x - colW;
      g.moveTo(x0, lineY); g.lineTo(x0 + colW, lineY); g.stroke();
      g.globalAlpha = 1;
    };
    sign('TO', info.to, P, 'left');
    sign('FROM', info.from, W - P, 'right');

    // 中间：星座名和一颗小星
    g.globalAlpha = 0.85;
    burst(g, W / 2, signTop + 44, 9, 2.6, 4, INK);
    g.textAlign = 'center'; g.font = `italic 17px ${SERIF}`; g.fillStyle = INK;
    g.fillText(fit(g, info.name, 200), W / 2, lineY - 12);
    g.globalAlpha = 1;

    footer(g, info, H);
    return out;
  }

  // ---------- 第二张：故事卡 ----------
  async function makeCard(info) {
    const colW = 520;
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = `20px ${SANS}`;
    const storyLines = wrap(meas, info.story || '……', colW);
    meas.font = `13px ${SANS}`;
    const starLines = wrap(meas, info.starNames.join(' · '), colW + 80);
    const storyH = storyLines.reduce((h, l) => h + (l === null ? 16 : 37), 0);
    const contentH = 30 + 40 + 50 + 130 + storyH + 22 + 44 + 26 + starLines.length * 22;

    const mw = W - P * 2;
    const cardTop = P + HEAD;
    const cardH = Math.max(Math.round(mw * 1.28), contentH + 320);
    const H = cardTop + cardH + 40 + P;
    const { out, g } = paper(H);
    header(g, info);

    const cx = W / 2, cy = cardTop + cardH / 2;
    g.fillStyle = '#060606'; g.fillRect(P, cardTop, mw, cardH);
    g.save();
    g.beginPath(); g.rect(P, cardTop, mw, cardH); g.clip();
    for (let i = 0; i < mw * cardH / 60; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`;
      g.fillRect(P + Math.random() * mw, cardTop + Math.random() * cardH, 1, 1);
    }
    const orbits = [
      { rx: mw * 0.27, ry: cardH * 0.45, rot: -9 * Math.PI / 180, stars: [-1.95, 1.2] },
      { rx: mw * 0.47, ry: Math.min(cardH * 0.2, 210), rot: -34 * Math.PI / 180, stars: [0.35] },
    ];
    g.strokeStyle = WHITE; g.lineWidth = 1.6;
    for (const o of orbits) { g.beginPath(); g.ellipse(cx, cy, o.rx, o.ry, o.rot, 0, Math.PI * 2); g.stroke(); }
    for (const o of orbits) {
      for (const th of o.stars) {
        const [bx, by] = orbitPoint(cx, cy, o.rx, o.ry, o.rot, th);
        g.fillStyle = '#060606'; g.beginPath(); g.arc(bx, by, 27, 0, Math.PI * 2); g.fill();
        burst(g, bx, by, 26, 8, 8, WHITE);
        const [sx, sy] = orbitPoint(cx, cy, o.rx, o.ry, o.rot, th - 0.2);
        g.fillStyle = '#060606'; g.beginPath(); g.arc(sx, sy, 13, 0, Math.PI * 2); g.fill();
        burst(g, sx, sy, 11, 3.4, 8, '#060606', WHITE);
      }
    }
    g.restore();
    frameRect(g, P, cardTop, mw, cardH);

    // 文字（加黑色描边，压在星轨上也能读）
    const text = (str, y, font, alpha = 1, spacing = 0) => {
      g.font = font; spaced(g, spacing);
      g.lineWidth = 5; g.strokeStyle = 'rgba(6,6,6,.9)'; g.lineJoin = 'round';
      g.strokeText(str, cx, y);
      g.fillStyle = `rgba(241,241,238,${alpha})`; g.fillText(str, cx, y);
      spaced(g, 0);
    };
    g.textAlign = 'center';
    let y = cy - contentH / 2 + 20;
    text('PRIVATE CONSTELLATION · 私人星座', y, `12px ${SANS}`, 0.55, 3.5); y += 40;
    text(`To ${info.to}`, y, `17px ${SANS}`, 0.8, 1.5); y += 50;
    text(info.name, y, `500 36px ${SANS}`, 1, 7); y += 30;

    const shape = info.chart.shape();
    if (shape.length) {
      const s = 90, my = y + 58;
      g.strokeStyle = 'rgba(243,243,240,.8)'; g.lineWidth = 1;
      g.beginPath();
      shape.forEach((p, i) => { const px = cx + p.x * s, py = my + p.y * s; i ? g.lineTo(px, py) : g.moveTo(px, py); });
      if (info.closed) g.closePath();
      g.stroke();
      shape.forEach(p => {
        const px = cx + p.x * s, py = my + p.y * s, R = 3.2 + Math.max(0, 3.5 - p.mag) * 0.8;
        g.fillStyle = '#060606'; g.beginPath(); g.arc(px, py, R * 1.4, 0, Math.PI * 2); g.fill();
        burst(g, px, py, R, R * 0.3, 4, WHITE);
      });
    }
    y += 140;

    for (const l of storyLines) {
      if (l === null) { y += 16; continue; }
      text(l, y, `20px ${SANS}`, 0.96); y += 37;
    }
    y += 22;
    text(`—— ${info.from}`, y, `17px ${SANS}`, 0.85, 1.5); y += 44;
    text(info.meta, y, `13px ${SANS}`, 0.55, 2.5); y += 26;
    for (const l of starLines) { if (l === null) continue; text(l, y, `13px ${SANS}`, 0.5, 0.8); y += 22; }

    footer(g, info, H);
    return out;
  }

  async function make(info) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return [await makeMap(info), await makeCard(info)];
  }

  const toBlob = c => new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('导出失败'))), 'image/png'));

  // ---------- 预览浮层 ----------
  function init(getInfo) {
    const $ = id => document.getElementById(id);
    const layer = $('posterLayer'), track = $('posterTrack');
    const imgs = [$('posterImgMap'), $('posterImgCard')];
    const dots = [...$('posterDots').querySelectorAll('button')];
    const prev = $('posterPrev'), next = $('posterNext'), saveBtn = $('posterSave');
    let slides = [];   // [{ blob, url, filename }]
    let current = 0;
    const cards = imgs.map(img => img.parentElement);

    const goTo = (i, animate = true) => {
      i = ((i % imgs.length) + imgs.length) % imgs.length;
      const old = current;
      current = i;
      cards.forEach((card, k) => {
        card.classList.remove('leaving');
        card.classList.toggle('is-active', k === i);
      });
      if (animate && old !== i) {
        void cards[old].offsetWidth;
        cards[old].classList.add('leaving');
      }
      dots.forEach((d, k) => {
        d.classList.toggle('on', k === i);
        d.setAttribute('aria-pressed', String(k === i));
      });

    };
    let swipeUntil = 0;
    cards.forEach((card, k) => {
      card.addEventListener('animationend', () => card.classList.remove('leaving'));
      card.addEventListener('click', () => { if (k !== current && performance.now() > swipeUntil) goTo(k); });
    });
    let touchStart = null;
    track.addEventListener('touchstart', e => {
      touchStart = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { passive: true });
    track.addEventListener('touchend', e => {
      if (!touchStart) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = e.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        swipeUntil = performance.now() + 450;
        goTo(current + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });
    track.addEventListener('touchcancel', () => { touchStart = null; });
    prev.addEventListener('click', () => goTo(current - 1));
    next.addEventListener('click', () => goTo(current + 1));
    dots.forEach((d, k) => d.addEventListener('click', () => goTo(k)));

    const close = () => { layer.classList.remove('open'); layer.setAttribute('aria-hidden', 'true'); };
    $('posterClose').addEventListener('click', close);
    layer.addEventListener('click', e => { if (e.target === layer || e.target === track) close(); });
    document.addEventListener('keydown', e => {
      if (!layer.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });

    // 手机上优先走系统分享面板（可以直接「存储图像」到相册），否则下载
    saveBtn.addEventListener('click', async () => {
      const s = slides[current];
      if (!s) return;
      const file = typeof File === 'function' ? new File([s.blob], s.filename, { type: 'image/png' }) : null;
      const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: s.filename }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a');
      a.href = s.url; a.download = s.filename;
      document.body.appendChild(a); a.click(); a.remove();
    });

    let busy = false;
    const run = async (btn) => {
      if (busy) return;
      busy = true;
      const label = btn.lastChild;
      const old = label.textContent;
      label.textContent = '正在冲洗星图…';
      try {
        const info = getInfo();
        const canvases = await make(info);
        const names = [`星图-${info.name}-${info.date}.png`, `故事卡-${info.name}-${info.date}.png`];
        const blobs = await Promise.all(canvases.map(toBlob));
        slides.forEach(s => URL.revokeObjectURL(s.url));
        slides = blobs.map((blob, i) => ({ blob, url: URL.createObjectURL(blob), filename: names[i] }));
        await Promise.all(slides.map(async (s, i) => {
          imgs[i].src = s.url;
          await imgs[i].decode();
          cards[i].style.setProperty('--ratio', imgs[i].naturalWidth / imgs[i].naturalHeight);
        }));
        layer.classList.add('open');
        layer.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => goTo(btn.dataset.savePoster === 'card' ? 1 : 0, false));
      } catch (e) {
        console.error(e);
        alert('图片生成失败了：' + e.message);
      } finally {
        label.textContent = old;
        busy = false;
      }
    };
    document.querySelectorAll('[data-save-poster]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); run(b); }));
  }

  window.Poster = { init, make, makeMap, makeCard };
})();
