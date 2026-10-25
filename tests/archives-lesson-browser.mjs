// The Archives lesson: once the Archives skill is owned, the Tower forest's
// note and hand at the Research tab, its dot, every other control held; on
// the Research page the hand at the Archives tab, over the note that a press
// dismisses, the other tabs held until then; and save/reload, at phone and
// desktop widths.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5199 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath, channel: executablePath ? undefined : process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
mkdirSync("test-results/archives-lesson", { recursive: true });
try {
  for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
    const page = await browser.newPage({ viewport });
    await fixClock(page);
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const fixture = sessionStorage.getItem("__archivesFixture");
      if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__archivesFixture"); }
    });
    await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
    await page.evaluate(async () => {
      const { defaults } = await import("/src/save/save.ts"); const { Game } = await import("/src/state.ts");
      const s = defaults(); Object.keys(s.tutorials).forEach((k) => s.tutorials[k] = true);
      s.tutorials.research = s.tutorials.archives = s.tutorials.enemy = false;
      Object.assign(s.upgrades, { combatStance: 1, breakthrough: 1, questForKnowledge: 1, archives: 1 });
      Object.assign(s.settings, { reduceMotion: false, transition: "instant", weatherSound: false });
      const g = new Game(s); g.newRun({ seed: 7, outside: true });
      sessionStorage.setItem("__archivesFixture", JSON.stringify(g.save));
    });
    await page.reload(); await page.locator("#hp").waitFor();
    const researchTab = page.locator('nav [data-tab="research"]');
    // The forest: the note, the hand at the Research tab and its dot, the rest held.
    await page.locator('.board-tip[data-lesson="research"]').waitFor();
    assert.match(await page.locator(".board-tip").innerText(), /Press the Research tab to open the Research menu/);
    assert.equal(await researchTab.locator(".forest-pointer.research").count(), 1);
    assert.ok(await researchTab.evaluate((e) => e.classList.contains("notify")));
    assert.ok(await page.locator('nav [data-tab="upgrades"]').isDisabled(), "every other tab is held");
    assert.ok(await page.locator("#enter-run").evaluate((e) => !!e.closest("[inert]")), "and the forest with it");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `test-results/archives-lesson/${name}-forest.png` });
    await researchTab.click();
    // The Research page: the dot gone, the hand at the Archives tab, the note under the tabs.
    const note = page.locator("#archives-lesson");
    await note.waitFor();
    assert.equal(await researchTab.evaluate((e) => e.classList.contains("notify")), false, "opening Research dismisses its dot");
    assert.match(await note.innerText(), /Pay the archivist Gold to research permanent upgrades\. Gems rush research and hire additional archivists to do more research at once\./);
    const archivesTab = page.locator('[data-research-tab="archives"]');
    assert.equal(await archivesTab.locator(".research-pointer").count(), 1);
    const hand = await archivesTab.locator(".research-pointer").boundingBox(), tabBox = await archivesTab.boundingBox();
    assert.ok(hand && hand.width > 10 && hand.y >= tabBox.y + tabBox.height - 4, "the hand shows, under the tab");
    assert.ok(await page.locator('nav [data-tab="upgrades"]').isDisabled(), "the other tabs stay held");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `test-results/archives-lesson/${name}-research.png` });
    // The Archives tab takes the hand away; the note waits.
    await archivesTab.click();
    assert.equal(await page.locator(".research-pointer").count(), 0);
    assert.equal(await note.count(), 1);
    await page.screenshot({ path: `test-results/archives-lesson/${name}-archives.png` });
    // Pressing the note ends the lesson.
    await note.click();
    assert.equal(await page.locator("#archives-lesson").count(), 0);
    assert.equal(await page.locator('nav [data-tab="upgrades"]').isDisabled(), false, "the tabs open again");
    await page.locator('nav [data-tab="board"]').click();
    assert.equal(await page.locator('.board-tip[data-lesson="research"]').count(), 0);
    await page.reload(); await page.locator("#hp").waitFor();
    assert.equal(await page.locator(".board-tip").count(), 0);
    assert.equal(await page.locator(".forest-pointer").count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`archives lesson: ${name} ok`);
  }
} finally {
  await browser.close();
  await server.close();
}
