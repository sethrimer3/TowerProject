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
await browser.close();
if (errors.length) process.exitCode = 1;
