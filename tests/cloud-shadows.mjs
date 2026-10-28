import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 5198 }, logLevel: "error" });
await server.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || ["/usr/bin/chromium"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath, channel: executablePath ? undefined : "msedge" });
mkdirSync("test-results/cloud-shadows", { recursive: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0], { waitUntil: "domcontentloaded" });
  await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
  for (const width of [390, 1024]) for (const mode of ["tower", "delve"]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.evaluate(async ({ width, mode }) => {
      const { forestSpriteScene } = await import("/tests/render-scenes.ts");
      const { Renderer } = await import("/src/render/rendering.ts");
      const { CloudShadows } = await import("/src/render/cloud-shadows.ts");
      const { kitImage } = await import("/src/sprites/kit.ts");
      const { MODES } = await import("/src/modes.ts");
      const { outsideWeather } = await import("/src/outside.ts");
      const { GOD_RAY_STYLE } = await import("/src/render/cloud-shadows.ts");
      const { g } = forestSpriteScene(mode);
      const weather = outsideWeather(g.run.seed);
      g.save.settings.reduceMotion = true;
      const board = document.createElement("canvas"); board.id = "cloud-review";
      const size = width < 500 ? 360 : 560;
      board.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:999999`;
      document.body.append(board);
      const renderer = new Renderer(board, g);
      const context = board.getContext("2d"), realDraw = context.drawImage.bind(context);
      let landmarkCenter = null;
      context.drawImage = (...args) => {
        const [image, x, y, w, h] = args;
        if (image.src?.endsWith(mode === "tower" ? "forest-tower-base.png" : "forest-mountain-base.png")) {
          const transform = context.getTransform();
          landmarkCenter = transform.a * (x + w / 2) + transform.c * y + transform.e;
        }
        return realDraw(...args);
      };
      for (let now = 1000; now <= 1600; now += 50) renderer.draw(now);
      const clouds = renderer.cloudShadows;
      const draw = (seconds, now = 1800) => { renderer.weather.elapsed = seconds; renderer.draw(now); };
      const shot = () => board.getContext("2d").getImageData(0, 0, board.width, board.height).data.slice();
      const diff = (a, b) => { let count = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) count++; return count; };
      draw(0); const first = shot();
      draw(42); const second = shot();
      draw(84); const third = shot();
      const rayImage = clouds.rayImage, savedRays = rayImage.data.slice();
      let rayAlphaPeak = 0;
      for (let i = 3; i < savedRays.length; i += 4) rayAlphaPeak = Math.max(rayAlphaPeak, savedRays[i]);
      rayImage.data.fill(0); clouds.rayCanvas.getContext("2d").putImageData(rayImage, 0, 0);
      draw(84); const noRays = shot();
      rayImage.data.set(savedRays); clouds.rayCanvas.getContext("2d").putImageData(rayImage, 0, 0);
      draw(84);
      let darkenedByRays = 0, rayPeak = 0;
      for (let i = 0; i < third.length; i += 4) {
        if (third[i] < noRays[i] || third[i + 1] < noRays[i + 1] || third[i + 2] < noRays[i + 2]) darkenedByRays++;
        rayPeak = Math.max(rayPeak, third[i] - noRays[i], third[i + 1] - noRays[i + 1], third[i + 2] - noRays[i + 2]);
      }
      const heightMap = clouds.heights, sharedField = clouds.field, alphaReads = clouds.silhouettes.size;
      const tallCells = heightMap.pixels.filter(h => h > 50).length;
      const at = heightMap.at;
      heightMap.at = () => 0;
      clouds.frameKey = ""; draw(84); const flat = shot();
      heightMap.at = at; clouds.frameKey = ""; draw(84);
      const recovered = shot();
      // Freeze weather and ambient animation together: neither wall-clock
      // time nor later render frames should move the cloud shadows.
      renderer.draw(2100); const frozen = shot();
      let readbacks = 0, updates = 0;
      const scratch = clouds.scratch.getContext("2d"), overlay = clouds.canvas.getContext("2d");
      const read = scratch.getImageData.bind(scratch), put = overlay.putImageData.bind(overlay);
      scratch.getImageData = (...args) => { readbacks++; return read(...args); };
      overlay.putImageData = (...args) => { updates++; return put(...args); };
      draw(84.01); const cachedUpdates = updates;
      const timings = [];
      const cloudTimings = [], cloudDraw = clouds.draw;
      clouds.draw = function(...args) {
        const start = performance.now();
        const result = cloudDraw.apply(this, args);
        cloudTimings.push(performance.now() - start);
        return result;
      };
      for (let i = 1; i <= 30; i++) {
        const start = performance.now();
        draw(84 + i / 15);
        timings.push(performance.now() - start);
      }
      clouds.draw = cloudDraw;
      scratch.getImageData = read; overlay.putImageData = put;
      const reused = heightMap === clouds.heights;
      const remembered = clouds.heights;
      g.save.settings.decorOff = true; draw(84);
      const decorRefresh = remembered !== clouds.heights;
      g.save.settings.decorOff = false; draw(84);
      // Sideways camera movement must keep the field tied to world space.
      const f = { c: board.getContext("2d"), width: size, left: 0, bottom: 0, n: 20, playerX: 8, playerY: 7, heroFacing: { dx: 0, dy: -1 }, look: { styledSprites: true } };
      clouds.draw(f, g.world, true, true, 84, false);
      const unchangedHeights = clouds.heights;
      clouds.draw({ ...f, left: 2.5, bottom: 1.25 }, g.world, true, true, 84, false);
      const cameraReuses = clouds.heights === unchangedHeights;
      draw(84);
      const image = board.toDataURL();
      const expectedLandmarkCenter = (MODES[mode].entranceX + .5 - renderer.left) * renderer.size * devicePixelRatio;
      context.drawImage = realDraw;
      let indoorCalls = 0;
      const original = CloudShadows.prototype.draw;
      CloudShadows.prototype.draw = function(...args) { indoorCalls++; return original.apply(this, args); };
      g.newRun({ outside: false, seed: 7 }); renderer.draw(2400);
      CloudShadows.prototype.draw = original;
      // Keep the outside frame on screen for a real phone/desktop capture.
      const img = new Image(); img.src = image; await img.decode();
      board.getContext("2d").setTransform(1, 0, 0, 1, 0, 0);
      board.getContext("2d").drawImage(img, 0, 0);
      return {
        motion: [diff(first, second), diff(second, third)], relief: diff(third, flat), restoration: diff(third, recovered), freeze: diff(recovered, frozen),
        rays: diff(third, noRays), rayPeak, rayAlphaPeak, rayOpacityCap: Math.round(GOD_RAY_STYLE.opacity[weather] * 255), weather, darkenedByRays, rayResolution: [clouds.rayCanvas.width, clouds.rayCanvas.height],
        tallCells, alphaReads, readbacks, updates, cachedUpdates, reused, decorRefresh, cameraReuses, fieldReused: sharedField === clouds.field, indoorCalls,
        resolution: [clouds.canvas.width, clouds.canvas.height], averageFrameMs: timings.reduce((a, b) => a + b) / timings.length,
        averageCloudMs: cloudTimings.reduce((a, b) => a + b) / cloudTimings.length, landmarkCenter, expectedLandmarkCenter,
        assetsReady: !!kitImage("forest-tower-base"),
      };
    }, { width, mode });
    assert.ok(result.assetsReady);
    assert.ok(Math.abs(result.landmarkCenter - result.expectedLandmarkCenter) < .01, "the entrance artwork and shadow heights align with the real stairs column");
    assert.ok(result.motion.every(pixels => pixels > 5000), "clouds visibly cross the real forest");
    assert.ok(result.rays > 5000, "shafts of sunlight are visible between the clouds");
    assert.ok(result.rayPeak >= (result.weather === "storm" ? 1 : result.weather === "rain" ? 2 : 4), `the rays have a faint ${result.weather} lighting contrast (${result.rayPeak})`);
    assert.ok(result.rayAlphaPeak <= result.rayOpacityCap, "soft layers cannot accumulate beyond the low opacity cap");
    assert.equal(result.darkenedByRays, 0, "sunlight brightens the scene instead of adding another dark overlay");
    assert.deepEqual(result.rayResolution, [96, 96]);
    assert.ok(result.relief > 100, "tree and building surfaces differ from flat ground projection");
    assert.equal(result.restoration, 0); assert.equal(result.freeze, 0);
    assert.ok(result.tallCells > 50);
    assert.equal(result.readbacks, 0, "steady frames never read sprite or screen pixels");
    assert.equal(result.cachedUpdates, 0, "the same 15Hz cloud frame is reused");
    assert.ok(result.updates >= 25 && result.updates <= 30);
    assert.ok(result.reused && result.decorRefresh && result.cameraReuses);
    assert.ok(result.fieldReused, "feathered/blurred textures survive ordinary frames, camera movement and decoration changes");
    assert.equal(result.indoorCalls, 0);
    assert.deepEqual(result.resolution, [96, 96]);
    await page.locator("#cloud-review").screenshot({ path: `test-results/cloud-shadows/${mode}-${width}.png` });
    await page.locator("#cloud-review").evaluate(e => e.remove());
    console.log(`${mode} ${width}px: ${result.relief} height-sensitive pixels, zero steady readbacks; average cloud ${result.averageCloudMs.toFixed(2)}ms, whole-board ${result.averageFrameMs.toFixed(2)}ms`);
  }
  assert.deepEqual(errors, []);
  console.log("Cloud motion, height projection, frozen time, cache reuse, bounded resolution and indoor exclusion passed.");
} finally {
  await browser.close(); await server.close();
}
