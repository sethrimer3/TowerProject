import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173/");
await page.evaluate(() => document.fonts.ready);
const fontCheck = await page.evaluate(() => ({
  loaded: document.fonts.check("16px Cinzel"),
  wrong: [
    ...document.querySelectorAll(
      "h1,h2,h3,p,small,button,select,span,b,footer",
    ),
  ]
    .filter((e) => !getComputedStyle(e).fontFamily.startsWith("Cinzel"))
    .map((e) => e.tagName),
  remote: performance
    .getEntriesByType("resource")
    .some((e) => /fonts.googleapis|fonts.gstatic/.test(e.name)),
}));
if (!fontCheck.loaded || fontCheck.wrong.length || fontCheck.remote)
  throw Error(
    "Local Cinzel font verification failed: " + JSON.stringify(fontCheck),
  );
await page.getByRole("button", { name: "Move up", exact: true }).click();
if ((await page.locator("#height").textContent()) !== "1")
  throw Error("Movement failed");
await page.reload();
if ((await page.locator("#height").textContent()) !== "1")
  throw Error("Save failed");
await page.locator('[data-tab="settings"]').click();
await page.locator("#density").selectOption("30");
await page.locator('[data-tab="tower"]').click();
if ((await page.locator("#density-label").textContent()) !== "30 × 30")
  throw Error("Density failed");
await page.locator('[data-tab="settings"]').click();
await page.locator("#density").selectOption("20");
await page.locator("#retire").click();
await page.locator("#confirm").click();
await page.locator("#again").click();
if ((await page.locator("#essence").textContent()) !== "1")
  throw Error("Reward failed");
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
if (overflow) throw Error("Horizontal overflow");
await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
await page.setViewportSize({ width: 1280, height: 1000 });
await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
console.log(
  JSON.stringify({
    errors,
    overflow,
    mobile: "390x844",
    checks: [
      "movement",
      "reload",
      "density",
      "retire confirmation",
      "summary",
      "new run",
      "essence",
    ],
  }),
);
for (let i = 0; i < 2; i++) {
  await page.locator('[data-tab="settings"]').click();
  await page.locator("#retire").click();
  await page.locator("#confirm").click();
  await page.locator("#again").click();
}
await page.locator('[data-tab="upgrades"]').click();
await page.locator('[data-buy="auto"]').click();
await page.locator('[data-tab="tower"]').click();
await page.locator("#auto").click();
await page.waitForTimeout(2000);
if (Number(await page.locator("#height").textContent()) < 1)
  throw Error("Auto unlock and climb failed");
await page.locator("#pause").click();
const before = await page.locator("#height").textContent();
await page.waitForTimeout(500);
if ((await page.locator("#height").textContent()) !== before)
  throw Error("Pause failed");
await page.locator('[data-tab="settings"]').click();
await page.locator("#erase").click();
await page.locator("#cancel").click();
await page.reload();
await page.locator('[data-tab="upgrades"]').click();
if ((await page.locator('[data-buy="auto"]').textContent()) !== "MAX")
  throw Error("Upgrade persistence failed");
console.log(
  "Upgrade purchase, auto unlock, climbing, pause, erase cancellation, and upgrade persistence passed",
);
await page.locator('[data-tab="settings"]').click();
await page.locator("#density").selectOption("30");
await page.locator('[data-tab="tower"]').click();
await page.screenshot({ path: "test-results/rooms-wide.png", fullPage: true });
await page.setViewportSize({ width: 320, height: 640 });
await page.locator('[data-tab="settings"]').click();
await page.locator("#density").selectOption("20");
await page.locator('[data-tab="tower"]').click();
await page.screenshot({
  path: "test-results/small-mobile.png",
  fullPage: true,
});
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw Error("Small phone horizontal overflow");
console.log(
  "Local Cinzel loaded without remote fonts; 320px mobile layout passed",
);
const fit = await page.evaluate(() => {
  const grid = document.querySelector("canvas").getBoundingClientRect();
  const controls = document.querySelector(".controls").getBoundingClientRect();
  const nav = document.querySelector("nav").getBoundingClientRect();
  return (
    Math.abs(grid.width - grid.height) < 1 &&
    controls.bottom <= nav.top &&
    nav.bottom <= innerHeight
  );
});
if (!fit) throw Error("Grid or controls do not fit above navigation");
const routePage = await browser.newPage({
  viewport: { width: 390, height: 844 },
});
routePage.on("pageerror", (e) => errors.push(e.message));
await routePage.goto("http://127.0.0.1:5173/");
for (let step = 0; step < 20; step++)
  await routePage.getByRole("button", { name: "Move up", exact: true }).click();
if ((await routePage.locator("#height").textContent()) !== "20")
  throw Error("Manual route failed to cross the section exit");
if ((await routePage.locator("#hp").textContent()) !== "120 / 120")
  throw Error("Mandatory route inflicted combat damage");
await routePage.screenshot({
  path: "test-results/exit-reached.png",
  fullPage: true,
});
console.log(
  "Manual browser ascent collected both required keys, opened both gates, and reached the next section",
);
await browser.close();
if (errors.length) process.exitCode = 1;
