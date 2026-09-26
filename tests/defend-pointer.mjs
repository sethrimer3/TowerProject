// Characterization snapshots for Defend's pointer handling (src/defend/ui.ts):
// dragging palette items, structures, the keep and city tiles onto legal and
// illegal tiles and off the board, panning, wheel and pinch zoom, a second
// finger or a cancel during a drag, and bombs during a battle. Mouse gestures
// go through Playwright, touches through CDP. After each gesture the camera,
// the drag overlay, the ghost icon, the layout and bombs (live and saved), the
// message and the palette are hashed against tests/fixtures/defend-pointer.golden.json.
// Regenerate with UPDATE_GOLDEN=1 on the code *before* a pointer refactor.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const UPDATE = process.env.UPDATE_GOLDEN === "1";
const GOLDEN = new URL("./fixtures/defend-pointer.golden.json", import.meta.url);
const URL_ROOT = "http://127.0.0.1:5173/";

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  let seed = 4242;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Frames draw random effects, so the battle reseeds right before it starts.
  window.__reseed = (value) => { seed = value; };
  const fixture = sessionStorage.getItem("__defendFixture");
  if (fixture) localStorage.setItem("towerincramental.v1", fixture);
});

// A save with Defend unlocked, spare palette items, bombs, and a small city:
// a ring of city tiles around the keep with a barracks and an archer tower.
await page.goto(URL_ROOT);
const fixture = await page.evaluate(async () => {
  const { defaults } = await import("/src/save.ts");
  const { placeCityTile, placeStructure } = await import("/src/defend/layout.ts");
  const s = defaults();
  s.upgrades.legacy = 1;
  Object.assign(s.defend.owned, { cityTile: 14, barracks: 3, archerTower: 2, watchTower: 1 });
  s.defend.bombs = 4;
  let layout = s.defend.layout;
  const { tx, ty } = layout.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, 1]]) layout = placeCityTile(layout, tx + dx, ty + dy) ?? layout;
  layout = placeStructure(layout, "barracks", tx - 1, ty) ?? layout;
  layout = placeStructure(layout, "archerTower", tx + 1, ty - 1) ?? layout;
  s.defend.layout = layout;
  return JSON.stringify(s);
});
await page.evaluate((f) => { sessionStorage.setItem("__defendFixture", f); }, fixture);
await page.reload();
// Hand the test the live DefendPage by patching its prototype, so the app's
// own page reports itself on its next frame. The dev server may have served
// the module under an HMR timestamp, so every loaded URL of it is patched.
await page.evaluate(async () => {
  const urls = new Set(["/src/defend/ui.ts"]);
  for (const e of performance.getEntriesByType("resource")) if (new URL(e.name).pathname === "/src/defend/ui.ts") urls.add(e.name);
  for (const url of urls) {
    const { DefendPage } = await import(url);
    const real = DefendPage.prototype.frame;
    DefendPage.prototype.frame = function (t) { window.__dp = this; return real.call(this, t); };
  }
});
await page.click('[data-tab="defend"]');
await page.waitForFunction(() => window.__dp);
await page.evaluate(async () => {
  const dp = window.__dp;
  const { SUB } = await import("/src/defend/grid.ts");
  /** Client point at (fx, fy) within tile (tx, ty), through the camera. */
  window.__tile = (tx, ty, fx = 0.5, fy = 0.5) => {
    const r = dp.renderer, c = r.canvas, box = c.getBoundingClientRect();
    const px = (tx + fx) * SUB * r.px * r.cam.s + r.cam.x, py = (ty + fy) * SUB * r.px * r.cam.s + r.cam.y;
    return { x: box.left + (px / c.width) * box.width, y: box.top + (py / c.height) * box.height };
  };
});

