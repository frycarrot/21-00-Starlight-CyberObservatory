const assert=require('node:assert/strict');
global.window=global;
require('../data/stars.js');
const Sky=require('../js/sky.js'), M=require('../js/matcher.js'), Parser=require('../js/marker.js');
const p=Parser.parseMarker('[星图:东亚|上海|2026-11-08|21:00|模板点:(1,6);(9,10);(6,6);(9,2);(1,6);(4,6);(5,4)|名字:向你飞去|To:你|From:我|故事:测试]');
assert(p.ok);assert.equal(p.closed,false);assert.equal(p.points.length,7);
for(const preset of Sky.PRESETS){
 const sky=Sky.buildSky(STAR_CATALOG,preset,Sky.localToUtc(p.date,p.time,preset.tz));
 const r=M.matchTemplate(p.points,sky.candidates);
 assert(r);assert.equal(r.stars.length,7);assert.strictEqual(r.stars[0],r.stars[4]);assert.equal(new Set(r.stars).size,6);
 assert.deepEqual(M.matchTemplate(p.points,sky.candidates).stars.map(s=>s.id),r.stars.map(s=>s.id));
 console.log(preset.city,'7 path vertices, 6 stars, revisit reused; deterministic');
}
const closed=Parser.parseMarker('[星图:东亚|上海|2026-11-08|21:00|模板点:(2,2);(2,6);(5,9);(8,6);(8,2);(2,2)|名字:屋|To:你|From:我|故事:测试]');
assert(closed.closed);assert.equal(closed.points.length,5);
