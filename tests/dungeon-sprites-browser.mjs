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
    const { dungeonFloorSprite, towerFloorFrame, DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS } = await import("/src/sprite-dungeon.ts");
    const { kitImage } = await import("/src/sprite-kit.ts");
    DUNGEON_ATLASES.forEach(kitImage); kitImage(DUNGEON_EDGE_ATLAS);
    const image = dungeonFloorSprite("tower", 0, 8, 5, 3);
    const pixels = [...image.getContext("2d").getImageData(0, 0, 24, 24).data];
    const cv = document.createElement("canvas"); cv.width = cv.height = 24;
    const frame = towerFloorFrame(8, 5, 3);
    const c = cv.getContext("2d"); c.drawImage(kitImage("dungeon-floor-masonry-0"), frame % 4 * 24, Math.floor(frame / 4) * 24, 24, 24, 0, 0, 24, 24);
    return { pixels, source: [...c.getImageData(0, 0, 24, 24).data] };
  });
  assert.deepEqual(loaded.pixels, native.source, "floor painter uses literal PNG texels");
  assert.deepEqual(native.pixels, native.source, "torch relief reads the selected new floor, not an older texture");
  await page.waitForFunction(async () => {
    const { DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS, towerFloorAtlasId } = await import("/src/sprite-dungeon.ts"), { kitImage } = await import("/src/sprite-kit.ts");
    return [...DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS, ...Array.from({ length: 10 }, (_, tone) => towerFloorAtlasId(tone))].map(kitImage).every(Boolean);
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
  const corners = await page.evaluate(async () => {
    const { DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS, DUNGEON_CORNER_FRAME, DUNGEON_WALL_VARIANTS } = await import("/src/sprite-dungeon.ts"), { kitImage } = await import("/src/sprite-kit.ts");
    return [...DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS].map(id => {
      const image = kitImage(id), cv = document.createElement("canvas"); cv.width = image.naturalWidth; cv.height = image.naturalHeight;
      const c = cv.getContext("2d"); c.drawImage(image, 0, 0);
      const pixels = c.getImageData(0, 0, cv.width, cv.height).data;
      const first = id === DUNGEON_EDGE_ATLAS ? 32 : DUNGEON_CORNER_FRAME;
      const pieces = Array.from({ length: 4 }, (_, corner) => {
        const frame = first + corner, x0 = frame % 4 * 24, y0 = Math.floor(frame / 4) * 24;
        const left = corner === 1 || corner === 2 ? 18 : 0, top = corner >= 2 ? 18 : 0;
        let visible = 0, outside = 0;
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (pixels[((y0 + y) * cv.width + x0 + x) * 4 + 3]) {
          visible++; if (x < left || x >= left + 6 || y < top || y >= top + 6) outside++;
        }
        return { visible, outside };
      });
      let tops = 0, faces = 0;
      if (id !== DUNGEON_EDGE_ATLAS) {
        const topPixels = new Set(), facePixels = new Set();
        for (let variant = 0; variant < DUNGEON_WALL_VARIANTS; variant++) {
          // Mask 14 exposes a north rim; mask 11 exposes the south face.
          const top = 4 + variant * 16 + 14, face = 4 + variant * 16 + 11;
          topPixels.add([...c.getImageData(top % 4 * 24, Math.floor(top / 4) * 24, 24, 24).data].join(","));
          facePixels.add([...c.getImageData(face % 4 * 24, Math.floor(face / 4) * 24 + 16, 24, 8).data].join(","));
        }
        tops = topPixels.size; faces = facePixels.size;
      }
      return { id, pieces, tops, faces };
    });
  });
  for (const atlas of corners) {
    for (const piece of atlas.pieces) { assert.ok(piece.visible >= 5, atlas.id); assert.equal(piece.outside, 0, atlas.id); }
    if (atlas.id !== "dungeon-edges") {
      assert.equal(atlas.tops, 6, `${atlas.id}: six distinct wall tops`);
      assert.equal(atlas.faces, 6, `${atlas.id}: six distinct south-facing facades`);
    }
  }
  const materials = await page.evaluate(async () => {
    const { drawDungeonGround, drawDungeonFrame, dungeonMaterialJoins, dungeonMaterial, dungeonFloorFrame, dungeonWallVariant,
      DUNGEON_ATLASES, DUNGEON_CAP_FRAME, DUNGEON_SHADE_FRAME } = await import("/src/sprite-dungeon.ts");
    const { dungeonWallProfile, dungeonWallBands } = await import("/src/wall-depth.ts");
    const { paintTile } = await import("/src/tile-painters.ts");
    const { kitImage } = await import("/src/sprite-kit.ts");
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 24;
    const c = canvas.getContext("2d");
    const pixels = (id, frame) => { c.clearRect(0, 0, 24, 24); drawDungeonFrame(c, kitImage(id), frame); return [...c.getImageData(0, 0, 24, 24).data]; };
    const core = pixels("dungeon-infill", 12);
    const flat = data => data.every((value, i) => value === [12, 16, 22, 255][i % 4]);
    const shared = ["tower", "delve"].every(mode => Array.from({ length: 10 }, (_, tone) => {
      c.clearRect(0, 0, 24, 24); drawDungeonGround(c, { mode, height: tone * 10, seed: 1107, x: 8, y: 5, wall: true, empty: false }, [], { depth: 2, openings: 0 });
      return flat([...c.getImageData(0, 0, 24, 24).data]);
    }).every(Boolean));
    const blackAt = (data, x, y) => data.slice((y * 24 + x) * 4, (y * 24 + x) * 4 + 3).join(",") === "12,16,22";
    const bodies = DUNGEON_ATLASES.map(id => {
      const data = pixels(id, 18); let visible = 0;
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (!blackAt(data, x, y)) visible++;
      return visible;
    });
    const world = { tile: (_x, y) => ({ kind: y < 0 ? "floor" : "wall" }) };
    const shadeTile = { mode: "tower", height: 0, seed: 1107, x: 2, y: 1, wall: true, empty: false,
      neighbors: { northWall: true, eastWall: true, southWall: true, westWall: true } };
    const variant = dungeonWallVariant(shadeTile.x, shadeTile.y, shadeTile.seed);
    const sources = [DUNGEON_CAP_FRAME + variant, 4 + variant * 16 + 15, DUNGEON_SHADE_FRAME + variant]
      .map(frame => pixels("dungeon-masonry-0", frame)); sources.push(core);
    const profile = dungeonWallProfile(world, shadeTile.x, shadeTile.y);
    const bands = dungeonWallBands(profile, shadeTile.x, shadeTile.y, shadeTile.seed);
    c.clearRect(0, 0, 24, 24); drawDungeonGround(c, shadeTile, [], profile);
    const shadePixels = [...c.getImageData(0, 0, 24, 24).data];
    const literal = shadePixels.every((value, i) => {
      const pixel = Math.floor(i / 4), band = bands[Math.floor(pixel / 24 / 2) * 12 + Math.floor(pixel % 24 / 2)];
      return value === sources[band][i];
    });
    const nativeWall = document.createElement("canvas"); nativeWall.width = nativeWall.height = 24;
    nativeWall.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(shadePixels), 24, 24), 0, 0);
    const scaledSame = [.73, 1.37, 2.125].every(scale => {
      const actual = document.createElement("canvas"), expected = document.createElement("canvas");
      actual.width = actual.height = expected.width = expected.height = 64;
      const ac = actual.getContext("2d"), ec = expected.getContext("2d");
      for (const ctx of [ac, ec]) { ctx.translate(.35, .65); ctx.scale(scale, scale); ctx.imageSmoothingEnabled = false; }
      drawDungeonGround(ac, shadeTile, [], profile); ec.drawImage(nativeWall, 0, 0, 24, 24);
      const a = ac.getImageData(0, 0, 64, 64).data, e = ec.getImageData(0, 0, 64, 64).data;
      return a.every((value, i) => value === e[i]);
    });
    const connected = ["tower", "delve"].every(mode => {
      const cv = document.createElement("canvas"); cv.width = 192; cv.height = 72;
      const ctx = cv.getContext("2d"), look = { mode, height: 0, seed: 1107, outside: false, entranceX: 8,
        styledSprites: true, spritesOff: false, reduceMotion: true, area1: false, themed: null };
      for (let y = 0; y < 3; y++) for (let x = -4; x < 4; x++) {
        ctx.save(); ctx.translate((x + 4) * 24, (2 - y) * 24);
        paintTile(ctx, world, world.tile(x, y), x, y, 0, 0, look); ctx.restore();
      }
      const data = ctx.getImageData(0, 0, 192, 72).data;
      for (let x = 0; x < 192; x++) {
        let material = false;
        for (let y = 0; y < 63; y++) {
          const i = (y * 192 + x) * 4, black = data[i] === 12 && data[i + 1] === 16 && data[i + 2] === 22;
          if (black && material) return false; // A black cutout after the core ended.
          if (!black) material = true;
          if (data[i + 3] !== 255) return false;
        }
      }
      return true;
    });
    const clear = Array.from({ length: 4 }, (_, variant) => {
      const data = pixels("dungeon-blends", variant * 20 + 15);
      for (let y = 9; y < 15; y++) for (let x = 9; x < 15; x++) if (data[(y * 24 + x) * 4 + 3]) return false;
      return true;
    });
    let tile, joins;
    for (let y = 0; y < 40 && !tile; y++) for (let x = 0; x < 40 && !tile; x++) {
      const candidate = { mode: "delve", height: 0, seed: 1107, x, y, wall: false, empty: true };
      const j = dungeonMaterialJoins(candidate, []);
      if (dungeonMaterial("delve", x, y, 1107) === "stone" && j.sides) { tile = candidate; joins = j; }
    }
    const frame = dungeonFloorFrame(tile.x, tile.y, tile.seed);
    const stone = pixels("dungeon-stone-0", frame), earth = pixels("dungeon-earth", frame);
    const mask = pixels("dungeon-blends", dungeonWallVariant(tile.x, tile.y, tile.seed) % 4 * 20 + joins.sides);
    c.clearRect(0, 0, 24, 24); drawDungeonGround(c, tile);
    const blended = [...c.getImageData(0, 0, 24, 24).data]; let same = true, changed = 0;
    for (let i = 0; i < blended.length; i++) {
      if (blended[i] !== (mask[Math.floor(i / 4) * 4 + 3] ? earth : stone)[i]) same = false;
      if (blended[i] !== stone[i]) changed++;
    }
    return { black: flat(core), shared, bodies, literal, scaledSame, connected, clear, same, changed };
  });
  assert.ok(materials.black && materials.shared, "deep interiors share a flat near-black PNG across every material and biome");
  assert.ok(materials.bodies.every(visible => visible > 576 * .8), "exposed walls retain a broad shaded body behind the rim");
  assert.ok(materials.literal, "continuous shade bands sample literal native PNG texels without color interpolation or soft alpha");
  assert.ok(materials.scaledSame, "fractional scales and offsets draw one native wall image without antialiased band seams");
  assert.ok(materials.connected, "actual joined Tower and Delve walls have no repeated black holes or transparent tile seams");
  assert.ok(materials.clear.every(Boolean), "material blending leaves quiet floor centers");
  assert.ok(materials.same && materials.changed > 10, "actual floor blends use authored binary masks and literal neighboring material texels");
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
  await page.setViewportSize({ width: 1100, height: 2500 });
  await page.evaluate(async () => {
    const { DUNGEON_ATLASES } = await import("/src/sprite-dungeon.ts"), { kitImage } = await import("/src/sprite-kit.ts");
    const sheet = document.createElement("canvas"); sheet.id = "dungeon-art"; sheet.width = 1100; sheet.height = 2430;
    const c = sheet.getContext("2d"); c.imageSmoothingEnabled = false; c.fillStyle = "#10151c"; c.fillRect(0, 0, sheet.width, sheet.height);
    DUNGEON_ATLASES.forEach((id, i) => {
      const image = kitImage(id), x = i % 7 * 155 + 6, y = Math.floor(i / 7) * 810;
      c.drawImage(image, x, y + 6); c.drawImage(image, 0, 0, 96, 24, x, y + 735, 144, 36);
      c.fillStyle = "#eee0b7"; c.font = "11px sans-serif"; c.fillText(id.replace("dungeon-", ""), x, y + 790);
    });
    sheet.style.cssText = "position:fixed;left:0;top:0;width:1100px;height:2430px;z-index:100000"; document.body.append(sheet);
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
  console.log("Native PNG floors, material joins, continuous wall contours, seam and cutout regressions, black cores, relief, late/failed loads, phone/desktop scenes and theme/toggle restoration pass.");
} finally { await browser.close(); await server.close(); }
