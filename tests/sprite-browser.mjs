// Optional sprite presentation and real Settings persistence in a browser.
// Run against `npm run dev` with PLAYWRIGHT_EXECUTABLE_PATH if Edge is absent.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { openMenu } from "./run-menu.mjs";
import { fixClock } from "./fixed-clock.mjs";

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await fixClock(page);
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("response", r => { if (r.url().includes("/assets/style/") && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
mkdirSync("test-results/sprites", { recursive: true });
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173/");
  await page.locator("#hp").waitFor();
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites")), false);
  // Start outside, with the actual default themes and no lessons obscuring it.
  await page.addInitScript(() => {
    const fixture = sessionStorage.getItem("__spriteFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__spriteFixture"); }
  });
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts");
    const { Game } = await import("/src/state.ts");
    const s = defaults();
    Object.keys(s.tutorials).forEach(k => s.tutorials[k] = true);
    s.upgrades.gear = 1;
    s.gold = 5000;
    s.equipment.unlocked = true;
    s.equipment.materials.whetstone = 40;
    s.equipment.items = [{ id: "e1", def: "knightsSword", rarity: "common", level: 1, slots: [] }];
    const g = new Game(s);
    g.newRun({ outside: true, seed: 7 });
    sessionStorage.setItem("__spriteFixture", JSON.stringify(g.save));
  });
  await page.reload();
  await openMenu(page);
  await page.locator("#auto-settings").click();
  const sprites = page.locator("#ui-sprites");
  await sprites.check();
  await page.waitForFunction(() => document.documentElement.classList.contains("ui-sprites"));
  await page.screenshot({ path: "test-results/sprites/settings-390.png", fullPage: true, animations: "disabled" });
  await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains("ui-sprites"));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("towerdelve.v1")).settings.uiSprites), true);
  // The real helper markup, including previously SVG-only actions and relics.
  await page.evaluate(async () => {
    const { ACTION_ICONS } = await import("/src/ui/equipment-icons.ts");
    const { relicIcon, POINTER_SVG, CART_ICON, NAV_TABS } = await import("/src/ui/dom.ts");
    const gallery = document.createElement("section");
    gallery.id = "sprite-review";
    gallery.style.cssText = "position:relative;z-index:100;background:#1b2430;padding:16px;display:flex;gap:16px;flex-wrap:wrap";
    gallery.innerHTML = Object.values(ACTION_ICONS).join("") + relicIcon("rare") + relicIcon("epic") + POINTER_SVG + CART_ICON + NAV_TABS.find(t => t.id === "deck").icon;
    document.querySelector("#app").prepend(gallery);
    for (const icon of gallery.children) icon.style.cssText = "width:48px;height:48px;flex-shrink:0";
  });
  await page.waitForFunction(() => [...document.querySelectorAll("#sprite-review .sprite-icon")].every(e => e.classList.contains("sprite-ready")));
  assert.ok(await page.locator("#sprite-review .sprite-replacement").first().isVisible());
  assert.equal(await page.locator("#sprite-review .sprite-replacement").last().evaluate(e => getComputedStyle(e).transform), "none");
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/sprites/ui-${width}.png`, fullPage: true, animations: "disabled" });
  }
  // Paint the production dressing functions at native resolution too.
  await page.waitForFunction(async () => {
    const { DETAIL_SPRITES, kitImage } = await import("/src/sprites/kit.ts");
    return DETAIL_SPRITES.slice(8).map(id => kitImage(id)).every(Boolean);
  });
  await page.evaluate(async () => {
    const { paintKitPlant } = await import("/src/render/decor/decor-bake.ts");
    const { drawCrates } = await import("/src/render/decor/decor-sprites.ts");
    const cv = document.createElement("canvas");
    cv.id = "dressing-review"; cv.width = 192; cv.height = 48;
    cv.style.cssText = "display:block;width:384px;height:96px;image-rendering:pixelated;background:#1b2430";
    const c = cv.getContext("2d");
    ["fern", "mushrooms", "tuft", "sprout", "pebbles", "web"].forEach((kind, i) => {
      c.save(); c.translate(i * 24, 0);
      paintKitPlant(c, { kind, i: 12, j: 20, variant: 0 });
      c.restore();
    });
    for (const [i, kind] of ["crate", "barrel"].entries())
      drawCrates(c, i + 6, 0, [{ x: 5, y: 8, w: 12, h: 12, lift: 0, tone: 0, kind }], true, true);
    document.querySelector("#sprite-review").append(cv);
  });
  await page.locator("#dressing-review").screenshot({ path: "test-results/sprites/dressing.png" });
  await page.locator("#dressing-review").evaluate(e => e.remove());
  // Each theme overrides its own part while preserving the saved preference.
  for (const [uiTheme, gameTheme, expectedUi, expectedGame] of [
    ["medieval", "classic", true, true], ["neon", "classic", false, true],
    ["medieval", "pixel", true, false], ["neon", "pixel", false, false],
  ]) {
    const actual = await page.evaluate(async ({ uiTheme, gameTheme }) => {
      const { defaults } = await import("/src/save/save.ts");
      const { applyUiTheme } = await import("/src/ui/medieval.ts");
      const s = defaults();
      s.themes.push("neonUi", "pixelGame");
      Object.assign(s.settings, { uiSprites: true, uiTheme, gameTheme });
      applyUiTheme(s);
      return [document.documentElement.classList.contains("ui-sprites"), document.documentElement.classList.contains("game-sprites")];
    }, { uiTheme, gameTheme });
    assert.deepEqual(actual, [expectedUi, expectedGame]);
    assert.equal(await page.locator("#sprite-review .sprite-replacement").first().isVisible(), expectedUi);
  }
  // Inspect the real Equipment dialog, not just the review sheet.
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-tab="gear"]').click();
  await page.locator('[data-geartab="equipment"]').click();
  await page.locator('[data-eq-item="e1"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll("#modal .sprite-icon")].every(e => e.classList.contains("sprite-ready")));
  assert.ok(await page.locator("#eq-dismantle .sprite-replacement").isVisible());
  await page.screenshot({ path: "test-results/sprites/equipment-390.png", fullPage: true, animations: "disabled" });
  await page.evaluate(() => document.querySelector("#modal").close());
  // Reset the actual page and switch off through Settings, including reload.
  await page.reload();
  await openMenu(page);
  await page.locator("#auto-settings").click();
  await page.locator("#ui-sprites").uncheck();
  await page.reload();
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites") || e.classList.contains("game-sprites")), false);
  assert.deepEqual(errors, []);
  console.log("Sprite loading, mobile/desktop layouts, saved toggle and independent theme overrides passed.");
} finally {
  await browser.close();
}
