import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), Sky=require('../js/sky.js'), Marker=require('../js/marker.js'), Matcher=require('../js/matcher.js');
globalThis.window=globalThis;require('../data/stars.js');
const {chromium}=createRequire(process.env.PLAYWRIGHT_DIR || new URL('../../CarrotHomeSystem/tools/ui-inspector/package.json',import.meta.url))('playwright-core');
const record=process.argv.includes('--record'), baselinePath=new URL('city-baseline.json',import.meta.url);
const baseline=record?{}:JSON.parse(readFileSync(baselinePath));
const browser=await chromium.launch({channel:'msedge'});
try{
for(const city of Sky.PRESETS){
 const results=[];
 for(const date of ['2026-01-15','2026-07-15','2026-11-08']){
 const code=`[星图:${city.region}|${city.city}|${date}|21:00|模板点:(2,2);(2,6);(5,9);(8,6);(8,2);(2,2)|名字:为你留灯|To:你|From:我|故事:今晚，为你留一盏星光。]`;
 const parsed=Marker.parseMarker(code);assert(parsed.ok);assert.deepEqual(parsed.warnings,[]);assert.equal(parsed.city,city.city);
 const utc=Sky.localToUtc(date,'21:00',city.tz);
 const local=new Intl.DateTimeFormat('sv-SE',{timeZone:city.tz,dateStyle:'short',timeStyle:'short',hourCycle:'h23'}).format(new Date(utc));assert.equal(local,`${date} 21:00`);
 const sky=Sky.buildSky(STAR_CATALOG,city,utc,{candidateCount:120,minAlt:12});const match=Matcher.matchTemplate(parsed.points,sky.candidates);assert(match);
 results.push({parsed,utc,stars:match.stars,cost:match.cost});
 }
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await page.addInitScript(()=>{let api;Object.defineProperty(window,'Poster',{get:()=>api,set:v=>{const init=v.init;v.init=f=>{window.getPosterInfo=f;return init(f)};api=v}})});
 const code=`[星图:${city.region}|${city.city}|2026-11-08|21:00|模板点:(2,2);(2,6);(5,9);(8,6);(8,2);(2,2)|名字:为你留灯|To:你|From:我|故事:今晚，为你留一盏星光。]`;
 await page.goto((process.env.TEST_BASE_URL || new URL('../index.html',import.meta.url).href)+'?lab#'+encodeURIComponent(code));
 await page.waitForFunction(()=>window.getPosterInfo);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
 assert((await page.locator('#headCity').textContent()).includes(city.city));assert(!(await page.locator('#headCity').textContent()).includes('undefined'));
 assert((await page.locator('#footLeft').textContent()).includes(city.city));
 const buttons=page.locator('#labPresets button');assert.equal(await buttons.count(),Sky.PRESETS.length);
 for(const b of await buttons.all()){const r=await b.boundingBox();assert(r.x>=0&&r.x+r.width<=390)}
 const pngs=await page.evaluate(async()=>{let seed=123;const original=Math.random;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);try{return (await Poster.make(getPosterInfo())).map(c=>c.toDataURL())}finally{Math.random=original}});
 results.push({exports:pngs.map(p=>createHash('sha256').update(p).digest('hex'))});
 if(record)baseline[city.city]=results;else if(baseline[city.city])assert.deepEqual(results,baseline[city.city],`${city.city}: legacy output changed`);
 console.log(city.city,'parse, 21:00, match, mobile lab, both exports OK');await page.close();
}
if(record)writeFileSync(baselinePath,JSON.stringify(baseline,null,2));
else{
 assert.equal(Sky.PRESETS.length,11);
 for(const [region,city] of Object.entries(Marker.REGION_CITY)){const p=Marker.parseMarker(`[星图:${region}|城市:未知|2026-11-08|21:00|模板点:(1,1);(5,9);(9,1)|故事:测试]`);assert(p.ok);assert.equal(p.city,city);assert(p.warnings.length)}
 for(const [city,dates] of Object.entries({'伦敦':[['2026-03-28',21],['2026-03-29',20],['2026-10-24',20],['2026-10-25',21]],'纽约':[['2026-03-07',2],['2026-03-08',1],['2026-10-31',1],['2026-11-01',2]],'洛杉矶':[['2026-03-07',5],['2026-03-08',4],['2026-10-31',4],['2026-11-01',5]],'悉尼':[['2026-04-04',10],['2026-04-05',11],['2026-10-03',11],['2026-10-04',10]]}))for(const [d,h] of dates)assert.equal(new Date(Sky.localToUtc(d,'21:00',Sky.findPreset('',city).tz)).getUTCHours(),h);
 console.log('Legacy exports byte-identical; defaults, unknown cities and DST boundaries OK');
}
}finally{await browser.close()}
