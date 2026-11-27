// The Catacomb screen in a real browser (docs/CATACOMBS.md, step 4): entering
// from the menu pauses the climb behind it, the hall plays a turn a second,
// a crosshair takes a tap, haste spends the bank, Skills and Spirit spend
// points and Spirit, an ability casts, the undead table opens from the enemy
// box, and Switch Back (or Escape) returns to the climb, its HUD restored.
import { chromium, expect } from "@playwright/test";
import { openMenu } from "./run-menu.mjs";
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" }) });
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const fixture = sessionStorage.getItem("catacombsFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("catacombsFixture"); }
  });
  // No fixed clock: the Catacombs play on the wall clock.
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173/");
  const marked = await page.evaluate(async () => {
    const { Game } = await import("/src/state.ts"), { defaults } = await import("/src/save/save.ts");
    const g = new Game(defaults());
    for (const k of Object.keys(g.save.tutorials)) g.save.tutorials[k] = true;
    g.save.tower.tiersOpen = 2; g.save.tower.tier = 2; g.save.upgrades.catacombs = 1;
    g.save.catacombs.rng.spawns = 7; g.catacombs.enter(1);
    g.save.catacombs.mxp = 440;
    g.save.catacombs.spirit.uncommon = 10;
    // A crosshair on the hall's last undead, far from the hero.
    const run = g.save.catacombs.run, marked = run.slots.findLastIndex(Boolean);
    run.slots[marked].mark = "crosshair";
    g.save.catacombs.clock.bank = 600;
    // Two minutes since the Catacombs' last turn: the reload banks them and says so.
    g.save.catacombs.clock.lastTurnAt = Date.now() - 120_000;
    g.newRun({ seed: 9 });
    sessionStorage.setItem("catacombsFixture", JSON.stringify(g.save));
    return marked;
  });
  await page.reload();
  await page.locator("#boot-loading").waitFor({ state: "hidden", timeout: 120000 });
  await expect(page.locator(".offline-catacombs")).toContainText(/Catacombs: \+1[12]\d banked turns/);
  await page.locator("#offline-claim").click();
  await expect(page.locator("#modal")).not.toBeVisible();
  await expect(page.locator("#height-label")).toHaveText("FLOOR");
  const floorBefore = await page.locator("#height").textContent();
  await openMenu(page);
  await page.locator("#catacombs-button").click();
  await expect(page.locator("html")).toHaveClass(/catacombs/);
  await expect(page.locator("#hero-class")).toHaveText("MAGICIAN");
  await expect(page.locator("#height-label")).toHaveText("HALL");
  await expect(page.locator("#board-title")).toHaveText("THE CATACOMBS");
  await expect(page.locator("#switch-back")).toBeVisible();
  await expect(page.locator("#end-run")).toBeHidden();
  await expect(page.locator("#hand")).toBeHidden();
  await expect(page.locator("#catacomb-bank")).toBeVisible();
  // A turn a second: the status line follows the Magician.
  await expect(page.locator("#message")).toContainText(/dashes|strikes|Down to Hall|Lore found|banished|shrugs/, { timeout: 4000 });
  // A tap on the crosshair: a free hit, said on the status line.
  const world = await page.locator("#world").boundingBox();
  await page.mouse.click(world.x + (([2, 4, 6, 10, 12, 14][marked] + 0.5) / 17) * world.width, world.y + (8.5 / 17) * world.height);
  await expect(page.locator("#message")).toContainText(/A crosshair (strikes|banishes)/);
  // Haste spends the bank.
  const left = (t) => { const m = /^(?:(\d+)m )?(\d+)s$/.exec(t); return Number(m[1] ?? 0) * 60 + Number(m[2]); };
  const bankBefore = left(await page.locator("#catacomb-bank-time").textContent());
  await page.selectOption("#catacomb-haste", "10");
  await page.waitForTimeout(2500);
  const bankAfter = await page.locator("#catacomb-bank-time").textContent();
  if (!/^\d+m \d\ds$|^\d+s$/.test(bankAfter)) throw new Error(`bank reads ${bankAfter}`);
  if (left(bankAfter) > bankBefore - 15) throw new Error(`haste spent too little of the bank: ${bankBefore} -> ${bankAfter}`);
  // Skills: a point into Might shows on the HUD at once; taking it back too.
  await expect(page.locator("#catacomb-menus")).toBeVisible();
  await expect(page.locator(".catacomb-free")).toHaveText("2 free");
  await page.locator('.catacomb-stat-head[data-skill="might"]').click();
  await page.locator('.catacomb-point[data-skill="might"][data-delta="1"]').click();
  await expect(page.locator("#attack")).not.toHaveText("10");
  await expect(page.locator(".catacomb-stat-lines")).toContainText("MAtk +1 a point · +1");
  await page.locator('.catacomb-point[data-skill="might"][data-delta="-1"]').click();
  await expect(page.locator("#attack")).toHaveText("10");
  // Spirit: Unlock Ability opens Spell Surge, which casts and counts down its cooldown.
  await expect(page.locator("#catacomb-abilities")).toBeHidden();
  await page.locator('[role=tab][data-menu="spirit"]').click();
  await page.locator('.catacomb-buy[data-upgrade="unlock"]').click();
  await expect(page.locator('.catacomb-upgrade[data-upgrade="unlock"]')).toContainText("1/3");
  await expect(page.locator(".catacomb-cooldown")).toHaveText("Ready");
  await page.locator('.catacomb-cast[data-cast="surge"]').hover();
  await expect(page.locator(".catacomb-tip")).toContainText("Spell Surge");
  await page.locator('.catacomb-cast[data-cast="surge"]').click();
  await expect(page.locator(".catacomb-cooldown")).toHaveText(/^\d+$/);
  await page.locator('.catacomb-auto[data-auto="surge"]').click();
  await expect(page.locator('.catacomb-auto[data-auto="surge"]')).toHaveAttribute("aria-pressed", "true");
  // The stats table, put away by a tap.
  await page.locator('[role=tab][data-menu="skills"]').click();
  await page.locator("#catacomb-stats-table").click();
  await expect(page.locator(".catacomb-stats")).toContainText("Magic skill points");
  await page.locator(".catacomb-stats").click();
  await expect(page.locator(".catacomb-stats")).toHaveCount(0);
  // The menus still to come say what they will do.
  await page.locator('[role=tab][data-menu="forge"]').click();
  await expect(page.locator("#catacomb-panel")).toContainText("Blacksmith's forge");
  await page.locator('[role=tab][data-menu="skills"]').click();
  // The enemy box opens the hall's undead.
  await page.locator("#base-enemy").click();
  await expect(page.locator(".catacomb-odds h2")).toContainText("Undead in Hall");
  await page.locator(".catacomb-odds .enemy-odds-x").click();
  await expect(page.locator(".catacomb-odds")).toHaveCount(0);
  // Switch Back: the climb's HUD, the floor it was on.
  await page.locator("#switch-back").click();
  await expect(page.locator("html")).not.toHaveClass(/catacombs/);
  await expect(page.locator("#height-label")).toHaveText("FLOOR");
  await expect(page.locator("#height")).toHaveText(floorBefore);
  await expect(page.locator("#hero-class")).not.toHaveText("MAGICIAN");
  await expect(page.locator("#switch-back")).toBeHidden();
  await expect(page.locator("#catacomb-menus")).toBeHidden();
  await expect(page.locator("nav")).toBeVisible();
  // Escape switches back too.
  await openMenu(page);
  await page.locator("#catacombs-button").click();
  await expect(page.locator("html")).toHaveClass(/catacombs/);
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).not.toHaveClass(/catacombs/);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Catacomb screen: enter, turns, a crosshair, haste, Skills, Spirit, an ability, the tables, Switch Back and Escape all work.");
} finally {
  await browser.close();
}
