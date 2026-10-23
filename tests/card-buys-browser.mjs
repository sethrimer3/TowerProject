// Card buys on the Deck page: the Buy ×1 and ×10 buttons over the Deck, a
// press short of Gems asking for them, ten bought at once shown one at a
// time with Skip to the summary, what they opened saved, and each rarity's
// reveal and look on the cards and the tree, at phone and desktop widths
// (screenshots in test-results/card-buys/).
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5199 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
mkdirSync("test-results/card-buys", { recursive: true });
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
/** Changes the saved game with `edit` and reloads into it (the page saves
 * over localStorage as it unloads, so the change waits in sessionStorage). */
async function restage(page, edit) {
  await page.evaluate((body) => {
    const s = JSON.parse(localStorage.getItem("towerdelve.v1"));
    new Function("s", body)(s);
    sessionStorage.setItem("__buyFixture", JSON.stringify(s));
  }, `(${edit})(s)`);
  await page.reload(); await page.locator("#hp").waitFor();
}
try {
  for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
    const page = await browser.newPage({ viewport });
    await fixClock(page);
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const fixture = sessionStorage.getItem("__buyFixture");
      if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__buyFixture"); }
    });
    await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
    await page.evaluate(async () => {
      const { defaults } = await import("/src/save.ts"); const { Game } = await import("/src/state.ts");
      const s = defaults(); Object.keys(s.tutorials).forEach((k) => s.tutorials[k] = true);
      s.upgrades.combatStance = 1; s.upgrades.buildout = 1; s.upgrades.cardBadges = 1;
      s.cardXp.stairs = 50_000; s.gems = 10;
      // STAIRS opened to rare, KEY raised by a common buy.
      s.cardBuys.opened = { stairs: { goldBonus: 1, floorHealGold: 1 }, key: { keyFind: 1 } };
      Object.assign(s.settings, { reduceMotion: false, transition: "instant", weatherSound: false });
      const g = new Game(s); g.newRun({ seed: 7, outside: true });
      sessionStorage.setItem("__buyFixture", JSON.stringify(g.save));
    });
    await page.reload(); await page.locator("#hp").waitFor();
    await page.locator('[data-tab="deck"]').click();
    const buys = page.locator(".deck-stack > .card-buys");
    await buys.waitFor();
    assert.deepEqual(await buys.locator("button").allInnerTexts().then((t) => t.map((s) => s.replace(/\s+/g, " ").trim())), ["Buy ×1 20", "Buy ×10 200"]);
    assert.deepEqual(await page.locator(".badge-draws button").allInnerTexts().then((t) => t.map((s) => s.split(/\s/)[0])), ["Buy", "Buy"], "badge draws say Buy");
    assert.ok(await buys.locator('[data-buy-cards="1"]').evaluate((b) => b.classList.contains("short") && !b.disabled), "short of Gems: red-priced, never disabled");
    assert.equal(await page.locator('#deck-hand [data-slot="0"] .rarity-frame.r-rare').count(), 1, "STAIRS looks rare");
    await page.screenshot({ path: `test-results/card-buys/${name}-deck.png` });
    await buys.locator('[data-buy-cards="1"]').click();
    assert.match(await page.locator("dialog[open]").innerText(), /not enough gems/i);
    await page.locator("#cancel").click();
    // Ten at once: one at a time, then all ten.
    await restage(page, (s) => (s.gems = 230));
    await page.locator('[data-tab="deck"]').click();
    await page.locator('[data-buy-cards="10"]').click();
    const reveal = page.locator(".card-buy-reveal");
    await reveal.waitFor();
    assert.equal(await reveal.locator(".badge-reveal-count").innerText(), "1 / 10");
    assert.match(await reveal.locator(".badge-reveal-text").innerText(), /CARD BOUGHT[\s\S]*Max level \d+ → \d+/);
    await page.locator(".badge-reveal-go").click();
    assert.equal(await reveal.locator(".badge-reveal-count").innerText(), "2 / 10");
    await page.locator(".badge-reveal-skip").click();
    assert.equal(await reveal.locator(".cb-sum").count(), 10);
    assert.match(await reveal.locator(".badge-reveal-kicker").innerText(), /10 CARDS BOUGHT/);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/card-buys/${name}-summary.png` });
    await page.locator(".badge-reveal-go").click();
    await reveal.waitFor({ state: "detached" });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("towerdelve.v1")));
    assert.equal(saved.gems, 30);
    const opened = Object.values(saved.cardBuys.opened).flatMap((n) => Object.values(n)).reduce((a, b) => a + b, 0);
    assert.equal(opened, 13, "ten more levels opened");
    assert.equal(typeof saved.cardBuys.rng, "number");
    // Each rarity's reveal, for review.
    for (const rarity of RARITIES) {
      await page.evaluate(async (rarity) => {
        const { revealBuys } = await import("/src/ui/card-buy-reveal.ts");
        const node = { common: "floorGold", uncommon: "floorHealGold", rare: "goldBonus", epic: "freeOffense", legendary: "overhealMax" }[rarity];
        revealBuys([{ card: "stairs", rarity, node, cap: 1, fresh: rarity !== "common", maxLevel: { before: 10, after: 11 }, look: { before: "common", after: rarity } }], false);
      }, rarity);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `test-results/card-buys/${name}-reveal-${rarity}.png` });
      await page.locator(".badge-reveal-go").click();
      await page.locator(".card-buy-reveal").waitFor({ state: "detached" });
    }
    // The tree with every rarity opened, in the graph.
    await restage(page, (s) => (s.cardBuys.opened = { stairs: { floorGold: 2, floorHealGold: 1, goldBonus: 1, freeOffense: 1, overhealMax: 1, stairSkip: 1 } }));
    await page.locator('[data-tab="deck"]').click();
    await page.locator('#deck-hand [data-slot="0"]').click();
    assert.match(await page.locator(".card-rarity-line").innerText(), /Legendary/i);
    await page.screenshot({ path: `test-results/card-buys/${name}-details.png` });
    await page.locator("[data-card-action='0']").click();
    const tree = page.locator(".card-tree");
    await tree.waitFor();
    assert.equal(await tree.locator("[data-ct-switch]").getAttribute("aria-checked"), "false", "the tree view first");
    await page.waitForTimeout(1800);
    assert.equal(await tree.locator(".ug-node.r-legendary .ct-holo").count(), 2);
    await page.screenshot({ path: `test-results/card-buys/${name}-tree.png` });
    await tree.locator('[data-node="overhealMax"]').click({ force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/card-buys/${name}-tree-legendary.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("card buy browser checks passed");
} finally {
  await browser.close();
  await server.close();
}
