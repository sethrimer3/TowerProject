import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5202 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/sprite-animations", { recursive: true });
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
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  const native = await page.evaluate(async () => {
    const { kitImage } = await import("/src/sprites/kit.ts"), { HERO_FACINGS, keyShineFrame } = await import("/src/sprites/animations.ts");
    const { paintContents, paintHero } = await import("/src/tile-painters.ts"), { drawStruckDown } = await import("/src/struck-down.ts");
    const ids = ["ambient-potion-bubbles", "ambient-key-shine", "ambient-death-skull", ...HERO_FACINGS.flatMap(f => [`hero-${f}`, `ambient-hero-${f}`]), "key-yellow", "key-blue", "key-red", "potion-red", "potion-blue"];
    await new Promise(resolve => { const check = () => ids.map(kitImage).every(Boolean) ? resolve() : requestAnimationFrame(check); check(); });
    const c = document.createElement("canvas").getContext("2d"); c.canvas.width = c.canvas.height = 24;
    const read = () => [...c.getImageData(0, 0, 24, 24).data];
    const get = (id, frame = 0) => { c.clearRect(0, 0, 24, 24); c.drawImage(kitImage(id), frame * 24, 0, 24, 24, 0, 0, 24, 24); return read(); };
    const hero = HERO_FACINGS.map(facing => {
      const base = get(`hero-${facing}`), frames = [0, 1, 2, 3].map(frame => get(`ambient-hero-${facing}`, frame));
      const stable = frames.every(data => data.every((v, i) => {
        const x = Math.floor(i / 4) % 24, y = Math.floor(i / 4 / 24), inside = facing === "up" ? x >= 8 && x <= 15 && y >= 12 && y <= 19 : x >= 9 && x <= 13 && y >= 11 && y <= 18;
        return (i % 4 !== 3 && inside) || v === base[i];
      }));
      return { facing, stable, first: JSON.stringify(base) === JSON.stringify(frames[0]), variants: new Set(frames.map(JSON.stringify)).size };
    });
    const red = get("potion-red"), blue = get("potion-blue");
    let bubblesInside = true;
    for (let frame = 1; frame < 5; frame++) get("ambient-potion-bubbles", frame).forEach((v, i) => { if (i % 4 === 3 && v && (!red[i] || !blue[i])) bubblesInside = false; });
    let when = 0; while (!keyShineFrame(1, 2, when, 47)) when += 25;
    const art = { x: 1, y: 2, seed: 47, time: when, spritesOff: false, reduceMotion: false, area1: false, styledSprites: true, spriteAnimations: true };
    const pickup = override => { c.clearRect(0, 0, 24, 24); paintContents(c, { kind: "key", color: "yellow" }, { ...art, ...override }); return c.canvas.toDataURL(); };
    const glint = pickup({}), plain = pickup({ spriteAnimations: false }), reduced = pickup({ reduceMotion: true });
    const f = { c, n: 1, s: 24, left: 0, bottom: 0, playerX: 0, playerY: -1, look: { styledSprites: true, spritesOff: false, reduceMotion: false, spriteAnimations: true } };
    const skull = (age, override) => { c.clearRect(0, 0, 24, 24); Object.assign(f.look, override); drawStruckDown(f, age); return c.canvas.toDataURL(); };
    const movingSkulls = [280, 420, 560].map(age => skull(age, { spriteAnimations: true, reduceMotion: false }));
    const staticSkulls = [280, 420, 560].map(age => skull(age, { spriteAnimations: false, reduceMotion: false }));
    const stillSkulls = [280, 420, 560].map(age => skull(age, { spriteAnimations: true, reduceMotion: true }));
    const sheet = document.createElement("canvas"); sheet.id = "ambient-art"; sheet.width = 960; sheet.height = 600;
    const ctx = sheet.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#10151c"; ctx.fillRect(0, 0, 960, 600);
    HERO_FACINGS.forEach((facing, row) => { for (let frame = 0; frame < 4; frame++) {
      c.clearRect(0, 0, 24, 24); c.drawImage(kitImage(`ambient-hero-${facing}`), frame * 24, 0, 24, 24, 0, 0, 24, 24);
      ctx.drawImage(c.canvas, frame * 100, row * 100); ctx.drawImage(c.canvas, frame * 100 + 24, row * 100, 72, 72);
    }});
    for (let frame = 0; frame < 6; frame++) { c.clearRect(0, 0, 24, 24); c.drawImage(kitImage("ambient-death-skull"), frame * 24, 0, 24, 24, 0, 0, 24, 24); ctx.drawImage(c.canvas, frame * 100, 420, 72, 72); }
    for (let frame = 0; frame < 5; frame++) {
      c.clearRect(0, 0, 24, 24); c.drawImage(kitImage("potion-red"), 0, 0); c.drawImage(kitImage("ambient-potion-bubbles"), frame * 24, 0, 24, 24, 0, 0, 24, 24); ctx.drawImage(c.canvas, 440 + frame * 100, 0, 72, 72);
      c.clearRect(0, 0, 24, 24); c.drawImage(kitImage("potion-blue"), 0, 0); c.drawImage(kitImage("ambient-potion-bubbles"), frame * 24, 0, 24, 24, 0, 0, 24, 24); ctx.drawImage(c.canvas, 440 + frame * 100, 100, 72, 72);
      c.clearRect(0, 0, 24, 24); c.drawImage(kitImage("key-yellow"), 0, 0); c.drawImage(kitImage("ambient-key-shine"), frame * 24, 0, 24, 24, 0, 0, 24, 24); ctx.drawImage(c.canvas, 440 + frame * 100, 200, 72, 72);
    }
    sheet.style.cssText = "position:fixed;top:0;left:0;z-index:99999"; document.body.append(sheet);
    return { hero, bubblesInside, glint, plain, reduced, movingSkulls, staticSkulls, stillSkulls };
  });
  for (const hero of native.hero) { assert.ok(hero.stable && hero.first, `${hero.facing}: original silhouette, helmet, feet and gear remain exact`); assert.ok(hero.variants >= 2, `${hero.facing}: visible idle change`); }
  assert.ok(native.bubblesInside); assert.notEqual(native.glint, native.plain); assert.equal(native.plain, native.reduced);
  assert.ok(new Set(native.movingSkulls).size > 1); assert.equal(new Set(native.staticSkulls).size, 1); assert.equal(new Set(native.stillSkulls).size, 1);
  await page.locator("#ambient-art").screenshot({ path: "test-results/sprite-animations/native-art.png" }); await page.locator("#ambient-art").evaluate(e => e.remove());
  const caches = await page.evaluate(async () => {
    const { WaterReflections } = await import("/src/render/decor/decor-reflections.ts");
    const c = document.createElement("canvas").getContext("2d"); c.canvas.width = c.canvas.height = 96;
    const pool = { water: new Uint8Array(576).fill(1), waterCount: 576, crates: [] };
    let hero = 0, contents = 0, frame = 0;
    const scene = { key: "ambient-cache", pools: [[0, -1, pool]], now: 1000, reduceMotion: true, waves: () => [], tileAt: () => ({ kind: "key" }),
      plan: (x, y) => x === 0 && y === -1 ? pool : null, isBroken: () => false, drawCrates() {},
      sprites: { style: "animated", tile: () => { contents++; }, contentFrame: () => frame, torches: [], hero: { x: 0, y: 0, frame: "down:0", paint: () => { hero++; } } } };
    const water = new WaterReflections(); water.draw(c, scene); const first = [hero, contents];
    scene.now++; water.draw(c, scene); const reused = [hero, contents];
    scene.sprites.hero.frame = "down:1"; scene.now++; water.draw(c, scene); const idleChanged = hero;
    frame = 1; scene.now++; water.draw(c, scene); return { first, reused, idleChanged, contentChanged: contents };
  });
  assert.deepEqual(caches.first, caches.reused); assert.equal(caches.idleChanged, 2); assert.ok(caches.contentChanged > caches.first[1]);
  for (const width of [390, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await page.evaluate(async width => {
      const { dungeonSpriteScene } = await import("/tests/render-scenes.ts"), { Renderer } = await import("/src/rendering.ts");
      const { loadSpriteFont } = await import("/src/sprites/font.ts"), { THEME_IDS } = await import("/src/theme-collection.ts");
      await loadSpriteFont(); const { g } = dungeonSpriteScene("tower", { spriteAnimations: false, reduceMotion: false }); g.save.themes = [...THEME_IDS];
      g.effect = { text: "", x: 0, y: 0, until: 0 }; g.blocked = { x: 0, y: 0, until: 0 };
      const canvas = document.createElement("canvas"); canvas.id = "ambient-board"; const size = width < 500 ? 360 : 510;
      canvas.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:99999`; document.body.append(canvas);
      const requested = [], RealImage = window.Image; window.Image = function(...args) { const im = new RealImage(...args); requested.push(im); return im; }; window.Image.prototype = RealImage.prototype;
      const renderer = new Renderer(canvas, g), begin = renderer.beginFrame.bind(renderer); let f;
      renderer.beginFrame = now => { f = begin(now); return f; }; let now = 1000;
      const draw = (step = 100) => renderer.draw(now += step);
      for (let pass = 0; pass < 16; pass++) { const count = requested.length; for (let i = 0; i < 20; i++) draw();
        await Promise.all(requested.map(im => im.complete ? null : new Promise(resolve => { im.addEventListener("load", resolve, { once: true }); im.addEventListener("error", resolve, { once: true }); })));
        if (count === requested.length && requested.every(im => im.complete)) break;
      }
      const before = JSON.stringify(g.save); g.save.settings.spriteAnimations = true; draw(); const started = f.heroIdleFrame;
      draw(1020); const idle = f.heroIdleFrame;
      g.route = [{ x: g.run.player.x, y: g.run.player.y + 1 }]; draw(); const route = f.heroIdleFrame; g.route = [];
      const gates = [];
      for (const [key, value] of [["spriteAnimations", false], ["reduceMotion", true], ["uiSprites", false], ["spritesOff", true], ["gameTheme", "neon"]]) {
        const old = g.save.settings[key]; g.save.settings[key] = value; draw(); draw(1100); gates.push(f.heroIdleFrame === 0); g.save.settings[key] = old;
      }
      g.save.settings.uiTheme = "neon"; draw(); draw(1020); const uiThemeIdle = f.heroIdleFrame;
      g.save.settings.uiTheme = "medieval"; g.save.settings.reduceMotion = true; draw(); const staticFrame = canvas.toDataURL();
      g.save.settings.spriteAnimations = false; draw(); const animationsOff = canvas.toDataURL();
      g.save.settings.spriteAnimations = true; draw(); const restored = canvas.toDataURL();
      g.save.settings.spriteAnimations = false; g.save.settings.reduceMotion = false;
      const unchanged = before === JSON.stringify(g.save);
      g.save.settings.spriteAnimations = true; draw(); draw(1020);
      window.Image = RealImage; return { started, idle, route, gates, uiThemeIdle, staticFrame, animationsOff, restored, unchanged };
    }, width);
    assert.equal(result.started, 0); assert.ok(result.idle > 0); assert.equal(result.route, 0); assert.ok(result.gates.every(Boolean)); assert.ok(result.uiThemeIdle > 0);
    assert.ok(result.staticFrame === result.restored, "toggling Animations restores exact reduced-motion pixels"); assert.ok(result.unchanged, "drawing does not alter the save");
    await page.locator("#ambient-board").screenshot({ path: `test-results/sprite-animations/tower-${width}.png` }); await page.locator("#ambient-board").evaluate(e => e.remove());
  }
  const death = await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts"), { Game } = await import("/src/state.ts"), { Renderer } = await import("/src/rendering.ts");
    const g = new Game(defaults()); Object.assign(g.save.settings, { uiSprites: true, spriteAnimations: true, reduceMotion: true });
    g.newRun({ seed: 7 }); const p = g.run.player; p.hp = 1; p.attack = 1; p.defense = 0;
    g.run.changes[`${p.x + 1},${p.y}`] = { kind: "enemy", enemy: { name: "Slime", tier: 0, strength: "normal", hp: 100, attack: 100, defense: 0 } };
    g.move(1, 0, true); const at = g.fights.struckDown.at(-1);
    const canvas = document.createElement("canvas"); canvas.id = "death-board"; canvas.style.cssText = "position:fixed;top:0;left:0;width:510px;height:510px;z-index:99999"; document.body.append(canvas);
    const renderer = new Renderer(canvas, g), images = [], drawImage = renderer.ctx.drawImage.bind(renderer.ctx);
    renderer.ctx.drawImage = (image, ...args) => { if (image.src?.includes("ambient-death-skull")) images.push(args[0]); drawImage(image, ...args); };
    renderer.draw(at + 280); const still = images.at(-1);
    g.save.settings.reduceMotion = false; renderer.draw(at + 280); const animated = images.at(-1);
    g.save.settings.spriteAnimations = false; renderer.draw(at + 280); const off = images.at(-1);
    return { fallen: g.fallen, events: g.fights.struckDown.length, still, animated, off };
  });
  assert.ok(death.fallen && death.events); assert.equal(death.still, 0); assert.equal(death.animated, 48); assert.equal(death.off, 0);
  await page.locator("#death-board").screenshot({ path: "test-results/sprite-animations/death.png" });
  const failed = await browser.newPage(); await fixClock(failed); await failed.route("**/assets/style/ambient-*.png", route => route.abort()); await failed.goto(server.resolvedUrls.local[0]);
  const fallback = await failed.evaluate(async () => {
    const { kitImage } = await import("/src/sprites/kit.ts"), { paintHero, paintContents } = await import("/src/tile-painters.ts"), { drawStruckDown } = await import("/src/struck-down.ts");
    await new Promise(resolve => { const check = () => ["hero-down", "potion-red"].map(kitImage).every(Boolean) ? resolve() : requestAnimationFrame(check); check(); });
    const c = document.createElement("canvas").getContext("2d"); c.canvas.width = c.canvas.height = 24;
    const hero = frame => { c.clearRect(0, 0, 24, 24); paintHero(c, false, true, { dx: 0, dy: -1 }, frame); return c.canvas.toDataURL(); };
    const before = hero(0); hero(2);
    const f = { c, n: 1, s: 24, left: 0, bottom: 0, playerX: 0, playerY: -1, look: { styledSprites: true, spritesOff: false, reduceMotion: true, spriteAnimations: true } };
    drawStruckDown(f, 280); await new Promise(resolve => setTimeout(resolve, 100)); c.clearRect(0, 0, 24, 24); drawStruckDown(f, 280);
    const skull = [...c.getImageData(0, 0, 24, 24).data].some(Boolean);
    return { hero: before === hero(2), skull };
  });
  assert.ok(fallback.hero && fallback.skull); await failed.close(); assert.deepEqual(errors, []);
  console.log("Native animation frames, fixed hero alpha/gear, clipped bubbles, rare key glints, reduced motion, reflection frame caches, live settings/theme/route gates and real lethal-fight skull frames pass.");
} finally { await browser.close(); await server.close(); }
