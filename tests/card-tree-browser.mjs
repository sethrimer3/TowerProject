// A card's upgrade tree: opened from its details on the Deck page, a point
// spent by its button and by tapping the picked node again, the next node
// sprouting open, a respec for Gems, and save/reload, at phone and desktop widths.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
const server = await createServer({ server: { host: "127.0.0.1", port: 5197 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
mkdirSync("test-results/card-tree", { recursive: true });
try {
  for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const fixture = sessionStorage.getItem("__treeFixture");
      if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__treeFixture"); }
    });
    await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
    await page.evaluate(async () => {
      const { defaults } = await import("/src/save.ts"); const { Game } = await import("/src/state.ts");
      const s = defaults(); Object.keys(s.tutorials).forEach((k) => s.tutorials[k] = true);
      s.upgrades.combatStance = 1; s.upgrades.buildout = 1;
      // Level 6 STAIRS: 6 card points (200 + 400 + 600 + 800 + 1,000 + 1,400 XP).
      s.cardXp.stairs = 4400; s.gems = 25;
      Object.assign(s.settings, { reduceMotion: false, transition: "instant", weatherSound: false });
      const g = new Game(s); g.newRun({ seed: 7, outside: true });
      sessionStorage.setItem("__treeFixture", JSON.stringify(g.save));
    });
    await page.reload(); await page.locator("#hp").waitFor();
    await page.locator('[data-tab="deck"]').click();
    await page.locator('#deck-hand [data-slot="0"]').click();
    await page.locator(".card-reveal.details").waitFor();
    assert.match(await page.locator(".card-points-line").innerText(), /6 card points · 6 to spend/);
    await page.locator("[data-card-action='0']").click();
    const tree = page.locator(".card-tree");
    await tree.waitFor();
    assert.equal(await tree.locator(".ug-alloc > b").innerText(), "6 / 6");
    assert.equal(await tree.locator(".ug-node").count(), 11, "the card and its ten upgrades");
    // Gold & Silver Bonus wait on the floor pay track.
    assert.ok(await tree.locator('[data-node="goldBonus"]').evaluate((e) => e.classList.contains("locked")));
    await page.waitForTimeout(700);
    await tree.locator('[data-node="floorPay"]').click();
    await tree.locator("[data-ct-raise]").click();
    for (let i = 0; i < 4; i++) { await page.waitForTimeout(80); await tree.locator('[data-node="floorPay"]').click(); }
    assert.equal(await tree.locator(".ug-alloc > b").innerText(), "1 / 6");
    assert.ok(await tree.locator('[data-node="floorPay"]').evaluate((e) => e.classList.contains("owned")));
    assert.ok(await tree.locator('[data-node="goldBonus"]').evaluate((e) => e.classList.contains("next")));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/card-tree/${name}.png` });
    // The branches are painted.
    const painted = await tree.locator(".ug-branches").evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n;
    });
    assert.ok(painted > 50, `branch pixels: ${painted}`);
    // Respec: 20 of the 25 Gems.
    await tree.locator("[data-ct-respec]").click();
    await page.locator("#confirm").click();
    assert.equal(await tree.locator(".ug-alloc > b").innerText(), "6 / 6");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("towerdelve.v1")).gems), 5);
    await tree.locator('[data-node="freeOffense"]').click();
    await tree.locator("[data-ct-raise]").click();
    await tree.locator("[data-ct-respec]").click();
    assert.ok(await page.locator("dialog[open]").innerText().then((t) => /not enough gems/i.test(t)), "short of Gems asks for Gems");
    await page.locator("#cancel").click();
    await page.keyboard.press("Escape");
    await tree.waitFor({ state: "detached" });
    await page.reload(); await page.locator("#hp").waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("towerdelve.v1")).cardTrees), { stairs: { freeOffense: 1 } });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("card tree browser checks passed");
} finally {
  await browser.close();
  await server.close();
}
