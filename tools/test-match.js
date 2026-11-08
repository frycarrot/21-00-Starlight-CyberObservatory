// 命令行快速检查：node tools/test-match.js "[星图:...]"
globalThis.window = globalThis;
require('../data/stars.js');
require('../js/names-zh.js');
const Sky = require('../js/sky.js');
const StarMarker = require('../js/marker.js');
const Matcher = require('../js/matcher.js');

const marker = process.argv[2] ||
  '[星图:东亚|上海|2026-11-08|21:00|模板点:(2,7);(3,8);(4,8);(5,7);(6,8);(7,8);(8,7);(7,4);(5,2);(3,4);(2,7)|名字:归巢之心|故事:测试]';
const p = StarMarker.parseMarker(marker);
console.log('parse:', p.ok, p.errors, p.warnings, p.city, p.date, p.points.length, 'closed=' + p.closed);
for (const preset of Sky.PRESETS) {
  const t = Sky.localToUtc(p.date, p.time, preset.tz);
  const sky = Sky.buildSky(window.STAR_CATALOG, preset, t);
  const t0 = Date.now();
  const r = Matcher.matchTemplate(p.points, sky.candidates);
  console.log(`\n${preset.city} ${new Date(t).toISOString()} ${Sky.utcOffsetLabel(t, preset.tz)} visible=${sky.stars.length} ` +
    `cost=${r.cost.toFixed(3)} span=${r.spanDeg.toFixed(0)}° tilt=${r.tiltDeg.toFixed(0)}° ${Date.now() - t0}ms`);
  console.log('  ' + r.stars.map(s => `${window.STAR_NAMES_ZH[s.name] || s.name}(${s.magApp.toFixed(1)},alt${s.alt.toFixed(0)})`).join(' → '));
}
