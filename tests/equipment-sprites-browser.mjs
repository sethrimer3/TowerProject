// Actual Equipment commands, native PNG components and independent theme gates.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5189 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
mkdirSync("test-results/equipment-sprites", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fixClock(page);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.url().includes("/assets/style/") && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    globalThis.__handStartsPaused = true; globalThis.__handHeld = true;
    const fixture = sessionStorage.getItem("__equipmentSpriteFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__equipmentSpriteFixture"); }
  });
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites")), false);
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save.ts"); const { Game } = await import("/src/state.ts");
    const s = defaults(); Object.keys(s.tutorials).forEach(k => s.tutorials[k] = true);
    Object.assign(s.upgrades, { gear: 1, delve: 1, combatStance: 1, buildout: 1 });
    Object.assign(s.settings, { uiSprites: true, reduceMotion: true, transition: "instant", weatherSound: false });
    s.gold = 20000; s.gems = 0;
    const item = (id, def, rarity, level, extra = {}) => ({ id, def, rarity, level, slots: [], ...extra });
    Object.assign(s.equipment, { unlocked: true, seen: true, items: [
      item("e1", "knightsSword", "uncommon", 12), item("e2", "knightsSword", "uncommon", 1),
      item("e3", "knightsSword", "uncommon", 4), item("e4", "knightsSword", "uncommon", 1),
      item("e5", "ringOfFury", "rare", 1, { locked: true }), item("e6", "steelCuirass", "common", 3),
    ], equipped: { tower: { weapon: "e1", ring: "e5" }, delve: {} }, nextId: 7 });
    Object.keys(s.equipment.materials).forEach(k => s.equipment.materials[k] = 1000);
    const g = new Game(s); g.newRun({ outside: true, seed: 7 });
    sessionStorage.setItem("__equipmentSpriteFixture", JSON.stringify(g.save));
  });
  const openGear = async () => { await page.locator('[data-tab="gear"]').click(); await page.locator('[data-geartab="equipment"]').click(); };
  const ready = selector => page.waitForFunction(selector => [...document.querySelectorAll(`${selector} .sprite-icon`)].every(e => e.classList.contains("sprite-ready")), selector);
  await page.reload(); await openGear(); await ready("#gear");
  const border = selector => page.locator(selector).first().evaluate(e => getComputedStyle(e).borderImageSource);
  for (const r of ["common", "uncommon", "rare"]) assert.ok((await border(`.eq-grid .rar-${r}`)).includes(`ui-equip-frame-${r}`));
  assert.ok((await border(".eq-ghost")).includes("ui-equip-frame-empty"));
  assert.ok(await page.locator(".eq-slots .eq-tile-worn .sprite-replacement").first().isVisible());
  assert.ok(await page.locator(".eq-slots .eq-tile-unique .sprite-replacement").first().isVisible());
  assert.equal(await page.locator('.eq-grid [data-eq-item="e1"] .eq-tile-level').textContent(), "12");
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/equipment-sprites/loadout-${width}.png`, animations: "disabled" });
  }
  await page.locator('.eq-grid [data-eq-item="e1"]').click(); await ready("#modal");
  assert.ok((await border(".equip-icon-frame")).includes("ui-equip-frame-uncommon"));
  await page.locator("#eq-level").click();
  assert.ok((await page.locator(".item-meta").first().textContent()).includes("Level 13"));
  await page.locator('[data-eq-on="delve"]').click(); await page.locator("#eq-close").click();
  await page.locator('[data-eq-mode="delve"]').click(); await ready("#gear");
  assert.equal(await page.locator('.eq-slots .eq-tile-worn').count(), 1);
  await page.locator('[data-eq-mode="tower"]').click();
  await page.locator('[data-eq-select="toggle"]').click(); await page.locator('.eq-grid [data-eq-item="e2"]').click();
  assert.ok(await page.locator('.eq-grid [data-eq-item="e2"]').evaluate(e => getComputedStyle(e, "::after").borderImageSource.includes("ui-equip-frame-selection")));
  assert.equal(await page.locator('.eq-grid [data-eq-item="e1"]').evaluate(e => e.classList.contains("selected")), false);
  await page.locator('.eq-grid [data-eq-item="e2"]').focus();
  await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  assert.ok(await page.locator('.eq-grid [data-eq-item="e2"]').evaluate(e => e.matches(":focus-visible") && getComputedStyle(e).outlineStyle === "solid"));
  await page.locator('.eq-grid [data-eq-item="e2"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/equipment-sprites/selected.png", animations: "disabled" });
  await page.locator('[data-eq-select="toggle"]').click();
  await page.locator(".eq-salvage summary").click(); await page.locator('[data-eq-auto-salvage]').click(); await ready("#gear");
  assert.equal(await page.locator('[data-eq-auto-salvage]').getAttribute("aria-pressed"), "true");
  assert.ok(await page.locator(".eq-check .sprite-replacement").isVisible());
  assert.ok(await page.locator(".eq-salvage-icon .sprite-replacement").isVisible());
  await page.reload(); await openGear(); await page.locator(".eq-salvage summary").click();
  assert.equal(await page.locator('[data-eq-auto-salvage]').getAttribute("aria-pressed"), "true");
  await ready("#gear");
  for (const [uiTheme, gameTheme, sprites, shown] of [["medieval", "classic", true, true], ["neon", "classic", true, false], ["medieval", "pixel", true, true], ["medieval", "classic", false, false]]) {
    await page.evaluate(async ({ uiTheme, gameTheme, sprites }) => {
      const { defaults } = await import("/src/save.ts"); const { applyUiTheme } = await import("/src/ui/medieval.ts");
      const s = defaults(); s.themes.push("neonUi", "pixelGame"); Object.assign(s.settings, { uiSprites: sprites, uiTheme, gameTheme }); applyUiTheme(s);
    }, { uiTheme, gameTheme, sprites });
    assert.equal((await border(".eq-grid .rar-common")).includes("ui-equip-frame-common"), shown);
    assert.equal(await page.locator(".eq-tile-worn .sprite-replacement").first().isVisible(), shown);
  }
  await page.reload(); await openGear(); await ready("#gear");
  await page.locator(".eq-tile-worn").first().evaluate(e => { e.classList.remove("sprite-ready"); e.querySelector("img").removeAttribute("src"); });
  assert.equal(await page.locator(".eq-tile-worn > .sprite-fallback").first().evaluate(e => getComputedStyle(e).visibility), "visible");
  await page.locator('[data-eq-view="assemble"]').click(); await page.locator('[data-eq-target]').first().click(); await ready("#gear");
  assert.ok((await border(".eq-result-slot")).includes("ui-equip-frame-rare"));
  await page.screenshot({ path: "test-results/equipment-sprites/assemble.png", animations: "disabled" });
  await page.locator("#eq-asm-go").click(); await ready("#modal");
  assert.ok((await border(".eq-result .eq-tile")).includes("ui-equip-frame-rare"));
  await page.locator("#eq-ok").click(); await page.locator('[data-eq-view="pulls"]').click();
  assert.equal(await page.locator('[data-eq-pull="1"]').isEnabled(), true, "Gem shortage remains actionable");
  assert.deepEqual(errors, []);
  console.log("Equipment rarity/empty/selection frames, status PNGs, levels, both loadouts, saved auto-salvage, assembly, fallback and theme gates pass at phone/desktop sizes.");
} finally { await browser.close(); await server.close(); }
