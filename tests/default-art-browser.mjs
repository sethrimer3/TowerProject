import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
import { openMenu } from "./run-menu.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 5196 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium", headless: true });
mkdirSync("test-results/default-art", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fixClock(page);
  const errors = [], missing = [], legacy = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.status() >= 400 && /assets\//.test(r.url())) missing.push(r.url()); });
  page.on("request", r => { if (/assets\/(cards|enemies|materials|sprites|tilesets)\//.test(r.url())) legacy.push(r.url()); });
  await page.addInitScript(() => {
    globalThis.__handHeld = true; globalThis.__handStartsPaused = true;
    const raw = sessionStorage.getItem("__defaultArtFixture");
    if (raw) { localStorage.setItem("towerdelve.v1", raw); sessionStorage.removeItem("__defaultArtFixture"); }
  });
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  await page.route("**/assets/style/hero-down.png", async route => { await hold; await route.continue(); });
  await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" });
  assert.ok(await page.locator("#boot-loading").isVisible());
  assert.equal(await page.locator("#app").isVisible(), false, "game stays hidden while a required sprite is delayed");
  await page.screenshot({ path: "test-results/default-art/loading.png" });
  release();
  await page.unroute("**/assets/style/hero-down.png");
  await page.locator("#hp").waitFor({ timeout: 30000 });
  assert.equal(await page.locator("#boot-loading").count(), 0);
  assert.ok(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites") && e.classList.contains("game-sprites")), "new game uses pixel art without opting in");
  assert.ok(await page.evaluate(() => [...document.images].every(i => i.complete && i.naturalWidth)), "every initial DOM image is ready at reveal");
  assert.ok(await page.locator("#world").evaluate(c => c.width > 0 && c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v)), "the board is painted before the loading screen disappears");
  await page.screenshot({ path: "test-results/default-art/ready-390.png" });

  const seed = async (settings = {}) => {
    await page.evaluate(async settings => {
      const { defaults } = await import("/src/save/save.ts");
      const { Game } = await import("/src/state.ts");
      const s = defaults(); Object.keys(s.tutorials).forEach(k => s.tutorials[k] = true);
      s.upgrades.combatStance = 1; s.upgrades.buildout = 1;
      s.themes.push("neonUi", "neonGame");
      Object.assign(s.settings, { uiSprites: false, spritesOff: true, spriteAnimations: true, squareDoors: true, reduceMotion: true, transition: "instant", weatherSound: false }, settings);
      const g = new Game(s); g.newRun({ seed: 7, outside: true });
      sessionStorage.setItem("__defaultArtFixture", JSON.stringify(g.save));
    }, settings);
    await page.reload(); await page.locator("#hp").waitFor({ timeout: 30000 });
  };
  await seed();
  await openMenu(page); await page.locator("#auto-settings").click();
  assert.equal(await page.locator("#ui-sprites, #sprites-off").count(), 0, "legacy switches are removed");
  for (const id of ["sprite-animations", "square-doors"]) {
    assert.ok(await page.locator(`#${id}`).isVisible());
    assert.ok(await page.locator(`#${id}`).isChecked(), "old independent preference survives");
    await page.locator(`#${id}`).uncheck();
  }
  await page.reload(); await page.locator("#hp").waitFor();
  await openMenu(page); await page.locator("#auto-settings").click();
  assert.equal(await page.locator("#sprite-animations").isChecked(), false);
  assert.equal(await page.locator("#square-doors").isChecked(), false);
  await page.locator("#settings-back").click();
  await page.locator('[data-tab="deck"]').click();
  assert.ok(await page.locator(".sprite-native").first().isVisible());
  await page.screenshot({ path: "test-results/default-art/deck.png" });
  await seed({ uiTheme: "neon" });
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites")), false);
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("game-sprites")), true);
  await seed({ gameTheme: "neon" });
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites")), true);
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("game-sprites")), false);

  // A load that fails once reloads by itself a second later and plays.
  const flaky = await browser.newPage();
  await fixClock(flaky);
  let dropped = 0;
  await flaky.route("**/assets/style/hero-down.png", route => (dropped++ === 0 ? route.abort() : route.continue()));
  await flaky.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" });
  await flaky.locator("#hp").waitFor({ timeout: 30000 });
  assert.equal(await flaky.locator("#boot-retry").count(), 0, "recovered without Retry");
  await flaky.close();

  // One that keeps failing reloads twice, then offers Retry.
  const failed = await browser.newPage();
  await fixClock(failed);
  let aborted = 0;
  await failed.route("**/assets/style/hero-down.png", route => { aborted++; return route.abort(); });
  await failed.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" });
  await failed.locator("#boot-retry").waitFor({ state: "visible", timeout: 30000 });
  assert.equal(aborted, 3, "the first load and two retries");
  assert.equal(await failed.locator("#app").isVisible(), false, "a failed image never exposes incomplete gameplay");
  await failed.unroute("**/assets/style/hero-down.png");
  await failed.locator("#boot-retry").click();
  await failed.locator("#hp").waitFor({ timeout: 30000 });
  await failed.close();
  assert.deepEqual(missing, []);
  assert.deepEqual(legacy, []);
  assert.deepEqual(errors, []);
  console.log("Default pixel art, delayed/failed asset barrier, auto-retry and Retry, old saves, independent options, cached pages and theme overrides passed.");
} finally { await browser.close(); await server.close(); }
