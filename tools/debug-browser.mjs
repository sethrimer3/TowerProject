import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});

await page.addInitScript(() => {
  const fixture = sessionStorage.getItem("__treeFixture");
  if (fixture) {
    localStorage.setItem("towerincramental.v1", fixture);
    sessionStorage.removeItem("__treeFixture");
  }
});
await page.goto("http://127.0.0.1:5173/");

const rawBefore = await page.evaluate(() => localStorage.getItem("towerincramental.v1"));
console.log("Raw localStorage before fixture:", rawBefore ? "exists" : "null");

await page.evaluate(() => {
  const item = localStorage.getItem("towerincramental.v1");
  const save = item ? JSON.parse(item) : { upgrades: {} };
  save.upgrades = save.upgrades || {};
  save.upgrades.delve = 1;
  sessionStorage.setItem("__treeFixture", JSON.stringify(save));
});
await page.reload();

const state = await page.evaluate(() => {
  const item = localStorage.getItem("towerincramental.v1");
  return {
    raw: item ? JSON.parse(item) : null,
    delveHidden: document.querySelector('[data-tab="delve"]')?.hidden,
    delveClass: document.querySelector('[data-tab="delve"]')?.className,
    selectedTab: document.querySelector('[data-tab].selected')?.dataset.tab,
  };
});
console.log("After reload state:", JSON.stringify(state, null, 2));

await page.locator('[data-tab="settings"]').click();
await page.locator("#arrows").check();
await page.locator('[data-tab="delve"]').click();

const afterClick = await page.evaluate(() => {
  return {
    selectedTab: document.querySelector('[data-tab].selected')?.dataset.tab,
    height: document.querySelector("#height")?.textContent,
    activePage: document.querySelector(".page.active")?.id,
    statsHidden: document.querySelector("#stats")?.hidden,
  };
});
console.log("After clicking delve tab:", JSON.stringify(afterClick, null, 2));

await page.getByRole("button", { name: "Move up", exact: true }).click();

const afterMove = await page.evaluate(() => {
  return {
    height: document.querySelector("#height")?.textContent,
    message: document.querySelector("#message")?.textContent,
  };
});
console.log("After move:", JSON.stringify(afterMove, null, 2));

await browser.close();
