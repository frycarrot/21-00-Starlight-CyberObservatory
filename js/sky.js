/*
 * sky.js · 真实星空计算（纯前端，不联网）
 * 日期 + 当地时间 + 城市经纬度 → 每颗星此刻在当地天空的高度/方位。
 * 精度：忽略岁差（J2000 星表 → 2026 年约差 0.37°）和大气折射，肉眼星图足够。
 * 浏览器里挂到 window.Sky；Node 里可 require。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sky = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;

  // 十一座城市预设。tz 用 IANA 时区名，夏令时由浏览器自带的时区库处理。
  const PRESETS = [
    { region: '东亚', city: '上海', cityEn: 'Shanghai', lat: 31.2304, lon: 121.4737, tz: 'Asia/Shanghai' },
    { region: '欧洲', city: '巴黎', cityEn: 'Paris', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris' },
    { region: '澳洲', city: '悉尼', cityEn: 'Sydney', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
    { region: '北美', city: '纽约', cityEn: 'New York', lat: 40.7128, lon: -74.006, tz: 'America/New_York' },
    { region: '东亚', city: '东京', cityEn: 'Tokyo', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo' },
    { region: '东亚', city: '香港', cityEn: 'Hong Kong', lat: 22.3193, lon: 114.1694, tz: 'Asia/Hong_Kong' },
    { region: '东亚', city: '台北', cityEn: 'Taipei', lat: 25.033, lon: 121.5654, tz: 'Asia/Taipei' },
    { region: '东亚', city: '北京', cityEn: 'Beijing', lat: 39.9042, lon: 116.4074, tz: 'Asia/Shanghai' },
    { region: '欧洲', city: '伦敦', cityEn: 'London', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
    { region: '北美', city: '洛杉矶', cityEn: 'Los Angeles', lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles' },
    { region: '东南亚', city: '新加坡', cityEn: 'Singapore', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore' },
  ];

  function findPreset(region, city) {
    return PRESETS.find(p => p.city === city) || PRESETS.find(p => p.region === region) || PRESETS[0];
  }

  // 某一瞬间 t(UTC 毫秒) 在时区 tz 的偏移（毫秒）
  function tzOffsetMs(t, tz) {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = {};
    for (const x of f.formatToParts(new Date(t))) p[x.type] = x.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - t;
  }

  // "2026-11-08" + "21:00" 在 tz 当地 → UTC 毫秒
  function localToUtc(dateStr, timeStr, tz) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = (timeStr || '21:00').split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    let t = wall;
    for (let i = 0; i < 3; i++) t = wall - tzOffsetMs(t, tz);
    return t;
  }

  function utcOffsetLabel(t, tz) {
    const min = Math.round(tzOffsetMs(t, tz) / 60000);
    const sign = min >= 0 ? '+' : '−';
    const a = Math.abs(min);
    return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
  }

  // 地方恒星时（度）
  function lstDeg(t, lonDeg) {
    const jd = t / 86400000 + 2440587.5;
    const g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + lonDeg;
    return ((g % 360) + 360) % 360;
  }

  function makeObserver(preset, t) {
    const phi = preset.lat * D2R;
    const lst = lstDeg(t, preset.lon);
    return { preset, t, lst, lstRad: lst * D2R, sinPhi: Math.sin(phi), cosPhi: Math.cos(phi) };
  }

  // 赤道坐标 → 地平坐标单位向量 [东, 北, 天顶]
  function equToVec(obs, raHours, decDeg) {
    const H = obs.lstRad - raHours * 15 * D2R;
    const dec = decDeg * D2R;
    const sd = Math.sin(dec), cd = Math.cos(dec), sH = Math.sin(H), cH = Math.cos(H);
    return [
      -cd * sH,
      sd * obs.cosPhi - cd * obs.sinPhi * cH,
      sd * obs.sinPhi + cd * obs.cosPhi * cH,
    ];
  }

  function vecToAltAz(v) {
    const alt = Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D;
    let az = Math.atan2(v[0], v[1]) * R2D;
    if (az < 0) az += 360;
    return { alt, az };
  }

  function altAzToVec(altDeg, azDeg) {
    const a = altDeg * D2R, z = azDeg * D2R, ca = Math.cos(a);
    return [ca * Math.sin(z), ca * Math.cos(z), Math.sin(a)];
  }

  // 低空大气消光：越靠近地平线越暗
  function extinctMag(mag, sinAlt) {
    if (sinAlt <= 0) return 99;
    const X = 1 / (sinAlt + 0.025 * Math.exp(-11 * sinAlt));
    return mag + 0.22 * (X - 1);
  }

  // 银道 → 赤道 (J2000)，用来画银河
  const GAL = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.44482963, 0.7469822445],
    [-0.867666149, -0.1980763734, 0.4559837762],
  ];
  function galToEqu(lDeg, bDeg) {
    const l = lDeg * D2R, b = bDeg * D2R;
    const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
    const x = GAL[0][0] * g[0] + GAL[1][0] * g[1] + GAL[2][0] * g[2];
    const y = GAL[0][1] * g[0] + GAL[1][1] * g[1] + GAL[2][1] * g[2];
    const z = GAL[0][2] * g[0] + GAL[1][2] * g[1] + GAL[2][2] * g[2];
    let ra = Math.atan2(y, x) * R2D / 15;
    if (ra < 0) ra += 24;
    return { ra, dec: Math.asin(z) * R2D };
  }

  // 黄道 → 赤道
  function eclToEqu(lambdaDeg) {
    const e = 23.4393 * D2R, l = lambdaDeg * D2R;
    let ra = Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l)) * R2D / 15;
    if (ra < 0) ra += 24;
    return { ra, dec: Math.asin(Math.sin(e) * Math.sin(l)) * R2D };
  }

  /**
   * 构建某地某刻的可见星空。
   * catalog: [[ra时, dec度, 星等, B-V, 名称], ...]
   * 返回 { observer, stars: 地平线以上可见的星, candidates: 拿来匹配模板的亮星 }
   */
  function buildSky(catalog, preset, t, opts = {}) {
    const candidateCount = opts.candidateCount ?? 120;
    const minAlt = opts.minAlt ?? 12;
    const obs = makeObserver(preset, t);
    const stars = [];
    for (let i = 0; i < catalog.length; i++) {
      const [ra, dec, mag, bv, name] = catalog[i];
      const v = equToVec(obs, ra, dec);
      if (v[2] <= 0) continue;
      const magApp = extinctMag(mag, v[2]);
      if (magApp > 6.3) continue;
      const { alt, az } = vecToAltAz(v);
      stars.push({ id: i, ra, dec, mag, bv, name, v, alt, az, magApp });
    }
    const candidates = stars
      .filter(s => s.alt >= minAlt)
      .sort((a, b) => a.magApp - b.magApp)
      .slice(0, candidateCount);
    return { observer: obs, stars, candidates };
  }

  return {
    PRESETS, findPreset, localToUtc, utcOffsetLabel, lstDeg, makeObserver,
    equToVec, vecToAltAz, altAzToVec, galToEqu, eclToEqu, buildSky, D2R, R2D,
  };
});
