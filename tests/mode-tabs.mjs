import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
import assert from "node:assert/strict";
import { openMenu } from "./run-menu.mjs";

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
    localStorage.setItem("towerdelve.v1", fixture);
  }
});

const url = process.env.TEST_URL || "http://127.0.0.1:5173/";
await fixClock(page);
await page.goto(url);

// 0. A fresh game starts inside a Tower run, where the tabs are hidden but
// keep their row; ending the run returns to the forest and shows them.
assert.equal(await page.locator('[data-tab="board"]').isVisible(), false, "Tabs should be hidden inside a run");
assert.ok((await page.locator("nav").boundingBox()).height > 40, "The tab row should keep its space inside a run");
await openMenu(page); await page.locator("#end-run").click();
await page.locator("#confirm").click();

// 1. Fresh start: one board button (the Tower's), no Delve sign, and the
// Deck, Gear and Defend tabs hidden until their skills are owned.
assert.equal(await page.locator('[data-tab="board"]').getAttribute("aria-label"), "Tower", "The board button should be the Tower's");
assert.equal(await page.locator("#forest-sign").isVisible(), false, "The forest sign should be hidden until the Delve is open");
for (const tab of ["deck", "gear", "defend"])
  assert.equal(await page.locator(`[data-tab="${tab}"]`).isVisible(), false, `${tab} tab should be hidden when not unlocked`);
for (const tab of ["board", "upgrades", "research", "shop"])
  assert.equal(await page.locator(`[data-tab="${tab}"]`).isVisible(), true, `${tab} tab should be visible`);
// The tab bar is icons only: no words in its buttons.
assert.equal((await page.locator("nav > button").allInnerTexts()).join("").trim(), "", "Tabs should show icons, not words");

// Check overflow on mobile
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `Fresh tabs should not overflow at ${width}px`);
}

// 2. Unlock DELVE: the forest's sign appears, Defend remains hidden
await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem("towerdelve.v1") || "{}");
  save.upgrades = save.upgrades || {};
  save.upgrades.delve = 1;
  sessionStorage.setItem("__testFixture", JSON.stringify(save));
});
await page.reload();

const delveVisibleUnlocked = await page.locator("#forest-sign").isVisible();
const defendVisibleLocked = await page.locator('[data-tab="defend"]').isVisible();
assert.equal(delveVisibleUnlocked, true, "The forest sign should show once the Delve is unlocked");
assert.equal(defendVisibleLocked, false, "DEFEND tab should still be hidden when legacy is not unlocked");

// Short desktop/browser windows use the compact board layout. The playfield
// must retain a real square row after the status and controls move into it.
await page.setViewportSize({ width: 800, height: 600 });
for (const mode of ["tower", "delve"]) {
  // The sign leads from the Tower's forest to the Delve's, and the board button follows.
  if (mode === "delve") await page.locator("#forest-sign").click();
  assert.equal(await page.locator('[data-tab="board"]').getAttribute("aria-label"), mode === "tower" ? "Tower" : "Delve");
  const world = await page.locator("#world").boundingBox();
  assert.ok(world && world.width > 0 && world.height > 0, `${mode} viewport should not collapse in a short window`);
  assert.ok(Math.abs(world.width - world.height) < 1, `${mode} viewport should remain square in a short window`);
}

// Check overflow with Delve unlocked
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `Tabs with Delve unlocked should not overflow at ${width}px`);
}

// 3. Unlock AN ENDURING LEGACY: Defend tab appears
await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem("towerdelve.v1") || "{}");
  save.upgrades = save.upgrades || {};
  save.upgrades.legacy = 1;
  sessionStorage.setItem("__testFixture", JSON.stringify(save));
});
await page.reload();

const delveVisibleBoth = await page.locator("#forest-sign").isVisible();
const defendVisibleUnlocked = await page.locator('[data-tab="defend"]').isVisible();
assert.equal(delveVisibleBoth, true, "The forest sign should still show");
assert.equal(defendVisibleUnlocked, true, "DEFEND tab should be visible when legacy is unlocked");

// Check overflow with all 6 tabs unlocked
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `Every tab should not overflow at ${width}px`);
}

// The Defend page itself isn't tested while Defend is on hold.

// Clean up fixture from sessionStorage
await page.evaluate(() => sessionStorage.removeItem("__testFixture"));

assert.deepEqual(errors, []);
await browser.close();
console.log("All mode-tabs browser checks passed!");
