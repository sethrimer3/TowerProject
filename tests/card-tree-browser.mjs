// A card's upgrade tree: opened from its details on the Deck page, a point
// spent by its button and by tapping the picked node again, the next node
// sprouting open, the ? button's help, a respec for Gems, and save/reload, at
// phone and desktop widths.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5197 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
mkdirSync("test-results/card-tree", { recursive: true });
try {
  // A tap opens a card's details on its release; the tap's own click, landing
  // on the new layer, must not close them. A later tap does.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await fixClock(page);
    await page.addInitScript(() => {
      const fixture = sessionStorage.getItem("__tapFixture");
      if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__tapFixture"); }
    });
    await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 }); await page.locator("#hp").waitFor();
    await page.evaluate(async () => {
      const { defaults } = await import("/src/save/save.ts"); const { Game } = await import("/src/state.ts");
      const s = defaults(); Object.keys(s.tutorials).forEach((k) => s.tutorials[k] = true);
      Object.assign(s.upgrades, { combatStance: 1, buildout: 1, cardHeal: 1, cardYellowKey: 1 });
      Object.assign(s.settings, { reduceMotion: true, transition: "instant", weatherSound: false });
      const g = new Game(s); g.newRun({ seed: 7, outside: true });
      sessionStorage.setItem("__tapFixture", JSON.stringify(g.save));
    });
    await page.reload({ waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 }); await page.locator("#hp").waitFor();
    await page.locator('[data-tab="deck"]').tap();
    for (const card of ['#deck-hand [data-slot="0"]', ".deck-add"]) {
      const box = await page.locator(card).first().boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      assert.equal(await page.locator("#deck-card-popover").count(), 1, `${card}: details stay open after the tap`);
      await page.touchscreen.tap(20, 20);
      await page.locator("#deck-card-popover").waitFor({ state: "detached" });
    }
    await context.close();
  }
  for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
    const page = await browser.newPage({ viewport });
    await fixClock(page);
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const fixture = sessionStorage.getItem("__treeFixture");
      if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__treeFixture"); }
    });
    await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 }); await page.locator("#hp").waitFor();
    await page.evaluate(async () => {
      const { defaults } = await import("/src/save/save.ts"); const { Game } = await import("/src/state.ts");
      const s = defaults(); Object.keys(s.tutorials).forEach((k) => s.tutorials[k] = true);
      s.upgrades.combatStance = 1; s.upgrades.buildout = 1;
      // Level 6 STAIRS: 6 card points (100 + 200 + 300 + 400 + 500 + 700 XP),
      // with an uncommon card buy's Floor Heal opened.
      s.cardXp.stairs = 2200; s.gems = 25;
      s.cardBuys.opened = { stairs: { floorHealGold: 1 } };
      Object.assign(s.settings, { reduceMotion: false, transition: "instant", weatherSound: false });
      const g = new Game(s); g.newRun({ seed: 7, outside: true });
      sessionStorage.setItem("__treeFixture", JSON.stringify(g.save));
    });
    await page.reload({ waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 }); await page.locator("#hp").waitFor();
    await page.locator('[data-tab="deck"]').click();
    await page.locator('#deck-hand [data-slot="0"]').click();
    await page.locator("#deck-card-popover").waitFor();
    assert.match(await page.locator(".card-level-line").innerText(), /^Level 6 \/ 11 · /);
    assert.equal(await page.locator(".card-points-line").count(), 0, "points belong beside the upgrade hint, not in a separate stat line");
    assert.match(await page.locator(".card-rarity-line").innerText(), /Uncommon/i);
    assert.match(await page.locator(".deck-tree-hint").innerText(), /Tap the card again to open upgrade tree\s+6 points available/i);
    await page.locator('#deck-hand [data-slot="0"]').click();
    const tree = page.locator(".card-tree");
    await tree.waitFor();
    assert.equal(await tree.locator(".ct-left b").innerText(), "6");
    // It stands in place of the Deck page, not over it.
    assert.equal(await page.locator("#deck .deck-page").count(), 0);
    assert.ok(await page.locator("#deck").evaluate((e) => e.classList.contains("tree-open")));
    // How the tree works is behind the ? button, not in a box under it.
    assert.ok(await tree.locator(".ug-card").evaluate((e) => e.hidden), "no details until an upgrade is chosen");
    await tree.locator("[data-ct-help]").click();
    assert.match(await page.locator("dialog[open]").innerText(), /Each card level earns a point/);
    await page.locator("#tree-help-ok").click();
    // The tree first; the phone's run switches to the list and back.
    const list = name === "phone";
    assert.equal(await tree.locator("[data-ct-switch]").getAttribute("aria-checked"), "false");
    if (list) {
      await tree.locator("[data-ct-switch]").click();
      assert.equal(await tree.locator("[data-ct-switch]").getAttribute("aria-checked"), "true");
      assert.equal(await tree.locator(".ct-row").count(), 10);
      assert.match(await tree.locator('.ct-row:has([data-ct-pick="floorHealGold"])').innerText(), /Locked/);
      assert.match(await tree.locator('.ct-row:has([data-ct-pick="goldBonus"])').innerText(), /Sealed upgrade/);
      for (let i = 0; i < 5; i++) await tree.locator('[data-ct-raise="floorGold"]').click();
      assert.match(await tree.locator(".ct-status").innerText(), /level 5 of 5\. 1 point left/);
      assert.match(await tree.locator('.ct-row:has([data-ct-pick="floorHealGold"])').innerText(), /Available/);
      await page.screenshot({ path: `test-results/card-tree/${name}-list.png` });
      await tree.locator("[data-ct-switch]").click();
    }
    assert.equal(await tree.locator(".ug-node").count(), 11, "the card and its ten upgrades");
    await page.waitForTimeout(700);
    if (!list) {
      // Floor Heal waits on Spare Change, and the rarer ones on card buys.
      assert.ok(await tree.locator('[data-node="floorHealGold"]').evaluate((e) => e.classList.contains("locked")));
      assert.ok(await tree.locator('[data-node="overhealMax"]').evaluate((e) => e.classList.contains("sealed") && !e.className.includes("r-") && e.innerText.trim() === "?"), "a sealed node shows only a ?");
      await tree.locator('[data-node="floorGold"]').click({ force: true });
      assert.match(await tree.locator("[data-ct-raise]").innerText(), /^Buy/);
      await tree.locator("[data-ct-raise]").click();
      for (let i = 0; i < 3; i++) await tree.locator('[data-node="floorGold"]').click({ force: true });
      // The keyboard: Enter on the chosen upgrade spends a point too.
      await tree.locator('[data-node="floorGold"]').focus();
      await page.keyboard.press("Enter");
      assert.match(await tree.locator(".ct-status").innerText(), /level 5 of 5/);
      // Up the tree from the full Spare Change to Floor Heal, back down, then across.
      await page.keyboard.press("ArrowUp");
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.node), "floorHealGold");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.node), "floorSilver");
      assert.match(await tree.locator(".ug-card").innerText(), /Wishing Well/);
      // Its Buy sits in the details' head, beside the name, and its ? says the rest.
      assert.equal(await tree.locator(".ug-card-head [data-ct-raise]").count(), 1);
      assert.match(await tree.locator(".ug-card").innerText(), /Wishing Well:\s*0%\s*→\s*\+2%/);
      await tree.locator("[data-ct-info]").click();
      assert.match(await page.locator("dialog[open]").innerText(), /Each level: \+2% Wishing Well Silver on each floor[\s\S]*Holds 5 of up to 10 levels/);
      await page.locator("#tree-help-ok").click();
      await tree.locator('[data-node="floorSilver"]').focus();
      // A press on the tree away from every upgrade lets go of it.
      const box = await tree.locator(".ug-host").boundingBox();
      await page.mouse.click(box.x + 12, box.y + box.height - 12);
      assert.ok(await tree.locator(".ug-card").evaluate((e) => e.hidden), "no details once let go");
    }
    assert.equal(await tree.locator(".ct-left b").innerText(), "1");
    assert.ok(await tree.locator('[data-node="floorGold"]').evaluate((e) => e.classList.contains("owned")));
    assert.ok(await tree.locator('[data-node="floorHealGold"]').evaluate((e) => e.classList.contains("next")));
    await page.waitForTimeout(1500);
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
    assert.equal(await tree.locator(".ct-left b").innerText(), "6");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("towerdelve.v1")).gems), 5);
    await tree.locator('[data-node="floorSilver"]').click({ force: true });
    await tree.locator("[data-ct-raise]").click();
    await tree.locator("[data-ct-respec]").click();
    assert.ok(await page.locator("dialog[open]").innerText().then((t) => /not enough gems/i.test(t)), "short of Gems asks for Gems");
    await page.locator("#cancel").click();
    await page.keyboard.press("Escape");
    await tree.waitFor({ state: "detached" });
    // Back on the Deck page.
    await page.locator("#deck .deck-page").waitFor();
    await page.reload({ waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 }); await page.locator("#hp").waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("towerdelve.v1")).cardTrees), { stairs: { floorSilver: 1 } });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("card tree browser checks passed");
} finally {
  await browser.close();
  await server.close();
}
