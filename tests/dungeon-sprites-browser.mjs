import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
const server = await createServer({ server: { host: "127.0.0.1", port: 5198 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/dungeon-sprites", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    globalThis.__handHeld = true; globalThis.__handStartsPaused = true;
    // Pin the same CPU canvas path before the first hash; Chromium otherwise
    // migrates canvases after readbacks and subtly changes blended pixels.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
      return getContext.call(this, type, type === "2d" ? { ...options, willReadFrequently: true } : options);
    };
  });
  let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route("**/dungeon-masonry-0.png", route => release(route));
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  const paint = () => page.evaluate(async () => {
    const { drawDungeonGround } = await import("/src/sprite-dungeon.ts");
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 24;
    const c = canvas.getContext("2d");
    const ready = drawDungeonGround(c, { mode: "tower", height: 0, seed: 3, x: 8, y: 5, wall: false, empty: true });
    return { ready, pixels: [...c.getImageData(0, 0, 24, 24).data] };
  });
  assert.equal((await paint()).ready, false);
  const route = await pending;
  await page.waitForFunction(async () => !!(await import("/src/sprite-kit.ts")).kitImage("dungeon-edges"));
  assert.equal((await paint()).ready, false, "no partial new tiles before the complete material group loads");
  await route.fulfill({ path: resolve("public/assets/style/dungeon-masonry-0.png"), contentType: "image/png" });
  await page.unroute("**/dungeon-masonry-0.png");
  await page.waitForFunction(async () => !!(await import("/src/sprite-kit.ts")).kitImage("dungeon-masonry-0"));
  const loaded = await paint(); assert.ok(loaded.ready);
  const native = await page.evaluate(async () => {
    const { dungeonFloorSprite, dungeonFloorFrame, DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS } = await import("/src/sprite-dungeon.ts");
    const { kitImage } = await import("/src/sprite-kit.ts");
    DUNGEON_ATLASES.forEach(kitImage); kitImage(DUNGEON_EDGE_ATLAS);
    const image = dungeonFloorSprite("tower", 0, 8, 5, 3);
    const pixels = [...image.getContext("2d").getImageData(0, 0, 24, 24).data];
    const cv = document.createElement("canvas"); cv.width = cv.height = 24;
    const c = cv.getContext("2d"); c.drawImage(kitImage("dungeon-masonry-0"), dungeonFloorFrame(8, 5, 3) * 24, 0, 24, 24, 0, 0, 24, 24);
    return { pixels, source: [...c.getImageData(0, 0, 24, 24).data] };
  });
  assert.deepEqual(loaded.pixels, native.source, "floor painter uses literal PNG texels");
  assert.deepEqual(native.pixels, native.source, "torch relief reads the selected new floor, not an older texture");
  await page.waitForFunction(async () => {
    const { DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS } = await import("/src/sprite-dungeon.ts"), { kitImage } = await import("/src/sprite-kit.ts");
    return [...DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS].every(id => !!kitImage(id));
  });
  const masks = await page.evaluate(async () => {
    const { kitImage } = await import("/src/sprite-kit.ts");
    const c = document.createElement("canvas").getContext("2d"); c.canvas.width = 96; c.canvas.height = 192;
    c.drawImage(kitImage("dungeon-edges"), 0, 0);
    const data = c.getImageData(0, 0, 96, 192).data;
    const centerClear = Array.from({ length: 32 }, (_, frame) => {
      for (let y = 9; y < 15; y++) for (let x = 9; x < 15; x++)
        if (data[((Math.floor(frame / 4) * 24 + y) * 96 + frame % 4 * 24 + x) * 4 + 3]) return false;
      return true;
    });
    return centerClear;
  });
  assert.ok(masks.every(Boolean), "soil transitions and contact shadows leave floor centers readable");
  for (const width of [390, 1100]) for (const mode of ["tower", "delve"]) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await page.evaluate(async ({ width, mode }) => {
      const { dungeonSpriteScene } = await import("/tests/render-scenes.ts"), { Renderer } = await import("/src/rendering.ts");
      const { loadSpriteFont } = await import("/src/sprite-font.ts"), { THEME_IDS } = await import("/src/theme-collection.ts");
      await loadSpriteFont(); const { g } = dungeonSpriteScene(mode); g.save.themes = [...THEME_IDS];
      g.effect = { text: "", x: 0, y: 0, until: 0 }; g.blocked = { x: 0, y: 0, until: 0 };
      const canvas = document.createElement("canvas"); canvas.id = "dungeon-review";
      const size = width < 500 ? 360 : 510;
      canvas.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:99999`; document.body.append(canvas);
      const requested = [], RealImage = window.Image;
      window.Image = function Image(...args) { const image = new RealImage(...args); requested.push(image); return image; };
      window.Image.prototype = RealImage.prototype;
      const renderer = new Renderer(canvas, g);
      let now = 1000;
      const draw = () => { for (let i = 0; i < 30; i++) renderer.draw(now += 100); };
      const settle = async () => {
        for (let pass = 0; pass < 16; pass++) {
          const count = requested.length;
          await Promise.all(requested.map(image => image.complete ? null : new Promise(resolve => {
            image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true });
          })));
          draw(); if (count === requested.length && requested.every(image => image.complete)) return;
        }
        throw Error("dungeon images never settled");
      };
      const hash = async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data))].join(",");
      const tiles = () => Array.from({ length: 17 * 17 }, (_, i) => g.world.tile(i % 17, Math.floor(i / 17)));
      const before = JSON.stringify(tiles());
      g.save.settings.uiSprites = false; draw(); await settle(); const off = await hash(), offPng = canvas.toDataURL();
      g.save.settings.uiSprites = true; draw(); await settle(); const on = await hash();
      g.save.settings.uiTheme = "neon"; draw(); const uiTheme = await hash();
      g.save.settings.gameTheme = "neon"; draw(); await settle(); const theme = await hash();
      g.save.settings.gameTheme = "classic"; draw(); await settle(); const restored = await hash();
      g.save.settings.spritesOff = true; draw(); await settle(); const boardOff = await hash();
      g.save.settings.spritesOff = false; g.save.settings.decorOff = true; draw(); await settle(); const decorOff = await hash();
      g.save.settings.decorOff = false; g.save.settings.uiSprites = false; draw(); await settle(); const offAgain = await hash(), offAgainPng = canvas.toDataURL();
      g.save.settings.uiSprites = true; draw(); await settle();
      window.Image = RealImage;
      return { off, on, uiTheme, theme, restored, boardOff, decorOff, offAgain, offPng, offAgainPng, unchanged: before === JSON.stringify(tiles()) };
    }, { width, mode });
    assert.notEqual(result.on, result.off); assert.equal(result.on, result.uiTheme);
    assert.notEqual(result.on, result.theme); assert.equal(result.on, result.restored);
    assert.notEqual(result.on, result.boardOff); assert.notEqual(result.on, result.decorOff);
    if (result.off !== result.offAgain) {
      writeFileSync(`test-results/dungeon-sprites/${mode}-off-before.png`, Buffer.from(result.offPng.split(",")[1], "base64"));
      writeFileSync(`test-results/dungeon-sprites/${mode}-off-after.png`, Buffer.from(result.offAgainPng.split(",")[1], "base64"));
    }
    assert.equal(result.off, result.offAgain, "a reused Renderer restores the exact legacy pixels and relief");
    assert.ok(result.unchanged);
    await page.locator("#dungeon-review").screenshot({ path: `test-results/dungeon-sprites/${mode}-${width}.png` });
    await page.locator("#dungeon-review").evaluate(e => e.remove());
  }
  await page.evaluate(async () => {
    const { DUNGEON_ATLASES } = await import("/src/sprite-dungeon.ts"), { kitImage } = await import("/src/sprite-kit.ts");
    const sheet = document.createElement("canvas"); sheet.id = "dungeon-art"; sheet.width = 1100; sheet.height = 850;
    const c = sheet.getContext("2d"); c.imageSmoothingEnabled = false; c.fillStyle = "#10151c"; c.fillRect(0, 0, sheet.width, sheet.height);
    DUNGEON_ATLASES.forEach((id, i) => {
      const image = kitImage(id), x = i % 7 * 155 + 6, y = Math.floor(i / 7) * 280;
      c.drawImage(image, x, y + 6); c.drawImage(image, 0, 0, 96, 24, x, y + 140, 144, 36);
      c.fillStyle = "#eee0b7"; c.font = "11px sans-serif"; c.fillText(id.replace("dungeon-", ""), x, y + 200);
    });
    sheet.style.cssText = "position:fixed;left:0;top:0;width:1100px;height:850px;z-index:100000"; document.body.append(sheet);
  });
  await page.locator("#dungeon-art").screenshot({ path: "test-results/dungeon-sprites/native-atlases.png" });
  await page.locator("#dungeon-art").evaluate(e => e.remove());
  const failed = await browser.newPage();
  await failed.route("**/dungeon-masonry-0.png", route => route.abort());
  await failed.goto(server.resolvedUrls.local[0]);
  const fallback = await failed.evaluate(async () => {
    const { drawDungeonGround } = await import("/src/sprite-dungeon.ts");
    const { paintTile } = await import("/src/tile-painters.ts");
    const cv = document.createElement("canvas"); cv.width = cv.height = 24; const c = cv.getContext("2d");
    const tile = { mode: "tower", height: 0, seed: 1, x: 8, y: 5, wall: true, empty: false };
    const ready = drawDungeonGround(c, tile);
    paintTile(c, { tile: () => ({ kind: "wall" }) }, { kind: "wall" }, 8, 5, 0, 0,
      { ...tile, outside: false, entranceX: 8, spritesOff: false, styledSprites: true, reduceMotion: true, area1: true, themed: null });
    return { ready, visible: [...c.getImageData(0, 0, 24, 24).data].filter((v, i) => i % 4 === 3 && v).length };
  });
  assert.equal(fallback.ready, false); assert.equal(fallback.visible, 576, "failed PNGs retain a complete legacy ground tile");
  await failed.close();
  assert.deepEqual(errors, []);
  console.log("Native PNG floors, relief texels, clear transition masks, late/failed loads, Tower/Delve phone/desktop frames and reused-renderer theme/toggle restoration pass.");
} finally { await browser.close(); await server.close(); }
