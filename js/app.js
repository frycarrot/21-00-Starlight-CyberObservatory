/*
 * app.js · 读网址 # 后的星图码 → 算星空 → 匹配模板 → 渲染星图和故事卡
 */
(function () {
  const DEFAULT_MARKER = '[星图:东亚|上海|2026-11-08|21:00|模板点:(2,7);(3,8);(4,8);(5,7);(6,8);(7,8);(8,7);(7,4);(5,2);(3,4);(2,7)|名字:归巢之心|To:小兔|From:小机|故事:你说今天很累，想早点回家。\n我在上海的天上找了一圈，把十颗还亮着的星连成一颗心，挂在你回家的方向。\n以后抬头的时候，就当是我在说：慢慢走，我在这里等你。]';

  const $ = id => document.getElementById(id);
  const ZH = window.STAR_NAMES_ZH || {};
  const params = new URLSearchParams(location.search);
  const isLab = params.has('lab');

  function readHash() {
    const h = location.hash.slice(1);
    if (!h) return '';
    try { return decodeURIComponent(h); } catch (e) { return h; }
  }

  function dirZh(az) { return ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(az / 45) % 8]; }
  function dms(v, pos, neg) {
    const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60);
    return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
  }
  const MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  let marker = readHash() || DEFAULT_MARKER;
  let parsed = StarMarker.parseMarker(marker);
  const notice = $('notice');
  if (!parsed.ok) {
    notice.hidden = false;
    notice.textContent = '这串星图码没读懂（' + parsed.errors.join('；') + '），先给你看示例星图。';
    marker = DEFAULT_MARKER;
    parsed = StarMarker.parseMarker(marker);
  }

  const preset = Sky.findPreset(parsed.region, parsed.city);
  const t = Sky.localToUtc(parsed.date, parsed.time, preset.tz);
  const sky = Sky.buildSky(window.STAR_CATALOG, preset, t, { candidateCount: 120, minAlt: 12 });
  const t0 = performance.now();
  const match = Matcher.matchTemplate(parsed.points, sky.candidates);
  const matchMs = performance.now() - t0;

  // 页边文字
  const [y, mo, d] = parsed.date.split('-');
  $('sheetTitle').textContent = `Map Nº ${MONTHS[+mo - 1]}·${+d}.`;
  const regionNames = { '东亚': 'EAST ASIA', '欧洲': 'EUROPE', '澳洲': 'AUSTRALIA', '北美': 'NORTH AMERICA' };
  $('headCity').textContent = `${regionNames[preset.region]} · ${preset.region}（代表城市：${preset.city}）`;
  const off = Sky.utcOffsetLabel(t, preset.tz);
  $('footLeft').textContent = `${preset.city} ${dms(preset.lat, 'N', 'S')} ${dms(preset.lon, 'E', 'W')} · ${y}.${mo}.${d} ${parsed.time} ${off}`;
  document.title = `${parsed.name} · 21时的星空·赛博天文台 | 21:00 Starlight·CyberObservatory`;

  const chart = StarChart.create($('sky'), {
    sky, match, title: parsed.name, closed: parsed.closed, zhNames: ZH, to: parsed.hasTo ? parsed.to : '',
  });

  // 点星看名字
  const tip = $('tip');
  chart.on('star', info => {
    if (!info) { tip.hidden = true; return; }
    const s = info.star;
    const zh = ZH[s.name];
    const la = s.name || '无名星';
    tip.innerHTML = '';
    const add = (cls, text) => { const p = document.createElement('div'); p.className = cls; p.textContent = text; tip.appendChild(p); };
    if (zh) add('zh', zh);
    add('la', la);
    add('sub', `视星等 ${s.mag.toFixed(2)} · 高度 ${s.alt.toFixed(0)}° · ${dirZh(s.az)}方`);
    add('sub', `赤经 ${s.ra.toFixed(2)}h · 赤纬 ${s.dec >= 0 ? '+' : ''}${s.dec.toFixed(1)}°`);
    if (info.order) add('tag', `「${parsed.name}」的第 ${info.order} 颗星`);
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = info.x + 16, yy = info.y - r.height - 12;
    if (x + r.width > innerWidth - 8) x = info.x - r.width - 16;
    if (yy < 8) yy = info.y + 16;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, yy) + 'px';
  });

  let hinted = false;
  chart.on('interact', () => {
    if (!hinted) { hinted = true; setTimeout(() => $('hint').classList.add('gone'), 2500); }
  });
  setTimeout(() => $('hint').classList.add('gone'), 12000);

  // 故事卡
  const starNames = match ? match.stars.map(s => ZH[s.name] || s.name || '无名星') : [];
  StoryCard.init({
    name: parsed.name,
    story: parsed.story,
    meta: `${preset.city} · ${y}.${mo}.${d} · ${parsed.time}`,
    starNames,
    closed: parsed.closed,
    getShape: () => chart.shape(),
    to: parsed.to,
    from: parsed.from,
  });

  Poster.init(() => ({
    chart,
    title: $('sheetTitle').textContent,
    cityLine: $('headCity').textContent,
    footLeft: $('footLeft').textContent,
    name: parsed.name,
    story: parsed.story,
    to: parsed.to,
    from: parsed.from,
    date: parsed.date,
    closed: parsed.closed,
    meta: `${preset.city} · ${y}.${mo}.${d} · ${parsed.time}`,
    starNames,
  }));
  setTimeout(() => $('storyBtn').classList.add('ready'), 3600);

  window.addEventListener('hashchange', () => location.reload());

  if (!match) {
    notice.hidden = false;
    notice.textContent = '这片天上没找到合适的亮星来摆这个形状，换个形状或日期试试。';
  }

  // ---------- 调试面板 ----------
  if (isLab) {
    const lab = $('lab');
    lab.hidden = false;
    $('labInput').value = marker;
    $('labDate').value = parsed.date;
    const presets = $('labPresets');
    for (const p of Sky.PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${p.region}·${p.city}`;
      b.onclick = () => {
        $('labInput').value = $('labInput').value.replace(/^\[星图:[^|]*\|[^|]*\|/, `[星图:${p.region}|${p.city}|`);
      };
      presets.appendChild(b);
    }
    $('labDate').onchange = e => {
      $('labInput').value = $('labInput').value.replace(/\d{4}-\d{2}-\d{2}/, e.target.value);
    };
    $('labApply').onclick = () => { location.hash = encodeURIComponent($('labInput').value.trim()); };
    $('labCopy').onclick = () => {
      const url = StarMarker.buildLink(location.origin + location.pathname, $('labInput').value);
      navigator.clipboard && navigator.clipboard.writeText(url);
      $('labCopy').textContent = '已复制';
    };
    $('labToggle').onclick = () => { lab.classList.toggle('collapsed'); $('labToggle').textContent = lab.classList.contains('collapsed') ? '展开' : '收起'; };
    const info = [
      `城市：${preset.city}  UTC 时刻：${new Date(t).toISOString().slice(0, 16)}Z (${off})`,
      `地平线以上可见星：${sky.stars.length}  候选亮星：${sky.candidates.length}`,
      `模板点：${parsed.points.length}${parsed.closed ? '（闭合）' : ''}`,
      match ? `匹配误差：${match.cost.toFixed(3)}  跨度：${match.spanDeg.toFixed(0)}°  用时：${matchMs.toFixed(0)}ms` : '匹配失败',
      match ? `星：${starNames.join(' → ')}` : '',
      parsed.warnings.length ? `提醒：\n- ${parsed.warnings.join('\n- ')}` : '没有格式提醒',
    ];
    $('labInfo').textContent = info.join('\n');
  }
  if (parsed.warnings.length) console.warn('[星图码提醒]', parsed.warnings);
})();
