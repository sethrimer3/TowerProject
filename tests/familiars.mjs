// Familiars in the real app (node tests/familiars.mjs, with a dev server running
// or TEST_URL): the Familiars tab at phone and desktop widths, hatching and its
// reveal, upgrades, the dialog when Medals fall short, the switch mid-climb, the
// Settings toggle, and the board's sprites, areas, flames and burn icon in every
// Game theme and Battery saver. Review images go to test-results/familiars/.
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fixClock } from "./fixed-clock.mjs";

const OUT = "test-results/familiars";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await fixClock(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const seeded = sessionStorage.getItem("familiarsFixture");
    if (seeded) {
      localStorage.setItem("towerdelve.v1", seeded);
      sessionStorage.removeItem("familiarsFixture");
    }
  });
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });

  /** Loads a profile with Events earned: in the forest, or inside with `board`'s state. */
  async function load({ medals = 0, familiars = {}, settings = {}, board = null, boosted = false } = {}) {
    await page.evaluate(async (given) => {
      const { defaults } = await import("/src/save/save.ts"), { Game } = await import("/src/state.ts");
      const { unlockAt } = await import("/src/goals.ts"), { getTowerGateEnemy } = await import("/src/enemies/scaling.ts");
      const { eventAt } = await import("/src/events/catalog.ts");
      const save = defaults(), at = unlockAt("events");
      for (const key of Object.keys(save.tutorials)) save.tutorials[key] = true;
      save.goals.claimed[at.tower] = [at.floor];
      save.tower.reached = save.tower.best = 80;
      save.medals = given.medals;
      save.familiars = given.familiars;
      if (given.boosted) save.events.boosted = [eventAt(Date.now())];
      Object.assign(save.settings, given.settings);
      const g = new Game(save);
      g.newRun({ seed: 21, outside: !given.board });
      if (given.board) {
        const { run } = g;
        Object.assign(run.player, { attack: 100, defense: 1e6, hp: 1e6, maxHp: 1e6 });
        run.familiars = given.board.run ?? {};
        for (const { x, y, marks } of given.board.enemies ?? [])
          run.changes[`${x},${y}`] = { kind: "enemy", enemy: { ...getTowerGateEnemy(0, "normal", "balanced"), hp: 100000 }, ...marks };
      }
      sessionStorage.setItem("familiarsFixture", JSON.stringify(g.save));
    }, { medals, familiars, settings, board, boosted });
    await page.reload({ waitUntil: "domcontentloaded" });
    // Battery saver hides the menu, so the board says the game has started.
    await expect(page.locator("#world")).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(700);
  }
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("towerdelve.v1")));
  async function openTab() {
    const button = page.locator("#events-button");
    if (await page.evaluate(() => !!document.querySelector("#run-menu-items #events-button"))) await page.locator("#run-menu-toggle").click();
    await button.click();
    await page.locator('[data-event-tab="familiars"]').click();
    await expect(page.locator("#familiar-list .familiar-row")).toHaveCount(5);
  }
  const overflow = () => page.evaluate(() => {
    const wide = [...document.querySelectorAll("#events, #familiar-list, .familiar-row, .familiar-stat, .familiar-hatch, dialog[open]")].filter((e) => e.scrollWidth > e.clientWidth + 1);
    return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: wide.map((e) => `${e.id || e.className}: ${e.textContent.slice(0, 30)}`) };
  });
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const modal = page.locator("dialog[open]");
  const DEFAULT = [0, 0, 0, 0];
  const ALL = Object.fromEntries(["dragon", "slime", "wolf", "falcon", "wisp"].map((id) => [id, { levels: DEFAULT }]));
  const MAXED = { dragon: { levels: [30, 15, 15, 25] }, slime: { levels: [10, 15, 20, 15] }, wolf: { levels: [15, 15, 30, 18] }, falcon: { levels: [15, 15, 30, 20] }, wisp: { levels: [15, 15, 30, 18] } };

  // --- Eggs, the confirmation and the hatch ---
  await load({ medals: 460 });
  await openTab();
  await expect(page.locator(".event-tabs button")).toHaveText(["Missions", "Store", "Familiars"]);
  await expect(page.locator(".familiar-hatch")).toHaveCount(5);
  await expect(page.locator('[data-familiar-hatch="wolf"] b')).toHaveText("150");
  await shot("tab-eggs");
  expect(await overflow()).toEqual({ page: 0, wide: [] });

  await page.locator('[data-familiar-hatch="dragon"]').click();
  await expect(modal.locator("#confirm")).toHaveAttribute("aria-label", "Hatch for 150 Medals");
  await modal.screenshot({ path: `${OUT}/confirm-hatch.png` });
  await modal.locator("#confirm").click();
  const reveal = page.locator(".hatch-reveal");
  await expect(reveal).toBeVisible();
  expect((await saved()).familiars.dragon).toBeTruthy();
  await page.mouse.click(20, 20);
  await expect(reveal).toBeVisible();
  const opened = Date.now();
  // Date stands still in the page, not here, and its animations run.
  for (const [name, at] of [["rise", 250], ["wobble", 1500], ["crack", 3000], ["zenith", 4700]]) {
    const wait = at - (Date.now() - opened);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${OUT}/hatch-${name}.png`, animations: "allow" });
  }
  await expect(reveal.locator(".hatch-name")).toHaveText("Dragon hatched!");
  await page.mouse.click(20, 20);
  await expect(reveal).toHaveCount(0);
  await expect(page.locator('[data-familiar="dragon"] .familiar-stat')).toHaveCount(4);
  await expect(page.locator('[data-familiar-hatch="wolf"] b')).toHaveText("300");
  await expect(page.locator("#event-medals-held")).toHaveText("310");
  await shot("tab-hatched");

  // --- An upgrade and the summary ---
  await page.locator('[data-familiar-stat="dragon:0"]').click();
  await expect(modal.locator("p")).toContainText("×5 → ×14.5");
  await modal.screenshot({ path: `${OUT}/confirm-upgrade.png` });
  await modal.locator("#confirm").click();
  await expect(page.locator('[data-familiar-stat="dragon:0"] b')).toHaveText("×14.5");
  await expect(page.locator('[data-familiar-stat="dragon:0"] .familiar-stat-cost')).toHaveText("140");
  expect((await saved()).medals).toBe(210);
  await page.locator('[data-familiar-about="dragon"]').click();
  await expect(modal.getByRole("cell", { name: "×24", exact: true })).toBeVisible();
  await modal.screenshot({ path: `${OUT}/summary.png` });
  await modal.locator("#familiar-ok").click();

  // --- Short of Medals: the Booster, then (boosted) where Medals come from ---
  const egg = page.locator('[data-familiar-hatch="wolf"]');
  await expect(egg).toHaveClass(/unaffordable/);
  await egg.click();
  await expect(modal.locator("#familiar-boost-buy")).toContainText("$9.99");
  await expect(modal).toContainText("90 more needed");
  await modal.screenshot({ path: `${OUT}/short.png` });
  await modal.locator("#familiar-boost-buy").click();
  await expect(modal.locator("#familiar-boost-message")).toHaveText("The store isn't open yet.");
  await modal.locator("#familiar-short-cancel").click();

  await load({ familiars: ALL, boosted: true });
  await openTab();
  const poor = page.locator('[data-familiar-stat="dragon:1"]');
  await expect(poor).toHaveClass(/unaffordable/);
  await expect(poor).toBeEnabled();
  await shot("tab-short");
  await poor.click();
  await expect(modal).toContainText("The event's missions pay more.");
  await expect(modal.locator("#familiar-boost-buy")).toHaveCount(0);
  await modal.locator("#familiar-ok").click();

  // --- Maxed, at every width ---
  await load({ familiars: MAXED, medals: 5000 });
  await openTab();
  await expect(page.locator(".familiar-stat.maxed")).toHaveCount(20);
  await expect(page.locator("button.familiar-stat")).toHaveCount(0);
  for (const [width, height] of [[320, 640], [390, 844], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await shot(`tab-max-${width}`);
    expect(await overflow(), `width ${width}`).toEqual({ page: 0, wide: [] });
    await page.locator('[data-familiar-about="slime"]').click();
    await modal.screenshot({ path: `${OUT}/summary-${width}.png` });
    expect(await overflow(), `summary at ${width}`).toEqual({ page: 0, wide: [] });
    await modal.locator("#familiar-ok").click();
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // --- The tab in every UI theme ---
  const UI_THEMES = ["classic", "medieval", "neon", "terminal", "desktop", "glyph", "ember", "yang", "yin", "shiro", "kuro", "arcade", "system", "orbit", "pixel", "doodle", "murk", "battery"];
  const MIXED = { dragon: { levels: [30, 2, 0, 4] }, wolf: { levels: DEFAULT, off: true } };
  for (const uiTheme of UI_THEMES) {
    await load({ familiars: MIXED, medals: 170, settings: { uiTheme, devTools: true, accessAll: true } });
    await openTab();
    // Past the page's fade in.
    await page.waitForTimeout(uiTheme === "medieval" ? 1800 : 150);
    await shot(`ui-${uiTheme}`);
    expect((await overflow()).page, uiTheme).toBe(0);
    const box = await page.locator('[data-familiar-switch="wolf"]').boundingBox();
    expect(Math.round(box.width), `${uiTheme}'s switch keeps its size`).toBe(36);
    expect(Math.round(box.height), `${uiTheme}'s switch keeps its size`).toBe(18);
  }

  // --- The board ---
  const world = page.locator("#world");
  /** How many pixels of a tile's middle top, where the burn icon stands (the
   * Tower's view is the whole 17 by 17), hold exactly the icon's colours: the
   * torches' flicker tints the floor and enemy, and never the icon over them. */
  const iconPixels = (x, y) => world.evaluate((c, [x, y]) => {
    const copy = document.createElement("canvas");
    copy.width = c.width;
    copy.height = c.height;
    const d = copy.getContext("2d", { willReadFrequently: true });
    d.drawImage(c, 0, 0);
    const s = c.width / 17, data = d.getImageData(Math.round((x + 8 / 24) * s), Math.round((16 - y) * s), Math.round((8 / 24) * s), Math.round((8 / 24) * s)).data;
    const flame = [[0x69, 0x32, 0x39], [0xa6, 0x54, 0x4e], [0xb2, 0x8a, 0x52], [0xe1, 0xbb, 0x78], [0xee, 0xe0, 0xb7]];
    let found = 0;
    for (let i = 0; i < data.length; i += 4) if (flame.some((rgb) => rgb.every((v, k) => Math.abs(v - data[i + k]) <= 3))) found++;
    return found;
  }, [x, y]);
  const still = { reduceMotion: true };
  const dragon = { dragon: { levels: DEFAULT } };
  // Far from the Dragon, so it never flies over the enemy looked at.
  const burning = (marks) => ({ run: { dragon: { turns: 0, timer: 50 } }, enemies: [{ x: 3, y: 13, marks }] });

  await load({ familiars: dragon, settings: still, board: burning({}) });
  const plain = await iconPixels(3, 13);
  await load({ familiars: dragon, settings: still, board: burning({ burn: 100 }) });
  const burned = await iconPixels(3, 13);
  await world.screenshot({ path: `${OUT}/board-burn.png` });
  expect(burned - plain, "the burn icon shows").toBeGreaterThan(20);
  // After a reload it still does.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#run-menu-toggle")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(700);
  expect((await iconPixels(3, 13)) - plain, "and after a reload").toBeGreaterThan(20);
  await load({ familiars: { dragon: { levels: DEFAULT, off: true } }, settings: still, board: burning({ burn: 100 }) });
  expect((await iconPixels(3, 13)) - plain, "none while the Dragon is off").toBeLessThan(8);

  const everything = {
    run: {
      dragon: { turns: 10, timer: 40 }, slime: { turns: 22, timer: 90 }, falcon: { turns: 31, timer: 80, left: 9 }, wisp: { turns: 25, timer: 70, left: 9 },
      wolf: { turns: 12, timer: 60, left: 9, casts: 1, at: { x: 4, y: 11 } },
    },
    enemies: [{ x: 3, y: 13, marks: { burn: 100 } }, { x: 5, y: 12, marks: { burn: 100, stun: 4, linger: { turns: 3, slow: 20 } } }, { x: 11, y: 5, marks: { stun: 3 } }],
  };
  await load({ familiars: ALL, board: everything });
  await world.screenshot({ path: `${OUT}/board-all.png`, animations: "allow" });

  const GAME_THEMES = ["neon", "terminal", "desktop", "glyph", "ember", "yang", "yin", "shiro", "kuro", "arcade", "system", "kroz", "orbit", "pixel", "doodle", "murk", "battery"];
  for (const gameTheme of GAME_THEMES) {
    await load({ familiars: ALL, board: everything, settings: { ...still, gameTheme, devTools: true, accessAll: true } });
    await world.screenshot({ path: `${OUT}/board-${gameTheme}.png` });
  }
  await load({ familiars: ALL, board: everything, settings: { batterySaver: true } });
  await world.screenshot({ path: `${OUT}/board-battery-saver.png` });

  // --- A real turn sets off the Dragon and the Slime ---
  const due = {
    run: { dragon: { turns: 0, timer: 1 }, slime: { turns: 0, timer: 1 } },
    enemies: [{ x: 12, y: 8, marks: {} }, { x: 8, y: 13, marks: {} }],
  };
  await load({ familiars: { dragon: { levels: DEFAULT }, slime: { levels: DEFAULT } }, board: due });
  await page.locator("#hand .hand-card").first().click();
  await page.waitForTimeout(120);
  await world.screenshot({ path: `${OUT}/board-fired.png`, animations: "allow" });
  await expect.poll(async () => Object.values((await saved()).tower.run.changes).some((t) => t.burn), { timeout: 15000 }).toBe(true);
  expect(Object.values((await saved()).tower.run.changes).some((t) => t.linger)).toBe(true);

  // --- The switch, mid-climb ---
  await load({ familiars: ALL, board: everything });
  await openTab();
  const toggle = page.locator('[data-familiar-switch="falcon"]');
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const after = await saved();
  expect(after.familiars.falcon.off).toBe(true);
  expect(after.tower.run.familiars.falcon.left).toBeUndefined();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  // --- Reduce motion's hatch ---
  await load({ medals: 150, settings: still });
  await openTab();
  await page.locator('[data-familiar-hatch="wisp"]').click();
  await modal.locator("#confirm").click();
  await page.waitForTimeout(120);
  await expect(page.locator(".hatch-reveal.still .hatch-name")).toHaveText("Wisp hatched!");
  await expect(page.locator(".hatch-reveal .hatch-egg")).toBeHidden();
  await shot("hatch-still");
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await expect(page.locator(".hatch-reveal")).toHaveCount(0);

  // --- The Settings toggle ---
  await load({ familiars: dragon });
  await page.locator("#run-menu-toggle").click();
  await page.locator("#auto-settings").click();
  await page.locator("#toggles-open").click();
  await page.locator("#familiar-toggles summary").click();
  await page.locator("#dragon-damage").click();
  await shot("toggles");
  expect((await saved()).settings.dragonDamage).toBe(false);

  expect(errors).toEqual([]);
  console.log(`Familiars browser checks passed; review images in ${OUT}/.`);
} finally {
  await browser.close();
}
