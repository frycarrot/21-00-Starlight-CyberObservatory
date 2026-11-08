/*
 * card.js · 极简天文平面设计风格的故事卡 + 发光星星按钮的形状
 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  // 多角星：radii 给每个角一个长度系数，用来做"蛄蛹"的变形
  function burst(cx, cy, R, r, n, radii, rot = -Math.PI / 2) {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i * Math.PI / n;
      const rr = i % 2 === 0 ? R * (radii ? radii[(i / 2) % radii.length] : 1) : r;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ',' + (cy + Math.sin(a) * rr).toFixed(2);
    }
    return d + 'Z';
  }

  // 按钮星星：10 个角，三组不同长短来回变形
  function initButtonStar() {
    const path = document.getElementById('btnStar');
    const frames = [
      [1, .78, .95, .72, 1, .8, .92, .75, .98, .74],
      [.86, .95, .76, .98, .84, .97, .78, .96, .85, .93],
      [.97, .74, 1, .82, .9, .73, 1, .8, .9, .79],
    ];
    const ds = frames.map(f => burst(0, 0, 50, 15, 10, f));
    path.setAttribute('d', ds[0]);
    el('animate', {
      attributeName: 'd', dur: '2.8s', repeatCount: 'indefinite',
      values: [...ds, ds[0]].join(';'),
      calcMode: 'spline', keyTimes: '0;0.33;0.66;1',
      keySplines: '.45 0 .55 1;.45 0 .55 1;.45 0 .55 1',
    }, path);
  }

  function buildArt(svg) {
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    const grain = el('filter', { id: 'grain', x: 0, y: 0, width: '100%', height: '100%' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.85', numOctaves: 2, stitchTiles: 'stitch' }, grain);
    el('feColorMatrix', { type: 'matrix', values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 -.18' }, grain);
    const rough = el('filter', { id: 'rough' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '1.4', numOctaves: 1, result: 'n' }, rough);
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 2.2 }, rough);

    const cx = 362.5, cy = 512;
    const orbit = (cls, id, rx, ry, dur, offsets) => {
      const g = el('g', { class: 'orbit ' + cls }, svg);
      const d = `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0`;
      el('path', { id, d, class: 'orbit-path', pathLength: 1, filter: 'url(#rough)' }, g);
      for (const o of offsets) {
        const s = el('g', { class: 'orbit-star' }, g);
        if (o.big) {
          el('circle', { r: 34, fill: '#060606' }, s);
          el('path', { d: burst(0, 0, 33, 11, 8, [1, .82, .96, .86]), fill: '#f6f6f2', filter: 'url(#rough)' }, s);
        } else {
          el('circle', { r: 17, fill: '#060606' }, s);
          el('path', { d: burst(0, 0, 14, 4.2, 8), fill: '#060606', stroke: '#f3f3f0', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, s);
        }
        const am = el('animateMotion', { dur: dur + 's', repeatCount: 'indefinite', begin: (-o.at * dur).toFixed(2) + 's' }, s);
        el('mpath', { href: '#' + id }, am);
      }
    };
    orbit('orbit-a', 'orbA', 160, 385, 52, [{ at: 0.27, big: true }, { at: 0.235 }, { at: 0.77, big: true }, { at: 0.735 }]);
    orbit('orbit-b', 'orbB', 340, 158, 70, [{ at: 0.6, big: true }, { at: 0.565 }]);

    el('rect', { width: 725, height: 1024, filter: 'url(#grain)', opacity: 0.26, style: 'mix-blend-mode:screen;pointer-events:none' }, svg);
  }

  function drawMini(svg, shape, closed) {
    svg.innerHTML = '';
    if (!shape.length) return;
    const pts = shape.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
    el(closed ? 'polygon' : 'polyline', { points: pts, fill: 'none', stroke: '#f3f3f0', 'stroke-width': 0.012, 'stroke-linejoin': 'round', opacity: 0.8 }, svg);
    for (const p of shape) {
      const R = 0.035 + Math.max(0, 3.5 - p.mag) * 0.009;
      el('circle', { cx: p.x, cy: p.y, r: R * 1.35, fill: '#060606' }, svg);
      el('path', { d: burst(p.x, p.y, R, R * 0.3, 4), fill: '#f6f6f2' }, svg);
    }
  }

  function init({ name, story, meta, starNames, closed, getShape, to, from }) {
    document.getElementById('cardTo').textContent = `To ${to}`;
    document.getElementById('cardFrom').textContent = `—— ${from}`;
    initButtonStar();
    const layer = document.getElementById('cardLayer');
    buildArt(document.getElementById('cardArt'));
    document.getElementById('cardName').textContent = name;
    const storyEl = document.getElementById('cardStory');
    storyEl.textContent = '';
    (story || '……').split(/\n+|\\n/).forEach(par => {
      const p = document.createElement('p');
      p.textContent = par.trim();
      if (p.textContent) storyEl.appendChild(p);
    });
    document.getElementById('cardMeta').textContent = meta;
    document.getElementById('cardStars').textContent = starNames.join(' · ');

    let lastFocus = null;
    const open = () => {
      drawMini(document.getElementById('cardMini'), getShape(), closed);
      // 重新触发描线动画
      layer.querySelectorAll('.orbit-path').forEach(p => { p.style.transition = 'none'; p.style.strokeDashoffset = 1; p.getBoundingClientRect(); p.style.transition = ''; p.style.strokeDashoffset = ''; });
      lastFocus = document.activeElement;
      layer.classList.add('open');
      layer.setAttribute('aria-hidden', 'false');
      document.getElementById('cardClose').focus({ preventScroll: true });
    };
    const close = () => {
      layer.classList.remove('open');
      layer.setAttribute('aria-hidden', 'true');
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    };
    document.getElementById('storyBtn').addEventListener('click', open);
    document.getElementById('cardClose').addEventListener('click', close);
    layer.addEventListener('click', e => { if (e.target === layer) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && layer.classList.contains('open')) close(); });
    return { open, close };
  }

  window.StoryCard = { init };
})();
