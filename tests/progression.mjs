import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { const fixture = sessionStorage.getItem('hudFixture'); if (fixture) { localStorage.setItem('towerdelve.v1', fixture); sessionStorage.removeItem('hudFixture'); } });
await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
const shown = (selector) => page.locator(selector).isVisible();

// A new game starts inside its first Tower run. The left rail holds the
// purse: Gems, Gold, then Silver.
assert.equal(await page.locator('.tower-heading').isVisible(), false);
assert.deepEqual(await page.locator('.hud-controls .purse > span').evaluateAll((s) => s.map((e) => e.className)), ['gem-stat', 'gold-stat', 'silver-stat']);
// Inside a run the height column ends with End Run, and Research stands under Settings.
assert.equal(await shown('#end-run'), true);
assert.equal(await shown('#section-pick'), false);
assert.equal(await shown('#enter-run'), false);
assert.equal(await shown('#run-research'), true);
assert.equal(await page.getByRole('button', { name: 'Claim 7 Gems', exact: true }).innerText(), '7\nCLAIM');
await page.getByRole('button', { name: 'End current run', exact: true }).click();
assert.match(await page.locator('#modal').innerText(), /End this ascent\?/);
await page.locator('#confirm').click();

// In the forest Goals and Enter take End Run's place; Research is a tab.
assert.equal(await shown('#end-run'), false);
assert.equal(await page.getByRole('button', { name: 'Goals', exact: true }).isVisible(), true);
assert.equal(await shown('#enter-run'), true);
assert.equal(await shown('#run-research'), false);

// With the Delve open, the sign leads to its forest, whose second button is
// still a placeholder, and a Delve run's End Run names it.
await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem('towerdelve.v1'));
  save.upgrades.delve = 1;
  save.tutorials.enter = true;
  sessionStorage.setItem('hudFixture', JSON.stringify(save));
});
await page.reload();
await page.locator('#forest-sign').click();
assert.equal(await page.getByRole('button', { name: 'Future Delve action 2', exact: true }).isVisible(), true);
await page.locator('#enter-run').click();
await page.getByRole('button', { name: 'End current run', exact: true }).click();
assert.match(await page.locator('#modal').innerText(), /End this delve\?/);
await page.locator('#cancel').click();
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
assert.deepEqual(errors, []); await browser.close(); console.log('Purse, height-column buttons in and out of a run, and mode-specific HUD checks passed at 390px.');
