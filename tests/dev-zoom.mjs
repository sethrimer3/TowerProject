// Dev zoom in the browser: the mouse wheel and a two-finger pinch scale the
// board about the pointer, a whole number of screen pixels an art pixel each
// step, up to the first past ×4, and a drag pans it without tapping.
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", ...(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE, channel: undefined } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const fixture = sessionStorage.getItem("__zoomFixture");
  if (fixture) {
    localStorage.setItem("towerdelve.v1", fixture);
    sessionStorage.removeItem("__zoomFixture");
  }
});
await fixClock(page);
await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173/");
await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
const reload = async (devTools) => {
  await page.evaluate((dev) => {
    const save = JSON.parse(localStorage.getItem("towerdelve.v1"));
    save.tutorials.climb = true;
    save.settings.devTools = dev;
    sessionStorage.setItem("__zoomFixture", JSON.stringify(save));
  }, devTools);
  await page.reload();
  await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
};
const frame = async () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
/** The board canvas's shown scale and its backing pixels an art pixel. */
const look = async () => { await frame(); return page.evaluate(() => {
  const c = document.querySelector("#world"), box = c.getBoundingClientRect();
  return { scale: box.width / c.offsetWidth, art: c.width / (17 * 24) };
}); };

await reload(true);
const box = await page.locator("#world").boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
/** The board point (CSS pixels of the unzoomed board) under a client point. */
const under = (x, y) => page.evaluate(([x, y]) => {
  const c = document.querySelector("#world"), r = c.getBoundingClientRect(), k = r.width / c.offsetWidth;
  return { x: (x - r.left) / k, y: (y - r.top) / k };
}, [x, y]);
// Zooming about a point a quarter in from the corner keeps that point under the pointer.
const px = box.x + box.width / 4, py = box.y + box.height / 4, before = await under(px, py);
await page.mouse.move(px, py);
for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
await look();
const after = await under(px, py);
if (Math.abs(after.x - before.x) > 1.5 || Math.abs(after.y - before.y) > 1.5) throw Error(`The point under the pointer should stay there: ${JSON.stringify(before)} then ${JSON.stringify(after)}`);
// A drag pans the zoomed board.
const start = await under(cx, cy);
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 6; i++) await page.mouse.move(cx - i * 10, cy - i * 10);
await page.mouse.up();
await look();
const panned = await under(cx, cy);
if (!(panned.x > start.x + 5 && panned.y > start.y + 5)) throw Error(`Dragging up-left should pan to show more of the lower right: ${JSON.stringify(start)} then ${JSON.stringify(panned)}`);
for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 100);
if ((await look()).scale !== 1) throw Error("Zooming all the way out should leave the board unzoomed");

await page.mouse.move(cx, cy);
const a = (box.width * 2) / (17 * 24), max = Math.floor(4 * a) + 1;
let last = 1;
for (let i = 0; i < 30; i++) {
  await page.mouse.wheel(0, -100);
  const { scale } = await look();
  if (scale < last - 1e-6) throw Error(`Zooming in should never shrink the board (${scale} after ${last})`);
  last = scale;
}
const zoomed = await look(), perArt = zoomed.scale * a;
if (Math.abs(perArt - max) > 0.01) throw Error(`The last step should put ${max} screen pixels on an art pixel, not ${perArt}`);
if (zoomed.scale <= 4) throw Error(`The last step should pass ×4, not ×${zoomed.scale}`);
if (!Number.isInteger(zoomed.art)) throw Error(`The canvas should keep whole pixels an art pixel, not ${zoomed.art}`);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 100);
if ((await look()).scale !== 1) throw Error("Zooming all the way out should leave the board unzoomed");

const cdp = await context.newCDPSession(page);
async function pinch(from, to) {
  const points = (gap) => [{ x: cx - gap / 2, y: cy, id: 1 }, { x: cx + gap / 2, y: cy, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(from + ((to - from) * i) / 8) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
await pinch(60, 240);
const pinched = (await look()).scale;
if (pinched < 3) throw Error(`Spreading two fingers fourfold should zoom about ×4, not ×${pinched}`);
if (await page.evaluate(() => document.documentElement.classList.contains("cinematic"))) throw Error("Under Dev Mode a pinch zooms instead of entering cinematic mode");
await pinch(240, 40);
if ((await look()).scale !== 1) throw Error("Pinching in should zoom back out");

if (errors.length) throw Error(errors.join("\n"));
await browser.close();
console.log("dev zoom ok");
