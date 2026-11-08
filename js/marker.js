/*
 * marker.js · 星图码解析（预览版，后端/协议以 astra 的实现为准）
 *
 * [星图:东亚|上海|2026-11-08|21:00|模板点:(2,7);(3,8);...|名字:归巢之心|故事:……]
 *
 * - 地区 / 城市 / 日期 / 时间 按位置写，也可以写成 城市:上海 这种键值
 * - 模板点：10×10 格子，x 向右、y 向上（0～10）。按顺序连线。
 *   最后一个点与第一个点相同 = 闭合图形（这个重复点不计数）
 * - To / From：称呼和署名，各最多 20 字，放在故事前面
 * - 故事必须放最后，可包含除 ] 以外的任何字符
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StarMarker = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const REGION_CITY = { '东亚': '上海', '欧洲': '巴黎', '澳洲': '悉尼', '北美': '纽约' };
  const CITY_REGION = { '上海': '东亚', '巴黎': '欧洲', '悉尼': '澳洲', '纽约': '北美' };
  const MIN_POINTS = 4, MAX_POINTS = 10, HARD_MAX = 12;

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function normDate(s) {
    if (/^今天|today$/i.test(s)) return todayStr();
    const m = s.match(/^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?$/);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function parseMarker(input) {
    const errors = [], warnings = [];
    let s = String(input || '').trim().replace(/^#/, '');
    if (/%[0-9A-Fa-f]{2}/.test(s)) {
      try { s = decodeURIComponent(s); } catch (e) { /* 保持原样 */ }
    }
    s = s.trim();
    const m = s.match(/^[\[［]\s*星图\s*[:：]([\s\S]*)[\]］]\s*$/);
    if (!m) return { ok: false, errors: ['不是星图码：需要以「[星图:」开头、「]」结尾'], warnings };

    let body = m[1];
    let story = '';
    const si = body.search(/[|｜]\s*故事\s*[:：]/);
    if (si >= 0) {
      story = body.slice(si).replace(/^[|｜]\s*故事\s*[:：]/, '').trim();
      body = body.slice(0, si);
    }

    let region = '', city = '', date = '', time = '21:00', name = '', pointsRaw = '', to = '', from = '';
    for (const raw of body.split(/[|｜]/)) {
      const p = raw.trim();
      if (!p) continue;
      const kv = p.match(/^(模板点|名字|日期|时间|城市|地区|区域|to|from)\s*[:：]([\s\S]*)$/i);
      const key = kv ? kv[1].replace(/^to$/i, 'To').replace(/^from$/i, 'From') : '', val = kv ? kv[2].trim() : p;
      if (key === '模板点') pointsRaw = val;
      else if (key === 'To') to = val;
      else if (key === 'From') from = val;
      else if (key === '名字') name = val;
      else if (key === '日期' || (!key && normDate(val))) date = val;
      else if (key === '时间' || (!key && /^\d{1,2}[:：]\d{2}$/.test(val))) time = val.replace('：', ':');
      else if (key === '城市' || (!key && CITY_REGION[val])) city = val;
      else if (key === '地区' || key === '区域' || (!key && REGION_CITY[val])) region = val;
      else warnings.push(`看不懂的片段：「${p}」`);
    }

    if (city && !CITY_REGION[city]) { warnings.push(`城市「${city}」不在预设里，改用地区代表城市`); city = ''; }
    if (region && !REGION_CITY[region]) { warnings.push(`地区「${region}」不在预设里`); region = ''; }
    if (!city && region) city = REGION_CITY[region];
    if (!region && city) region = CITY_REGION[city];
    if (!city) { warnings.push('没写地区，默认东亚·上海'); region = '东亚'; city = '上海'; }
    if (region && REGION_CITY[region] !== city) warnings.push(`「${region}」和「${city}」不匹配，以城市为准`);
    region = CITY_REGION[city];

    const nd = date ? normDate(date) : null;
    if (!nd) { warnings.push(date ? `日期「${date}」无效，改用今天` : '没写日期，改用今天'); }
    date = nd || todayStr();

    if (!/^\d{1,2}:\d{2}$/.test(time)) { warnings.push('时间格式不对，改用 21:00'); time = '21:00'; }
    if (time !== '21:00') warnings.push(`时间约定固定为 21:00，这里收到 ${time}，仍按收到的画`);
    time = time.padStart(5, '0');

    const points = [];
    const re = /[(（]\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*[)）]/g;
    let pm;
    while ((pm = re.exec(pointsRaw))) {
      const x = +pm[1], y = +pm[2];
      if (x < 0 || x > 10 || y < 0 || y > 10) { warnings.push(`点 (${x},${y}) 超出 0～10，已截断`); }
      points.push({ x: Math.max(0, Math.min(10, x)), y: Math.max(0, Math.min(10, y)) });
    }
    let closed = false;
    if (points.length > 2) {
      const a = points[0], b = points[points.length - 1];
      if (a.x === b.x && a.y === b.y) { closed = true; points.pop(); }
    }
    // 相邻重复点去掉
    for (let i = points.length - 1; i > 0; i--) {
      if (points[i].x === points[i - 1].x && points[i].y === points[i - 1].y) points.splice(i, 1);
    }
    if (points.length < 3) errors.push(`模板点太少（${points.length} 个），至少要 ${MIN_POINTS} 个`);
    else if (points.length < MIN_POINTS) warnings.push(`模板点只有 ${points.length} 个，建议 ${MIN_POINTS}～8 个`);
    if (points.length > HARD_MAX) { errors.push(`模板点 ${points.length} 个，超过上限`); }
    else if (points.length > MAX_POINTS) warnings.push(`模板点 ${points.length} 个，超过约定的 ${MAX_POINTS} 个`);

    name = name.trim() || '无名星座';
    if ([...name].length > 20) { warnings.push('名字超过 20 字，已截断'); name = [...name].slice(0, 20).join(''); }
    const cut20 = (v, label) => {
      if ([...v].length <= 20) return v;
      warnings.push(`${label} 超过 20 字，已截断`);
      return [...v].slice(0, 20).join('');
    };
    to = cut20(to, 'To');
    from = cut20(from, 'From');
    if (!to) warnings.push('没写 To，卡片上称呼会用「你」');
    if (!from) warnings.push('没写 From，卡片上署名会用「为你摘星的我」');
    if ([...story].length > 600) { warnings.push('故事超过 600 字，已截断'); story = [...story].slice(0, 600).join('') + '…'; }

    return {
      ok: errors.length === 0, errors, warnings, region, city, date, time, points, closed, name, story,
      to: to || '你', from: from || '为你摘星的我', hasTo: !!to, hasFrom: !!from,
    };
  }

  function buildLink(base, marker) {
    return base.replace(/#.*$/, '') + '#' + encodeURIComponent(marker.trim());
  }

  return { parseMarker, buildLink, REGION_CITY, CITY_REGION };
});
