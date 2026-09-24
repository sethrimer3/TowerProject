import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.addInitScript(() => {
  const fixture = sessionStorage.getItem("__testFixture");
  if (fixture) {
    localStorage.setItem("towerincramental.v1", fixture);
  }
});

const url = process.env.TEST_URL || "http://127.0.0.1:5173/";
await page.goto(url);

// 1. Fresh start: Delve and Defend tabs must be completely hidden
const delveVisibleFresh = await page.locator('[data-tab="delve"]').isVisible();
const defendVisibleFresh = await page.locator('[data-tab="defend"]').isVisible();
assert.equal(delveVisibleFresh, false, "DELVE tab should be hidden when not unlocked");
assert.equal(defendVisibleFresh, false, "DEFEND tab should be hidden when not unlocked");

// Verify Tower, Gear, Upgrades, Settings are visible
for (const tab of ["tower", "gear", "upgrades", "settings"]) {
  const visible = await page.locator(`[data-tab="${tab}"]`).isVisible();
  assert.equal(visible, true, `${tab} tab should be visible`);
}

// Check overflow on mobile
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `Fresh tabs should not overflow at ${width}px`);
}

// 2. Unlock DELVE: Delve tab appears, Defend remains hidden
await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem("towerincramental.v1") || "{}");
  save.upgrades = save.upgrades || {};
  save.upgrades.delve = 1;
  sessionStorage.setItem("__testFixture", JSON.stringify(save));
});
await page.reload();

const delveVisibleUnlocked = await page.locator('[data-tab="delve"]').isVisible();
const defendVisibleLocked = await page.locator('[data-tab="defend"]').isVisible();
assert.equal(delveVisibleUnlocked, true, "DELVE tab should be visible when unlocked");
assert.equal(defendVisibleLocked, false, "DEFEND tab should still be hidden when legacy is not unlocked");

// Check overflow with Delve unlocked
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `Tabs with Delve unlocked should not overflow at ${width}px`);
}

// 3. Unlock AN ENDURING LEGACY: Defend tab appears
await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem("towerincramental.v1") || "{}");
  save.upgrades = save.upgrades || {};
  save.upgrades.legacy = 1;
  sessionStorage.setItem("__testFixture", JSON.stringify(save));
});
await page.reload();

const delveVisibleBoth = await page.locator('[data-tab="delve"]').isVisible();
const defendVisibleUnlocked = await page.locator('[data-tab="defend"]').isVisible();
assert.equal(delveVisibleBoth, true, "DELVE tab should be visible");
assert.equal(defendVisibleUnlocked, true, "DEFEND tab should be visible when legacy is unlocked");

// Check overflow with all 6 tabs unlocked
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `All 6 tabs should not overflow at ${width}px`);
}

// 4. Click DEFEND tab: the city grid should render
await page.locator('[data-tab="defend"]').click();
const defendSelected = await page.locator('[data-tab="defend"]').evaluate((el) => el.classList.contains("selected"));
assert.equal(defendSelected, true, "DEFEND tab should be selected");

const defendSection = page.locator("#defend");
assert.equal(await defendSection.isVisible(), true, "DEFEND page section should be active/visible");
const tileCount = await page.locator(".defend-tile").count();
assert.equal(tileCount, 9 * 13, "DEFEND grid should render 9x13 tiles");
const keepCount = await page.locator(".defend-tile.keep").count();
assert.equal(keepCount, 1, "DEFEND grid should have exactly one keep tile");
const topRowLocked = await page.locator('.defend-tile.locked[data-defend-y="0"]').count();
assert.equal(topRowLocked, 9, "Top row should be locked in the DEFEND grid");

const statsVisible = await page.locator("#stats").isVisible();
assert.equal(statsVisible, false, "Stats section should be hidden on DEFEND tab");

const currenciesVisible = await page.locator("#currencies").isVisible();
assert.equal(currenciesVisible, false, "Currencies section should be hidden on DEFEND tab");

// Clean up fixture from sessionStorage
await page.evaluate(() => sessionStorage.removeItem("__testFixture"));

assert.deepEqual(errors, []);
await browser.close();
console.log("All mode-tabs browser checks passed!");
