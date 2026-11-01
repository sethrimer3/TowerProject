import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { fixClock } from "./fixed-clock.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 5201 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath, channel: executablePath ? undefined : "msedge" });
mkdirSync("test-results/lakeside", { recursive: true });
try {
  for (const width of [390, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await fixClock(page);
    await page.addInitScript(() => {
      globalThis.__handHeld = true; globalThis.__handStartsPaused = true;
      const fixture = sessionStorage.getItem("lakeFixture");
      if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("lakeFixture"); }
    });
    const ready = async () => {
      await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
      await expect(page.locator("#world")).toBeVisible({ timeout: 30000 });
    };
    await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" }); await ready();
    await page.evaluate(async () => {
      const { Game } = await import("/src/state.ts"), { defaults } = await import("/src/save/save.ts");
      const s = defaults();
      for (const k of Object.keys(s.tutorials)) s.tutorials[k] = true;
      s.tutorials.enemy = false;
      Object.assign(s.settings, { reduceMotion: true, weatherSound: false });
      const g = new Game(s); g.newRun({ outside: true, seed: 7 });
      sessionStorage.setItem("lakeFixture", JSON.stringify(g.save));
    });
    await page.reload({ waitUntil: "domcontentloaded" }); await ready();
    async function instrument() {
      await page.evaluate(async () => {
        const { Game } = await import("/src/state.ts");
        for (const name of ["walkTo", "travelForest"]) {
          const method = Game.prototype[name];
          Game.prototype[name] = function(...args) { window.lakeGame = this; return method.apply(this, args); };
        }
      });
    }
    await instrument();
    async function tile(x, y) {
      const b = await page.locator("#world").boundingBox();
      await page.locator("#world").click({ position: { x: (x + .5) * b.width / 20, y: (19 - y + .5) * b.width / 20 } });
    }
    await expect(page.locator("#tier-prev")).toBeEnabled();
    // An actual edge walk, with no later tower unlocked, discovers the lake.
    await tile(0, 7);
    await page.waitForFunction(() => lakeGame?.atLake && !lakeGame.forestArrival);
    await expect(page.locator("#board-title")).toHaveText("Lakeside");
    await expect(page.locator("#enter-run")).toBeHidden();
    await expect(page.locator("#forest-sign")).toBeHidden();
    await expect(page.locator("#tier-prev")).toBeDisabled();
    await expect(page.locator("#tier-next")).toBeEnabled();
    await page.locator("#world").screenshot({ path: `test-results/lakeside/lake-${width}.png` });
    // The save made by the real route update restores this area on reload.
    await page.reload({ waitUntil: "domcontentloaded" }); await ready(); await instrument();
    await expect(page.locator("#board-title")).toHaveText("Lakeside");
    await tile(6, 7);
    const modal = page.locator("#modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator("h2")).toHaveText("Fisherman");
    await expect(modal.locator("p")).toHaveText("Come back later, traveller...");
    assert.equal(await page.evaluate(() => lakeGame.run.player.x), 13);
    assert.equal(await page.evaluate(() => lakeGame.route.length), 0);
    await page.screenshot({ path: `test-results/lakeside/dialogue-${width}.png` });
    await page.locator("#fisherman-close").click();
    await tile(7, 7);
    await page.waitForFunction(() => lakeGame.run.player.x === 7 && !lakeGame.route.length);
    await expect(modal).not.toBeVisible();
    await page.locator("#world").screenshot({ path: `test-results/lakeside/dock-${width}.png` });
    await page.reload({ waitUntil: "domcontentloaded" }); await ready(); await instrument();
    await expect(modal).not.toBeVisible();
    await tile(14, 7);
    await page.waitForFunction(() => lakeGame.run.player.x === 14 && !lakeGame.route.length);
    await tile(12, 7);
    await expect(modal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
    await tile(19, 7);
    await page.waitForFunction(() => !lakeGame.atLake && !lakeGame.forestArrival);
    await expect(page.locator("#enter-run")).toBeVisible();
    assert.equal(await page.evaluate(() => lakeGame.tier), 1);
    // Arrows also work, without a Tower 0 or a Tier II unlock.
    await page.locator("#tier-prev").click();
    await page.waitForFunction(() => lakeGame.atLake && !lakeGame.forestArrival);
    await page.locator("#tier-next").click();
    await page.waitForFunction(() => !lakeGame.atLake && !lakeGame.forestArrival);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Lakeside travel, dialogue, repeat visit, reload and return passed at ${width}px.`);
  }
} finally { await browser.close(); await server.close(); }
