// Literal PNG texels, unchanged masks, delayed loads, and real dungeon frames.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5196 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/environment-sprites", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await fixClock(page);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => { globalThis.__handHeld = true; globalThis.__handStartsPaused = true; });
  let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route("**/env-water-deep.png", route => release(route));
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  await page.evaluate(async () => {
    const { DecorBaker } = await import("/src/render/decor/decor-bake.ts");
    const water = new Uint8Array(576);
    for (let y = 1; y < 23; y++) for (let x = 1; x < 23; x++) water[y * 24 + x] = x === 1 || x === 22 || y === 1 || y === 22 ? 2 : 1;
    const d = { water, moss: null, vines: [], flowers: [], plants: [] };
    const src = { kind: () => "floor", seed: 77 }, baker = new DecorBaker();
    const read = cv => [...cv.getContext("2d").getImageData(0, 0, 24, 24).data];
    const off = read(baker.bake(src, 0, 0, d));
    baker.bake(src, 0, 0, d, true);
    window.__environmentReview = { src, d, baker, read, off };
  });
  const route = await pending;
  await page.waitForFunction(async () => {
    const { kitImage } = await import("/src/sprites/kit.ts");
    return ["env-water-mid", "env-water-shore", "env-water-bank"].every(id => !!kitImage(id));
  });
  const loading = await page.evaluate(() => {
    const { src, d, baker, read, off } = window.__environmentReview;
    return { off, loading: read(baker.bake(src, 0, 0, d, true)) };
  });
  assert.deepEqual(loading.loading, loading.off, "water keeps the complete old look until all four materials load");
  await route.fulfill({ path: resolve("public/assets/style/env-water-deep.png"), contentType: "image/png" });
  await page.waitForFunction(async () => !!(await import("/src/sprites/kit.ts")).kitImage("env-water-deep"));
  await page.evaluate(async () => {
    const { ENVIRONMENT_SPRITES } = await import("/src/sprites/environment.ts");
    const { kitImage } = await import("/src/sprites/kit.ts"); ENVIRONMENT_SPRITES.forEach(kitImage);
  });
  await page.waitForFunction(async () => {
    const { ENVIRONMENT_SPRITES } = await import("/src/sprites/environment.ts"), { kitImage } = await import("/src/sprites/kit.ts");
    return ENVIRONMENT_SPRITES.every(id => !!kitImage(id));
  });
  const pixels = await page.evaluate(async () => {
    const { DecorBaker } = await import("/src/render/decor/decor-bake.ts");
    const { environmentPixels, MOSS_SPRITES } = await import("/src/sprites/environment.ts");
    const { src, d, baker, read, off } = window.__environmentReview;
    const on = read(baker.bake(src, 0, 0, d, true));
    const rgba = (data, x, y) => [...data.slice((y * 24 + x) * 4, (y * 24 + x + 1) * 4)];
    const samples = [[12, 12, "deep"], [2, 12, "shore"], [3, 12, "mid"], [12, 2, "bank"]]
      .map(([x, y, kind]) => [rgba(on, x, y), rgba(environmentPixels(`env-water-${kind}`).data, x, y)]);
    const offAgain = read(baker.bake(src, 0, 0, d, false)), restored = read(baker.bake(src, 0, 0, d, true));
    const vine = read(new DecorBaker().bake(src, 0, 0, { ...d, vines: [{ i: 1, j: 12, c: 2 }] }, true));
    let waterChangedByLeaves = 0;
    for (let k = 0; k < 576; k++) if (d.water[k] === 1 && on.slice(k * 4, k * 4 + 4).some((v, n) => v !== vine[k * 4 + n])) waterChangedByLeaves++;
    const moss = MOSS_SPRITES.map((id, variant) => {
      const mask = new Uint8Array(576); mask[12 * 24 + 12] = variant === 1 ? 7 : 3;
      const mossSrc = { ...src, kind: () => variant === 2 ? "wall" : "floor" };
      const result = read(new DecorBaker().bake(mossSrc, 0, 0, { ...d, water: null, moss: mask }, true));
      return { actual: rgba(result, 12, 12), expected: rgba(environmentPixels(id).data, 12, 12),
        footprint: result.filter((a, k) => k % 4 === 3 && a).length };
    });
    return { off, on, offAgain, restored, samples, moss, waterChangedByLeaves,
      sameFootprint: on.every((v, k) => k % 4 !== 3 || !!v === !!off[k]) };
  });
  assert.notDeepEqual(pixels.on, pixels.off, "PNG arrival immediately refreshes the baked tile");
  assert.ok(pixels.sameFootprint, "pool and wet-bank coverage remains unchanged");
  for (const [actual, expected] of pixels.samples) assert.deepEqual(actual, expected, "water uses the PNG's literal texel");
  assert.deepEqual(pixels.offAgain, pixels.off); assert.deepEqual(pixels.restored, pixels.on);
  assert.equal(pixels.waterChangedByLeaves, 0, "leaf sprites stay out of planned water");
  for (const moss of pixels.moss) {
    assert.equal(moss.footprint, 1, "PNG texture respects the exact moss mask");
    moss.actual.slice(0, 3).forEach((value, i) => assert.ok(Math.abs(value - moss.expected[i]) <= 2));
  }
  await page.evaluate(async () => {
    const { ENVIRONMENT_SPRITES, MOSS_SPRITES, WATER_SPRITES } = await import("/src/sprites/environment.ts");
    const { kitImage } = await import("/src/sprites/kit.ts");
    const sheet = document.createElement("canvas"); sheet.id = "environment-art"; sheet.width = 960; sheet.height = 650;
    const c = sheet.getContext("2d"); c.imageSmoothingEnabled = false; c.fillStyle = "#293543"; c.fillRect(0, 0, 960, 650);
    ENVIRONMENT_SPRITES.forEach((id, i) => {
      const image = kitImage(id), x = i % 4 * 240, y = Math.floor(i / 4) * 160;
      c.drawImage(image, x + 8, y + 8);
      c.drawImage(image, x + 48, y + 8, image.naturalWidth * 4, image.naturalHeight * 4);
      c.fillStyle = "#eee0b7"; c.font = "12px sans-serif"; c.fillText(id.replace("env-", ""), x + 8, y + 140);
    });
    sheet.style.cssText = "position:fixed;left:0;top:0;width:960px;height:650px;z-index:100000"; document.body.append(sheet);
    const tiles = document.createElement("canvas"); tiles.id = "environment-tiles"; tiles.width = 7 * 72; tiles.height = 72;
    const t = tiles.getContext("2d"); t.imageSmoothingEnabled = false;
    [...MOSS_SPRITES, ...WATER_SPRITES].forEach((id, i) => {
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) t.drawImage(kitImage(id), i * 72 + x * 24, y * 24);
    });
    tiles.style.cssText = "position:fixed;left:0;top:0;width:504px;height:72px;z-index:100001"; document.body.append(tiles);
  });
  await page.locator("#environment-tiles").screenshot({ path: "test-results/environment-sprites/materials-tiled.png" });
  await page.locator("#environment-tiles").evaluate(e => e.remove());
  await page.locator("#environment-art").screenshot({ path: "test-results/environment-sprites/native-and-enlarged.png" });
  await page.locator("#environment-art").evaluate(e => e.remove());
  for (const width of [390, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.evaluate(async width => {
      const { environmentSpriteScene } = await import("/tests/render-scenes.ts"), { Renderer } = await import("/src/rendering.ts");
      const { loadSpriteFont } = await import("/src/sprites/font.ts"), { THEME_IDS } = await import("/src/theme-collection.ts");
      await loadSpriteFont();
      const { g } = environmentSpriteScene(); g.save.themes = [...THEME_IDS];
      const { DecorLayer } = await import("/src/render/decor/decor-render.ts");
      const layer = new DecorLayer(); layer.planBudget = 1000; layer.sync(g.world, g.run.seed);
      const view = { left: 0, bottom: 0, n: 17, s: 24 };
      const oldLights = layer.glows(view), kitLights = layer.glows(view, true), oldAgain = layer.glows(view);
      g.effect = { text: "", x: 0, y: 0, until: 0 }; g.blocked = { x: 0, y: 0, until: 0 };
      const canvas = document.createElement("canvas"); canvas.id = "environment-review";
      const size = width < 500 ? 360 : 408;
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
        throw Error("environment images never settled");
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
      g.save.settings.uiSprites = true; draw();
      window.Image = RealImage;
      return { off, on, uiTheme, theme, restored, boardOff, decorOff, offAgain, oldLights, kitLights, oldAgain };
    }, width);
    assert.notEqual(result.on, result.off); assert.equal(result.on, result.uiTheme, "UI themes leave Game sprites independent");
    assert.notEqual(result.on, result.theme); assert.equal(result.on, result.restored);
    assert.notEqual(result.on, result.boardOff); assert.notEqual(result.on, result.decorOff);
    assert.equal(result.off, result.offAgain, "Sprites off restores the exact original frame");
    assert.notDeepEqual(result.kitLights, result.oldLights, "emitted hues match the active PNG colors");
    assert.deepEqual(result.oldAgain, result.oldLights, "turning the kit off resets cached light colors");
    const geometry = lights => lights.map(({ rgb, ...light }) => light);
    assert.deepEqual(geometry(result.kitLights), geometry(result.oldLights), "light positions, radii and strengths are unchanged");
    await page.locator("#environment-review").screenshot({ path: `test-results/environment-sprites/board-${width}.png` });
    await page.locator("#environment-review").evaluate(e => e.remove());
  }
  assert.deepEqual(errors, []);
  console.log("Environmental PNG texels, exact masks, late loads, native art, theme/toggle restoration and real phone/desktop dungeon frames pass.");
} finally { await browser.close(); await server.close(); }
