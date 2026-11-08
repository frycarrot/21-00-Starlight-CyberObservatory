import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR || new URL('../../CarrotHomeSystem/tools/ui-inspector/package.json', import.meta.url))('playwright-core');
const base = process.env.TEST_BASE_URL || new URL('../index.html', import.meta.url).href;
const oldChart = process.env.TEST_OLD_CHART ? execFileSync('git', ['-c', 'safe.directory=//192.168.2.48/Carrot/LLM/CyberObservatory', 'show', 'HEAD:js/chart.js'], { encoding: 'utf8' }) : null;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
try {
  for (const [name, width, height, region, city, points] of [
    ['tall-mobile', 390, 844, '东亚', '上海', '(2,1);(1,6);(5,9);(8,2);(2,1)'],
    ['wide-desktop', 1366, 650, '欧洲', '巴黎', '(1,5);(3,6);(7,6);(9,5);(5,4);(1,5)'],
    ['south-mobile', 360, 900, '澳洲', '悉尼', '(2,2);(2,6);(5,9);(8,6);(8,2);(2,2)'],
    ['north-landscape', 844, 390, '北美', '纽约', '(1,7);(3,9);(5,7);(7,9);(9,7);(8,4);(5,1);(2,4);(1,7)'],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (oldChart) await page.route('**/js/chart.js*', route => route.fulfill({ contentType: 'text/javascript', body: oldChart }));
    await page.addInitScript(() => {
      let chartAPI;
      Object.defineProperty(window, 'StarChart', {
        get: () => chartAPI,
        set: value => {
          const create = value.create;
          value.create = (canvas, data) => {
            window.testData = data;
            return window.testChart = create(canvas, data);
          };
          chartAPI = value;
        },
      });
      window.snapshotLabels = [];
      window.liveLabels = {};
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
        if (window.capturing) window.snapshotLabels.push({ text, x, y, width: this.measureText(text).width, align: this.textAlign });
        if (this.canvas.id === 'sky') window.liveLabels[text] = { x, y };
        return fillText.call(this, text, x, y, ...rest);
      };
    });
    const marker = `[星图:${region}|${city}|2026-11-08|21:00|模板点:${points}|名字:破浪与信标|To:你|From:为你摘星的我|故事:沿着星光回家。]`;
    await page.goto(base + '#' + encodeURIComponent(marker));
    await page.waitForFunction(() => window.testChart && Object.keys(window.liveLabels).length > 0);
    await page.evaluate(() => document.fonts.ready);
    for (const mode of ['initial', 'zoomed', 'panned']) {
      if (mode === 'zoomed') {
        await page.locator('#sky').dispatchEvent('wheel', { deltaY: -1800 });
      }
      if (mode === 'panned') {
        const canvas = await page.locator('#sky').boundingBox();
        await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
        await page.mouse.down();
        await page.mouse.move(canvas.x + canvas.width / 2 + 1300, canvas.y + canvas.height / 2 - 600, { steps: 5 });
        await page.mouse.up();
      }
      await page.waitForTimeout(100);
      const result = await page.evaluate(() => {
        const expected = window.testData.match.stars.map(s => window.testData.zhNames[s.name] || s.name);
        const beforeShape = window.testChart.shape();
        const beforeLabels = Object.fromEntries(expected.map(name => [name, window.liveLabels[name]]));
        window.snapshotLabels = [];
        window.capturing = true;
        const out = window.testChart.snapshot(904, 904, 2);
        window.capturing = false;
        const afterShape = window.testChart.shape();
        const labels = window.snapshotLabels;
        return { expected, beforeShape, afterShape, beforeLabels, labels, png: out.toDataURL() };
      });
      for (const name of result.expected) {
        const label = result.labels.find(l => l.text === name);
        assert(label, `${name}/${mode}: missing star`);
        assert(label.x >= 24 && label.x + label.width < 904 - 16 && label.y > 40 && label.y < 904 - 24, `${name}/${mode}: clipped ${JSON.stringify(label)}`);
      }
      assert.deepEqual(result.afterShape, result.beforeShape, `${name}/${mode}: snapshot changed screen caches`);
      const title = result.labels.find(l => l.text === '破浪与信标');
      assert(title && title.x - title.width / 2 >= 16 && title.x + title.width / 2 <= 888 && title.y >= 40);
      await page.waitForTimeout(100);
      const afterLabels = await page.evaluate(names => Object.fromEntries(names.map(n => [n, window.liveLabels[n]])), result.expected);
      assert.deepEqual(afterLabels, result.beforeLabels, `${name}/${mode}: snapshot changed screen viewpoint`);
      if (name === 'tall-mobile' && mode === 'initial') writeFileSync(fileURLToPath(new URL('_shots/export-fit-fixed.png', import.meta.url)), Buffer.from(result.png.split(',')[1], 'base64'));
      console.log(name, mode, result.expected.length, 'stars + labels inside export; screen unchanged');
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
