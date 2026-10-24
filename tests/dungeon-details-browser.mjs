import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5199 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/dungeon-sprites", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  await fixClock(page);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route("**/dungeon-details-masonry-0.png", route => release(route));
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  await page.evaluate(async () => {
    const { dungeonDetail } = await import("/src/render/dungeon-details.ts");
    const { paintTile } = await import("/src/render/tile-painters.ts");
    const { dungeonWallProfile, dungeonWallBands } = await import("/src/render/wall-depth.ts");
    const world = { tile: (_x, y) => ({ kind: y <= 0 ? "wall" : "floor" }) }, seed = 1107;
    let left = -100; while (dungeonDetail(world, left, 0, seed, () => "masonry")?.half !== 0) left++;
    const canvas = document.createElement("canvas"); canvas.width = 48; canvas.height = 24;
    const c = canvas.getContext("2d"), look = { mode: "tower", height: 0, seed, outside: false, entranceX: 8,
      styledSprites: true, reduceMotion: true, themed: null };
    const paint = () => {
      c.clearRect(0, 0, 48, 24);
      for (let half = 0; half < 2; half++) { c.save(); c.translate(half * 24, 0); paintTile(c, world, world.tile(left + half, 0), left + half, 0, 0, 0, look); c.restore(); }
      return [...c.getImageData(0, 0, 48, 24).data];
    };
    globalThis.detailReview = { world, left, look, paint, canvas, dungeonWallProfile, dungeonWallBands };
    paint();
  });
  const route = await pending;
  await page.waitForFunction(async () => {
    const { kitImage } = await import("/src/sprites/kit.ts");
    return ["dungeon-masonry-0", "dungeon-edges", "dungeon-infill", "dungeon-blends"].every(id => kitImage(id));
  });
  const before = await page.evaluate(() => detailReview.paint());
  await route.fulfill({ path: resolve("public/assets/style/dungeon-details-masonry-0.png"), contentType: "image/png" });
  await page.unroute("**/dungeon-details-masonry-0.png");
  await page.waitForFunction(async () => !!(await import("/src/sprites/kit.ts")).kitImage("dungeon-details-masonry-0"));
  const result = await page.evaluate(async before => {
    const { world, left, look, paint, dungeonWallProfile, dungeonWallBands } = detailReview;
    const { kitImage } = await import("/src/sprites/kit.ts"), { dungeonDetail } = await import("/src/render/dungeon-details.ts");
    const cv = document.createElement("canvas"); cv.width = kitImage("dungeon-details-masonry-0").naturalWidth; cv.height = 48;
    const ctx = cv.getContext("2d"); ctx.drawImage(kitImage("dungeon-details-masonry-0"), 0, 0);
    const source = ctx.getImageData(0, 0, cv.width, 48).data, after = paint();
    let exact = true, changed = 0;
    for (let half = 0; half < 2; half++) {
      const bands = dungeonWallBands(dungeonWallProfile(world, left + half, 0), left + half, 0, look.seed);
      const d = dungeonDetail(world, left + half, 0, look.seed, () => "masonry");
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const at = (y * 48 + half * 24 + x) * 4, band = bands[Math.floor(y / 2) * 12 + Math.floor(x / 2)];
        const sample = ((band * 24 + y) * cv.width + d.variant * 48 + half * 24 + x) * 4;
        const overlay = y >= 3 && band < 2 && source[sample + 3];
        for (let channel = 0; channel < 4; channel++) {
          if (after[at + channel] !== (overlay ? source[sample + channel] : before[at + channel])) exact = false;
          if (after[at + channel] !== before[at + channel]) changed++;
        }
      }
    }
    return { exact, changed };
  }, before);
  assert.ok(result.exact && result.changed > 10, "both halves use one literal PNG motif, respect shade bands/coping and refresh a warm cache after a delayed load");
  await page.evaluate(async () => {
    const { DUNGEON_ATLASES } = await import("/src/sprites/dungeon.ts"), { kitImage } = await import("/src/sprites/kit.ts");
    for (const id of DUNGEON_ATLASES) { kitImage(id); kitImage(id.replace("dungeon-", "dungeon-details-")); }
  });
  await page.waitForFunction(async () => {
    const { DUNGEON_ATLASES } = await import("/src/sprites/dungeon.ts"), { kitImage } = await import("/src/sprites/kit.ts");
    return DUNGEON_ATLASES.every(id => kitImage(id) && kitImage(id.replace("dungeon-", "dungeon-details-")));
  });
  const atlas = await page.evaluate(async () => {
    const { DUNGEON_ATLASES } = await import("/src/sprites/dungeon.ts"), { kitImage } = await import("/src/sprites/kit.ts");
    return DUNGEON_ATLASES.flatMap(id => {
      const cv = document.createElement("canvas"); cv.width = kitImage(id.replace("dungeon-", "dungeon-details-")).naturalWidth; cv.height = 48;
      const c = cv.getContext("2d"); c.drawImage(kitImage(id.replace("dungeon-", "dungeon-details-")), 0, 0);
      const p = c.getImageData(0, 0, cv.width, 48).data;
      return Array.from({ length: cv.width / 48 }, (_, v) => {
        let visible = 0, gutter = 0, sameAlpha = true, crossing = false;
        for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) {
          const at = (y * cv.width + v * 48 + x) * 4;
          if (p[at + 3]) { visible++; if (x < 2 || x > 45 || y < 2 || y > 21) gutter++; if (x === 23 || x === 24) crossing = true; }
          if (p[at + 3] !== p[at + 24 * cv.width * 4 + 3]) sameAlpha = false;
        }
        return { id, visible, gutter, sameAlpha, crossing };
      });
    });
  });
  assert.ok(atlas.every(a => a.visible > 15 && a.visible < 576 && a.gutter === 0 && a.sameAlpha), "all detail ramps retain sparse native subjects, clear gutters and identical shade silhouettes");
  assert.ok(atlas.filter(a => a.crossing).length >= 60, "most authored features cross the internal tile boundary");
  await page.evaluate(async () => {
    const { kitImage } = await import("/src/sprites/kit.ts"), { paintTile } = await import("/src/render/tile-painters.ts");
    const cv = document.createElement("canvas"); cv.id = "context-review"; cv.width = 1100; cv.height = 910;
    const c = cv.getContext("2d"); c.imageSmoothingEnabled = false; c.fillStyle = "#10151c"; c.fillRect(0, 0, 1100, 910);
    ["masonry-0", "stone-0", "earth"].forEach((material, i) => {
      const im = kitImage(`dungeon-details-${material}`), y = i * 140;
      c.drawImage(im, 10, y + 24); c.drawImage(im, 380, y + 10, im.naturalWidth * 2, 96);
      c.fillStyle = "#eee0b7"; c.font = "12px sans-serif"; c.fillText(material, 10, y + 100);
    });
    for (const [i, mode] of ["tower", "delve"].entries()) {
      const world = { tile: (x, y) => ({ kind: x >= -8 && x <= 7 && y >= 3 && y <= 12 && !(x >= -1 && x <= 0 && y >= 6 && y <= 9) ? "floor" : "wall" }) };
      const look = { mode, height: 0, seed: 1107, outside: false, entranceX: 8, styledSprites: true, reduceMotion: true, themed: null };
      c.fillStyle = "#eee0b7"; c.fillText(`${mode}: contextual wall details, native tiles`, i * 550 + 10, 450);
      for (let y = 0; y < 17; y++) for (let x = -11; x < 11; x++) {
        c.save(); c.translate(i * 550 + 10 + (x + 11) * 24, 470 + (16 - y) * 24);
        paintTile(c, world, world.tile(x, y), x, y, 0, 0, look); c.restore();
      }
    }
    cv.style.cssText = "position:fixed;left:0;top:0;width:1100px;height:910px;z-index:100000"; document.body.append(cv);
  });
  await page.locator("#context-review").screenshot({ path: "test-results/dungeon-sprites/contextual-details.png" });
  const failed = await browser.newPage(); await fixClock(failed); let rejected = 0;
  failed.on("pageerror", e => errors.push(e.message));
  await failed.route("**/dungeon-details-masonry-0.png", route => { rejected++; return route.abort(); });
  await failed.goto(server.resolvedUrls.local[0]); await failed.locator("#hp").waitFor();
  const fallback = () => failed.evaluate(async () => {
    const { dungeonDetail } = await import("/src/render/dungeon-details.ts"), { dungeonWallProfile } = await import("/src/render/wall-depth.ts");
    const { paintTile } = await import("/src/render/tile-painters.ts"), { drawDungeonGround, dungeonDiagonals } = await import("/src/sprites/dungeon.ts");
    const world = { tile: (_x, y) => ({ kind: y <= 0 ? "wall" : "floor" }) }, seed = 1107;
    let x = -100; while (dungeonDetail(world, x, 0, seed, () => "masonry")?.half !== 0) x++;
    const cv = document.createElement("canvas"); cv.width = 48; cv.height = 24;
    const c = cv.getContext("2d"), look = { mode: "tower", height: 0, seed, outside: false, entranceX: 8, styledSprites: true, reduceMotion: true, themed: null };
    paintTile(c, world, world.tile(x, 0), x, 0, 0, 0, look);
    c.save(); c.translate(24, 0);
    const ready = drawDungeonGround(c, { mode: "tower", height: 0, seed, x, y: 0, wall: true, empty: false,
      neighbors: { northWall: false, eastWall: true, southWall: true, westWall: true } }, dungeonDiagonals(world, "tower", x, 0, seed), dungeonWallProfile(world, x, 0));
    c.restore();
    const p = c.getImageData(0, 0, 48, 24).data;
    return { ready, same: Array.from({ length: 24 * 24 * 4 }, (_, i) => {
      const y = Math.floor(i / 96), col = i % 96; return p[y * 192 + col] === p[y * 192 + 96 + col];
    }).every(Boolean) };
  });
  await fallback();
  await failed.waitForFunction(async () => {
    const { kitImage } = await import("/src/sprites/kit.ts");
    return ["dungeon-masonry-0", "dungeon-edges", "dungeon-infill", "dungeon-blends"].every(id => kitImage(id));
  });
  const restored = await fallback();
  assert.ok(rejected && restored.ready && restored.same, "a failed optional detail image preserves the exact existing native wall");
  assert.deepEqual(errors, []);
  console.log("Contextual detail PNG texels, shared two-tile motifs, sparse/guttered shade ramps, protected coping, late-load refresh and failed-image fallback pass.");
} finally { await browser.close(); await server.close(); }
