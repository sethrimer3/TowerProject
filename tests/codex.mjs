// The Codex in a browser (needs `npm run dev`, or TEST_URL): the menu's Codex
// button opens it in the forest and inside a climb, locked categories can't
// be chosen, Access to Everything opens them all, links lead to their pages,
// and nothing overflows a phone's width. Screenshots go to test-results/codex/.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const url = process.env.TEST_URL ?? "http://127.0.0.1:5173/";
const out = "test-results/codex";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
const fail = (message) => { throw new Error(message); };
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector("#run-menu-toggle", { state: "visible", timeout: 60_000 });
  const openCodex = async () => {
    await page.click("#run-menu-toggle");
    await page.click("#codex-button");
    await page.waitForSelector("#codex.active .codex-tabs");
  };
  await openCodex();
  await page.screenshot({ path: `${out}/general.png`, fullPage: true });
  const locked = await page.locator(".codex-tab.locked").count();
  if (!locked) fail("a new profile should have locked categories");
  if (!(await page.locator(".codex-tab.locked").first().isDisabled())) fail("a locked category must not be selectable");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) fail(`the Codex overflows the phone's width by ${overflow}px`);
  for (const tab of ["cards", "enemies", "elements"]) {
    await page.click(`[data-codex-tab="${tab}"]`);
    await page.screenshot({ path: `${out}/${tab}.png`, fullPage: true });
  }
  // The Free Daily Gems link leads to its offer on the Shop page.
  await page.click(`[data-codex-tab="general"]`);
  await page.click(`[data-codex-link="general/dailyGems"]`);
  await page.waitForSelector("#shop.active .shop-card.shop-focus");
  // Access to Everything opens every category: a fresh page, its save so set before the game loads.
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("towerdelve.v1")));
  saved.settings.accessAll = true;
  await page.close();
  const all = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await all.addInitScript((json) => {
    if (sessionStorage.getItem("codex-seeded")) return;
    sessionStorage.setItem("codex-seeded", "1");
    localStorage.setItem("towerdelve.v1", json);
  }, JSON.stringify(saved));
  all.on("pageerror", (e) => errors.push(e.message));
  await all.goto(url);
  await all.waitForSelector("#run-menu-toggle", { state: "visible", timeout: 60_000 });
  await all.click("#run-menu-toggle");
  await all.click("#codex-button");
  await all.waitForSelector("#codex.active .codex-tabs");
  if (await all.locator(".codex-tab.locked").count()) fail("Access to Everything should open every category");
  if (await all.locator(".codex-hidden").count()) fail("Access to Everything should reveal every entry");
  for (const tab of ["badges", "inspiration", "training", "arcana", "equipment", "shrines", "archives"]) {
    await all.click(`[data-codex-tab="${tab}"]`);
    const width = await all.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (width > 0) fail(`${tab} overflows by ${width}px`);
    await all.screenshot({ path: `${out}/all-${tab}.png`, fullPage: true });
  }
  if (errors.length) fail(`page errors: ${errors.join("; ")}`);
  console.log("Codex browser checks passed.");
} finally {
  await browser.close();
}
