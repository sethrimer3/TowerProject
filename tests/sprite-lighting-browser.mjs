// Compare actual baked lighting masks with the displayed PNG alpha, not a mock.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5194 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
try {
  const page = await browser.newPage();
  await fixClock(page);
  await page.addInitScript(() => { globalThis.__handHeld = true; globalThis.__handStartsPaused = true; });
  let release; const requested = new Promise(resolve => { release = resolve; });
  await page.route("**/assets/style/hero-up.png", route => release(route));
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  await page.evaluate(async () => {
    const { EntityLighting } = await import("/src/entity-lighting.ts");
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 72;
    const f = {
      c: canvas.getContext("2d"), s: 24, width: 72, n: 3, left: 0, bottom: 0, now: 1000, darkness: 0.5,
      playerX: 1, playerY: 1, heroFacing: { dx: 0, dy: 1 },
      look: { spritesOff: false, styledSprites: true, reduceMotion: true, area1: false },
      world: { tile: () => ({ kind: "floor" }) },
      torches: [{ x: 0, y: 1, active: true, lightRadius: 8, baseIntensity: 1,
        visibilityPolygon: [{ x: -5, y: -5 }, { x: 8, y: -5 }, { x: 8, y: 8 }, { x: -5, y: 8 }] }],
    };
    const lighting = new EntityLighting(); lighting.drawShadows(f, () => null);
    const alpha = canvas => [...canvas.getContext("2d").getImageData(0, 0, 24, 24).data].filter((_, i) => i % 4 === 3);
    // Inspect the baked artifact after invoking the public drawing pass.
    const mask = () => [...lighting.silhouettes.values()].at(-1).canvas;
    window.__lightReview = { lighting, f, alpha, mask, before: alpha(mask()) };
  });
  const route = await requested;
  await route.fulfill({ path: resolve("public/assets/style/hero-up.png"), contentType: "image/png" });
  await page.waitForFunction(async () => { const { kitImage } = await import("/src/sprites/kit.ts"); return !!kitImage("hero-up"); });
  const result = await page.evaluate(async () => {
    const { kitImage } = await import("/src/sprites/kit.ts");
    const { lighting, f, alpha, mask, before } = window.__lightReview;
    const pngAlpha = id => {
      const c = document.createElement("canvas"); c.width = c.height = 24;
      c.getContext("2d").drawImage(kitImage(id), 0, 0); return alpha(c);
    };
    f.now = 1001; lighting.drawShadows(f, () => null);
    const up = alpha(mask()), expectedUp = pngAlpha("hero-up");
    const glaze = document.createElement("canvas"); glaze.width = glaze.height = 24;
    lighting.drawSpriteLighting(f, glaze.getContext("2d"), true);
    const glazeAlpha = alpha(glaze), outside = glazeAlpha.filter((a, i) => a && !expectedUp[i]).length;
    const leftImage = kitImage("hero-left");
    if (!leftImage) await new Promise(resolve => {
      const check = () => kitImage("hero-left") ? resolve() : requestAnimationFrame(check); check();
    });
    f.heroFacing = { dx: -1, dy: 0 }; f.now = 1002; lighting.drawShadows(f, () => null);
    const left = alpha(mask()), expectedLeft = pngAlpha("hero-left");
    f.look.styledSprites = false; f.now = 1003; lighting.drawShadows(f, () => null); const off = alpha(mask());
    f.look.styledSprites = true; f.now = 1004; lighting.drawShadows(f, () => null); const restored = alpha(mask());
    return { before, up, expectedUp, outside, left, expectedLeft, off, restored, hasShadow: !!lighting.shadows };
  });
  assert.ok(result.hasShadow);
  assert.notDeepEqual(result.before, result.up, "a late PNG replaces the fallback mask immediately");
  assert.deepEqual(result.up, result.expectedUp, "hero shadow follows the active PNG alpha");
  assert.equal(result.outside, 0, "torch highlights stay inside the active silhouette");
  assert.deepEqual(result.left, result.expectedLeft, "turning updates the silhouette without waiting for cache expiry");
  assert.notDeepEqual(result.off, result.left); assert.deepEqual(result.restored, result.left, "toggling restores the exact PNG mask");
  console.log("PNG lighting masks match hero alpha; late loads, facing, highlights and toggles pass.");
} finally { await browser.close(); await server.close(); }
