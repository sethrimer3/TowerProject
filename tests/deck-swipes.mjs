// Real touch gestures, identity-preserving card flights and anchored details.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { fixClock } from "./fixed-clock.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 5198 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch({ executablePath, channel: executablePath ? undefined : process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
mkdirSync("test-results/deck-swipes", { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await fixClock(page);
  await page.addInitScript(() => {
    globalThis.__handHeld = true; globalThis.__handStartsPaused = true;
    const fixture = sessionStorage.getItem("deckSwipeFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("deckSwipeFixture"); }
    globalThis.deckAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      globalThis.deckAnimations.push({ classes: this.className, id: this.dataset?.deckCard, frames, options });
      return animate.call(this, frames, options);
    };
    globalThis.deckTones = [];
    const set = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function(value, time) {
      globalThis.deckTones.push(value);
      return set.call(this, value, time);
    };
  });
  const ready = async () => {
    await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
    await expect(page.locator("#world")).toBeVisible({ timeout: 30000 });
  };
  await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" }); await ready();
  const fixture = await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts"), { Game } = await import("/src/state.ts");
    const s = defaults();
    for (const key of Object.keys(s.tutorials)) s.tutorials[key] = true;
    Object.assign(s.upgrades, { combatStance: 1, buildout: 1, cardDoorKey: 1, cardEnemy: 1, cardHeal: 1, cardAtkUp: 1, cardDefUp: 1, cardYellowKey: 1, manualHand: 1 });
    s.hand = ["stairs", "door", "key", "monster"];
    s.cardXp.heal = 600;
    Object.assign(s.settings, { uiTheme: "medieval", reduceMotion: false, transition: "instant", weatherSound: false });
    const g = new Game(s); g.newRun({ outside: true, seed: 7 }); return g.save;
  });
  async function load(change = {}) {
    const save = structuredClone(fixture);
    Object.assign(save, change);
    await page.evaluate(save => sessionStorage.setItem("deckSwipeFixture", JSON.stringify(save)), save);
    await page.reload({ waitUntil: "domcontentloaded" }); await ready();
    await page.locator('[data-tab="deck"]').tap();
  }
  const hand = () => page.locator("#deck-hand [data-deck-card]").evaluateAll(ns => ns.map(n => n.dataset.deckCard));
  const settled = () => expect(page.locator(".deck-flight")).toHaveCount(0, { timeout: 10000 });
  const client = await context.newCDPSession(page);
  async function swipe(selector, dy, cancel = false) {
    const locator = page.locator(selector);
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 5; i++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + dy * i / 5 }] });
    await client.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
  }
  async function dragTo(selector, target) {
    const from = await page.locator(selector).boundingBox(), to = await page.locator(target).boundingBox();
    const x = from.x + from.width / 2, y = from.y + from.height / 2, dx = to.x + to.width / 2 - x, dy = to.y + to.height / 2 - y;
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await load();
  assert.deepEqual(await hand(), ["stairs", "door", "key", "monster"]);
  await expect(page.locator('.deck-grid [data-deck-card="stairs"], .deck-check')).toHaveCount(0);
  // The real card stays available underneath a nonmodal, card-pointing popup.
  await page.locator('[data-add="heal"]').tap();
  const pop = page.locator("#deck-card-popover");
  await expect(pop).toContainText("Tap the card again to open upgrade tree");
  await expect(pop).toContainText("3 points available");
  await expect(pop).toContainText("Swipe up to add to hand.");
  await expect(pop).not.toContainText("IN YOUR DECK");
  await expect(page.locator(".card-reveal.details, [data-card-action]")).toHaveCount(0);
  const anchor = await page.locator('[data-add="heal"]').boundingBox(), popup = await pop.boundingBox();
  assert.ok(popup.y + popup.height < anchor.y, "deck details sit above the card");
  const arrow = await pop.evaluate(n => Number.parseFloat(n.style.getPropertyValue("--arrow-x")));
  assert.ok(Math.abs(popup.x + arrow - anchor.x - anchor.width / 2) < 1, "arrow points at the selected card");
  await page.screenshot({ path: "test-results/deck-swipes/popover-390.png" });
  await page.locator('[data-add="heal"]').tap();
  await expect(page.locator(".card-tree")).toBeVisible();
  await expect(pop).toHaveCount(0);
  await page.locator("[data-ct-close]").tap();
  // Full hand: no replacement, a horizontal refusal and the low error notes.
  await swipe('[data-add="heal"]', -36);
  assert.deepEqual(await hand(), ["stairs", "door", "key", "monster"]);
  await expect(pop).toContainText("Your hand is full.");
  assert.ok(await page.evaluate(() => deckAnimations.some(a => a.frames?.some?.(f => f.transform === "translateX(-7px)"))));
  assert.ok(await page.evaluate(() => deckTones.includes(190) && deckTones.includes(145)), "error cue plays");
  await page.keyboard.press("Escape");
  // Dragged onto a full hand's card, a deck card swaps with it; STAIRS stays.
  await dragTo('[data-add="heal"]', '#deck-hand [data-deck-card="key"]'); await settled();
  assert.deepEqual(await hand(), ["stairs", "door", "heal", "monster"]);
  await expect(page.locator('[data-add="key"]')).toBeVisible();
  await dragTo('[data-add="key"]', '#deck-hand [data-deck-card="stairs"]'); await settled();
  assert.deepEqual(await hand(), ["stairs", "door", "heal", "monster"], "STAIRS is never swapped out");
  await dragTo('[data-add="key"]', '#deck-hand [data-deck-card="heal"]'); await settled();
  assert.deepEqual(await hand(), ["stairs", "door", "key", "monster"]);
  // Swipe down anywhere on a hand card returns it; cards make room in order.
  await swipe('#deck-hand [data-deck-card="door"] .deck-card', 36); await settled();
  assert.deepEqual(await hand(), ["stairs", "key", "monster"]);
  await expect(page.locator('[data-add="door"]')).toBeVisible();
  assert.ok(await page.evaluate(() => deckAnimations.some(a => ["yellowKey", "atkUp", "defUp"].includes(a.id) && a.frames?.some?.(f => f.transform?.startsWith("translate(")))), "reserve cards move to make room");
  // Dropped on a hand slot, a deck card takes that slot, not the end.
  await dragTo('[data-add="heal"]', '#deck-hand [data-deck-card="key"]'); await settled();
  assert.deepEqual(await hand(), ["stairs", "heal", "key", "monster"]);
  await swipe('#deck-hand [data-deck-card="heal"] .deck-card', 36); await settled();
  assert.deepEqual(await hand(), ["stairs", "key", "monster"]);
  // Swipe up fills the first empty slot and removes the reserve duplicate.
  await page.evaluate(() => deckAnimations.length = 0);
  await swipe('[data-add="heal"]', -36); await settled();
  assert.deepEqual(await hand(), ["stairs", "key", "monster", "heal"]);
  await expect(page.locator('[data-add="heal"]')).toHaveCount(0);
  const flights = await page.evaluate(() => deckAnimations.filter(a => a.classes === "deck-flight"));
  assert.equal(flights.length, 1);
  assert.match(flights[0].frames[1].transform, /scale\(0\./, "the actual card shrinks into the smaller hand slot");
  assert.ok(await page.evaluate(() => deckAnimations.some(a => a.id && a.frames?.some?.(f => f.transform?.startsWith("translate(")))), "reserve closes the gap");
  // A cancelled gesture never changes the saved hand or leaves a ghost.
  await swipe('#deck-hand [data-deck-card="heal"] .deck-card', 36, true);
  assert.deepEqual(await hand(), ["stairs", "key", "monster", "heal"]);
  await expect(page.locator(".deck-ghost, .deck-flight")).toHaveCount(0);
  await swipe('#deck-hand [data-deck-card="stairs"] .deck-card', 36); await settled();
  assert.ok((await hand()).includes("stairs"));
  // Keyboard equivalents and Manual hand obey the same exclusive ownership.
  await page.locator('#deck-hand [data-deck-card="heal"] .deck-card').focus();
  await page.keyboard.press("ArrowDown"); await settled();
  await page.locator('[data-hand-kind="manual"]').tap();
  await page.locator('[data-add="heal"]').focus(); await page.keyboard.press("ArrowUp"); await settled();
  assert.deepEqual(await hand(), ["heal"]);
  await expect(page.locator('[data-add="heal"]')).toHaveCount(0);
  await page.locator('[data-hand-kind="auto"]').tap();
  await expect(page.locator('[data-add="heal"]')).toHaveCount(0);
  // Phone/desktop popup bounds, Escape/outside dismissal, and saved transfers.
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('[data-add="door"]').tap();
    const b = await pop.boundingBox();
    assert.ok(b.x >= 7 && b.x + b.width <= width - 7);
    assert.ok(b.y >= 7 && b.y + b.height <= 837);
    await page.screenshot({ path: `test-results/deck-swipes/deck-${width}.png` });
    await page.keyboard.press("Escape"); await expect(pop).toHaveCount(0);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('[data-add="door"]').tap();
  const shortPop = await pop.boundingBox(), shortCard = await page.locator('[data-add="door"]').boundingBox();
  assert.ok(shortPop.y >= 7 && shortPop.y + shortPop.height <= 383);
  assert.ok(shortPop.y + shortPop.height < shortCard.y || shortPop.y > shortCard.y + shortCard.height, "short-screen details do not cover the card");
  const shortContent = pop.locator(".deck-popover-content");
  await shortContent.evaluate(n => { n.scrollTop = n.scrollHeight; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(await shortContent.evaluate(n => n.scrollHeight <= n.clientHeight || n.scrollTop > 0), "scrolling popup text keeps its place");
  await page.keyboard.press("Escape");
  // Reduced motion commits immediately, without flights or displacement.
  await load({ hand: ["stairs"], settings: { ...fixture.settings, reduceMotion: true } });
  await swipe('[data-add="heal"]', -36);
  assert.deepEqual(await hand(), ["stairs", "heal"]);
  assert.equal(await page.evaluate(() => deckAnimations.filter(a => a.classes === "deck-flight").length), 0);
  await page.reload({ waitUntil: "domcontentloaded" }); await ready();
  await page.locator('[data-tab="deck"]').tap();
  assert.deepEqual(await hand(), ["stairs", "heal"], "swipe transfers persist across reload");
  // An old save's first card-points lesson can select a Manual card.
  // That card must be shown, despite never repeating in the reserve.
  await page.setViewportSize({ width: 390, height: 844 });
  await load({ hand: ["stairs", "door"], manualHand: ["heal"], tutorials: { ...fixture.tutorials, enemy: false, cardPoints: false }, cardXp: { ...fixture.cardXp, heal: 2200 } });
  assert.deepEqual(await hand(), ["heal"], "the tutorial reveals its target's hand");
  await page.locator('#deck-hand [data-deck-card="heal"] .deck-card').tap();
  await expect(pop).toContainText("Tap the card again");
  await page.locator('#deck-hand [data-deck-card="heal"] .deck-card').tap();
  await expect(page.locator(".card-tree")).toBeVisible();
  await expect(page.locator("[data-ct-close]")).toBeDisabled();
  await page.locator("[data-ct-raise]:has(.ct-lesson-pointer)").tap();
  await expect(page.locator("#modal")).toContainText("Well spent!");
  assert.deepEqual(errors, []);
  await context.close();
  console.log("Deck swipes: anchored details, second tap trees, real touch transfers, flights/gap motion, full-hand sound/shake, cancellation, keyboard, both hands and reduced motion passed.");
} finally {
  await browser.close(); await server.close();
}
