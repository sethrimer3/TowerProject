import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { decodeSettings } from "../src/settings.ts";
import { goldBonuses, goldBonusTotal } from "../src/gold-bonuses.ts";
import { THEMES, THEME_IDS, claimThemes, gameLook, themeGoldFactor, themesOf, uiLook } from "../src/theme-collection.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

test("a new hero owns the Medieval UI theme and wears it, on the Classic board", () => {
  const save = defaults();
  assert.deepEqual(save.themes, ["medievalUi"]);
  assert.equal(uiLook(save), "medieval");
  assert.equal(gameLook(save), "classic");
});

test("Neon is a UI theme and a Game theme, and Terminal and Desktop UI themes, each earned on its own", () => {
  assert.deepEqual(themesOf("ui"), ["medievalUi", "neonUi", "terminalUi", "desktopUi"]);
  assert.deepEqual(themesOf("game"), ["neonGame"]);
  const save = defaults();
  assert.deepEqual(claimThemes(save), [], "nothing earned yet");
  save.tower.reached = 49;
  assert.deepEqual(claimThemes(save), []);
  save.tower.reached = 50;
  assert.deepEqual(claimThemes(save), ["neonUi"], "floor 50 of Tower I completed");
  assert.deepEqual(claimThemes(save), [], "each is earned once");
  save.tower.reached = 99;
  assert.deepEqual(claimThemes(save), []);
  save.tower.reached = 100;
  assert.deepEqual(claimThemes(save), ["terminalUi"], "floor 100 of Tower I completed");
  // A Delve depth in another tier's records counts.
  save.delve.tierRecords[2] = { best: 25, reached: 25 };
  assert.deepEqual(claimThemes(save), ["neonGame"]);
  save.delve.tierRecords[2] = { best: 49, reached: 49 };
  assert.deepEqual(claimThemes(save), []);
  save.delve.reached = 50;
  assert.deepEqual(claimThemes(save), ["desktopUi"], "depth 50 in the Delve");
  assert.deepEqual(save.themes, THEME_IDS, "kept in catalog order");
  // Tower I's floors count from its waiting records too, and only Tower I's.
  const other = defaults();
  other.tower.tier = 2;
  other.tower.reached = 80;
  assert.deepEqual(claimThemes(other), [], "Tower II's floors don't count");
  other.tower.tierRecords[1] = { best: 60, reached: 60 };
  assert.deepEqual(claimThemes(other), ["neonUi"]);
  other.tower.tierRecords[1] = { best: 100, reached: 100 };
  assert.deepEqual(claimThemes(other), ["terminalUi"]);
});

test("the Terminal UI theme is worn once owned", () => {
  const save = defaults();
  const g = new Game(save);
  assert.equal(g.wearTheme("ui", "terminal"), false, "not owned yet");
  assert.equal(uiLook(save), "medieval");
  save.themes.push("terminalUi");
  assert.ok(g.wearTheme("ui", "terminal"));
  assert.equal(uiLook(save), "terminal");
  assert.equal(decodeSettings({ uiTheme: "terminal" }).uiTheme, "terminal", "the choice is saved");
});

test("the Desktop UI theme is worn once owned", () => {
  const save = defaults();
  const g = new Game(save);
  assert.equal(g.wearTheme("ui", "desktop"), false, "not owned yet");
  save.themes.push("desktopUi");
  assert.ok(g.wearTheme("ui", "desktop"));
  assert.equal(uiLook(save), "desktop");
  assert.equal(decodeSettings({ uiTheme: "desktop" }).uiTheme, "desktop", "the choice is saved");
});

test("a theme chosen but not owned shows Classic until it is earned", () => {
  const save = defaults();
  save.settings.uiTheme = "neon";
  save.settings.gameTheme = "neon";
  assert.equal(uiLook(save), "classic");
  assert.equal(gameLook(save), "classic");
  const g = new Game(save);
  assert.equal(g.wearTheme("game", "neon"), false, "an unowned theme can't be worn");
  assert.ok(g.wearTheme("ui", "classic"), "Classic always can");
  save.themes.push("neonGame");
  assert.ok(g.wearTheme("game", "neon"));
  assert.equal(gameLook(save), "neon");
});

test("each theme owned adds 2.5% to all Gold banked", () => {
  const save = defaults();
  assert.equal(themeGoldFactor(save), 1.025);
  save.themes = [...THEME_IDS];
  assert.equal(themeGoldFactor(save), 1.125);
  const row = goldBonuses(save, 1, 0).at(-1)!;
  assert.deepEqual(row, { name: "Themes owned (5)", factor: 1.125 });
  assert.equal(goldBonusTotal(goldBonuses(save, 1, 0)), 1.125);
  assert.equal(goldBonuses({ ...save, themes: [] }, 1, 0).at(-1)!.factor, null, "none owned: Inactive");

  // Banking: a kill's Gold with no theme and with all five.
  const killGold = (themes: typeof save.themes) => {
    const s = defaults();
    s.themes = themes;
    const g = new Game(s);
    (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "enemy", enemy: { name: "Rat", hp: 1, attack: 0, defense: 0, strength: "normal" } }]]);
    Object.assign(g.run.player, { x: 0, y: 0, attack: 100 });
    const before = g.save.gold;
    assert.ok(g.move(1, 0));
    return g.save.gold - before;
  };
  const none = killGold([]), all = killGold([...THEME_IDS]);
  assert.ok(none > 0);
  assert.ok(Math.abs(all - none * 1.125) < 1e-9, `${all} is ${none} × 1.125`);
});

test("saves keep their themes, always with Medieval", () => {
  const save = defaults();
  save.themes = ["medievalUi", "neonGame"];
  assert.deepEqual(decode(JSON.stringify(save)).themes, ["medievalUi", "neonGame"]);
  const raw = JSON.parse(JSON.stringify(save));
  raw.themes = ["neonGame", "bogus", "neonGame"];
  assert.deepEqual(decode(JSON.stringify(raw)).themes, ["medievalUi", "neonGame"]);
  delete raw.themes;
  assert.deepEqual(decode(JSON.stringify(raw)).themes, ["medievalUi"], "an old save gets Medieval");
});

test("older saves' Medieval and Neon toggles become the UI and Game themes", () => {
  const old = (medievalTheme: boolean, neonTheme: boolean) => decodeSettings({ medievalTheme, neonTheme });
  assert.deepEqual([old(false, false).uiTheme, old(false, false).gameTheme], ["classic", "classic"], "a hero who never chose Medieval keeps the Classic page");
  assert.deepEqual([old(true, false).uiTheme, old(true, false).gameTheme], ["medieval", "classic"]);
  assert.deepEqual([old(false, true).uiTheme, old(false, true).gameTheme], ["neon", "neon"]);
  assert.equal(decodeSettings({}).uiTheme, "medieval", "a new save starts in Medieval");
  assert.equal(decodeSettings({ medievalTheme: false, uiTheme: "neon" }).uiTheme, "neon", "a saved choice wins");
});

test("every theme names how it is earned", () => {
  for (const id of THEME_IDS) assert.ok(THEMES[id].unlock.length > 0, id);
});
