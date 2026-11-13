import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { fixClock } from "./fixed-clock.mjs";
import { openMenu } from "./run-menu.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 5211 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/arcana-lab", { recursive: true });
try {
  for (const width of [390, 1100]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [];
    page.on("pageerror", e => errors.push(e.message)); await fixClock(page);
    await page.addInitScript(() => {
      globalThis.__handHeld = true;
      const fixture = sessionStorage.getItem("arcanaLabFixture");
      if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("arcanaLabFixture"); }
    });
    const url = server.resolvedUrls.local[0];
    await page.goto(url, { waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
    await page.evaluate(async () => {
      const { Game } = await import("/src/state.ts"), { defaults } = await import("/src/save/save.ts");
      const s = defaults(); for (const k of Object.keys(s.tutorials)) s.tutorials[k] = true;
      s.settings.reduceMotion = true; s.settings.weatherSound = false;
      const g = new Game(s); g.newRun({ seed: 1103 }); sessionStorage.setItem("arcanaLabFixture", JSON.stringify(g.save));
    });
    await page.reload({ waitUntil: "domcontentloaded" }); await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
    await openMenu(page); await page.locator("#auto-settings").click();
    const read = () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem("towerdelve.v1")); return { tower: s.tower, delve: s.delve, gold: s.gold, xp: s.xp, arcana: s.arcana, settings: s.settings }; });
    const save = await read(); assert.equal(save.settings.devMode, false);
    await page.locator("#arcana-lab-open").click();
    const before = page.locator("#arcana-before"), after = page.locator("#arcana-after"), slider = page.locator("#arcana-scrub");
    await expect(page.locator("#arcana-play")).toHaveText("Play");
    await expect(page.locator("#arcana-loading")).toBeHidden();
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeHidden();
    const first = await after.getAttribute("data-example"), pixels = new Map();
    for (let i = 0; i < 9; i++) {
      const id = await after.getAttribute("data-example");
      assert.equal(await before.getAttribute("data-example"), id);
      assert.equal(await before.getAttribute("data-time"), await after.getAttribute("data-time"));
      const pair = await page.evaluate(() => ["arcana-before", "arcana-after"].map(id => document.getElementById(id).toDataURL()));
      assert.notEqual(pair[0], pair[1], `${id}: proposal differs from the genuine current effect`); pixels.set(id, pair);
      if (id === "voidwell" || id === "thunderbolt") await page.locator(".arcana-comparison").screenshot({ path: `test-results/arcana-lab/${id}-${width}.png` });
      await page.locator("#arcana-next").click();
    }
    assert.equal(pixels.size, 9); await expect(after).toHaveAttribute("data-example", first);
    assert.equal(await after.evaluate(c => c.toDataURL()), pixels.get(first)[1], "returning to a slide restores the same frame");
    await page.locator("#arcana-next").focus(); await page.keyboard.press("Home"); await expect(after).toHaveAttribute("data-example", "voidwell");
    await page.keyboard.press("ArrowLeft"); await expect(after).toHaveAttribute("data-example", "aurumBloom");
    await page.keyboard.press("ArrowRight"); await expect(after).toHaveAttribute("data-example", "voidwell");
    const start = await after.evaluate(c => c.toDataURL());
    await slider.fill("900"); await expect(page.locator("#arcana-play")).toHaveText("Play");
    assert.notEqual(await after.evaluate(c => c.toDataURL()), start);
    const time = await after.getAttribute("data-time");
    await page.waitForTimeout(250); assert.equal(await after.getAttribute("data-time"), time, "scrubbing pauses the shared clock");
    await slider.focus(); await page.keyboard.press("ArrowRight");
    await expect(after).toHaveAttribute("data-example", "voidwell"); assert.equal(await slider.inputValue(), "950", "slider arrow keys scrub without changing slides");
    await page.locator("#arcana-play").click(); await page.waitForTimeout(350);
    assert.notEqual(await after.getAttribute("data-time"), "950");
    const sharedTime = await page.evaluate(() => ["arcana-before", "arcana-after"].map(id => document.getElementById(id).dataset.time));
    assert.equal(sharedTime[0], sharedTime[1]);
    await page.locator("#arcana-play").click();
    await page.locator("#arcana-restart").click(); await expect(after).toHaveAttribute("data-time", "0");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]); await page.locator("#arcana-copy").click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /ARC-voidwell: Voidwell/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const boxes = await page.locator(".arcana-comparison canvas").evaluateAll(cs => cs.map(c => ({ x: c.getBoundingClientRect().x, y: c.getBoundingClientRect().y })));
    if (width > 700) assert.equal(boxes[0].y, boxes[1].y, "desktop shows both sides beside each other");
    else assert.ok(boxes[1].y > boxes[0].y, "phone stacks the two labeled views");
    assert.deepEqual(await read(), save, "browsing, playback, scrubbing and copying never change gameplay or settings");
    await slider.focus(); await page.keyboard.press("Escape"); await expect(page.locator("#arcana-lab-open")).toBeVisible();
    // OS Reduce Motion pauses previews even with the game's motion setting off.
    await page.locator("#motion").setChecked(false); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#arcana-lab-open").click(); await expect(page.locator("#arcana-play")).toHaveText("Play");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.locator("#arcana-play").click(); await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("#arcana-play")).toHaveText("Play");
    await page.locator("#arcana-lab-back").click(); await page.locator("#motion").setChecked(true);
    await page.locator("#arcana-lab-open").click(); await expect(page.locator("#arcana-play")).toHaveText("Play");
    await page.locator("#arcana-lab-back").click(); await page.locator("#settings-back").click();
    await expect(page.locator("#world")).toBeVisible(); assert.deepEqual(await read(), save); assert.deepEqual(errors, []);
    await page.close(); console.log(`Arcana comparison: all nine effects, synchronized playback, scrub/keyboard, copy, motion preferences and run isolation pass at ${width}px.`);
  }
} finally { await browser.close(); await server.close(); }
