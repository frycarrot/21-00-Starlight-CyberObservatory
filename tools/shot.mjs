// 本地截图检查（开发用）：node tools/shot.mjs
// 借用 CarrotHomeSystem/tools/ui-inspector 里已装好的 Playwright，可用 PLAYWRIGHT_DIR 改路径
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const pwDir = process.env.PLAYWRIGHT_DIR || join(here, '..', '..', 'CarrotHomeSystem', 'tools', 'ui-inspector', 'package.json');
const { chromium } = createRequire(pwDir)('playwright-core');
const out = join(here, '_shots');
mkdirSync(out, { recursive: true });
const base = pathToFileURL(join(here, '..', 'index.html')).href;

const scenes = [
  { name: 'desktop', vp: { width: 1366, height: 860 }, url: base },
  { name: 'desktop-card', vp: { width: 1366, height: 860 }, url: base, card: true },
  { name: 'mobile', vp: { width: 390, height: 844 }, url: base, mobile: true },
  { name: 'mobile-card', vp: { width: 390, height: 844 }, url: base, mobile: true, card: true },
  { name: 'poster', vp: { width: 1366, height: 860 }, url: base, poster: true },
  { name: 'mobile-poster', vp: { width: 390, height: 844 }, url: base, mobile: true, poster: true },
  { name: 'mobile-poster2', vp: { width: 390, height: 844 }, url: base, mobile: true, poster: true, slide2: true },
  { name: 'sydney-lab', vp: { width: 1366, height: 860 }, url: base + '?lab#' + encodeURIComponent('[星图:澳洲|悉尼|2026-12-24|21:00|模板点:(1,5);(3,6);(5,9);(7,6);(9,5);(7,4);(8,1);(5,3);(2,1);(3,4);(1,5)|名字:平安夜的星|故事:测试南半球。]') },
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
for (const s of scenes) {
  const page = await browser.newPage({ viewport: s.vp, deviceScaleFactor: s.mobile ? 2 : 1, hasTouch: !!s.mobile });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await page.goto(s.url);
  await page.waitForTimeout(5000);
  if (s.card) { await page.click('#storyBtn'); await page.waitForTimeout(3500); }
  if (s.poster) {
    await page.click('.save-map');
    await page.waitForFunction(() => document.getElementById('posterLayer').classList.contains('open'), null, { timeout: 15000 });
    const { writeFileSync } = await import('node:fs');
    for (const id of ['posterImgMap', 'posterImgCard']) {
      const b64 = await page.evaluate(async (id) => {
        const blob = await (await fetch(document.getElementById(id).src)).blob();
        return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
      }, id);
      writeFileSync(join(out, s.name + '-' + id + (process.env.SHOT_TAG ? '-' + process.env.SHOT_TAG : '') + '.png'), Buffer.from(b64, 'base64'));
    }
    await page.waitForTimeout(600);
    if (s.slide2) { await page.click('#posterDots button[data-i="1"]'); await page.waitForTimeout(900); }
  }
  await page.screenshot({ path: join(out, s.name + (process.env.SHOT_TAG ? '-' + process.env.SHOT_TAG : '') + '.png') });
  console.log(s.name, errs.length ? errs : 'ok');
  await page.close();
}
await browser.close();
