import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { decodeSettings } from "../src/save/settings.ts";
import { goldMultipliers, goldMultiplierTotal } from "../src/economy/gold-multipliers.ts";
import { THEME_GOLD_PER_MILLE, THEME_IDS, TRACK_GOLD_PER_MILLE, collectionGoldFactor, gameLook, grantTheme, themesOf, uiLook } from "../src/theme-collection.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

test("a new hero owns no theme and wears Classic, page and board", () => {
  const save = defaults();
  assert.deepEqual(save.themes, []);
  assert.equal(uiLook(save), "classic");
  assert.equal(gameLook(save), "classic");
});

test("every theme but Classic is a UI or Game theme, earned only in an event's Store", () => {
  assert.ok(themesOf("ui").includes("medievalUi"), "Medieval is one to earn");
  assert.equal(themesOf("ui").length + themesOf("game").length, THEME_IDS.length);
  const save = defaults();
  save.tower.reached = 1000;
  save.delve.reached = 1000;
  const g = new Game(save);
  assert.deepEqual(g.themes.claim(), [], "climbing earns none");
  assert.equal("buy" in g.themes, false, "the Themes page sells none");
  grantTheme(save, "systemGame");
  grantTheme(save, "neonUi");
  grantTheme(save, "neonUi");
  assert.deepEqual(save.themes, ["neonUi", "systemGame"], "each once, in catalog order");
});

test("Dev mode owns every theme", () => {
  const save = defaults();
  const g = new Game(save);
  g.setDevMode(true);
  const fresh = g.themes.claim();
  assert.deepEqual(fresh, THEME_IDS, "each announced once");
  assert.deepEqual(save.themes, THEME_IDS);
  assert.deepEqual(g.themes.claim(), []);
  assert.equal(new Game(defaults()).themes.claim().length, 0, "none without Dev mode");
});

test("the Terminal UI theme is worn once owned", () => {
  const save = defaults();
  const g = new Game(save);
  assert.equal(g.themes.wear("ui", "terminal"), false, "not owned yet");
  assert.equal(uiLook(save), "classic");
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

test("the Event Collection: each UI theme, Game theme and bonus track owned adds its share to all Gold banked", () => {
  const save = defaults();
  const collection = (s: typeof save) => goldMultipliers({ save: s, mode: "tower", tier: 1, now: 0 }).find((m) => m.id === "collection")!;
  assert.equal(collection(save).factor, null, "none owned: Inactive");
  save.themes = ["neonUi", "neonGame"];
  const both = (1000 + THEME_GOLD_PER_MILLE.ui + THEME_GOLD_PER_MILLE.game) / 1000;
  assert.equal(collectionGoldFactor(save), both);
  assert.deepEqual(collection(save), { id: "collection", name: "Event Collection", factor: both });
  save.music = ["track"];
  assert.equal(collectionGoldFactor(save), (1000 + THEME_GOLD_PER_MILLE.ui + THEME_GOLD_PER_MILLE.game + TRACK_GOLD_PER_MILLE) / 1000, "a track's share adds in");
  save.music = [];
  save.themes = [...THEME_IDS];
  const all = collectionGoldFactor(save);
  assert.equal(goldMultiplierTotal(goldMultipliers({ save, mode: "tower", tier: 1, now: 0 })), all);

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
  const none = killGold([]), owned = killGold([...THEME_IDS]);
  assert.ok(none > 0);
  assert.ok(Math.abs(owned - none * all) < 1e-9, `${owned} is ${none} × ${all}`);
});

test("saves keep their themes", () => {
  const save = defaults();
  save.themes = ["medievalUi", "neonGame"];
  assert.deepEqual(decode(JSON.stringify(save)).themes, ["medievalUi", "neonGame"]);
  const raw = JSON.parse(JSON.stringify(save));
  raw.themes = ["neonGame", "bogus", "neonGame"];
  assert.deepEqual(decode(JSON.stringify(raw)).themes, ["neonGame"]);
  delete raw.themes;
  assert.deepEqual(decode(JSON.stringify(raw)).themes, [], "none without");
});

test("a new save starts in Classic", () => {
  assert.equal(decodeSettings({}).uiTheme, "classic");
});
