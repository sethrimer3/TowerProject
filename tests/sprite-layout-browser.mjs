// Content must fit inside the visible PNG trim, including the narrow HUD.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { openMenu } from "./run-menu.mjs";
import { fixClock } from "./fixed-clock.mjs";
const server = await createServer({ server: { host: "127.0.0.1", port: 5193 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium" });
mkdirSync("test-results/sprite-layout", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fixClock(page);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    globalThis.__handHeld = true; globalThis.__handStartsPaused = true;
    const fixture = sessionStorage.getItem("__fontFixture");
    if (fixture) { localStorage.setItem("towerdelve.v1", fixture); sessionStorage.removeItem("__fontFixture"); }
  });
  await page.goto(server.resolvedUrls.local[0]); await page.locator("#hp").waitFor();
  const seed = async (settings = {}, large = false, outside = false, packed = false) => {
    await page.evaluate(async ({ settings, large, outside, packed }) => {
      const { defaults } = await import("/src/save/save.ts"); const { Game } = await import("/src/state.ts");
      const { THEME_IDS } = await import("/src/theme-collection.ts");
      const s = defaults(); Object.keys(s.tutorials).forEach(k => s.tutorials[k] = true);
      s.upgrades.combatStance = 1;
      s.themes = [...THEME_IDS]; s.equipment.unlocked = true;
      Object.assign(s.settings, { reduceMotion: true, transition: "instant", devMode: true, weatherSound: false }, settings);
      const g = new Game(s); g.newRun({ seed: 7, outside });
      if (!outside) { g.advanceTowerRoom(); g.advanceTowerRoom(); }
      if (large) {
        s.upgrades.shroud = 1; Object.assign(g.run.player, { hp: 999_999_999, maxHp: 999_999_999, attack: 999_999_999, defense: 999_999_999, shroud: 999_999_999 });
      }
      if (packed) {
        const { xpForLevel } = await import("/src/progression/xp.ts");
        s.settings.devMode = false;
        s.gems = 264; s.gold = 6688; g.run.silver = 1434;
        s.tower.tiersOpen = 2;
        Object.assign(s.upgrades, { archives: 1, ignore: 1, target: 1, undos: 1, shroud: 1 });
        Object.assign(s.provisions, { bomb: 1, heal: 1, edge: 1, guard: 1 });
        s.archives.levels.unlockShrines = 1;
        s.archives.levels.undoCount = 2;
        s.xp = xpForLevel(31) + 200;
        Object.assign(g.run.player, { hp: 1603, maxHp: 1603, attack: 360, defense: 175, shroud: 371, keys: { yellow: 33, blue: 12, red: 4 } });
        g.run.shrine = { picked: [], rolls: 0, offer: ["attack", "goldMaxHp"] };
      }
      sessionStorage.setItem("__fontFixture", JSON.stringify(g.save));
    }, { settings, large, outside, packed });
    await page.reload(); await page.locator("#hp").waitFor(); await page.evaluate(() => document.fonts.ready);
  };
  const ready = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.querySelectorAll("#stats .sprite-icon")].every(e => e.classList.contains("sprite-ready")));
  };
  const family = selector => page.locator(selector).evaluate(e => getComputedStyle(e).fontFamily);
  const fit = async selector => {
    const failures = await page.locator(selector).evaluateAll(buttons => buttons.flatMap(button => {
      const style = getComputedStyle(button), box = button.getBoundingClientRect();
      if (!box.width || !box.height || style.visibility === "hidden") return [];
      const left = box.left + parseFloat(style.borderLeftWidth), right = box.right - parseFloat(style.borderRightWidth);
      const top = box.top + parseFloat(style.borderTopWidth), bottom = box.bottom - parseFloat(style.borderBottomWidth);
      const problems = [], check = (rect, label) => {
        if (rect.width && rect.height && (rect.left < left - 1 || rect.right > right + 1 || rect.top < top - 1 || rect.bottom > bottom + 1))
          problems.push(`${button.id || button.className}: ${label} outside inner frame [${[rect.left-left, right-rect.right, rect.top-top, bottom-rect.bottom].map(n => n.toFixed(1))}]`);
      };
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim() || getComputedStyle(node.parentElement).visibility === "hidden") continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const rect of range.getClientRects()) check(rect, node.textContent.trim());
      }
      for (const icon of button.querySelectorAll(".sprite-icon")) check(icon.getBoundingClientRect(), "PNG icon");
      return problems;
    }));
    assert.deepEqual(failures, [], `${page.viewportSize().width}px ${await page.locator("html").getAttribute("class")}`);
  };
  await seed(); assert.ok((await family("#gold-ad")).includes("Tower Pixel"));
  await openMenu(page); await page.locator("#auto-settings").click();
  await page.evaluate(() => document.fonts.ready);
  await fit("#settings button");
  await page.locator("#settings-back").click(); await ready();
  assert.ok((await family("#gold-ad")).includes("Tower Pixel"));
  assert.equal(await page.evaluate(() => document.fonts.check('16px "Tower Pixel"')), true);
  const controls = "#gold-ad, #gem-ad, #gold-bonus, #base-enemy, #run-menu-toggle, #run-shop, #auto, .hp-readout, .portrait-top";
  for (const width of [320, 360, 390, 768, 1100]) {
    await page.setViewportSize({ width, height: 844 }); await ready();
    await fit(controls);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px page fits`);
    await page.locator("#stats").screenshot({ path: `test-results/sprite-layout/hud-${width}.png` });
    await openMenu(page); await fit("#run-menu button");
    await page.locator("#run-menu-toggle").click();
  }
  // The portrait shares the lower row with inventory, leaving vitals free
  // to span both columns. The second progress bar must stay below XP.
  for (const settings of [{}, { uiTheme: "neon" }]) {
    await seed(settings, false, false, true); await ready();
    await page.locator("#auto").click();
    await page.waitForFunction(() => document.querySelector("#auto-state").textContent === "PLAYING");
    for (const width of [320, 360, 390, 480, 768, 1100]) {
      await page.setViewportSize({ width, height: 844 }); await ready();
      const layout = await page.evaluate(() => {
        const box = s => document.querySelector(s).getBoundingClientRect().toJSON();
        return Object.fromEntries([".player-stats", ".vitals", ".portrait-top", ".run-inventory", "#xp", "#shrine-bar", ".xp-track", ".shrine-track"].map(s => [s, box(s)]));
      });
      const p = layout[".portrait-top"], v = layout[".vitals"], i = layout[".run-inventory"], s = layout[".player-stats"];
      assert.equal(await page.locator(".run-consumables > :visible").count(), 7, "all limited-use items are present");
      assert.ok(v.width >= s.width - 1 && v.bottom <= p.top && v.bottom <= i.top, `${width}px vitals span the upper row`);
      assert.ok(p.right <= i.left && p.top < i.bottom, `${width}px portrait sits beside inventory`);
      assert.ok(layout["#xp"].bottom <= layout["#shrine-bar"].top && layout["#shrine-bar"].bottom <= p.bottom, `${width}px Shrine progress below XP, inside portrait`);
      assert.ok(layout[".xp-track"].width >= 12 && layout[".shrine-track"].width >= 12, `${width}px both progress tracks remain visible`);
      await fit(".purse, .portrait-top, .run-inventory, .hp-readout, #gold-ad, #gem-ad, #auto, #run-menu-toggle, #run-shop");
      const items = await page.locator(".run-consumables > :visible").evaluateAll(es => es.map(e => e.getBoundingClientRect().toJSON()));
      assert.equal(items[0].top, items[1].top, `${width}px inventory fits at least two items per row`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px packed HUD fits`);
      const labelLines = await page.locator("#auto-state").evaluate(e => { const r = document.createRange(); r.selectNodeContents(e); return r.getClientRects().length; });
      assert.equal(labelLines, 1, `${width}px play/pause label stays whole`);
      if (!settings.uiTheme)
        await page.locator("#stats").screenshot({ path: `test-results/sprite-layout/hud-packed-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#shrine-bar").focus(); await page.keyboard.press("Enter");
    assert.ok(await page.locator("#modal").isVisible(), "Shrine progress still opens boon details by keyboard");
    await page.locator("#shrine-close").click();
    if (!settings.uiTheme)
      await page.screenshot({ path: "test-results/sprite-layout/hud-reflow-390.png", animations: "disabled" });
  }
  await seed({}); await ready();
  await page.setViewportSize({ width: 320, height: 844 });
  await seed({}, true); await ready();
  await page.locator("#stats").screenshot({ path: "test-results/sprite-layout/hud-large-320.png" });
  await fit(controls);
  assert.ok(await page.locator(".combat-stats").evaluate(e => e.scrollWidth <= e.clientWidth + 1), "large stats and shroud fit");
  await page.locator("#stats").screenshot({ path: "test-results/sprite-layout/hud-large-320.png" });
  await page.locator("#gold-bonus").click(); await fit(".gold-bonus-box button"); await page.locator(".gold-bonus-x").click();
  await page.locator("#base-enemy").click(); await fit(".enemy-odds-box button"); await page.locator(".enemy-odds-x").click();
  await page.reload(); await ready(); assert.ok((await family("#gold-ad")).includes("Tower Pixel"), "font persists with Sprites");
  await page.setViewportSize({ width: 390, height: 844 });
  await openMenu(page); await page.locator("#run-research").click();
  await page.waitForFunction(() => document.querySelector("#research").classList.contains("active"));
  await page.evaluate(() => document.fonts.ready);
  await fit("#research button:not(.skill-node), .training-row > span.training-box");
  await page.screenshot({ path: "test-results/sprite-layout/training-390.png", animations: "disabled" });
  await seed({}, false, true); await ready();
  await page.locator('[data-tab="deck"]').click();
  await fit("#deck button:not(.badge-token):not(.hand-card):not(.deck-add):not(.deck-card):not(.deck-entry-art)");
  await page.locator('[data-tab="shop"]').click();
  await fit("#shop button");
  // Independent theme overrides, using real reloaded saves.
  await seed({ uiTheme: "neon" });
  assert.ok(!(await family("#gold-ad")).includes("Tower Pixel"));
  assert.ok(await page.locator("html").evaluate(e => e.classList.contains("game-sprites")));
  await seed({ gameTheme: "neon" }); await ready();
  assert.ok((await family("#gold-ad")).includes("Tower Pixel"));
  assert.equal(await page.locator("html").evaluate(e => e.classList.contains("game-sprites")), false);
  await seed({ uiTheme: "neon" }); assert.ok((await family("#gold-ad")).startsWith("Cinzel"));
  assert.deepEqual(errors, []);
  console.log("HUD button content fits at 320–1100px; Training, Settings, Deck and Shop fit; custom font loads, persists and respects theme overrides.");
} finally { await browser.close(); await server.close(); }
