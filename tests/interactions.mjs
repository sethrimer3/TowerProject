import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const fixture = sessionStorage.getItem("__fixture");
  if (fixture) {
    localStorage.setItem("towerincramental.v1", fixture);
    sessionStorage.removeItem("__fixture");
  }
});
await page.addInitScript(() => { const fixture = sessionStorage.getItem("__treeFixture"); if (fixture) { localStorage.setItem("towerincramental.v1", fixture); sessionStorage.removeItem("__treeFixture"); } });
await page.goto("http://127.0.0.1:5173/");
// Movement fixtures begin after the Delve unlock; fresh progression has its own suite.
await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem("towerincramental.v1"));
  save.upgrades.delve = 1;
  sessionStorage.setItem("__treeFixture", JSON.stringify(save));
});
await page.reload();
await expect(page.locator(".dpad")).toBeHidden();
await page.locator('[data-tab="delve"]').click();
const saved = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("towerincramental.v1")));
async function tap(x, y) {
  await page.waitForTimeout(250);
  const save = await saved(),
    p = save.delve.run.player,
    n = save.settings.density,
    left = Math.max(0, Math.min(30 - n, p.x - Math.floor(n / 2))),
    bottom = Math.max(0, p.y - Math.floor(n * 0.3));
  const box = await page.locator("#world").boundingBox();
  await page.mouse.click(
    box.x + ((x - left + 0.5) * box.width) / n,
    box.y + ((n - 0.5 - y + bottom) * box.width) / n,
  );
}
async function swipe(dx, dy) {
  const b = await page.locator("#world").boundingBox(),
    x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx * 45, y + dy * 45, { steps: 4 });
  await page.mouse.up();
}
await swipe(0, -1);
await expect.poll(async () => (await saved()).delve.run.player.y).toBe(1);
await swipe(-1, 0);
await expect.poll(async () => (await saved()).delve.run.player.x).toBe(14);
await swipe(1, 0);
await swipe(0, 1);
await expect.poll(async () => (await saved()).delve.run.player.y).toBe(0);
await tap(15, 3);
await expect.poll(async () => (await saved()).delve.run.player.y).toBe(3);
await expect
  .poll(async () => (await saved()).delve.run.player.keys.yellow)
  .toBe(1);
await page.locator("#undo").click();
await expect.poll(async () => (await saved()).delve.run.player.y).toBe(2);
await expect
  .poll(async () => (await saved()).delve.run.player.keys.yellow)
  .toBe(0);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("towerincramental.v1"));
  s.delve.run.player.y = 3;
  s.delve.run.changes["15,3"] = { kind: "floor" };
  s.delve.history = [];
  sessionStorage.setItem("__fixture", JSON.stringify(s));
});
await page.reload();
await page.locator('[data-tab="delve"]').click();
await tap(15, 8);
await expect.poll(async () => (await saved()).delve.run.player.y).toBe(5);
await expect(page.locator("#message")).toContainText("Requires a yellow key.");
await page.screenshot({
  path: "test-results/blocked-door.png",
  fullPage: true,
});
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("towerincramental.v1"));
  s.upgrades.revive = 1;
  s.delve.run.player.y = 1;
  s.delve.run.player.hp = 1;
  s.delve.run.player.attack = 1;
  s.delve.run.player.defense = 0;
  s.delve.run.changes = {};
  s.delve.history = [];
  sessionStorage.setItem("__fixture", JSON.stringify(s));
});
await page.reload();
await page.locator('[data-tab="delve"]').click();
await tap(15, 3);
await expect(page.locator("#revive-now")).toBeVisible();
await expect.poll(async () => (await saved()).delve.run.player.y).toBe(0);
await page.locator("#again").click();
await expect(page.locator("#undo")).toHaveAttribute("aria-label", "Revive");
await page.reload();
await page.locator('[data-tab="delve"]').click();
await expect(page.locator("#undo")).toHaveAttribute("aria-label", "Revive");
await page.locator("#undo").click();
await expect.poll(async () => (await saved()).delve.run.player.y).toBe(1);
await expect.poll(async () => (await saved()).delve.run.player.hp).toBe(1);
await tap(15, 3);
await page.locator("#again").click();
await swipe(0, -1);
await expect(page.locator("#undo")).toHaveAttribute("aria-label", /^Undo/);
await expect.poll(async () => (await saved()).delve.revival).toBe(null);
await page.locator("#undo").click();
await expect.poll(async () => (await saved()).delve.run.player.y).toBe(0);
await expect.poll(async () => (await saved()).delve.revival).toBe(null);
await page.screenshot({
  path: "test-results/touch-controls.png",
  fullPage: true,
});
await page.evaluate(async () => {
  const { generate } = await import("/src/generation.ts");
  const s = JSON.parse(localStorage.getItem("towerincramental.v1"));
  for (let seed = 0; seed < 20; seed++) {
    const cells = generate(seed, 0);
    const y = Array.from({ length: 20 }, (_, y) => y).find(
      (y) =>
        cells.get(`0,${y}`).kind !== "wall" &&
        cells.get(`29,${y}`).kind !== "wall",
    );
    if (y === undefined) continue;
    s.delve.run.seed = seed;
    s.delve.run.outside = false;
    s.delve.run.player.x = 29;
    s.delve.run.player.y = y;
    s.delve.run.player.hp = 120;
    s.delve.run.player.attack = 12;
    s.delve.run.player.defense = 5;
    s.delve.run.player.keys = { yellow: 1, blue: 1, red: 1 };
    s.delve.run.changes = {};
    s.delve.history = [];
    s.delve.revival = null;
    s.settings.density = 30;
    sessionStorage.setItem("__fixture", JSON.stringify(s));
    break;
  }
});
await page.reload();
await page.locator('[data-tab="delve"]').click();
await page.screenshot({
  path: "test-results/wrap-opening.png",
  fullPage: true,
});
const wrapY = (await saved()).delve.run.player.y;
await tap(0, wrapY);
await expect.poll(async () => (await saved()).delve.run.player.x).toBe(0);
await page.locator("#undo").click();
await expect.poll(async () => (await saved()).delve.run.player.x).toBe(29);
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "Four swipe directions, tap path/combat, undo, locked-door stop/X, death reset, Revive refresh and expiry passed.",
);
await browser.close();
