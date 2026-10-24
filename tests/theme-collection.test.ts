import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { decodeSettings } from "../src/save/settings.ts";
import { goldMultipliers, goldMultiplierTotal } from "../src/economy/gold-multipliers.ts";
import { THEME_IDS, THEME_PRICE, canBuyTheme, gameLook, themeGoldFactor, themesOf, uiLook } from "../src/theme-collection.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

test("a new hero owns the Medieval UI theme and wears it, on the Classic board", () => {
  const save = defaults();
  assert.deepEqual(save.themes, ["medievalUi"]);
  assert.equal(uiLook(save), "medieval");
  assert.equal(gameLook(save), "classic");
});

test("Neon, Terminal, Desktop, Glyph, Ember, Yang, Yin, Shiro, Kuro, Arcade, System, Orbit, Pixel, Doodle and Murk are each a UI theme and a Game theme, each bought on its own for 1 Gold", () => {
  assert.deepEqual(themesOf("ui"), ["medievalUi", "neonUi", "terminalUi", "desktopUi", "glyphUi", "emberUi", "yangUi", "yinUi", "shiroUi", "kuroUi", "arcadeUi", "systemUi", "orbitUi", "pixelUi", "doodleUi", "murkUi"]);
  assert.deepEqual(themesOf("game"), ["neonGame", "terminalGame", "desktopGame", "glyphGame", "emberGame", "yangGame", "yinGame", "shiroGame", "kuroGame", "arcadeGame", "systemGame", "krozGame", "orbitGame", "pixelGame", "doodleGame", "murkGame"]);
  assert.deepEqual(THEME_PRICE, { currency: "gold", amount: 1 });
  const save = defaults();
  save.tower.reached = 1000;
  save.delve.reached = 1000;
  const g = new Game(save);
  assert.deepEqual(g.themes.claim(), [], "climbing earns none");
  save.gold = 0;
  assert.equal(canBuyTheme(save, "neonUi"), false, "no Gold");
  assert.equal(g.themes.buy("neonUi"), false);
  save.gold = 2.5;
  assert.ok(g.themes.buy("systemGame"));
  assert.equal(save.gold, 1.5, "1 Gold paid");
  assert.ok(g.themes.buy("neonUi"));
  assert.deepEqual(save.themes, ["medievalUi", "neonUi", "systemGame"], "kept in catalog order");
  assert.equal(g.themes.buy("neonUi"), false, "each is bought once");
  assert.equal(g.themes.buy("medievalUi"), false, "Medieval is owned from the start");
  assert.equal(save.gold, 0.5);
  assert.equal(g.themes.buy("terminalUi"), false, "short of 1 Gold");
  save.settings.freePurchases = true;
  assert.ok(g.themes.buy("terminalUi"), "free purchases pay nothing");
  assert.equal(save.gold, 0.5);
});

test("Dev mode owns every theme", () => {
  const save = defaults();
  const g = new Game(save);
  g.setDevMode(true);
  const fresh = g.themes.claim();
  assert.deepEqual(fresh, THEME_IDS.filter((id) => id !== "medievalUi"), "each announced once");
  assert.deepEqual(save.themes, THEME_IDS);
  assert.deepEqual(g.themes.claim(), []);
  assert.equal(new Game(defaults()).themes.claim().length, 0, "none without Dev mode");
});

test("the Terminal UI theme is worn once owned", () => {
  const save = defaults();
  const g = new Game(save);
  assert.equal(g.themes.wear("ui", "terminal"), false, "not owned yet");
  assert.equal(uiLook(save), "medieval");
  save.themes.push("terminalUi");
  assert.ok(g.themes.wear("ui", "terminal"));
  assert.equal(uiLook(save), "terminal");
  assert.equal(decodeSettings({ uiTheme: "terminal" }).uiTheme, "terminal", "the choice is saved");
});

