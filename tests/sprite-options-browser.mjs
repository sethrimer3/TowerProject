import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { openMenu } from "./run-menu.mjs";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5200 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/sprite-options", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await fixClock(page);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    globalThis.__handHeld = true; globalThis.__handStartsPaused = true;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, options) {
      return getContext.call(this, type, type === "2d" ? { ...options, willReadFrequently: true } : options);
    };
    const fixture = sessionStorage.getItem("__optionsFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__optionsFixture"); }
  });
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts"), { Game } = await import("/src/state.ts");
    const save = defaults(); Object.keys(save.tutorials).forEach(k => save.tutorials[k] = true);
    const g = new Game(save); g.newRun({ outside: true, seed: 7 });
    sessionStorage.setItem("__optionsFixture", JSON.stringify(g.save));
  });
  await page.reload(); await openMenu(page); await page.locator("#auto-settings").click();
  assert.equal(await page.locator("#sprite-animations, #square-doors").count(), 0);
  await page.locator("#ui-sprites").check();
  assert.equal(await page.locator("#ui-sprites").evaluate(e => e === document.activeElement), true);
  for (const id of ["sprite-animations", "square-doors"]) {
    assert.equal(await page.locator(`#${id}`).isChecked(), false);
    await page.locator(`#${id}`).check();
  }
  for (const width of [390, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const bounds = id => document.getElementById(id).closest("label").getBoundingClientRect();
      const parent = bounds("ui-sprites"), a = bounds("sprite-animations"), d = bounds("square-doors");
      return a.top >= parent.bottom && d.top >= a.bottom && a.left > parent.left && document.documentElement.scrollWidth <= innerWidth;
    });
    assert.ok(layout, "child checkboxes sit immediately below Sprites and fit the viewport");
    await page.screenshot({ path: `test-results/sprite-options/settings-${width}.png`, fullPage: true });
  }
  await page.locator("#ui-sprites").uncheck();
  assert.equal(await page.locator("#sprite-animations, #square-doors").count(), 0);
  await page.locator("#ui-sprites").check();
  assert.ok(await page.locator("#sprite-animations").isChecked()); assert.ok(await page.locator("#square-doors").isChecked());
  await page.reload(); await openMenu(page); await page.locator("#auto-settings").click();
  for (const id of ["ui-sprites", "sprite-animations", "square-doors"]) assert.ok(await page.locator(`#${id}`).isChecked());
  const art = await page.evaluate(async () => {
    const { SQUARE_DOORS } = await import("/src/sprites/options.ts"), { kitImage } = await import("/src/sprites/kit.ts");
    const { paintTorch, paintContents } = await import("/src/render/tile-painters.ts");
    const ids = [...SQUARE_DOORS.map(k => `square-door-${k}`), "torch-animation", "torch", "door-wood", "key-blue", "dungeon-floor-masonry-0"];
    await new Promise(resolve => { const check = () => ids.map(kitImage).every(Boolean) ? resolve() : requestAnimationFrame(check); check(); });
    const sheet = document.createElement("canvas"); sheet.id = "options-art"; sheet.width = 432; sheet.height = 384;
    sheet.style.cssText = "position:fixed;top:0;left:0;width:864px;height:768px;z-index:999999;image-rendering:pixelated";
    const c = sheet.getContext("2d"); c.imageSmoothingEnabled = false; c.fillStyle = "#10151c"; c.fillRect(0, 0, 432, 384);
    const cv = document.createElement("canvas"); cv.width = cv.height = 24; const ctx = cv.getContext("2d");
    const pixels = () => [...ctx.getImageData(0, 0, 24, 24).data];
    const doors = SQUARE_DOORS.map((kind, i) => {
      ctx.clearRect(0, 0, 24, 24); ctx.drawImage(kitImage(`square-door-${kind}`), 0, 0);
      const opaque = pixels().filter((v, i) => i % 4 === 3 && v === 255).length;
      c.drawImage(cv, i * 72, 0); c.drawImage(cv, i * 72, 32, 72, 72); return opaque;
    });
    const torch = { x: 0, y: 0 }, frames = [], hardware = [], staticArt = [];
    for (let i = 0; i < 4; i++) {
      ctx.clearRect(0, 0, 24, 24); paintTorch(ctx, torch, i * 130, false, false, true, true);
      frames.push(pixels()); hardware.push([...ctx.getImageData(0, 11, 24, 13).data]);
      c.drawImage(cv, i * 72, 120); c.drawImage(cv, i * 72, 152, 72, 72);
      ctx.clearRect(0, 0, 24, 24); paintTorch(ctx, torch, i * 130, true, false, true, true); staticArt.push(pixels());
    }
    c.drawImage(kitImage("dungeon-floor-masonry-0"), 0, 240);
    c.drawImage(kitImage("dungeon-floor-masonry-0"), 120, 240, 144, 144);
    const tile = { kind: "door", color: "blue" }, base = { x: 0, y: 0, time: 0, reduceMotion: true, spritesOff: false, area1: false, styledSprites: true };
    const drawDoor = squareDoors => { ctx.clearRect(0, 0, 24, 24); paintContents(ctx, tile, { ...base, squareDoors }); return pixels(); };
    document.body.append(sheet);
    return { doors, frames, hardware, staticArt, old: drawDoor(false), square: drawDoor(true) };
  });
  assert.ok(art.doors.every(count => count === 576), "square doors fill every native tile pixel");
  assert.equal(new Set(art.frames.map(JSON.stringify)).size, 4);
  assert.equal(new Set(art.hardware.map(JSON.stringify)).size, 1, "torch fixtures never wobble between frames");
  assert.equal(new Set(art.staticArt.map(JSON.stringify)).size, 1, "Reduce motion freezes the actual PNG frame");
  assert.notDeepEqual(art.old, art.square);
  await page.locator("#options-art").screenshot({ path: "test-results/sprite-options/native-art.png" });
  await page.locator("#options-art").evaluate(e => e.remove());
  const result = await page.evaluate(async () => {
    const { dungeonSpriteScene } = await import("/tests/render-scenes.ts"), { Renderer } = await import("/src/render/rendering.ts");
    const { loadSpriteFont } = await import("/src/sprites/font.ts"), { THEME_IDS } = await import("/src/theme-collection.ts");
    await loadSpriteFont(); const { g } = dungeonSpriteScene("tower"); g.save.themes = [...THEME_IDS];
    g.effect = { text: "", x: 0, y: 0, until: 0 }; g.blocked = { x: 0, y: 0, until: 0 };
    // Place one controlled lock beside the hero, keeping terrain unchanged.
    const p = g.run.player; g.run.changes[`${p.x + 1},${p.y}`] = { kind: "door", color: "blue" };
    const before = JSON.stringify(g.run);
    const canvas = document.createElement("canvas"); canvas.id = "options-board";
    canvas.style.cssText = "position:fixed;left:0;top:0;width:510px;height:510px;z-index:99999"; document.body.append(canvas);
    const requested = [], RealImage = window.Image;
    window.Image = function(...args) { const image = new RealImage(...args); requested.push(image); return image; }; window.Image.prototype = RealImage.prototype;
    const r = new Renderer(canvas, g); let now = 1000;
    const draw = () => { for (let i = 0; i < 30; i++) r.draw(now += 100); };
    const settle = async () => { for (let i = 0; i < 16; i++) {
      const count = requested.length;
      await Promise.all(requested.map(image => image.complete ? null : new Promise(resolve => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); })));
      draw(); if (count === requested.length && requested.every(image => image.complete)) return;
    } throw Error("sprite options never settled"); };
    const hash = () => canvas.toDataURL();
    draw(); await settle(); const original = hash();
    g.save.settings.squareDoors = true; draw(); await settle(); const square = hash();
    g.save.settings.spriteAnimations = true; draw(); await settle(); const animated = hash();
    g.save.settings.squareDoors = false; g.save.settings.spriteAnimations = false; draw(); const restored = hash();
    const gated = async key => {
      g.save.settings[key] = key === "gameTheme" ? "neon" : key === "uiSprites" ? false : true;
      draw(); await settle(); const off = hash();
      g.save.settings.squareDoors = true; g.save.settings.spriteAnimations = true; draw(); const withOptions = hash();
      g.save.settings.squareDoors = false; g.save.settings.spriteAnimations = false;
      g.save.settings[key] = key === "gameTheme" ? "classic" : key === "uiSprites" ? true : false;
      return off === withOptions;
    };
    const gates = []; for (const key of ["uiSprites", "spritesOff", "gameTheme"]) gates.push(await gated(key));
    g.save.settings.squareDoors = true; g.save.settings.spriteAnimations = true; draw(); await settle();
    window.Image = RealImage;
    return { original, square, animated, restored, gates, unchanged: before === JSON.stringify(g.run) };
  });
  assert.notEqual(result.original, result.square, "live Square doors changes the real Renderer");
  assert.notEqual(result.square, result.animated, "live Animations uses the native torch strip");
  assert.equal(result.original, result.restored, "both options restore exact original pixels on the same Renderer");
  assert.ok(result.gates.every(Boolean), "sprites off, board opt-out and non-Classic themes override both options");
  assert.ok(result.unchanged, "rendering changes no saved run data");
  await page.locator("#options-board").screenshot({ path: "test-results/sprite-options/tower.png" });
  const failed = await browser.newPage();
  await fixClock(failed);
  await failed.route("**/square-door-blue.png", route => route.abort());
  await failed.route("**/torch-animation.png", route => route.abort());
  await failed.goto(server.resolvedUrls.local[0]);
  const fallback = await failed.evaluate(async () => {
    const { paintContents, paintTorch } = await import("/src/render/tile-painters.ts"), { kitImage } = await import("/src/sprites/kit.ts");
    const ids = ["door-wood", "key-blue", "torch"];
    await new Promise(resolve => { const check = () => ids.map(kitImage).every(Boolean) ? resolve() : requestAnimationFrame(check); check(); });
    const cv = document.createElement("canvas"); cv.width = cv.height = 24; const c = cv.getContext("2d");
    const art = { x: 0, y: 0, time: 0, reduceMotion: true, spritesOff: false, area1: false, styledSprites: true };
    const door = enabled => { c.clearRect(0, 0, 24, 24); paintContents(c, { kind: "door", color: "blue" }, { ...art, squareDoors: enabled }); return cv.toDataURL(); };
    const torch = enabled => { c.clearRect(0, 0, 24, 24); paintTorch(c, { x: 0, y: 0 }, 1000, true, false, true, enabled); return cv.toDataURL(); };
    const before = [door(false), torch(false)]; door(true); torch(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    return before.map((pixels, i) => pixels === [door(true), torch(true)][i]);
  });
  assert.ok(fallback.every(Boolean), "failed new PNGs retain exact previous door and torch art"); await failed.close();
  assert.deepEqual(errors, []);
  console.log("Sprite child settings, reload, native doors/torch frames, reduced motion, live Renderer toggles, theme gates and failed-image fallback pass.");
} finally { await browser.close(); await server.close(); }
