// Real production city painters at native and zoomed scales, plus toggling
// on/off on the same cached renderer. This suite starts its own dev server.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 5185 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  await fixClock(page);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.url().includes("/assets/") && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    const Real = window.Image; window.__cityImages = [];
    window.Image = function (...args) { const img = new Real(...args); window.__cityImages.push(img); return img; };
    window.Image.prototype = Real.prototype;
  });
  await page.route("**/__sprite-review.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto(new URL("/__sprite-review.html", server.resolvedUrls.local[0]).href);
  await page.evaluate(async () => {
    const { CITY_SPRITES, WORLD_SPRITES, CONTROL_SPRITES, DEFEND_STRUCTURE_SPRITES, kitImage } = await import("/src/sprite-kit.ts");
    const { defaultLayout, fitLayout, placeCityTile, placeStructure } = await import("/src/defend/layout.ts");
    const { generateCity } = await import("/src/defend/citygen.ts");
    const { DefendRenderer } = await import("/src/defend/render.ts");
    [...CITY_SPRITES, ...WORLD_SPRITES, ...CONTROL_SPRITES, ...DEFEND_STRUCTURE_SPRITES].forEach(kitImage);
    let layout = defaultLayout();
    const { tx, ty } = layout.keep;
    for (let radius = 1; radius <= 2; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++)
      layout = placeCityTile(layout, tx + dx, ty + dy) || layout;
    for (const [kind, dx, dy] of [["barracks", 1, 1], ["archerBarracks", -1, -1], ["archerTower", -1, 1], ["watchTower", 1, -1], ["cannonTower", 0, -2]]) {
      const next = placeStructure(layout, kind, tx + dx, ty + dy);
      if (!next) throw Error(`Could not place review structure ${kind}`);
      layout = next;
    }
    const map = generateCity(fitLayout(layout), 3);
    const cv = document.createElement("canvas"); cv.id = "city-review";
    document.body.replaceChildren(cv); document.body.style.cssText = "margin:0;background:#10151c";
    const renderer = new DefendRenderer(cv); renderer.resize(504);
    const options = { now: 1000, grid: false, weather: null, night: 0, reduceMotion: true };
    window.__cityReview = { renderer, map, options };
    renderer.draw(map, null, null, options);
  });
  await page.waitForFunction(() => window.__cityImages.every(img => img.complete && img.naturalWidth));
  const draw = (styledSprites, zoom = 1, damage = false) => page.evaluate(async ({ styledSprites, zoom, damage }) => {
    const { renderer, map, options } = window.__cityReview;
    renderer.cam.s = zoom;
    renderer.cam.x = -(zoom - 1) * renderer.canvas.width / 2;
    renderer.cam.y = -(zoom - 1) * renderer.canvas.height * 0.7;
    let sim = null;
    if (damage) {
      const { DefendSim } = await import("/src/defend/sim.ts");
      const { UPGRADES } = await import("/src/defend/catalog.ts");
      sim = new DefendSim(map, Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 7);
      const houses = map.buildings.filter(b => b.kind === "house");
      for (const b of houses.filter((_, i) => i % 3 === 0)) { sim.damageBuilding(b.id, sim.maxHp[b.id]); sim.rebuildCell(b.cells[0]); }
    }
    renderer.draw(map, sim, null, { ...options, styledSprites });
    return renderer.canvas.toDataURL();
  }, { styledSprites, zoom, damage });
  mkdirSync("test-results/city-sprites", { recursive: true });
  await page.evaluate(async () => {
    const { paintIcon } = await import("/src/defend/structure-art.ts");
    const sheet = document.createElement("canvas"); sheet.id = "city-palette-review";
    sheet.width = 384; sheet.height = 48;
    sheet.style.cssText = "display:block;width:768px;height:96px;image-rendering:pixelated";
    const c = sheet.getContext("2d");
    ["cityTile", "bomb", "keep", "barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower"].forEach((item, i) => {
      const icon = document.createElement("canvas"); icon.width = icon.height = 48;
      paintIcon(icon, item, true); c.drawImage(icon, i * 48, 0);
    });
    document.body.append(sheet);
  });
  await page.locator("#city-palette-review").screenshot({ path: "test-results/city-sprites/palette.png" });
  const off = await draw(false);
  await page.locator("#city-review").screenshot({ path: "test-results/city-sprites/off.png" });
  assert.notEqual(await draw(true), off);
  await page.locator("#city-review").screenshot({ path: "test-results/city-sprites/on.png" });
  await draw(true, 3);
  await page.locator("#city-review").screenshot({ path: "test-results/city-sprites/zoom.png" });
  await draw(true, 3, true);
  await page.locator("#city-review").screenshot({ path: "test-results/city-sprites/damage.png" });
  assert.equal(await draw(false), off, "toggling off clears cached sprite art");
  assert.deepEqual(errors, []);
  console.log("City PNGs load, roofs and dressing render at both scales, damage/rebuilding render, and toggling off restores identical pixels.");
} finally {
  await browser.close();
  await server.close();
}
