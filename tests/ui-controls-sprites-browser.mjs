// Real settings, popup and reward controls; native inputs keep their behavior.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { openMenu } from "./run-menu.mjs";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5190 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
mkdirSync("test-results/ui-controls-sprites", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fixClock(page);
  const errors = [];
  const loaded = new Set();
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => {
    if (r.url().includes("/assets/style/")) {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
      else loaded.add(r.url().split("/").at(-1));
    }
  });
  await page.addInitScript(() => {
    globalThis.__handStartsPaused = true; globalThis.__handHeld = true;
    const fixture = sessionStorage.getItem("__controlSpriteFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__controlSpriteFixture"); }
  });
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites")), false);
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts"); const { Game } = await import("/src/state.ts");
    const s = defaults(); Object.keys(s.tutorials).forEach(k => s.tutorials[k] = true);
    Object.assign(s.upgrades, { combatStance: 1, buildout: 1, overheal: 1 }); s.training.overheal = 100;
    Object.assign(s.settings, { reduceMotion: true, transition: "instant", weatherSound: false });
    const g = new Game(s); g.newRun({ seed: 7 }); g.run.player.hp = g.hpCeiling;
    sessionStorage.setItem("__controlSpriteFixture", JSON.stringify(g.save));
  });
  const ready = selector => page.waitForFunction(selector => [...document.querySelectorAll(`${selector} .sprite-icon`)].every(e => e.classList.contains("sprite-ready")), selector);
  const background = selector => page.locator(selector).evaluate(e => getComputedStyle(e).backgroundImage);
  await page.reload();
  assert.ok(await page.locator("#overheal").isVisible());
  for (const selector of ["#health-gain", "#overheal-gain"]) assert.ok((await background(selector)).includes("ui-fill-gain"));
  for (const selector of ["#health-loss", "#overheal-loss"]) assert.ok((await background(selector)).includes("shrine-fill"));
  await page.locator("#gold-bonus").click(); await ready(".gold-bonus-box");
  assert.ok(await page.locator(".gold-bonus-box").evaluate(e => getComputedStyle(e).borderImageSource !== "none"));
  await page.screenshot({ path: "test-results/ui-controls-sprites/gold-popup.png", animations: "disabled" });
  await page.locator(".gold-bonus-x .sprite-replacement").click();
  assert.equal(await page.locator(".gold-bonus-layer").count(), 0);
  await page.locator("#base-enemy").click(); await ready(".enemy-odds-box");
  const table = await page.locator(".enemy-odds-table").first().textContent();
  assert.ok(table.includes("Chance") && await page.locator('.enemy-odds-table th[aria-label="ATK"] .stat-sprite').count());
  await page.screenshot({ path: "test-results/ui-controls-sprites/enemy-popup.png", animations: "disabled" });
  await page.locator(".enemy-odds-x .sprite-replacement").click();
  assert.equal(await page.locator(".enemy-odds-layer").count(), 0);
  await openMenu(page); await page.locator("#auto-settings").click(); await ready("#settings");
  const range = page.locator("#brightness");
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await range.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await range.evaluate(e => getComputedStyle(e).getPropertyValue("--ui-slider-thumb").includes("ui-slider-thumb")));
    await page.screenshot({ path: `test-results/ui-controls-sprites/settings-${width}.png`, animations: "disabled" });
  }
  await range.press("ArrowLeft");
  assert.equal(await range.inputValue(), "95");
  assert.equal(await page.locator("#brightness-value").textContent(), "95");
  assert.ok(await range.evaluate(e => e.matches(":focus-visible") && getComputedStyle(e).outlineStyle === "solid"));
  const box = await range.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.screenshot({ path: "test-results/ui-controls-sprites/slider-active.png", animations: "disabled" });
  await page.mouse.up();
  assert.notEqual(await range.inputValue(), "95");
  const savedBrightness = await range.inputValue();
  await page.locator("#stats-open").click(); await ready("#modal");
  await page.locator("#stats-close .sprite-replacement").click();
  assert.equal(await page.locator("#modal").evaluate(e => e.open), false);
  await page.locator("#ui-themes").click(); await ready("#themes");
  await page.locator("#themes-back .sprite-replacement").click();
  for (const [uiTheme, gameTheme, sprites, shown] of [["medieval", "classic", true, true], ["neon", "classic", true, false], ["medieval", "pixel", true, true], ["medieval", "classic", false, false]]) {
    await page.evaluate(async ({ uiTheme, gameTheme, sprites }) => {
      const { defaults } = await import("/src/save/save.ts"); const { applyUiTheme } = await import("/src/ui/medieval.ts");
      const s = defaults(); s.themes.push("neonUi", "pixelGame"); Object.assign(s.settings, { uiTheme: sprites ? uiTheme : "neon", gameTheme }); applyUiTheme(s);
    }, { uiTheme, gameTheme, sprites });
    assert.equal(await page.locator("#settings-back .sprite-replacement").isVisible(), shown);
    assert.equal(await range.evaluate(e => getComputedStyle(e).getPropertyValue("--ui-slider-thumb").includes("ui-slider-thumb")), shown);
  }
  await page.reload(); await openMenu(page); await page.locator("#auto-settings").click(); await ready("#settings");
  assert.equal(await range.inputValue(), savedBrightness);
  await page.locator("#settings-back .ui-control-icon").evaluate(e => { e.classList.remove("sprite-ready"); e.querySelector("img").removeAttribute("src"); });
  assert.equal(await page.locator("#settings-back .theme-art").evaluate(e => getComputedStyle(e).visibility), "visible");
  await page.evaluate(async () => {
    const { revealReward, offerShown } = await import("/src/ui/reward-reveal.ts");
    const { OFFERS } = await import("/src/shop/offers.ts"); const { ENTITLEMENTS } = await import("/src/shop/entitlements.ts");
    const offer = OFFERS.find(o => o.item?.kind === "entitlement" && ENTITLEMENTS[o.item.id].goldFactor === 1);
    revealReward(offerShown(offer), true);
  });
  await ready(".reward-reveal");
  assert.ok(await page.locator(".reward-reveal-star .sprite-replacement").isVisible());
  await page.screenshot({ path: "test-results/ui-controls-sprites/reward.png", animations: "disabled" });
  await page.locator(".reward-reveal-star .sprite-replacement").click();
  assert.equal(await page.locator(".reward-reveal").count(), 0);
  assert.deepEqual(errors, []);
  for (const file of ["ui-slider-thumb.png", "ui-slider-thumb-active.png", "ui-slider-track.png"]) assert.ok(loaded.has(file), file);
  console.log("Native PNG navigation, popup closes, sliders, live values, save/reload, focus, bar fills, reward star, fallback and theme overrides pass on phone/desktop layouts.");
} finally { await browser.close(); await server.close(); }
