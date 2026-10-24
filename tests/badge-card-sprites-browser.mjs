// Real Deck, badge details/draws, and the in-run hand at both layout sizes.
// Starts its own Vite server; no fixture-only markup replaces the app.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5186 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
mkdirSync("test-results/badge-card-sprites", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fixClock(page);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.url().includes("/assets/style/") && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    globalThis.__handStartsPaused = true;
    globalThis.__handHeld = true;
    const fixture = sessionStorage.getItem("__badgeSpriteFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__badgeSpriteFixture"); }
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator("#hp").waitFor();
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("ui-sprites")), true);
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts");
    const { Game } = await import("/src/state.ts");
    const { UPGRADES } = await import("/src/progression/upgrades.ts");
    const { BADGE_IDS } = await import("/src/cards/badges.ts");
    const s = defaults();
    for (const id of Object.keys(s.tutorials)) s.tutorials[id] = true;
    for (const u of UPGRADES) s.upgrades[u.id] = 1;
    Object.assign(s.settings, { reduceMotion: true, transition: "instant", weatherSound: false });
    s.hand = ["stairs", "door", "key", "monster"];
    s.gems = 0; // Drawing stays actionable even when short of Gems.
    s.archives.levels.badgeSlots = 1;
    s.badges = { owned: Object.fromEntries(BADGE_IDS.map(id => [id, { copies: 4, pick: 0 }])), cards: { stairs: ["hp", "yellowGate"], monster: ["charge"] }, rng: 99 };
    const g = new Game(s);
    g.newRun({ outside: true, seed: 7 });
    sessionStorage.setItem("__badgeSpriteFixture", JSON.stringify(g.save));
  });
  await page.reload();
  await page.locator('[data-tab="deck"]').click();
  const ready = selector => page.waitForFunction(selector => [...document.querySelectorAll(`${selector} .sprite-icon`)].every(e => e.classList.contains("sprite-ready")), selector);
  const singleCardFrame = async () => {
    const problems = await page.locator(".deck-card, .deck-entry-art, .deck-add").evaluateAll(cards => cards.flatMap(card => {
      const art = card.querySelector(".sprite-card"), image = art.querySelector(".sprite-native"), style = getComputedStyle(card);
      const outer = card.getBoundingClientRect(), inner = image.getBoundingClientRect();
      const issues = [];
      if (style.borderImageSource !== "none" || parseFloat(style.borderLeftWidth) || parseFloat(style.paddingLeft)) issues.push("extra button frame/inset");
      if (["left", "right", "top", "bottom"].some(edge => Math.abs(outer[edge] - inner[edge]) > 0.5)) issues.push("card image does not fill its control");
      if (card.classList.contains("deck-card") && getComputedStyle(card.parentElement).borderImageSource !== "none") issues.push("occupied slot has a second frame");
      return issues.map(issue => `${card.getAttribute("aria-label")}: ${issue}`);
    }));
    assert.deepEqual(problems, []);
    assert.ok(await page.locator(".deck-slot.empty, .deck-slot.for-sale").evaluateAll(slots => slots.length > 0 && slots.every(e => getComputedStyle(e).borderImageSource.includes("slot.png"))), "empty and purchasable slots retain their frames");
  };
  await ready("#deck");
  assert.equal(await page.locator(".badge-grid .badge-token").count(), 22);
  assert.equal(await page.locator(".badge-grid .badge-level b").first().textContent(), "2");
  assert.ok(await page.locator('.badge-pick[data-badge="yellowGate"] .badge-condition').isVisible());
  assert.equal(await page.locator('.badge-pick[data-badge="yellowGate"] .badge-condition').textContent(), "<");
  assert.equal(await page.locator('.badge-pick[data-badge="yellowAtLeast"] .badge-condition').textContent(), "≥");
  assert.equal(await page.locator('[data-draw="1"]').isEnabled(), true);
  assert.ok(await page.locator(".badge-mark .sprite-replacement").first().isVisible());
  assert.ok(await page.locator(".sprite-card-label").first().isVisible());
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await singleCardFrame();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/badge-card-sprites/deck-${width}.png`, fullPage: true, animations: "disabled" });
  }
  // The full-size card remains the keyboard control for ordering the hand.
  await page.locator('.deck-card[data-slot="0"]').focus();
  await page.keyboard.press("ArrowRight");
  assert.ok((await page.locator('.deck-card[data-slot="1"] .sprite-native').getAttribute("src")).endsWith("card-stairs.png"));
  await page.keyboard.press("ArrowLeft");
  assert.ok((await page.locator('.deck-card[data-slot="0"] .sprite-native').getAttribute("src")).endsWith("card-stairs.png"));
  await page.locator('[data-badge="blueAtLeast"]').click();
  await ready("#modal");
  assert.ok(await page.locator("#modal .badge-token.big .sprite-replacement").first().isVisible());
  await page.screenshot({ path: "test-results/badge-card-sprites/detail.png", animations: "disabled" });
  await page.locator("#modal").evaluate(e => e.close());
  // A level-up reveal must retain its live numeral after replacing the SVG.
  await page.evaluate(async () => {
    const { revealDraws } = await import("/src/ui/badge-reveal.ts");
    revealDraws([{ id: "hp", before: 2, after: 3 }], true);
  });
  await ready(".badge-reveal");
  await page.waitForFunction(() => document.querySelector(".badge-reveal .badge-level b")?.textContent === "2");
  await page.screenshot({ path: "test-results/badge-card-sprites/reveal.png", animations: "disabled" });
  await page.locator(".badge-reveal-go").click();
  // The same saved preference follows independent UI and Game overrides.
  for (const [uiTheme, gameTheme, shown] of [["medieval", "classic", true], ["neon", "classic", false], ["medieval", "pixel", true], ["neon", "pixel", false]]) {
    await page.evaluate(async ({ uiTheme, gameTheme }) => {
      const { defaults } = await import("/src/save/save.ts");
      const { applyUiTheme } = await import("/src/ui/medieval.ts");
      const s = defaults(); s.themes.push("neonUi", "pixelGame");
      Object.assign(s.settings, { uiTheme, gameTheme }); applyUiTheme(s);
    }, { uiTheme, gameTheme });
    assert.equal(await page.locator(".badge-grid .sprite-replacement").first().isVisible(), shown);
    assert.equal(await page.locator(".sprite-card-label").first().isVisible(), true);
  }
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts");
    const { applyUiTheme } = await import("/src/ui/medieval.ts");
    const s = defaults(); s.themes.push("neonUi"); s.settings.uiTheme = "neon"; applyUiTheme(s);
  });
  assert.equal(await page.locator(".badge-grid .sprite-replacement").first().isVisible(), false);
  assert.equal(await page.locator(".badge-grid .badge-condition").first().isVisible(), false);
  assert.ok(await page.locator(".badge-grid .theme-art").first().isVisible());
  // Missing replacements keep their fallback even while sprites are on.
  await page.reload();
  await page.locator('[data-tab="deck"]').click();
  await ready("#deck");
  // Match the reported card-points lesson: disabled cards still have one
  // full-size face, and the pointed card still opens its upgrade tree.
  const normalSave = await page.evaluate(() => localStorage.getItem("towerdelve.v1"));
  await page.evaluate(raw => {
    const s = JSON.parse(raw); s.tutorials.cardPoints = false; s.cardXp.key = 200;
    sessionStorage.setItem("__badgeSpriteFixture", JSON.stringify(s));
  }, normalSave);
  await page.reload(); await page.locator('[data-tab="deck"]').click(); await ready("#deck");
  assert.ok(await page.locator(".deck-card:disabled").count() > 0, "lesson cards remain disabled");
  await singleCardFrame();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/badge-card-sprites/deck-lesson-390.png", fullPage: true, animations: "disabled" });
  await page.locator('.deck-card:not(:disabled)').click();
  assert.ok(await page.locator(".card-tree").isVisible(), "lesson card opens its tree");
  await page.evaluate(raw => sessionStorage.setItem("__badgeSpriteFixture", raw), normalSave);
  await page.reload(); await page.locator('[data-tab="deck"]').click(); await ready("#deck");
  await page.locator('.badge-pick[data-badge="hp"] .badge-glyph').evaluate(e => {
    e.classList.remove("sprite-ready"); e.querySelector("img").removeAttribute("src");
  });
  assert.equal(await page.locator('.badge-pick[data-badge="hp"] .badge-glyph > .theme-art').evaluate(e => getComputedStyle(e).visibility), "visible");
  await page.locator('[data-tab="board"]').click();
  await page.locator("#enter-run").click();
  await ready("#hand");
  assert.ok(await page.locator(".hand-badge-level .sprite-replacement").first().isVisible());
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: `test-results/badge-card-sprites/hand-${width}.png`, animations: "disabled" });
  }
  assert.deepEqual(errors, []);
  console.log("All 22 badge PNGs, card faces, live levels/gates, draw controls, hand marks, fallbacks and theme overrides passed at phone/desktop sizes.");
} finally { await browser.close(); await server.close(); }
