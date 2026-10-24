// Real Shrine offers, picks and management. Starts its own server;
// Tower-only Shrines leave Delve and Defend untouched.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { openMenu } from "./run-menu.mjs";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5188 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
mkdirSync("test-results/shrine-sprites", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fixClock(page);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.url().includes("/assets/style/") && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    globalThis.__handStartsPaused = true; globalThis.__handHeld = true;
    const fixture = sessionStorage.getItem("__shrineSpriteFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__shrineSpriteFixture"); }
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator("#hp").waitFor();
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites")), false);
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts");
    const { Game } = await import("/src/state.ts");
    const { BOON_IDS } = await import("/src/shrines.ts");
    const s = defaults();
    Object.keys(s.tutorials).forEach(k => s.tutorials[k] = true);
    Object.assign(s.upgrades, { archives: 1, combatStance: 1, buildout: 1 });
    Object.assign(s.settings, { uiSprites: true, reduceMotion: true, transition: "instant", weatherSound: false });
    Object.assign(s.archives.levels, { unlockShrines: 1, firstBoonChoice: 1, banBoons: 2, autoPickRanking: 4, autoPickBoons: 1 });
    s.shrines.firstChoice = "attack"; s.shrines.ranking = [...BOON_IDS];
    const g = new Game(s); g.newRun({ outside: true, seed: 7 });
    sessionStorage.setItem("__shrineSpriteFixture", JSON.stringify(g.save));
  });
  await page.reload();
  const ready = selector => page.waitForFunction(selector => [...document.querySelectorAll(`${selector} .sprite-icon`)].every(e => e.classList.contains("sprite-ready")), selector);
  await openMenu(page); await page.locator("#shrines-button").click();
  await ready("#shrines");
  assert.equal(await page.locator(".boon-ban .boon-icon .sprite-replacement").count(), 20);
  assert.equal(await page.locator(".boon-rank .boon-icon .sprite-replacement").count(), 20);
  assert.ok(await page.locator(".boon-first-preview .sprite-replacement").isVisible());
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/shrine-sprites/management-${width}.png`, fullPage: true, animations: "disabled" });
  }
  await page.locator("#first-boon").selectOption("regen");
  await ready("#shrines");
  assert.ok((await page.locator(".boon-first-preview img").getAttribute("src")).endsWith("boon-regen.png"));
  await page.locator('[data-ban="goldMaxHp"]').check();
  await ready("#shrines");
  assert.ok(await page.locator('.boon-ban.banned .sprite-replacement[src$="shrine-ban.png"]').isVisible());
  assert.equal(await page.locator('.boon-rank[data-rank="goldMaxHp"] .rank-move').count(), 0);
  await page.locator('[data-rank="attack"] [data-up]').click();
  assert.equal(await page.locator(".boon-rank").first().getAttribute("data-rank"), "attack");
  // Drag by the actual PNG grip, retaining the original row-reordering path.
  const grip = page.locator('[data-rank="attack"] .rank-grip');
  await grip.scrollIntoViewIfNeeded();
  const from = await grip.boundingBox();
  const to = await page.locator('[data-rank="maxHp"] .rank-grip').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down(); await page.mouse.move(to.x + to.width / 2, to.y + to.height - 1, { steps: 8 }); await page.mouse.up();
  assert.equal(await page.locator(".boon-rank").first().getAttribute("data-rank"), "maxHp");
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator(".boon-rank").first().scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/shrine-sprites/ranking-${width}.png`, animations: "disabled" });
  }
  // Off and custom UI themes keep the original text-only layout; Game
  // themes override independently, so they don't hide interface subjects.
  for (const [uiTheme, gameTheme, sprites, shown] of [["medieval", "classic", true, true], ["neon", "classic", true, false], ["medieval", "pixel", true, true], ["medieval", "classic", false, false]]) {
    await page.evaluate(async ({ uiTheme, gameTheme, sprites }) => {
      const { defaults } = await import("/src/save/save.ts"); const { applyUiTheme } = await import("/src/ui/medieval.ts");
      const s = defaults(); s.themes.push("neonUi", "pixelGame"); Object.assign(s.settings, { uiSprites: sprites, uiTheme, gameTheme }); applyUiTheme(s);
    }, { uiTheme, gameTheme, sprites });
    assert.equal(await page.locator(".boon-ban .boon-icon").first().isVisible(), shown);
  }
  // A reload retains the actual saved preferences and the changed choices.
  await page.reload(); await openMenu(page); await page.locator("#shrines-button").click();
  assert.equal(await page.locator("#first-boon").inputValue(), "regen");
  assert.equal(await page.locator('[data-ban="goldMaxHp"]').isChecked(), true);
  await page.evaluate(async () => {
    const { Game } = await import("/src/state.ts");
    const s = JSON.parse(localStorage.getItem("towerdelve.v1"));
    const g = new Game(s); g.newRun({ outside: false, seed: 7 });
    g.run.height = g.run.maxHeight = 199;
    g.run.shrine = { picked: [], rolls: 0, offer: ["attack", "goldMaxHp"] };
    // Clear the management ban only in this independent offer fixture.
    g.save.shrines.banned = [];
    sessionStorage.setItem("__shrineSpriteFixture", JSON.stringify(g.save));
  });
  await page.reload(); await page.locator("#shrine-bar").click();
  await ready("#modal");
  assert.equal(await page.locator(".boon-choice").count(), 2);
  assert.equal(await page.locator(".boon-choice .boon-icon").count(), 2);
  assert.notEqual(await page.locator(".boon-choice.standard").evaluate(e => getComputedStyle(e).borderImageSource), await page.locator(".boon-choice.tradeoff").evaluate(e => getComputedStyle(e).borderImageSource));
  assert.equal(await page.locator("#shrine-left").textContent(), "1");
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/shrine-sprites/offer-${width}.png`, animations: "disabled" });
  }
  // Loading failures remove the decorative slot and retain the full live label.
  await page.locator('.boon-choice[data-boon="attack"] .boon-icon').evaluate(e => { e.classList.remove("sprite-ready"); e.querySelector("img").removeAttribute("src"); });
  assert.equal(await page.locator('.boon-choice[data-boon="attack"] .boon-icon').isVisible(), false);
  assert.ok((await page.locator('.boon-choice[data-boon="attack"] b').textContent()).includes("ATK"));
  await page.locator('[data-boon="attack"]').click();
  await page.locator("#shrine-bar").click(); await ready("#modal");
  assert.equal(await page.locator(".boon-table tbody tr").count(), 1);
  assert.equal(await page.locator(".boon-table tbody td").last().textContent(), "1");
  await page.locator("#boon-autopick").check();
  assert.equal(await page.locator("#boon-autopick").isChecked(), true);
  await page.screenshot({ path: "test-results/shrine-sprites/taken.png", animations: "disabled" });
  assert.deepEqual(errors, []);
  console.log("All 20 boon PNGs, offers, picks, live counts, management, PNG grip dragging, save/reload, fallback and independent theme overrides passed at phone/desktop sizes.");
} finally { await browser.close(); await server.close(); }
