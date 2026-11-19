import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { decodePng } from '../tools/ui-atlas-png.mjs';
import { fixClock } from './fixed-clock.mjs';
import { openMenu } from './run-menu.mjs';

const server = await createServer({ server: { host: '127.0.0.1', port: 5215 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium' });
const digest = pixels => createHash('sha256').update(Buffer.from(pixels)).digest('hex');
const expected = legacy => {
  const { pixels } = decodePng(readFileSync(`public/assets/ui/frames/${legacy ? 'legacy/' : ''}panel.png`));
  // Canvas readback clears hidden RGB below fully transparent source pixels.
  for (let i = 0; i < pixels.length; i += 4) if (!pixels[i + 3]) pixels.fill(0, i, i + 3);
  return digest(pixels);
};
mkdirSync('test-results/legacy-borders', { recursive: true });
try {
  for (const atlas of [true, false]) for (const width of [390, 1100]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await fixClock(page);
    await page.addInitScript(() => {
      globalThis.__handHeld = true; globalThis.__handStartsPaused = true;
      const fixture = sessionStorage.getItem('__borderFixture');
      if (fixture) { localStorage.setItem('towerdelve.v1', fixture); sessionStorage.removeItem('__borderFixture'); }
    });
    const ready = async () => { await page.locator('#hp').waitFor({ timeout: 120000 }); await page.evaluate(() => document.fonts.ready); };
    const settings = async () => { await openMenu(page); await page.locator('#auto-settings').click(); };
    const seed = async (extra = {}) => {
      await page.evaluate(async ({ atlas, extra }) => {
        const { defaults } = await import('/src/save/save.ts'), { Game } = await import('/src/state.ts');
        const s = defaults(); Object.keys(s.tutorials).forEach(k => s.tutorials[k] = true);
        s.themes.push('medievalUi', 'neonUi');
        Object.assign(s.settings, { experimentalAtlas: atlas, reduceMotion: true, transition: 'instant', weatherSound: false, uiTheme: 'classic' }, extra);
        const g = new Game(s); g.newRun({ seed: 7, outside: false }); g.advanceTowerRoom();
        sessionStorage.setItem('__borderFixture', JSON.stringify(g.save));
      }, { atlas, extra });
      await page.reload(); await ready();
    };
    const frame = async () => page.locator('#board-frame').evaluate(async e => {
      const s = getComputedStyle(e), image = new Image();
      image.src = s.borderImageSource.slice(4, -1).replace(/^['"]|['"]$/g, ''); await image.decode();
      const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
      return { slice: s.borderImageSlice, width: s.borderImageWidth, reserved: s.borderTopWidth, pixels: [...ctx.getImageData(0, 0, c.width, c.height).data] };
    });
    const checkFrame = async legacy => {
      const f = await frame();
      assert.equal(f.slice, `${legacy ? 6 : 3} fill`);
      assert.equal(f.width, `${legacy ? 6 : 3}px`);
      assert.equal(f.reserved, f.width, 'trim reserves its actual width outside the canvas');
      assert.equal(digest(f.pixels), expected(legacy), 'actual CSS frame uses the selected native artwork');
      assert.equal(await page.locator('html').evaluate(e => e.classList.contains('legacy-borders')), legacy);
    };
    await page.goto(server.resolvedUrls.local[0]); await ready(); await seed();
    await checkFrame(false); await settings();
    const toggle = page.getByLabel('LEGACY BORDERS', { exact: true });
    assert.equal(await toggle.isChecked(), false);
    await toggle.check();
    await checkFrame(true);
    assert.equal(await page.locator('#stats-open').evaluate(e => getComputedStyle(e).borderTopWidth), '6px', 'old ordinary button sizing returns immediately');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('towerdelve.v1')).settings.legacyBorders), true);
    await page.locator('#settings-back').click();
    await page.screenshot({ path: `test-results/legacy-borders/legacy-${width}-${atlas}.png`, fullPage: true });
    await page.reload(); await ready(); await checkFrame(true); await settings();
    assert.ok(await toggle.isChecked(), 'preference survives reload');
    await toggle.uncheck(); await checkFrame(false);
    assert.equal(await page.locator('#stats-open').evaluate(e => getComputedStyle(e).borderTopWidth), '3px');
    await page.locator('#settings-back').click();
    await page.screenshot({ path: `test-results/legacy-borders/continuous-${width}-${atlas}.png`, fullPage: true });
    await page.reload(); await ready(); await checkFrame(false);
    // The kit applies to both default UI looks, while Neon retains its own art.
    await seed({ legacyBorders: true, uiTheme: 'medieval' }); await checkFrame(true);
    await seed({ legacyBorders: true, uiTheme: 'neon' });
    assert.equal(await page.locator('html').evaluate(e => e.classList.contains('ui-sprites')), false);
    const neonBorder = await page.locator('#board-frame').evaluate(e => getComputedStyle(e).borderImageSource);
    await settings(); await toggle.uncheck();
    assert.equal(await page.locator('#board-frame').evaluate(e => getComputedStyle(e).borderImageSource), neonBorder);
    assert.equal(await page.locator('html').evaluate(e => e.classList.contains('legacy-borders')), false);
    await toggle.check();
    await page.locator('#erase').click();
    if (!atlas) await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.locator('#confirm').click()]);
    else await page.locator('#confirm').click();
    await ready(); await checkFrame(false);
    await settings(); assert.equal(await toggle.isChecked(), false, 'erase restores the default border choice');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Legacy/continuous native artwork, live switching, saved preferences and themes passed at ${width}px (atlas=${atlas}).`);
  }
} finally { await browser.close(); await server.close(); }