const keep = await page.evaluate(() => window.__dp.host.save().layout.keep);
const tile = (tx, ty, fx = 0.5, fy = 0.5) => page.evaluate((args) => window.__tile(...args), [tx, ty, fx, fy]);
const paletteItem = async (id) => {
  const b = await page.locator(`#defend-palette [data-item="${id}"]`).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

async function observe() {
  return page.evaluate(() => {
    const dp = window.__dp, ov = dp.overlay(), save = dp.host.save();
    const stored = JSON.parse(localStorage.getItem("towerincramental.v1") || "{}").defend ?? null;
    const ghost = document.querySelector(".defend-drag-ghost");
    const cam = dp.renderer.cam;
    const r = (v) => Math.round(v * 1000) / 1000;
    return JSON.stringify({
      cam: [r(cam.x), r(cam.y), r(cam.s)],
      overlay: ov && { legal: [...ov.legal].sort(), hover: ov.hover, ghost: ov.ghost, bomb: ov.bomb && [r(ov.bomb.x), r(ov.bomb.y), ov.bomb.r] },
      ghost: ghost && [ghost.style.left, ghost.style.top],
      layout: save.layout, bombs: save.bombs,
      stored: stored && { layout: stored.layout, bombs: stored.bombs },
      message: document.querySelector("#defend-message")?.textContent ?? null,
      palette: document.querySelector("#defend-palette")?.innerHTML.replace(/<canvas[^>]*><\/canvas>/g, ""),
    });
  });
}

const actual = {};
const snapshots = {};
async function shot(name) {
  const text = await observe();
  snapshots[name] = text;
  actual[name] = createHash("sha256").update(text).digest("hex").slice(0, 16);
}
/** Clears the message so each gesture's own message is what gets recorded. */
const quiet = () => page.evaluate(() => window.__dp.setMessage(""));

// --- Mouse gestures (one pointer) ---
async function drag(from, to, { steps = 4, release = true, mid } = {}) {
  await quiet();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  if (mid) await mid();
  if (release) await page.mouse.up();
}

await shot("start");
await drag(await paletteItem("barracks"), await tile(keep.tx, keep.ty - 2), { release: false });
await shot("palette barracks mid-drag");
await page.mouse.up();
await shot("palette barracks dropped by the city");
await drag(await paletteItem("barracks"), await tile(keep.tx, 0));
await shot("palette barracks on the top row");
await drag(await paletteItem("watchTower"), await tile(2, keep.ty));
await shot("palette watch tower outside the city");
await drag(await paletteItem("cityTile"), await tile(keep.tx, keep.ty));
await shot("palette city tile onto the city");
await drag(await paletteItem("cityTile"), await tile(keep.tx + 4, keep.ty + 1));
await shot("palette city tile detached");
await drag(await paletteItem("cityTile"), await tile(keep.tx + 2, keep.ty));
await shot("palette city tile added");
// A barracks carried onto the first tile the drag lights up as legal.
await drag(await paletteItem("barracks"), await tile(keep.tx, keep.ty - 2), {
  release: false,
  mid: async () => {
    const [tx, ty] = await page.evaluate(() => [...window.__dp.overlay().legal].sort()[0].split(",").map(Number));
    const to = await tile(tx, ty, 0.9, 0.5);
    await page.mouse.move(to.x, to.y, { steps: 3 });
  },
});
await shot("palette barracks over a legal tile");
await page.mouse.up();
await shot("palette barracks placed");
await drag(await paletteItem("archerTower"), await paletteItem("barracks"));
await shot("palette archer tower back onto the palette");
await drag(await tile(keep.tx - 1, keep.ty), await tile(keep.tx - 1, keep.ty - 1));
await shot("structure moved");
await drag(await tile(keep.tx - 1, keep.ty - 1), await tile(keep.tx - 1, keep.ty - 1), { steps: 1 });
await shot("structure pressed without moving");
await drag(await tile(keep.tx + 1, keep.ty - 1), await paletteItem("barracks"));
await shot("structure dropped on the palette");
await drag(await tile(keep.tx, keep.ty), await tile(keep.tx, keep.ty - 1));
await shot("keep moved");
await drag(await tile(keep.tx, keep.ty - 1), await paletteItem("barracks"));
await shot("keep dropped on the palette");
await drag(await tile(keep.tx + 2, keep.ty), await tile(keep.tx - 2, keep.ty));
await shot("city tile moved");
await drag(await tile(keep.tx - 2, keep.ty), await paletteItem("cityTile"));
await shot("city tile dropped on the palette");
await drag(await tile(keep.tx, keep.ty + 1), await tile(keep.tx + 3, keep.ty + 3));
await shot("city tile moved somewhere illegal");
// A city tile holding a structure never lifts, even pressed where the
// structure doesn't cover it.
{
  const free = await page.evaluate(async () => {
    const { SUB, CELLS_W } = await import("/src/defend/grid.ts");
    const dp = window.__dp, map = dp.currentMap();
    for (const st of dp.host.save().layout.structures)
      for (let y = 0; y < SUB; y++) for (let x = 0; x < SUB; x++) {
        const cx = st.tx * SUB + x, cy = st.ty * SUB + y, owner = map.owner[cy * CELLS_W + cx];
        if (owner < 0 || !map.buildings[owner].structureUid) return { tx: st.tx, ty: st.ty, fx: (x + 0.5) / SUB, fy: (y + 0.5) / SUB };
      }
    return null;
  });
  if (!free) throw new Error("no structure leaves part of its tile uncovered");
  const at = await page.evaluate(({ tx, ty, fx, fy }) => window.__tile(tx, ty, fx, fy), free);
  await drag(at, await tile(free.tx, free.ty - 2), { steps: 3 });
}
await shot("loaded city tile pressed at its corner");
// Right-button presses are ignored on the board and the palette.
await quiet();
{
  const p = await tile(keep.tx - 1, keep.ty - 1);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(p.x + 60, p.y + 40, { steps: 3 });
  await page.mouse.up({ button: "right" });
  const q = await paletteItem("barracks");
  await page.mouse.move(q.x, q.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.mouse.up({ button: "right" });
}
await shot("right button ignored");

// --- Camera: wheel zoom, then panning open ground with the mouse ---
// Camera gestures aim at fractions of the board, which stay on the canvas
// however far it is zoomed; the upper board is open ground, outside the city.
const boardBox = await page.locator("#defend-canvas").boundingBox();
const board = (u, v) => ({ x: boardBox.x + u * boardBox.width, y: boardBox.y + v * boardBox.height });
async function wheel(at, deltaY) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(50);
}
await wheel(board(0.4, 0.3), -400);
await shot("wheel zoom");
await drag(board(0.3, 0.2), board(0.6, 0.35), { steps: 5 });
await shot("mouse pan");
await wheel(board(0.5, 0.3), 250);
await shot("wheel zoom out");

// --- Touch gestures through CDP (several pointers) ---
const cdp = await context.newCDPSession(page);
const touch = (type, points) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

async function pinch(a0, b0, a1, b1, steps = 5) {
  await quiet();
  await touch("touchStart", [{ ...a0, id: 1 }]);
  await touch("touchStart", [{ ...a0, id: 1 }, { ...b0, id: 2 }]);
  for (let i = 1; i <= steps; i++) await touch("touchMove", [{ ...lerp(a0, a1, i / steps), id: 1 }, { ...lerp(b0, b1, i / steps), id: 2 }]);
  await touch("touchEnd", [{ ...b1, id: 2 }]);
  await touch("touchEnd", []);
}
await pinch(board(0.4, 0.3), board(0.6, 0.4), board(0.3, 0.2), board(0.7, 0.5));
await shot("pinch out");
await pinch(board(0.3, 0.2), board(0.7, 0.5), board(0.45, 0.3), board(0.55, 0.35));
await shot("pinch in");
{
  await quiet();
  const a = board(0.3, 0.2), b = board(0.5, 0.4);
  await touch("touchStart", [{ ...a, id: 5 }]);
  for (let i = 1; i <= 4; i++) await touch("touchMove", [{ ...lerp(a, b, i / 4), id: 5 }]);
  await touch("touchEnd", []);
}
await shot("touch pan");
// A cancelled view pointer is forgotten: the next finger pans on its own.
{
  await wheel(board(0.5, 0.3), -300);
  await quiet();
  const a = board(0.4, 0.3), b = board(0.5, 0.35);
  await touch("touchStart", [{ ...a, id: 6 }]);
  await touch("touchMove", [{ ...b, id: 6 }]);
  await touch("touchCancel", []);
  const c = board(0.3, 0.3), d = board(0.45, 0.5);
  await touch("touchStart", [{ ...c, id: 7 }]);
  for (let i = 1; i <= 3; i++) await touch("touchMove", [{ ...lerp(c, d, i / 3), id: 7 }]);
  await touch("touchEnd", []);
}
await shot("touch pan after a cancelled one");
// A second finger during a structure drag cancels it and pans/pinches instead.
{
  // Zoomed in on the structure, so the fingers afterwards have room to pan.
  await page.evaluate(() => window.__dp.renderer.resetCam());
  await wheel(await tile(keep.tx - 1, keep.ty - 1), -300);
  await quiet();
  const s = await tile(keep.tx - 1, keep.ty - 1), t = await tile(keep.tx - 2, keep.ty - 1);
  await touch("touchStart", [{ ...s, id: 1 }]);
  await touch("touchMove", [{ ...lerp(s, t, 0.5), id: 1 }]);
  await shot("touch structure drag");
  const f = board(0.5, 0.2);
  await touch("touchStart", [{ ...lerp(s, t, 0.5), id: 1 }, { ...f, id: 2 }]);
  await shot("second finger cancels the drag");
  for (let i = 1; i <= 3; i++) await touch("touchMove", [{ ...t, id: 1 }, { x: f.x + 15 * i, y: f.y + 20 * i, id: 2 }]);
  await shot("fingers after the cancelled drag");
  await touch("touchEnd", [{ ...t, id: 1 }]);
  await touch("touchEnd", []);
}
await shot("fingers lifted");
// A cancelled pointer drops a drag without placing it.
{
  await quiet();
  const s = await paletteItem("barracks"), t = await tile(keep.tx - 2, keep.ty - 1);
  await touch("touchStart", [{ ...s, id: 3 }]);
  await touch("touchMove", [{ ...lerp(s, t, 0.5), id: 3 }]);
  await touch("touchMove", [{ ...t, id: 3 }]);
  await touch("touchCancel", []);
}
await shot("palette drag cancelled");

// --- Battle: bombs ---
// Reseeded and started in one task, so no frame's draws come between, and
// frozen at once so no wave or message arrives mid-gesture.
await page.evaluate(() => {
  window.__reseed(777);
  document.querySelector("#defend-start").click();
  window.__dp.sim.speed = 0;
});
await shot("battle started");
// In battle a press on the city moves the view instead of picking it up.
{
  const now = await page.evaluate(() => window.__dp.host.save().layout.keep);
  await drag(await tile(now.tx, now.ty), board(0.5, 0.2), { steps: 3 });
}
await shot("battle press on the keep");
await drag(await paletteItem("bomb"), await tile(keep.tx, keep.ty - 3), { release: false });
await shot("bomb mid-drag");
await page.mouse.up();
await shot("bomb dropped");
await drag(await paletteItem("bomb"), await paletteItem("bomb"));
await shot("bomb returned to the palette");
{
  await quiet();
  const s = await paletteItem("bomb"), t = await tile(keep.tx - 2, keep.ty - 4), f = board(0.3, 0.3);
  await touch("touchStart", [{ ...s, id: 1 }]);
  await touch("touchMove", [{ ...lerp(s, t, 0.5), id: 1 }]);
  await touch("touchStart", [{ ...lerp(s, t, 0.5), id: 1 }, { ...f, id: 2 }]);
  await touch("touchMove", [{ ...lerp(s, t, 0.5), id: 1 }, { x: f.x + 30, y: f.y + 10, id: 2 }]);
  await shot("second finger during a bomb drag");
  await touch("touchMove", [{ ...t, id: 1 }, { x: f.x + 30, y: f.y + 10, id: 2 }]);
  await touch("touchEnd", [{ x: f.x + 30, y: f.y + 10, id: 2 }]);
  await touch("touchEnd", []);
}
await shot("bomb touch drop");
{
  await page.evaluate(() => { window.__dp.host.save().bombs = 0; window.__dp.renderPalette(); });
  await drag(await paletteItem("bomb"), await tile(keep.tx, keep.ty - 3), { release: false });
  await shot("bomb with none left mid-drag");
  await page.mouse.up();
}
await shot("bomb with none left");

await browser.close();
// The observed state behind each hash, for reading a mismatch.
mkdirSync("test-results/defend-pointer", { recursive: true });
writeFileSync(
  "test-results/defend-pointer/snapshots.json",
  JSON.stringify(Object.fromEntries(Object.entries(snapshots).map(([k, v]) => [k, JSON.parse(v)])), null, 1),
);
if (errors.length) throw new Error(`page errors:\n${errors.join("\n")}`);

if (UPDATE || !existsSync(GOLDEN)) {
  writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
  console.log(`Recorded ${Object.keys(actual).length} Defend pointer snapshots.`);
} else {
  const expected = JSON.parse(readFileSync(GOLDEN, "utf8"));
  const bad = Object.keys({ ...expected, ...actual }).filter((k) => expected[k] !== actual[k]);
  if (bad.length) {
    for (const k of bad) console.log(`MISMATCH ${k}`);
    console.log("Observed state: test-results/defend-pointer/snapshots.json");
    process.exitCode = 1;
  } else console.log(`All ${Object.keys(actual).length} Defend pointer snapshots match.`);
}
