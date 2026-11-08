import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR || new URL('../../CarrotHomeSystem/tools/ui-inspector/package.json', import.meta.url))('playwright-core');
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
try {
  for (const [width, height] of [[1920, 1080], [1366, 650], [898, 700], [390, 844], [844, 390]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900 });
    // Exercise the download fallback without opening the host system share panel.
    await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('../index.html', import.meta.url).href);
    assert.equal(await page.locator('#headCity').textContent(), 'EAST ASIA · 东亚（代表城市：上海）');
    if (width > 640) {
      const layout = await page.evaluate(() => {
        const foot = document.querySelector('.sheet-foot').getBoundingClientRect();
        return [...document.querySelectorAll('.sheet-foot > span')].map(el => el.getBoundingClientRect().top - foot.top);
      });
      assert(layout.every(top => Math.abs(top - 20) < 1));
    }
    await page.click('.save-map');
    await page.waitForSelector('.poster-layer.open');
    await page.waitForTimeout(800);
    for (const current of [0, 1]) {
      await page.locator('#posterDots button').nth(current).click();
      await page.waitForTimeout(750);
      const layout = await page.evaluate(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom }; };
        return { card: rect(document.querySelector('.poster-slide.is-active')), actions: rect(document.querySelector('.poster-actions')), tip: rect(document.querySelector('.poster-tip')), save: rect(document.querySelector('.save-map')), w: innerWidth, h: innerHeight };
      });
      assert(layout.card.y >= 0 && layout.card.x >= 0 && layout.card.right <= width, JSON.stringify(layout));
      assert(layout.card.bottom < layout.actions.y && layout.tip.bottom <= height, JSON.stringify(layout));
      assert(Math.abs((layout.save.x + layout.save.right) / 2 - width / 2) < 1, 'Save button must be centered');
      const downloadPromise = page.waitForEvent('download');
      await page.click('#posterSave');
      const download = await downloadPromise;
      assert(download.suggestedFilename().startsWith(current ? '故事卡-' : '星图-'));
    }
    // Both ends wrap: right from story to map; left from map to story.
    if (width >= 900) {
      assert(await page.locator('#posterPrev').isVisible());
      assert(await page.locator('#posterNext').isVisible());
      await page.click('#posterNext');
      assert(await page.locator('#posterImgMap').evaluate(el => el.parentElement.classList.contains('is-active')));
      await page.click('#posterPrev');
      assert(await page.locator('#posterImgCard').evaluate(el => el.parentElement.classList.contains('is-active')));
    } else {
      await page.keyboard.press('ArrowRight');
      assert(await page.locator('#posterImgMap').evaluate(el => el.parentElement.classList.contains('is-active')));
      await page.keyboard.press('ArrowLeft');
      assert(await page.locator('#posterImgCard').evaluate(el => el.parentElement.classList.contains('is-active')));
    }
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(750);
    assert(await page.locator('#posterImgMap').evaluate(el => el.parentElement.classList.contains('is-active')));
    await page.locator('#posterTrack').dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 250, clientY: 200 }] });
    await page.locator('#posterTrack').dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 100, clientY: 200 }] });
    assert(await page.locator('#posterImgCard').evaluate(el => el.parentElement.classList.contains('is-active')));
    await page.click('#posterClose');
    assert.equal(await page.locator('#posterLayer').getAttribute('aria-hidden'), 'true');
    await page.click('.save-map');
    await page.waitForSelector('.poster-layer.open');
    await page.waitForTimeout(100);
    assert(await page.locator('#posterImgMap').evaluate(el => el.parentElement.classList.contains('is-active')));
    assert.deepEqual(errors, []);
    console.log(`${width}x${height}: layout, selection, downloads, swipe, close/reopen OK`);
    if (width === 1920) {
      await page.waitForTimeout(750);
      const { fileURLToPath } = await import('node:url');
      await page.screenshot({ path: fileURLToPath(new URL('_shots/poster-loop.png', import.meta.url)) });
      await page.click('#posterClose');
      await page.waitForTimeout(500);
      await page.screenshot({ path: fileURLToPath(new URL('_shots/desktop-region.png', import.meta.url)) });
    }
    await page.close();
  }
} finally { await browser.close(); }

