// Real Canvas coverage of live geometry, prop silhouettes and warm cache reuse.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const server = await createServer({ server: { host: "127.0.0.1", port: 5196 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator("#hp").waitFor();
  await page.evaluate(async () => {
    const { defaults } = await import("/src/save/save.ts");
    const { Game } = await import("/src/state.ts");
    const { Renderer } = await import("/src/render/rendering.ts");
    const save = defaults();
    Object.assign(save.settings, { reduceMotion: true, brightness: 65 });
    const g = new Game(save);
    g.newRun({ seed: 7 });
    for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++)
      g.run.changes[`${x},${y}`] = { kind: x === 8 ? "wall" : "floor" };
    g.run.changes["8,4"] = { kind: "door", color: "yellow" };
    g.run.changes["6,5"] = { kind: "potion" };
    g.run.changes["10,4"] = { kind: "potion" };
    g.run.player.x = 6; g.run.player.y = 3;
    g.world.torches = [
      { x: 5, y: 4, active: true, baseIntensity: 0.7, lightRadius: 6.5 },
      { x: 12, y: 12, active: true, baseIntensity: 0.7, lightRadius: 6.5 },
    ];
    const cv = document.createElement("canvas");
    cv.id = "shadow-review";
    cv.style.cssText = "position:fixed;left:0;top:0;width:408px;height:408px;z-index:99999";
    document.body.append(cv);
    const r = new Renderer(cv, g);
    const draw = () => { for (let t = 1000; t <= 1500; t += 50) r.draw(t); };
    draw();
    window.shadowReview = { g, r, cv, draw };
  });
  // Allow every requested native sprite to finish, then draw with the same clock.
  await page.waitForFunction(async () => {
    const { kitImage } = await import("/src/sprites/kit.ts");
    return ["potion", "torch", "mushrooms", "crate", "barrel"].every(id => kitImage(id));
  });
  const closed = await page.evaluate(() => {
    const { r, draw } = window.shadowReview;
    draw();
    const terrain = r.light.terrain, bake = terrain.bake;
    const lit = r.light.entities.lit.map(p => `${p.x},${p.y}`);
    draw();
    return { lit, reused: terrain.bake === bake };
  });
  assert.ok(closed.lit.includes("6,5"));
  assert.ok(!closed.lit.includes("10,4"), "hidden potion must not cast or receive directional light");
  assert.equal(closed.reused, true, "stationary draws reuse the terrain image");
  mkdirSync("test-results/terrain-shadows", { recursive: true });
  await page.locator("#shadow-review").screenshot({ path: "test-results/terrain-shadows/closed.png" });
  const opened = await page.evaluate(() => {
    const { r, g, draw } = window.shadowReview, old = r.light.terrain.bake;
    g.run.changes["8,4"] = { kind: "floor" };
    draw();
    return { lit: r.light.entities.lit.map(p => `${p.x},${p.y}`), refreshed: r.light.terrain.bake !== old };
  });
  assert.ok(opened.lit.includes("10,4"), "opening the door reveals the potion to the torch");
  assert.equal(opened.refreshed, true);
  await page.locator("#shadow-review").screenshot({ path: "test-results/terrain-shadows/open.png" });
  const masks = await page.evaluate(async () => {
    const { torchShadowCaster, EntityLighting } = await import("/src/render/entity-lighting.ts");
    const { paintPlantBody } = await import("/src/render/decor/decor-bake.ts");
    const { drawCrates } = await import("/src/render/decor/decor-sprites.ts");
    const { g } = window.shadowReview;
    const lighting = new EntityLighting();
    const profiles = [torchShadowCaster(g.world.torches[0]),
      { key: "mushroom", draw: c => paintPlantBody(c, { kind: "mushrooms", i: 12, j: 18, variant: 0 }, {}, 0, 0, true) },
      ...["crate", "barrel"].map(kind => ({ key: kind, draw: c => drawCrates(c, 0, 0,
        [{ kind, x: 5, y: 5, w: 12, h: 14, lift: 0, tone: 0 }], false, true) })),
    ];
    return profiles.map(p => {
      const cv = lighting.silhouette(p.key, p.draw, 0);
      const rgba = cv.getContext("2d").getImageData(0, 0, 24, 24).data;
      const solid = [...rgba].filter((v, i) => i % 4 === 3 && v).length;
      const flame = [...rgba.slice(0, 11 * 24 * 4)].some((v, i) => i % 4 === 3 && v);
      return { key: p.key, solid, flame };
    });
  });
  assert.ok(masks.every(p => p.solid > 0 && p.solid < 24 * 24), "every prop has a nonrectangular physical silhouette");
  assert.equal(masks[0].flame, false, "the torch silhouette excludes the flame");
  assert.deepEqual(errors, []);
  console.log("Terrain shadows: live doors, hidden items, prop silhouettes and warm caches passed.");
} finally {
  await browser.close();
  await server.close();
}
