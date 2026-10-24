// Actual Tower/Delve UI plus an exhaustive native-art review sheet.
// Defend is deliberately outside this suite.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5187 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
mkdirSync("test-results/goals-hud-sprites", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fixClock(page);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.url().includes("/assets/style/") && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    globalThis.__handStartsPaused = true; globalThis.__handHeld = true;
    const fixture = sessionStorage.getItem("__goalsSpriteFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__goalsSpriteFixture"); }
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator("#hp").waitFor();
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites")), false);
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts");
    const { Game } = await import("/src/state.ts");
    const { UPGRADES } = await import("/src/progression/upgrades.ts");
    const s = defaults();
    for (const id of Object.keys(s.tutorials)) s.tutorials[id] = true;
    for (const u of UPGRADES) s.upgrades[u.id] = 1;
    Object.assign(s.settings, { uiSprites: true, reduceMotion: true, transition: "instant", weatherSound: false });
    s.archives.levels.noteTaking = 1;
    s.tower.tiersOpen = 9;
    s.tower.best = s.tower.reached = 30;
    s.goals.claimed = { 1: [60, 70], 2: [40] };
    s.goals.mastered = { 1: [10, 20] }; s.goals.cleared = { 1: [10] };
    const g = new Game(s); g.newRun({ outside: true, seed: 7 });
    sessionStorage.setItem("__goalsSpriteFixture", JSON.stringify(g.save));
  });
  await page.reload();
  const ready = selector => page.waitForFunction(selector => [...document.querySelectorAll(`${selector} .sprite-icon`)].every(e => e.classList.contains("sprite-ready")), selector);
  await ready("#stats");
  for (const selector of [".silver-stat", ".purse .gold-stat", ".combat-stats .attack-stat", ".combat-stats .defense-stat"])
    assert.equal(await page.locator(`${selector} .sprite-replacement`).count(), 1, "one icon per HUD slot");
  assert.ok((await page.locator(".silver-stat .sprite-replacement").first().getAttribute("src")).endsWith("/silver.png"));
  assert.equal(await page.locator(".silver-stat .silver-sprite").first().evaluate(e => getComputedStyle(e).filter), "none");
  assert.ok((await page.locator("#forest-sign").evaluate(e => getComputedStyle(e).borderImageSource)).includes("ui-sign"));
  await page.screenshot({ path: "test-results/goals-hud-sprites/forest-390.png", animations: "disabled" });
  // Real reusable symbol pairs at native and 2x scale, all fitting a 24px grid.
  await page.evaluate(async () => {
    const { UI_DETAIL_SPRITES, UI_ORNAMENT_SPRITES } = await import("/src/sprites/ui-details.ts");
    const { kitIcon } = await import("/src/sprites/kit.ts");
    const gallery = document.createElement("section"); gallery.id = "ui-detail-review";
    gallery.style.cssText = "position:relative;z-index:99;background:#1b2430;padding:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px";
    gallery.innerHTML = [...UI_DETAIL_SPRITES, ...UI_ORNAMENT_SPRITES].map(id => `<div style="display:flex;align-items:center;gap:4px">${kitIcon(id, "?", "review-native")}${kitIcon(id, "?", "review-double")}</div>`).join("");
    document.querySelector("#app").prepend(gallery);
    gallery.querySelectorAll(".review-native").forEach(e => e.style.cssText = "width:24px;height:24px;flex-shrink:0");
    gallery.querySelectorAll(".review-double").forEach(e => e.style.cssText = "width:48px;height:48px;flex-shrink:0");
  });
  await ready("#ui-detail-review");
  await page.locator("#ui-detail-review").screenshot({ path: "test-results/goals-hud-sprites/native-and-2x.png" });
  await page.locator("#ui-detail-review").evaluate(e => e.remove());
  await page.locator("#section-pick").click();
  await ready("#goals");
  assert.ok(await page.locator('.goal-art .sprite-replacement[src$="goal-damage-prediction.png"]').first().isVisible());
  assert.ok(await page.locator('.goal-mark .sprite-replacement[src$="ui-mastered.png"]').first().isVisible());
  assert.ok(await page.locator(".goal-badge .sprite-replacement").first().isVisible());
  assert.equal(await page.locator(".goal-badge").first().evaluate(e => getComputedStyle(e).position), "absolute");
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/goals-hud-sprites/goals-${width}.png`, animations: "disabled" });
  }
  // A real reward dialog uses a PNG seal, with its live description intact.
  await page.locator('[data-goal="1:10:0"]').click();
  await ready("#modal");
  assert.ok((await page.locator("#modal").evaluate(e => getComputedStyle(e, "::before").backgroundImage)).includes("ui-seal"));
  await page.screenshot({ path: "test-results/goals-hud-sprites/goal-dialog.png", animations: "disabled" });
  await page.locator("#modal").evaluate(e => e.close());
  // Each theme controls its own art without changing the saved preference.
  for (const [uiTheme, gameTheme, shown] of [["medieval", "classic", true], ["neon", "classic", false], ["medieval", "pixel", true], ["neon", "pixel", false]]) {
    await page.evaluate(async ({ uiTheme, gameTheme }) => {
      const { defaults } = await import("/src/save/save.ts");
      const { applyUiTheme } = await import("/src/ui/medieval.ts");
      const s = defaults(); s.themes.push("neonUi", "pixelGame");
      Object.assign(s.settings, { uiSprites: true, uiTheme, gameTheme }); applyUiTheme(s);
    }, { uiTheme, gameTheme });
    assert.equal(await page.locator('.goal-art .sprite-replacement[src$="goal-damage-prediction.png"]').first().isVisible(), shown);
  }
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts");
    const { applyUiTheme } = await import("/src/ui/medieval.ts"); applyUiTheme(defaults());
  });
  assert.equal(await page.locator('.goal-art .sprite-replacement[src$="goal-damage-prediction.png"]').first().isVisible(), false);
  await page.reload();
  await page.locator('[data-tab="upgrades"]').click();
  await ready("#upgrades");
  assert.ok(await page.locator('[data-skill="shroud"] .sprite-replacement[src$="ui-ward.png"]').count());
  await page.screenshot({ path: "test-results/goals-hud-sprites/skills.png", animations: "disabled" });
  await page.locator('[data-tab="board"]').click();
  await page.locator("#enter-run").click();
  await ready("#stats");
  for (const [selector, id] of [["#focus-stat", "focus"], ["#ignore-stat", "ignore"], ["#target-stat", "target"], ["#undo", "undo"]]) {
    assert.ok(await page.locator(`${selector} .sprite-replacement[src$="/${id}.png"]`).isVisible());
    assert.ok(await page.locator(`${selector} b`).textContent());
  }
  assert.ok(await page.locator('#auto .sprite-replacement[src$="play.png"]').isVisible());
  await page.locator("#auto").click();
  await ready("#stats");
  assert.ok(await page.locator('#auto .sprite-replacement[src$="pause.png"]').isVisible());
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/goals-hud-sprites/hud-${width}.png`, animations: "disabled" });
  }
  await page.locator("#height").click();
  await ready("#run-notes");
  assert.ok(await page.locator('#run-notes-copy .sprite-replacement[src$="ui-copy.png"]').isVisible());
  assert.ok(await page.locator(".notes-body table").count());
  assert.equal(await page.locator(".notes-body td").first().evaluate(e => getComputedStyle(e).color), "rgb(238, 224, 183)");
  await page.screenshot({ path: "test-results/goals-hud-sprites/run-notes.png", animations: "disabled" });
  await page.locator("#run-notes-close").click();
  await page.evaluate(async () => {
    const { revealDraws } = await import("/src/ui/badge-reveal.ts");
    revealDraws([{ id: "hp", before: 2, after: 3 }], false);
  });
  await ready(".badge-reveal");
  assert.equal(await page.locator(".badge-coin").evaluate(e => getComputedStyle(e).position), "absolute");
  assert.ok(await page.locator('.badge-coin .sprite-replacement[src$="ui-duplicate.png"]').count());
  await page.waitForFunction(() => document.querySelector(".badge-reveal .badge-level b")?.textContent === "2");
  await page.locator(".badge-reveal-go").click();
  // A failed replacement retains its original SVG and all live counts.
  await page.locator("#focus-stat .sprite-icon").evaluate(e => { e.classList.remove("sprite-ready"); e.querySelector("img").removeAttribute("src"); });
  assert.equal(await page.locator("#focus-stat .sprite-fallback").evaluate(e => getComputedStyle(e).visibility), "visible");
  assert.deepEqual(errors, []);
  console.log("Goals, utility icons, updated skill/Silver art, live HUD controls, PNG seal, theme overrides and missing-image fallback passed at phone/desktop sizes.");
} finally { await browser.close(); await server.close(); }