test("the Desktop UI theme is worn once owned", () => {
  const save = defaults();
  const g = new Game(save);
  assert.equal(g.themes.wear("ui", "desktop"), false, "not owned yet");
  save.themes.push("desktopUi");
  assert.ok(g.themes.wear("ui", "desktop"));
  assert.equal(uiLook(save), "desktop");
  assert.equal(decodeSettings({ uiTheme: "desktop" }).uiTheme, "desktop", "the choice is saved");
});

test("the Glyph, Ember, Yang, Yin, Shiro, Kuro, Arcade, System, Orbit, Pixel, Doodle and Murk UI themes are worn once owned", () => {
  const save = defaults();
  const g = new Game(save);
  for (const [look, id] of [["glyph", "glyphUi"], ["ember", "emberUi"], ["yang", "yangUi"], ["yin", "yinUi"], ["shiro", "shiroUi"], ["kuro", "kuroUi"], ["arcade", "arcadeUi"], ["system", "systemUi"], ["orbit", "orbitUi"], ["pixel", "pixelUi"], ["doodle", "doodleUi"], ["murk", "murkUi"]] as const) {
    assert.equal(g.themes.wear("ui", look), false, `${look} not owned yet`);
    save.themes.push(id);
    assert.ok(g.themes.wear("ui", look));
    assert.equal(uiLook(save), look);
    assert.equal(decodeSettings({ uiTheme: look }).uiTheme, look, "the choice is saved");
  }
});

test("the Terminal, Desktop, Glyph, Ember, Yang, Yin, Shiro, Kuro, Arcade, System, Kroz, Orbit, Pixel, Doodle and Murk Game themes are worn once owned", () => {
  const save = defaults();
  const g = new Game(save);
  for (const [look, id] of [["terminal", "terminalGame"], ["desktop", "desktopGame"], ["glyph", "glyphGame"], ["ember", "emberGame"], ["yang", "yangGame"], ["yin", "yinGame"], ["shiro", "shiroGame"], ["kuro", "kuroGame"], ["arcade", "arcadeGame"], ["system", "systemGame"], ["kroz", "krozGame"], ["orbit", "orbitGame"], ["pixel", "pixelGame"], ["doodle", "doodleGame"], ["murk", "murkGame"]] as const) {
    assert.equal(g.themes.wear("game", look), false, `${look} not owned yet`);
    save.themes.push(id);
    assert.ok(g.themes.wear("game", look));
    assert.equal(gameLook(save), look);
    assert.equal(decodeSettings({ gameTheme: look }).gameTheme, look, "the choice is saved");
  }
});

test("a theme chosen but not owned shows Classic until it is bought", () => {
  const save = defaults();
  save.settings.uiTheme = "neon";
  save.settings.gameTheme = "neon";
  assert.equal(uiLook(save), "classic");
  assert.equal(gameLook(save), "classic");
  const g = new Game(save);
  assert.equal(g.themes.wear("game", "neon"), false, "an unowned theme can't be worn");
  assert.ok(g.themes.wear("ui", "classic"), "Classic always can");
  save.themes.push("neonGame");
  assert.ok(g.themes.wear("game", "neon"));
  assert.equal(gameLook(save), "neon");
});

test("each theme owned adds 2.5% to all Gold banked", () => {
  const save = defaults();
  assert.equal(themeGoldFactor(save), 1.025);
  save.themes = [...THEME_IDS];
  assert.equal(themeGoldFactor(save), 1.8);
  const themes = (s: typeof save) => goldMultipliers({ save: s, mode: "tower", tier: 1, now: 0 }).find((m) => m.id === "themes")!;
  assert.deepEqual(themes(save), { id: "themes", name: "Themes owned (32)", factor: 1.8 });
  assert.equal(goldMultiplierTotal(goldMultipliers({ save, mode: "tower", tier: 1, now: 0 })), 1.8);
  assert.equal(themes({ ...save, themes: [] }).factor, null, "none owned: Inactive");

  // Banking: a kill's Gold with no theme and with all of them.
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
  assert.ok(Math.abs(all - none * 1.8) < 1e-9, `${all} is ${none} × 1.8`);
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

test("a new save starts in Medieval", () => {
  assert.equal(decodeSettings({}).uiTheme, "medieval");
});
