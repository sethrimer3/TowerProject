import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 5197 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath, channel: executablePath ? undefined : "msedge" });
mkdirSync("test-results/pixel-outlines", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" });
  await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
  const checks = await page.evaluate(async () => {
    const { paintContents, paintHero } = await import("/src/render/tile-painters.ts");
    const { kitImage, drawKit } = await import("/src/sprites/kit.ts");
    const { OUTLINE_PALETTES } = await import("/src/sprites/pixel-outline.ts");
    const { EntityLighting } = await import("/src/render/entity-lighting.ts");
    const samples = [
      ["key-yellow", { kind: "key", color: "yellow" }, "gold"],
      ["potion-red", { kind: "potion" }, "gold"], ["potion-blue", { kind: "potion", color: "red" }, "gold"],
      ["sword", { kind: "attack" }, "gold"], ["shield", { kind: "defense" }, "gold"],
      ["chest-wood", { kind: "treasure" }, "gold"], ["chest-gold", { kind: "reward", tier: "gold" }, "gold"],
      ["stairs", { kind: "stairs" }, "blue"], ["door-wood", { kind: "door", door: { type: "wood" } }, "black"],
      ["square-door-wood", { kind: "door", door: { type: "wood" } }, "black", true],
      ...["down", "up", "left", "right"].map(direction => [`hero-${direction}`, direction, "blue"]),
      ["ambient-hero-down", "idle", "blue"],
    ];
    const art = { x: 0, y: 0, time: 0, reduceMotion: true, styledSprites: true };
    const facing = direction => ({ dx: direction === "left" ? -1 : direction === "right" ? 1 : 0, dy: direction === "up" ? 1 : -1 });
    const draw = (ctx, [, tile,, square]) => typeof tile === "string" ? paintHero(ctx, facing(tile), tile === "idle" ? 2 : 0) : paintContents(ctx, tile, { ...art, squareDoors: square });
    const sheet = document.createElement("canvas"); sheet.id = "outline-art"; sheet.width = 600; sheet.height = 360;
    sheet.style.cssText = "position:fixed;left:0;top:0;z-index:999999;width:600px;height:360px"; document.body.append(sheet);
    const sc = sheet.getContext("2d"); sc.fillStyle = "#25303a"; sc.fillRect(0, 0, 600, 360); sc.imageSmoothingEnabled = false;
    const results = [];
    for (const [index, sample] of samples.entries()) {
      const [id,,,square] = sample, canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
      const c = canvas.getContext("2d"); c.translate(4, 4); draw(c, sample);
      const actual = c.getImageData(0, 0, 32, 32).data;
      c.clearRect(-4, -4, 32, 32);
      const source = kitImage(id);
      if (id.startsWith("ambient-")) c.drawImage(source, 48, 0, 24, 24, 0, 0, 24, 24);
      else c.drawImage(source, 0, 0, 24, 24);
      const expected = c.getImageData(0, 0, 32, 32).data;
      let changedBody = 0, contour = 0, wrongColors = 0, softPixels = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if (expected[i + 3] && [0,1,2,3].some(channel => actual[i + channel] !== expected[i + channel])) changedBody++;
        if (!expected[i + 3] && actual[i + 3]) {
          contour++;
          if (actual[i + 3] !== 255) softPixels++;
          if (!OUTLINE_PALETTES[sample[2]].some(color => color.every((value, channel) => value === actual[i + channel]))) wrongColors++;
        }
      }
      c.clearRect(-4, -4, 32, 32); draw(c, sample);
      const x = index % 5 * 120, y = Math.floor(index / 5) * 120;
      sc.drawImage(canvas, x + 28, y + 12, 64, 64); sc.fillStyle = "#ede1bb"; sc.font = "11px sans-serif"; sc.fillText(id.replace("square-", ""), x + 5, y + 99);
      results.push({ id, changedBody, contour, wrongColors, softPixels });
    }
    const target = document.createElement("canvas").getContext("2d");
    let reads = 0; const originalRead = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) { reads++; return originalRead.apply(this, args); };
    for (let i = 0; i < 100; i++) for (const sample of samples) draw(target, sample);
    CanvasRenderingContext2D.prototype.getImageData = originalRead;
    // Decorative contours never enlarge torch-lighting silhouettes, and
    // direct icon drawing stays exactly the original unoutlined PNG.
    target.canvas.width = target.canvas.height = 24;
    const lighting = new EntityLighting();
    const frame = { look: art, world: { tile: () => ({ kind: "floor" }) }, left: 0, bottom: 0, n: 3, now: 0, playerX: 1, playerY: 1, heroFacing: facing("down") };
    lighting.casters(frame).find(caster => caster.hero).draw(target);
    const physical = originalRead.call(target, 0, 0, 24, 24).data.slice();
    target.clearRect(0, 0, 24, 24); drawKit(target, "hero-down");
    const native = originalRead.call(target, 0, 0, 24, 24).data;
    return { results, reads, physicalBodyPreserved: physical.every((value, i) => value === native[i]) };
  });
  for (const result of checks.results) {
    assert.equal(result.changedBody, 0, result.id); assert.ok(result.contour > 10, result.id);
    assert.equal(result.wrongColors, 0, result.id); assert.equal(result.softPixels, 0, result.id);
  }
  assert.equal(checks.reads, 0, "1,500 warmed sprite draws require no pixel readbacks");
  assert.ok(checks.physicalBodyPreserved);
  await page.locator("#outline-art").screenshot({ path: "test-results/pixel-outlines/native-contours.png" });
  await page.locator("#outline-art").evaluate(element => element.remove());
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async width => {
      const { combatSpriteScene } = await import("/tests/render-scenes.ts");
      const { Renderer } = await import("/src/render/rendering.ts");
      const { TrialRenderer } = await import("/src/proving-grounds/render.ts");
      const { startTrial } = await import("/src/proving-grounds/trial.ts");
      const { g } = combatSpriteScene(); g.save.settings.reduceMotion = true;
      const canvas = document.createElement("canvas"); canvas.id = "outline-board";
      const size = width < 500 ? 360 : 560;
      canvas.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:999999`; document.body.append(canvas);
      const renderer = new Renderer(canvas, g);
      for (let now = 1000; now <= 1600; now += 50) renderer.draw(now);
      window.outlineTrial = () => {
        const trial = startTrial({ maxHp: 1000, attack: 5, defense: 5 });
        new TrialRenderer(canvas).draw(trial, 1000, -Infinity, true);
      };
    }, width);
    await page.locator("#outline-board").screenshot({ path: `test-results/pixel-outlines/dungeon-${width}.png` });
    await page.evaluate(() => window.outlineTrial());
    await page.locator("#outline-board").screenshot({ path: `test-results/pixel-outlines/trial-${width}.png` });
    await page.locator("#outline-board").evaluate(element => element.remove());
  }
  assert.deepEqual(errors, []);
  console.log("Pixel contours: original texels, exact gold/blue/black palettes, all hero facings/idle, both door styles, cached readbacks, physical masks and phone/desktop dungeon/trial previews passed.");
} finally { await browser.close(); await server.close(); }
