// Native forest art, atomic loading and real Tower/Delve frames and gates.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5197 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/forest-sprites", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await fixClock(page);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => { globalThis.__handHeld = true; globalThis.__handStartsPaused = true; });
  let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route("**/forest-oak.png", route => release(route));
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  const initial = await page.evaluate(async () => {
    const { forestSpritesReady } = await import("/src/sprite-forest.ts");
    return forestSpritesReady();
  });
  assert.equal(initial, false);
  const route = await pending;
  await page.waitForFunction(async () => {
    const { FOREST_SPRITES } = await import("/src/sprite-forest.ts"), { kitImage } = await import("/src/sprite-kit.ts");
    return Object.keys(FOREST_SPRITES).filter(id => id !== "forest-oak").every(id => !!kitImage(id));
  });
  assert.equal(await page.evaluate(async () => (await import("/src/sprite-forest.ts")).forestSpritesReady()), false,
    "keep the complete tile forest until every replacement foliage PNG is ready");
  const groundSource = () => page.evaluate(async () => {
    const { drawForestTile } = await import("/src/outside.ts"), { kitImage } = await import("/src/sprite-kit.ts");
    kitImage("terrain");
    let source = "";
    const canvas = document.createElement("canvas"), c = canvas.getContext("2d"), draw = c.drawImage.bind(c);
    c.drawImage = (image, ...args) => { source = image.src; draw(image, ...args); };
    drawForestTile(c, { kind: "wall" }, { x: 0, y: 0, seed: 503, center: 8 }, true, true);
    return source.split("/").at(-1);
  });
  await groundSource();
  await page.waitForFunction(async () => !!(await import("/src/sprite-kit.ts")).kitImage("terrain"));
  assert.equal(await groundSource(), "terrain.png", "a delayed crown keeps the old forest tile, including its tree");
  await route.fulfill({ path: resolve("public/assets/style/forest-oak.png"), contentType: "image/png" });
  await page.unroute("**/forest-oak.png");
  await page.waitForFunction(async () => (await import("/src/sprite-forest.ts")).forestSpritesReady());
  assert.equal(await groundSource(), "forest-litter.png", "image arrival switches to ground-only art beneath the foliage layer");
  for (const width of [390, 1100]) for (const mode of ["tower", "delve"]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.evaluate(async ({ width, mode }) => {
      const { forestSpriteScene } = await import("/tests/render-scenes.ts"), { Renderer } = await import("/src/rendering.ts");
      const { loadSpriteFont } = await import("/src/sprite-font.ts"), { THEME_IDS } = await import("/src/theme-collection.ts");
      await loadSpriteFont();
      const { g } = forestSpriteScene(mode); g.save.themes = [...THEME_IDS];
      g.effect = { text: "", x: 0, y: 0, until: 0 }; g.blocked = { x: 0, y: 0, until: 0 };
      const canvas = document.createElement("canvas"); canvas.id = "forest-review";
      const size = width < 500 ? 360 : 480;
      canvas.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:99999`; document.body.append(canvas);
      const requested = [], RealImage = window.Image;
      window.Image = function Image(...args) { const image = new RealImage(...args); requested.push(image); return image; };
      window.Image.prototype = RealImage.prototype;
      const draw = () => { const r = new Renderer(canvas, g); for (let t = 1000; t <= 1450; t += 50) r.draw(t); r.draw(1740); };
      const settle = async () => {
        for (let pass = 0; pass < 12; pass++) {
          const count = requested.length;
          await Promise.all(requested.map(image => image.complete ? null : new Promise(resolve => {
            image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true });
          })));
          draw(); if (count === requested.length && requested.every(image => image.complete)) return;
        }
        throw Error("forest images never settled");
      };
      const hash = async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data))].join(",");
      g.save.settings.uiSprites = false; draw(); await settle(); const off = await hash();
      g.save.settings.uiSprites = true; draw(); await settle(); const on = await hash();
      g.save.settings.uiTheme = "neon"; draw(); const uiTheme = await hash();
      g.save.settings.gameTheme = "neon"; draw(); await settle(); const theme = await hash();
      g.save.settings.gameTheme = "classic"; draw(); await settle(); const restored = await hash();
      g.save.settings.spritesOff = true; draw(); await settle(); const boardOff = await hash();
      g.save.settings.spritesOff = false; g.save.settings.decorOff = true; draw(); await settle(); const decorOff = await hash();
      g.save.settings.decorOff = false; g.save.settings.uiSprites = false; draw(); const offAgain = await hash();
      g.save.settings.uiSprites = true; draw(); window.Image = RealImage;
      return { off, on, uiTheme, theme, restored, boardOff, decorOff, offAgain };
    }, { width, mode });
    assert.notEqual(result.on, result.off); assert.equal(result.on, result.uiTheme);
    assert.notEqual(result.on, result.theme); assert.equal(result.on, result.restored);
    assert.notEqual(result.on, result.boardOff); assert.notEqual(result.on, result.decorOff);
    assert.equal(result.off, result.offAgain, "Sprites off restores the exact original forest frame");
    await page.locator("#forest-review").screenshot({ path: `test-results/forest-sprites/${mode}-${width}.png` });
    await page.locator("#forest-review").evaluate(e => e.remove());
  }
  await page.evaluate(async () => {
    const { FOREST_SPRITES, FOREST_LANDMARKS } = await import("/src/sprite-forest.ts"), { kitImage } = await import("/src/sprite-kit.ts");
    const sheet = document.createElement("canvas"); sheet.id = "forest-art"; sheet.width = 1000; sheet.height = 900;
    const c = sheet.getContext("2d"); c.imageSmoothingEnabled = false; c.fillStyle = "#1b2430"; c.fillRect(0, 0, 1000, 900);
    Object.keys(FOREST_SPRITES).forEach((id, i) => {
      const image = kitImage(id), x = i % 5 * 200, y = Math.floor(i / 5) * 140;
      c.drawImage(image, x + 6, y + 6);
      c.fillStyle = "#eee0b7"; c.font = "12px sans-serif"; c.fillText(id.replace("forest-", ""), x + 6, y + 132);
    });
    Object.keys(FOREST_LANDMARKS).forEach((id, i) => c.drawImage(kitImage(id), i * 440 + 30, 600));
    sheet.style.cssText = "position:fixed;left:0;top:0;width:1000px;height:900px;z-index:100000"; document.body.append(sheet);
  });
  await page.locator("#forest-art").screenshot({ path: "test-results/forest-sprites/native-art.png" });
  await page.locator("#forest-art").evaluate(e => e.remove());
  // The real board keeps building taps, the mode sign and both entrances.
  await page.addInitScript(() => {
    const fixture = sessionStorage.getItem("__forestFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__forestFixture"); }
  });
  await page.evaluate(async () => {
    const { g } = (await import("/tests/render-scenes.ts")).forestSpriteScene("tower");
    for (const key of Object.keys(g.save.tutorials)) g.save.tutorials[key] = true;
    sessionStorage.setItem("__forestFixture", JSON.stringify(g.save));
  });
  await page.reload();
  const title = text => page.waitForFunction(text => document.querySelector("#board-title")?.textContent === text, text);
  await title("THE TOWER APPROACH");
  const tap = async (column, row) => {
    const box = await page.locator("#world").boundingBox();
    await page.mouse.click(box.x + box.width * column / 20, box.y + box.height * row / 20);
  };
  await tap(3.5, 9.5); await page.locator("#equip-materials").waitFor();
  await page.locator('[data-tab="board"]').click();
  await tap(13.5, 9.5); await page.locator("#tournament-back").waitFor();
  await page.locator("#tournament-back").click();
  await page.locator("#forest-sign").click();
  await title("THE MOUNTAIN HOLLOW");
  const sign = await page.locator("#forest-sign").boundingBox(), box = await page.locator("#world").boundingBox();
  await page.mouse.click(sign.x + sign.width / 2, box.y + box.height * 7.5 / 20);
  const delveTitle = await page.evaluate(async () => (await import("/src/modes.ts")).MODES.delve.words.title);
  await title(delveTitle);
  await page.reload();
  // Loading a save from inside the Delve returns there; test Tower separately.
  await page.evaluate(async () => {
    const { g } = (await import("/tests/render-scenes.ts")).forestSpriteScene("tower");
    for (const key of Object.keys(g.save.tutorials)) g.save.tutorials[key] = true;
    sessionStorage.setItem("__forestFixture", JSON.stringify(g.save));
  });
  await page.reload(); await page.locator("#forest-sign").waitFor();
  await tap(8.5, 7.5);
  await title("THE ASCENT TRIALS");
  const failed = await browser.newPage();
  await failed.route("**/forest-oak.png", route => route.abort());
  await failed.route("**/forest-tower-base.png", route => route.abort());
  await failed.goto(server.resolvedUrls.local[0]);
  await failed.evaluate(async () => {
    (await import("/src/sprite-forest.ts")).forestSpritesReady();
    (await import("/src/sprite-kit.ts")).kitImage("forest-tower-base");
  });
  await failed.waitForFunction(async () => {
    const { FOREST_SPRITES } = await import("/src/sprite-forest.ts"), { kitImage } = await import("/src/sprite-kit.ts");
    return Object.keys(FOREST_SPRITES).filter(id => id !== "forest-oak").every(id => !!kitImage(id));
  });
  assert.equal(await failed.evaluate(async () => (await import("/src/sprite-forest.ts")).forestSpritesReady()), false);
  const fallback = await failed.evaluate(async () => {
    const { drawEntrance } = await import("/src/outside.ts");
    const cv = document.createElement("canvas"); cv.width = cv.height = 480;
    drawEntrance(cv.getContext("2d"), "tower", 8, "", undefined, true);
    const rgba = cv.getContext("2d").getImageData(110, 20, 1, 1).data;
    return [...rgba];
  });
  assert.equal(fallback[3], 255, "missing landmark retains the huge procedural base rather than a tiny icon");
  await failed.close();
  assert.deepEqual(errors, []);
  console.log("Forest PNG late/failed loads, native artwork, Tower/Delve phone/desktop frames, theme gates, exact restoration and real building/sign/entrance taps pass.");
} finally { await browser.close(); await server.close(); }
