import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5201 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/tower-tiers", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  await fixClock(page);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    globalThis.__handHeld = true; globalThis.__handStartsPaused = true;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, options) {
      return getContext.call(this, type, type === "2d" ? { ...options, willReadFrequently: true } : options);
    };
  });
  let release; const requested = new Promise(resolve => { release = resolve; });
  await page.route("**/dungeon-tower-2-floor.png", route => release(route));
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  const paint = () => page.evaluate(async () => {
    const { drawDungeonGround } = await import("/src/sprite-dungeon.ts");
    const c = document.createElement("canvas").getContext("2d"); c.canvas.width = c.canvas.height = 24;
    return drawDungeonGround(c, { mode: "tower", tier: 2, height: 0, seed: 0, x: 0, y: 0, wall: false, empty: true });
  });
  assert.equal(await paint(), false);
  const route = await requested;
  await page.waitForFunction(async () => !!(await import("/src/sprite-kit.ts")).kitImage("dungeon-tower-2-walls"));
  assert.equal(await paint(), false, "floors and walls switch as one complete material group");
  await route.fulfill({ path: resolve("public/assets/style/dungeon-tower-2-floor.png"), contentType: "image/png" });
  await page.unroute("**/dungeon-tower-2-floor.png");
  await page.waitForFunction(async () => {
    const { drawDungeonGround } = await import("/src/sprite-dungeon.ts");
    const c = document.createElement("canvas").getContext("2d"); c.canvas.width = c.canvas.height = 24;
    return [2, 3].map(tier => drawDungeonGround(c, { mode: "tower", tier, height: 0, seed: 0, x: 0, y: 0, wall: false, empty: true })).every(Boolean);
  });
  const native = await page.evaluate(async () => {
    const { drawDungeonGround, dungeonFloorSprite, drawDungeonFrame } = await import("/src/sprite-dungeon.ts");
    const { kitImage } = await import("/src/sprite-kit.ts");
    const c = document.createElement("canvas").getContext("2d"); c.canvas.width = c.canvas.height = 96;
    const read = () => [...c.getImageData(0, 0, 96, 96).data];
    return [2, 3].map(tier => {
      c.clearRect(0, 0, 96, 96);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        c.save(); c.translate(col * 24, row * 24);
        // Negative world coordinates exercise wrapping and north/south order.
        drawDungeonGround(c, { mode: "tower", tier, height: 99, seed: 0, x: col - 4, y: 4 - row, wall: false, empty: true }); c.restore();
      }
      const actual = read(); c.clearRect(0, 0, 96, 96); c.drawImage(kitImage(`dungeon-tower-${tier}-floor`), 0, 0); const expected = read();
      const relief = dungeonFloorSprite("tower", 0, 0, 0, 0, tier);
      const reliefPixels = [...relief.getContext("2d").getImageData(0, 0, 24, 24).data];
      const sourcePixels = [...c.getImageData(0, 0, 24, 24).data];
      const wall = kitImage(`dungeon-tower-${tier}-walls`), corners = [];
      for (let i = 0; i < 4; i++) {
        c.clearRect(0, 0, 96, 96); drawDungeonFrame(c, wall, 100 + i);
        const data = c.getImageData(0, 0, 24, 24).data;
        let opaque = 0, outside = 0;
        const left = [1, 2].includes(i) ? 18 : 0, top = i >= 2 ? 18 : 0;
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (data[(y * 24 + x) * 4 + 3]) {
          opaque++; if (x < left || x >= left + 6 || y < top || y >= top + 6) outside++;
        }
        corners.push({ opaque, outside });
      }
      c.clearRect(0, 0, 96, 96);
      drawDungeonGround(c, { mode: "tower", tier, height: 0, seed: 0, x: 0, y: 0, wall: true, empty: false }, [], { depth: 2, openings: 0 });
      const core = [...c.getImageData(0, 0, 24, 24).data].every((value, i) => value === [12, 16, 22, 255][i % 4]);
      return { actual, expected, reliefPixels, sourcePixels, corners, core };
    });
  });
  for (const set of native) {
    assert.deepEqual(set.actual, set.expected, "all sixteen floor frames reconstruct the literal panel without seams or flips");
    assert.deepEqual(set.reliefPixels, set.sourcePixels, "torch relief reads the selected tower's PNG texels");
    assert.ok(set.core, "both materials recede to the same near-black core");
    for (const corner of set.corners) { assert.ok(corner.opaque >= 5); assert.equal(corner.outside, 0); }
  }
  for (const width of [390, 1100]) for (const tier of [2, 3]) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await page.evaluate(async ({ tier, width }) => {
      const { towerTierSpriteScene } = await import("/tests/render-scenes.ts"), { Renderer } = await import("/src/rendering.ts");
      const { loadSpriteFont } = await import("/src/sprite-font.ts"), { THEME_IDS } = await import("/src/theme-collection.ts");
      const { decode } = await import("/src/save.ts"), { Game } = await import("/src/state.ts");
      await loadSpriteFont(); const { g } = towerTierSpriteScene(tier); g.save.themes = [...THEME_IDS];
      g.effect = { text: "", x: 0, y: 0, until: 0 }; g.blocked = { x: 0, y: 0, until: 0 };
      const before = JSON.stringify(g.save), size = width < 500 ? 360 : 510;
      const canvas = document.createElement("canvas"); canvas.id = "tier-board";
      canvas.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:99999`; document.body.append(canvas);
      const requested = [], RealImage = window.Image;
      window.Image = function(...args) { const image = new RealImage(...args); requested.push(image); return image; }; window.Image.prototype = RealImage.prototype;
      const renderer = new Renderer(canvas, g); let now = 1000;
      const draw = () => { for (let i = 0; i < 30; i++) renderer.draw(now += 100); };
      const settle = async () => { for (let i = 0; i < 16; i++) {
        const count = requested.length;
        await Promise.all(requested.map(image => image.complete ? null : new Promise(resolve => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); })));
        draw(); if (count === requested.length && requested.every(image => image.complete)) return;
      } throw Error("tier sprites never settled"); };
      const hash = () => canvas.toDataURL();
      draw(); await settle(); const original = hash(), unchanged = before === JSON.stringify(g.save);
      g.run.tier = tier === 2 ? 3 : 2; draw(); await settle(); const other = hash();
      g.run.tier = tier; draw(); const restored = hash();
      g.save.settings.uiTheme = "neon"; draw(); const ui = hash();
      g.save.settings.gameTheme = "neon"; draw(); await settle(); const theme = hash();
      g.run.tier = tier === 2 ? 3 : 2; draw(); const themedOther = hash();
      g.run.tier = tier; g.save.settings.gameTheme = "classic"; draw(); await settle(); const themedBack = hash();
      g.save.settings.uiSprites = false; draw(); await settle(); const off = hash();
      g.save.settings.uiSprites = true; draw(); await settle(); const onAgain = hash();
      g.save.settings.uiSprites = false; draw(); const offAgain = hash();
      g.save.settings.uiSprites = true; draw();
      const loaded = new Game(decode(JSON.stringify(g.save)));
      const reloadedTier = new Renderer(document.createElement("canvas"), loaded).look().tier;
      window.Image = RealImage;
      return { original, other, restored, ui, theme, themedOther, themedBack, off, onAgain, offAgain, unchanged, reloadedTier };
    }, { tier, width });
    assert.ok(result.unchanged, "drawing leaves saved gameplay untouched"); assert.equal(result.reloadedTier, tier);
    assert.notEqual(result.original, result.other, "switching a warmed Renderer changes the ground, wall and relief material");
    assert.equal(result.original, result.restored); assert.equal(result.original, result.ui);
    assert.notEqual(result.original, result.theme); assert.equal(result.theme, result.themedOther, "other Game themes override the material identity");
    assert.equal(result.original, result.themedBack); assert.equal(result.original, result.onAgain);
    assert.equal(result.off, result.offAgain, "sprites off restores exact legacy pixels");
    await page.locator("#tier-board").screenshot({ path: `test-results/tower-tiers/tower-${tier}-${width}.png` });
    await page.locator("#tier-board").evaluate(e => e.remove());
  }
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.evaluate(async () => {
    const { kitImage } = await import("/src/sprite-kit.ts");
    const c = document.createElement("canvas").getContext("2d"); c.canvas.id = "tier-art"; c.canvas.width = 1000; c.canvas.height = 600;
    c.canvas.style.cssText = "position:fixed;top:0;left:0;z-index:99999"; c.imageSmoothingEnabled = false;
    c.fillStyle = "#0c1016"; c.fillRect(0, 0, 1000, 600);
    for (const [i, tier] of [2, 3].entries()) {
      const x = i * 500, floor = kitImage(`dungeon-tower-${tier}-floor`), walls = kitImage(`dungeon-tower-${tier}-walls`);
      c.drawImage(floor, x, 0); c.drawImage(floor, x + 110, 0, 288, 288);
      c.drawImage(walls, 0, 624, 96, 24, x, 310, 384, 96);
      c.drawImage(walls, 0, 48, 96, 24, x, 410, 384, 96);
      c.drawImage(walls, 0, 672, 96, 24, x, 510, 384, 96);
    }
    document.body.append(c.canvas);
  });
  await page.locator("#tier-art").screenshot({ path: "test-results/tower-tiers/native-materials.png" });
  const failed = await browser.newPage();
  await fixClock(failed);
  await failed.route("**/dungeon-tower-3-walls.png", route => route.abort());
  await failed.goto(server.resolvedUrls.local[0]);
  const fallback = await failed.evaluate(async () => {
    const { drawDungeonGround } = await import("/src/sprite-dungeon.ts"), { paintTile } = await import("/src/tile-painters.ts");
    const c = document.createElement("canvas").getContext("2d"); c.canvas.width = c.canvas.height = 24;
    const tile = { mode: "tower", tier: 3, height: 0, seed: 0, x: 0, y: 0, wall: true, empty: false };
    const ready = drawDungeonGround(c, tile);
    paintTile(c, { tile: () => ({ kind: "wall" }) }, { kind: "wall" }, 0, 0, 0, 0,
      { ...tile, outside: false, entranceX: 8, spritesOff: false, styledSprites: true, reduceMotion: true, area1: true, themed: null });
    return { ready, opaque: [...c.getImageData(0, 0, 24, 24).data].filter((v, i) => i % 4 === 3 && v === 255).length };
  });
  assert.equal(fallback.ready, false); assert.equal(fallback.opaque, 576); await failed.close();
  assert.deepEqual(errors, []);
  console.log("Tower II/III literal floor panels, relief, corner footprints, black cores, late/failed loads, phone/desktop scenes, live tier caches, themes, reload and legacy restoration pass.");
} finally { await browser.close(); await server.close(); }
