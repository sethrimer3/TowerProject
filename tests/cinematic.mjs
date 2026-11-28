// Cinematic mode in the browser: two real fingers pinching the board in hide
// every control, and pinching out, three taps, Escape, Ctrl and the wheel or
// the Back button bring them back.
import { chromium } from "@playwright/test";
import { fixClock } from "./fixed-clock.mjs";
import { openMenu } from "./run-menu.mjs";

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  // The pinch and the wheel zoom the board (tests/dev-zoom.mjs); this suite checks Cinematic mode's.
  globalThis.__noDevZoom = true;
  const fixture = sessionStorage.getItem("__cinematicFixture");
  if (fixture) {
    localStorage.setItem("towerdelve.v1", fixture);
    sessionStorage.removeItem("__cinematicFixture");
  }
});
await fixClock(page);
await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173/");
await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
// A new game's first run, its climb lesson passed, with Cinematic mode on.
await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem("towerdelve.v1"));
  save.tutorials.climb = true;
  save.settings.cinematic = true;
  sessionStorage.setItem("__cinematicFixture", JSON.stringify(save));
});
await page.reload();
await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });

const cdp = await context.newCDPSession(page);
const canvas = await page.locator("#world").boundingBox();
const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
/** Two fingers on the board, from `from` px apart to `to` px apart. */
async function pinch(from, to) {
  const points = (gap) => [{ x: cx - gap / 2, y: cy, id: 1 }, { x: cx + gap / 2, y: cy, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(from + ((to - from) * i) / 8) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const cinematic = () => page.evaluate(() => document.documentElement.classList.contains("cinematic"));
async function expect(on, what) {
  if ((await cinematic()) !== on) throw Error(`${what}: cinematic mode should be ${on ? "on" : "off"}`);
  const shown = await page.locator("#stats").isVisible();
  if (shown === on) throw Error(`${what}: the stats should be ${on ? "hidden" : "shown"}`);
}

await expect(false, "at the start");
await pinch(200, 60);
await expect(true, "pinched in");
if (await page.locator("nav").isVisible()) throw Error("The hand's row should be hidden");
const board = await page.locator("#board-frame").boundingBox();
if (board.width < 380) throw Error(`The board should fill the screen's width, not ${board.width}px`);
await pinch(60, 220);
await expect(false, "pinched out");

await pinch(200, 60);
await page.mouse.click(cx, cy);
if (!(await page.locator("#cinematic-back").isVisible())) throw Error("A tap should show the Back button");
await page.mouse.click(cx, cy);
await page.mouse.click(cx, cy);
await expect(false, "three taps");

await pinch(200, 60);
await page.keyboard.press("Escape");
await expect(false, "Escape");

await page.mouse.move(cx, cy);
await page.keyboard.down("Control");
await page.mouse.wheel(0, 100);
await expect(true, "Ctrl and the wheel down");
await page.mouse.wheel(0, -100);
await page.keyboard.up("Control");
await expect(false, "Ctrl and the wheel up");

await pinch(200, 60);
await page.mouse.click(cx, cy);
await page.locator("#cinematic-back").click();
if (await cinematic()) throw Error("Back should leave cinematic mode");
if (await page.locator("#settings-back").isVisible()) throw Error("Back should stay on the board, not open Settings");
await openMenu(page); await page.locator("#auto-settings").click();
if (!(await page.locator("#cinematic-idle").isVisible())) throw Error("The idle option should show while Cinematic mode is on");
await page.locator("#cinematic").uncheck();
if (await page.locator("#cinematic-idle").isVisible()) throw Error("The idle option should hide with Cinematic mode off");
await page.locator("#settings-back").click();
await pinch(200, 60);
await expect(false, "pinched with the setting off");

if (errors.length) throw Error("Page errors: " + errors.join("; "));
console.log(JSON.stringify({ errors, checks: ["pinch in", "board fills", "pinch out", "tap shows Back", "three taps", "Escape", "ctrl wheel", "Back leaves", "setting off"] }));
await browser.close();
