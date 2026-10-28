import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { fixClock } from "./fixed-clock.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 5199 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath, channel: executablePath ? undefined : "msedge" });
mkdirSync("test-results/forest-travel", { recursive: true });
try {
  for (const width of [390, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await fixClock(page);
    await page.addInitScript(() => {
      globalThis.__handHeld = true; globalThis.__handStartsPaused = true;
      const fixture = sessionStorage.getItem("forestTravelFixture");
      if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("forestTravelFixture"); }
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
      s.tower.tiersOpen = 3; s.equipment.unlocked = true;
      Object.assign(s.settings, { reduceMotion: false, transition: "smooth", weatherSound: false });
      const g = new Game(s); g.newRun({ outside: true, seed: 7 });
      sessionStorage.setItem("forestTravelFixture", JSON.stringify(g.save));
    });
    await page.reload({ waitUntil: "domcontentloaded" }); await ready();
    async function instrument() {
      await page.evaluate(async () => {
        const { Game } = await import("/src/state.ts"), { Renderer } = await import("/src/render/rendering.ts");
        window.forestHold = true; window.forestElapsed = 0;
        for (const name of ["walkTo", "travelForest"]) {
          const method = Game.prototype[name];
          Game.prototype[name] = function(...args) { window.forestGame = this; return method.apply(this, args); };
        }
        const advance = Game.prototype.forestArrivalFrame;
        Game.prototype.forestArrivalFrame = function(now) {
          if (window.forestHold && this.forestArrival) { this.forestArrival.started ??= now; return false; }
          return advance.call(this, now);
        };
        let frame = null;
        const image = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
          if (frame && /\/(?:hero-(?:up|down|left|right)|ambient-hero-)[^/]*\.png/.test(source?.src || "")) frame.heroDraws++;
          return image.call(this, source, ...args);
        };
        const draw = Renderer.prototype.draw;
        Renderer.prototype.draw = function(now) {
          const a = this.game.forestArrival;
          if (a && window.forestHold) now = (a.started ?? now) + window.forestElapsed;
          const next = { phase: window.forestElapsed, heroDraws: 0, tier: this.game.tier, arrival: !!a };
          frame = next;
          try { draw.call(this, now); } finally { frame = null; }
          next.x = this.playerX; next.y = this.playerY;
          window.forestFrame = next;
        };
      });
    }
    await instrument();
    async function tile(x, y) {
      const b = await page.locator("#world").boundingBox();
      await page.locator("#world").click({ position: { x: (x + .5) * b.width / 20, y: (19 - y + .5) * b.width / 20 } });
    }
    await tile(18, 7);
    await page.waitForFunction(() => forestGame?.run.player.x === 18 && !forestGame.route.length);
    assert.equal(await page.evaluate(() => forestGame.world.width), 20);
    await page.reload({ waitUntil: "domcontentloaded" }); await ready(); await instrument();
    // The rightmost path position survives an actual reload.
    await tile(18, 7);
    assert.equal(await page.evaluate(() => forestGame.run.player.x), 18);
    const grass = await page.evaluate(() => [6, 5, 4].find(y => forestGame.world.tile(18, y).kind === "floor"));
    assert.notEqual(grass, undefined);
    await tile(18, grass);
    await page.waitForFunction(y => forestGame.run.player.x === 18 && forestGame.run.player.y === y && !forestGame.route.length, grass);
    async function phase(ms) {
      await page.evaluate(ms => window.forestElapsed = ms, ms);
      await page.waitForFunction(ms => window.forestFrame?.phase === ms && window.forestFrame.arrival && window.forestFrame.tier === forestGame.tier, ms);
      return page.evaluate(() => forestFrame);
    }
    await page.locator("#tier-next").click();
    await page.waitForFunction(() => forestGame.tier === 2 && !!forestGame.forestArrival);
    assert.equal((await phase(0)).heroDraws, 0);
    assert.equal((await phase(99)).heroDraws, 0, "the first 100ms contain no hero draw");
    assert.equal(await page.evaluate(() => forestGame.stepManually(1, 0)), false);
    await expect(page.locator("#tier-next")).toBeDisabled();
    const entering = await phase(250);
    assert.equal(entering.x, 0);
    assert.ok(entering.heroDraws > 0, "a real native hero PNG walks in");
    await page.screenshot({ path: `test-results/forest-travel/enter-left-${width}.png` });
    await page.evaluate(() => window.forestHold = false);
    await page.waitForFunction(() => !forestGame.forestArrival);
    await expect(page.locator("#tier-prev")).toBeEnabled();
    // Stepping onto the left edge invokes exactly the same arrival from the right.
    await page.evaluate(() => { window.forestHold = true; window.forestElapsed = 0; });
    const edgeRow = await page.evaluate(async () => {
      const { routeTo } = await import("/src/pathfinding.ts");
      return [6, 5, 7].find(y => routeTo(forestGame, 0, y) !== null);
    });
    assert.notEqual(edgeRow, undefined);
    await tile(0, edgeRow);
    await page.waitForFunction(() => forestGame.tier === 1 && !!forestGame.forestArrival);
    assert.equal((await phase(99)).heroDraws, 0);
    const returning = await phase(250);
    assert.equal(returning.x, 19); assert.ok(returning.heroDraws > 0);
    await page.screenshot({ path: `test-results/forest-travel/enter-right-${width}.png` });
    await page.evaluate(() => window.forestHold = false);
    await page.waitForFunction(() => !forestGame.forestArrival);
    assert.equal(await page.evaluate(() => forestGame.run.player.x), 18);
    assert.ok(await page.evaluate(async () => {
      const { routeTo } = await import("/src/pathfinding.ts");
      return routeTo(forestGame, 8, 7) !== null;
    }), "the landing connects back to the main path");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Forest travel: real path/grass clicks, reload, arrow and edge crossings, 100ms no-hero pause, native sprite walk-in, input lock and both directions passed at phone/desktop widths.");
} finally { await browser.close(); await server.close(); }
