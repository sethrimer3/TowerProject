// The card points lesson and the Deck's marks: a level-up's numbered dot on
// the forest's Deck tab, the hand pointing there with every other control
// held, the arrow on cards with points and NEW on a card not yet met, the
// lesson's card the only one to press, its tree held open until a point is
// spent, the closing note, and save/reload, at phone and desktop widths.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5198 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath, channel: executablePath ? undefined : process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
mkdirSync("test-results/card-points", { recursive: true });
try {
  for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
    const page = await browser.newPage({ viewport });
    await fixClock(page);
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const fixture = sessionStorage.getItem("__pointsFixture");
      if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__pointsFixture"); }
    });
    await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 }); await page.locator("#hp").waitFor();
    await page.evaluate(async () => {
      const { defaults } = await import("/src/save/save.ts"); const { Game } = await import("/src/state.ts");
      const { withFirstSkills } = await import("/tests/first-skills.ts");
      const s = withFirstSkills(defaults()); Object.keys(s.tutorials).forEach((k) => s.tutorials[k] = true);
      s.tutorials.cardPoints = false;
      s.tutorials.enemy = false;
      s.upgrades.combatStance = 1; s.upgrades.buildout = 1; s.upgrades.cardHeal = 1;
      // DOOR at level 3 (3 points), KEY at level 1; HEAL new to the deck.
      s.cardXp.door = 600; s.cardXp.key = 200;
      Object.assign(s.settings, { reduceMotion: false, transition: "instant", weatherSound: false });
      const g = new Game(s); g.newRun({ seed: 7, outside: true });
      sessionStorage.setItem("__pointsFixture", JSON.stringify(g.save));
    });
    await page.reload({ waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 }); await page.locator("#hp").waitFor();
    const deckTab = page.locator('nav [data-tab="deck"]');
    // The forest: the note, the hand at the Deck tab, its dot counting HEAL and the two cards with points.
    await page.locator('.board-tip[data-lesson="cards"]').waitFor();
    assert.match(await page.locator(".board-tip").innerText(), /gain levels as you use them/);
    assert.equal(await deckTab.locator(".forest-pointer.cards").count(), 1);
    assert.equal(await deckTab.getAttribute("data-count"), "3");
    assert.ok(await deckTab.evaluate((e) => e.classList.contains("notify")));
    assert.ok(await page.locator('nav [data-tab="upgrades"]').isDisabled(), "every other tab is held");
    assert.ok(await page.locator("#enter-run").evaluate((e) => !!e.closest("[inert]")), "and the forest with it");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/card-points/${name}-forest.png` });
    await deckTab.click();
    // The Deck page: the dot gone, the hand pointing at DOOR, the only card to press.
    await page.locator(".deck-page").waitFor();
    assert.equal(await deckTab.evaluate((e) => e.classList.contains("notify")), false, "opening the Deck dismisses its dot");
    assert.match(await page.locator(".deck-tip").innerText(), /Tap DOOR for details/);
    const door = page.locator('#deck-hand .deck-slot:has(.deck-card[aria-label^="Door"])');
    assert.equal(await door.locator(".deck-pointer").count(), 1);
    assert.equal(await page.locator("#deck-hand .deck-card:not(:disabled)").count(), 1, "only DOOR can be pressed");
    assert.equal(await page.locator("#deck-hand .card-points-mark").count(), 2, "DOOR's and KEY's arrows");
    assert.equal(await page.locator('.deck-add[data-add="heal"] .card-new').count(), 1, "HEAL wears NEW");
    assert.equal(await page.locator("#deck-hand .card-new").count(), 0, "the starting hand never does");
    assert.ok(await page.locator('nav [data-tab="upgrades"]').isDisabled());
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `test-results/card-points/${name}-deck.png` });
    // The first tap explains DOOR; its second opens the held tutorial tree.
    await door.locator(".deck-card").click();
    await page.locator("#deck-card-popover").waitFor();
    assert.match(await page.locator(".deck-tree-hint").innerText(), /Tap the card again/);
    await door.locator(".deck-card").click();
    const tree = page.locator(".card-tree");
    await tree.waitFor();
    assert.equal(await page.locator("#deck-card-popover").count(), 0, "details close when the tree opens");
    assert.ok(await tree.locator("[data-ct-close]").isDisabled());
    await page.keyboard.press("Escape");
    assert.equal(await tree.count(), 1, "Escape doesn't leave either");
    assert.match(await tree.locator(".ct-tip").innerText(), /Spend a card point/);
    const spend = tree.locator("[data-ct-raise]:has(.ct-lesson-pointer)");
    assert.equal(await spend.count(), 1);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/card-points/${name}-tree.png` });
    await spend.click();
    // The close: keep levelling, and what Gems will do.
    const modal = page.locator("#modal[open]");
    await modal.waitFor();
    assert.match(await modal.innerText(), /Well spent!/);
    assert.match(await modal.innerText(), /rare and special card powers/);
    assert.match(await modal.innerText(), /respec/);
    await page.screenshot({ path: `test-results/card-points/${name}-done.png` });
    await modal.locator("button").click();
    assert.equal(await tree.locator(".ct-tip").count(), 0);
    assert.equal(await tree.locator(".ct-lesson-pointer").count(), 0);
    assert.equal(await tree.locator("[data-ct-close]").isDisabled(), false);
    await tree.locator("[data-ct-close]").click();
    assert.equal(await page.locator('nav [data-tab="upgrades"]').isDisabled(), false, "the tabs open again");
    assert.equal(await page.locator(".deck-tip").count(), 0);
    assert.equal(await page.locator("#deck-hand .card-points-mark").count(), 2, "both still have points");
    // Meeting HEAL takes its NEW away.
    await page.locator('.deck-add[data-add="heal"]').click();
    await page.locator("#deck-card-popover").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("#deck-card-popover").waitFor({ state: "detached" });
    assert.equal(await page.locator(".card-new").count(), 0);
    // Back on the board, the lesson is gone, and stays gone after a reload.
    await page.locator('nav [data-tab="board"]').click();
    assert.equal(await page.locator('.board-tip[data-lesson="cards"]').count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 }); await page.locator("#hp").waitFor();
    assert.equal(await page.locator('.board-tip[data-lesson="cards"]').count(), 0);
    assert.equal(await page.locator(".forest-pointer").count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`card points lesson: ${name} ok`);
  }
} finally {
  await browser.close();
  await server.close();
}
