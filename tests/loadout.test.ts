import { trainNow } from "./train-now.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { StatTrainingRow } from "../src/progression/training.ts";
import { loadout, trainingBulk, trainingFull, trainingPoints, trainingStep, upgradeText, provisionOpen, provisionPrice, provisionsOpen, provisionText } from "../src/progression/loadout.ts";
import { decode, defaults } from "../src/save/save.ts";
import { GOLD_SHOP } from "../src/economy/provisions.ts";
import { LIMIT_BREAKS, TRAINING, isStatRow, trained, trainingCap, trainingCeiling, trainingWorth } from "../src/progression/training.ts";
import { UPGRADES, cost, type UpgradeId } from "../src/progression/upgrades.ts";
import { TREES } from "../src/progression/skill-trees.ts";
import { levelForXp, xpForLevel } from "../src/progression/xp.ts";
import { addItem } from "../src/equipment/inventory.ts";
import { Game } from "../src/state.ts";
import { predict } from "../src/combat.ts";
import { getTowerGateEnemy } from "../src/enemies/scaling.ts";
import { enemyStats } from "../src/enemies/curves.ts";
import { snap } from "../src/exact.ts";

test("a new character starts at 12 ATK, 0 DEF, 100 HP, no shroud, no Regen, no keys and no undo", () => {
  assert.deepEqual(loadout(defaults()), {
    attack: 12, defense: 0, maxHp: 100, shroud: 0, regen: 0, lifesteal: 0, thorns: 0, parry: 0, bossAttack: 0, pierce: 0, keys: { yellow: 0, blue: 0, red: 0 }, startKeys: { yellow: 0, blue: 0 }, undoCapacity: 0,
  });
});

test("Rehearsed steps gives the first undo; Echoes of time gives none, only research", () => {
  const s = defaults();
  s.archives.levels.undoCount = 3;
  assert.equal(loadout(s).undoCapacity, 0, "research needs one of the two skills");
  s.upgrades.undos = 1;
  assert.equal(loadout(s).undoCapacity, 3, "Echoes of time alone: research only");
  s.upgrades.inspirationUndos = 1;
  assert.equal(loadout(s).undoCapacity, 1 + 3, "Undo Count research adds to Rehearsed steps' undo");
});

test("each rank of an upgrade adds its grant", () => {
  const s = defaults();
  Object.assign(s.upgrades, {
    combatStance: 1, buildout: 1, quality: 1,
    yellow: 1, blue: 2, red: 3, undos: 1, inspirationUndos: 1, shroud: 1,
  });
  assert.deepEqual(loadout(s), {
    attack: 12 + 2,
    defense: 0 + 1,
    maxHp: 100,
    shroud: 1,
    regen: 0,
    lifesteal: 0,
    thorns: 0,
    parry: 0,
    bossAttack: 0,
    pierce: 0,
    keys: { yellow: 1, blue: 2, red: 3 },
    startKeys: { yellow: 0, blue: 0 },
    undoCapacity: 1,
  });
});

test("each level earns three training points and nothing else", () => {
  const s = defaults();
  s.xp = xpForLevel(15);
  assert.equal(levelForXp(s.xp), 15);
  assert.equal(levelForXp(s.xp - 1), 14);
  assert.deepEqual(trainingPoints(s), { earned: 45, spent: 0, left: 45 });
  assert.deepEqual(loadout(s), loadout(defaults()));
});

test("each training rank is worth more than the one before, whatever the hero's level", () => {
  const s = defaults();
  s.xp = xpForLevel(5);
  Object.assign(s.training, { hp: 3, defense: 2, attack: 1 });
  for (const [id, points] of [["hp", 3], ["defense", 2], ["attack", 0]] as const) s.trainingPaid[id].points = points;
  // Rank curves: max HP 10n + n², DEF the most of n and n²/12, ATK n + n²/5, fractions kept
  // (the page shows the stats whole).
  const l = loadout(s);
  assert.deepEqual([l.attack, l.defense, l.maxHp], [12 + 1.2, 2, 100 + 39]);
  assert.deepEqual(trainingPoints(s), { earned: 15, spent: 3 + 2, left: 10 });
  // The next rank: the 4th max HP rank adds 10 + 7 = 17, the 2nd ATK 1 + 3 / 5 = 1.6.
  assert.deepEqual(
    [trainingStep(s, "hp"), trainingStep(s, "attack")].map(({ now, next, worth, affordable }) => [now, next, worth, affordable]),
    [[139, 156, 17, true], [13, 14, 1.6, true]],
  );
  assert.equal(trainingStep({ ...s, trainingPaid: { ...s.trainingPaid, hp: { points: 13, gold: 0, ms: 0 } } }, "attack").affordable, false, "1 point a rank, none left");
  // Levelling up only earns points: ranks bought are worth what they were.
  s.xp = xpForLevel(20);
  assert.deepEqual(loadout(s), l);
  // Each rank adds more than the one before, but Lifesteal's, which each add
  // less, the percent rows', which each add the same, and DEF's first
  // twelve, 1 each.
  const flat = new Set(["thorns", "parry"]);
  for (const row of TRAINING.filter(isStatRow).filter((r) => r.id !== "lifesteal" && !flat.has(r.id)))
    for (let n = row.id === "defense" ? 12 : 1; n < 400; n++) assert.ok(trainingWorth(row, n) > trainingWorth(row, n - 1), `${row.id} rank ${n + 1}`);
  const def = TRAINING.find((r) => r.id === "defense")! as StatTrainingRow;
  for (let n = 0; n < 12; n++) assert.equal(trainingWorth(def, n), 1, `DEF rank ${n + 1} adds 1`);
  for (let n = 12; n < 400; n++) assert.ok(trainingWorth(def, n) > 1, `DEF rank ${n + 1} adds more than 1`);
  assert.equal(trained(def, 13), snap(169 / 12), "the square takes over at rank 13");
  const steal = TRAINING.find((r) => r.id === "lifesteal")! as StatTrainingRow;
  for (let n = 1; n < steal.max; n++) assert.ok(trainingWorth(steal, n) < trainingWorth(steal, n - 1) && trainingWorth(steal, n) > 0, `lifesteal rank ${n + 1}`);
});

test("Shroud's ranks: 5.1 at the first, 60 at 10, about 2,100 at 100, 15,000 at 200, 62,000 at 300 and four billion at 5,000", () => {
  const row = TRAINING.find((t) => t.id === "shroud")!;
  assert.equal(trainingCeiling(row), 5000);
  const at = (n: number) => trained(row, n);
  assert.equal(at(1), 5.1);
  assert.ok(at(2) - at(1) > 5 && at(2) - at(1) < 6, "about 5 a rank at the start");
  assert.ok(at(10) > 59 && at(10) < 61, `${at(10)}`);
  assert.ok(at(100) > 2050 && at(100) < 2200, `${at(100)}`);
  assert.ok(at(200) > 14500 && at(200) < 15500, `${at(200)}`);
  assert.ok(at(300) > 61000 && at(300) < 62500, `${at(300)}`);
  assert.ok(at(5000) > 3.9e9 && at(5000) < 4.1e9 && at(5000) > at(4999), `${at(5000)}`);
});

test("Shroud blocks 1 damage a fight and opens Shroud training", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.xp = xpForLevel(10);
  assert.equal(trainNow(g, "shroud"), false, "not before Shroud");
  assert.equal(g.run.player.shroud, undefined, "no shroud yet");
  g.save.tower.inspiration = 2;
  g.save.upgrades.trainers = 0; // trainNow owns it
  g.save.upgrades.trainers = 1;
  assert.equal(g.skills.buy("shroud"), false, "not before Larger Hand");
  g.save.upgrades.largerHand = 1;
  assert.ok(g.skills.buy("shroud"));
  assert.equal(loadout(g.save).shroud, 1);
  assert.equal(g.save.tower.inspiration, 0, "2 Inspiration");
  assert.equal(g.run.player.shroud, 1, "the run in the forest takes it at once");
  assert.ok(trainNow(g, "shroud") && trainNow(g, "shroud"));
  // Two ranks: 5 × 2 + 0.1 × 2² + 0.0000064 × 1⁴.
  const two = trained(TRAINING.find((t) => t.id === "shroud")!, 2);
  assert.ok(Math.abs(two - 10.4000064) < 1e-6, `${two}`);
  assert.equal(loadout(g.save).shroud, 1 + two);
  assert.equal(g.run.player.shroud, 1 + two, "training reaches a run still outside");
  assert.deepEqual([trainingStep(g.save, "shroud").now, trainingStep(g.save, "shroud").next], [11, 16]);
  assert.equal(trainingPoints(g.save).spent, 2, "a point a rank");
});

test("each level costs the cube of its number in XP, more in each band of 25 levels, and levels are found exactly", () => {
  assert.deepEqual([1, 5, 10, 20, 25, 26, 50, 51, 76, 101, 126].map(xpForLevel), [48, 1200, 6600, 42000, 78000, 89310, 681750, 743715, 3286283, 11811128, 38492691]);
  // Each band raises a level's cost over the base curve's 12 × level × (level + 3) by 25%, 50%, 75%, 100%, then 25% each, more than the band below.
  for (const [level, factor] of [[25, 1], [26, 1.25], [51, 1.875], [76, 3.28125], [101, 6.5625], [126, 8.203125], [151, 10.25390625]]) {
    const cost = xpForLevel(level) - xpForLevel(level - 1);
    assert.ok(Math.abs(cost - 12 * level * (level + 3) * factor) <= 1, `level ${level} costs ${cost}`);
  }
  for (const level of [0, 1, 2, 7, 25, 26, 49, 51, 76, 101, 126, 300]) {
    assert.equal(levelForXp(xpForLevel(level)), level);
    if (level) assert.equal(levelForXp(xpForLevel(level) - 1), level - 1);
  }
});

test("training spends points and reaches a run still outside", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  assert.equal(trainNow(g, "hp"), false);
  g.save.xp = xpForLevel(1);
  assert.equal(trainNow(g, "hp"), true);
  assert.deepEqual([g.run.player.maxHp, g.run.player.hp, trainingPoints(g.save).left], [111, 111, 2]);
  assert.equal(trainNow(g, "attack"), true, "ATK takes 1 point");
  assert.equal(trainNow(g, "defense"), true, "and DEF the last");
  assert.equal(trainNow(g, "defense"), false, "no points left");
});

test("evenly spread training alone still beats both modes' normal enemies at floor 100", () => {
  // The levels a hero reaches by each floor when every run climbs about 1.5
  // floors past the last, clearing the floors below again (see
  // docs/PROGRESSION_AND_DIFFICULTY.md).
  const hero = (level: number) => {
    const s = defaults(), points = 3 * level;
    s.xp = xpForLevel(level);
    // Every row costs 1 point a rank: a third of the points each.
    Object.assign(s.training, { hp: Math.floor(points / 3), defense: Math.floor(points / 3), attack: Math.floor(points / 3) });
    const l = loadout(s);
    return { x: 0, y: 0, hp: l.maxHp, maxHp: l.maxHp, attack: l.attack, defense: l.defense, keys: l.keys };
  };
  const delve = (floor: number) => ({ name: "Cinder slime", tier: 1, strength: "normal" as const, ...enemyStats("delve", 1, floor * 10, "normal", "balanced") });
  const wins = (level: number, floor: number) => [getTowerGateEnemy(floor - 1, "normal", "balanced"), delve(floor - 1)].map((e) => predict(hero(level), e).survivable);
  assert.deepEqual(wins(7, 10), [true, true]);
  assert.deepEqual(wins(28, 50), [true, true]);
  assert.deepEqual(wins(39, 75), [true, true]);
  assert.deepEqual(wins(50, 100), [true, true]);
});

test("gear adds flat bonuses, then its percentages of the total, fractions kept; provisions add nothing", () => {
  const s = defaults();
  s.equipment.unlocked = true;
  // Uncommon (×1.25): +3.75 ATK and +2.5% ATK; +37.5 max HP and +5% max HP.
  s.equipment.equipped.tower.weapon = addItem(s.equipment, "knightsSword", "uncommon")!.id;
  s.equipment.equipped.tower.chestplate = addItem(s.equipment, "giantsHauberk", "uncommon")!.id;
  Object.assign(s.provisions, { edge: 1, guard: 2, heal: 1 });
  const l = loadout(s);
  assert.equal(l.attack, 16.14375, "(12 + 3.75) × 1.025");
  assert.equal(l.defense, 0);
  assert.equal(l.maxHp, 144.375, "137.5 × 1.05");
  // The Delve's hero wears nothing yet.
  assert.equal(loadout(s, "delve").attack, 12);
});

test("descriptions are written from the grants", () => {
  const text = Object.fromEntries(UPGRADES.map((u) => [u.id, upgradeText(u.id)]));
  assert.deepEqual(
    { yellow: text.yellow, blue: text.blue, red: text.red,
      quality: text.quality, undos: text.undos, combatStance: text.combatStance, buildout: text.buildout,
      inspirationUndos: text.inspirationUndos, revive: text.revive },
    {
      yellow: "+1 starting gold key",
      blue: "+1 starting blue key",
      red: "+1 starting red key",
      quality: "+2 weapon attack and +1 armor defense",
      undos: "Open Undo Count research in the Archives, or 4 more levels of it once Rehearsed steps has opened it",
      combatStance: "Open the Deck, where you reorder the cards in your hand before a climb",
      buildout: "Unlock the Deck: add its cards to your hand, or set them aside, to choose what a climb heads for",
      inspirationUndos: "Rewind one action a climb, and open Undo Count research in the Archives, or 4 more levels of it once Echoes of time has opened it",
      revive: "When a strike would fell you, a 0.5% chance to rise at full HP and fight on: opens Revive training",
    },
  );
  assert.deepEqual(GOLD_SHOP.map((g) => provisionText(g.id)), [
    "One more elixir every climb: press it to fill HP to max HP",
    "One more Aegis charm every climb: press it for +20% DEF for 100 turns",
    "One more Vanguard Banner every climb: press it for +20% ATK for 100 turns",
    "One more gold key every 100 floors of a climb, from the floor it starts on",
    "One more Bomb every climb: press it, then an enemy's tile, to deal that enemy your ATK",
  ]);
});

test("every provision costs 100 Gold, and each one after a hundred times the last", () => {
  const s = defaults();
  for (const { id } of GOLD_SHOP)
    assert.deepEqual(Array.from({ length: 4 }, (_, n) => provisionPrice({ provisions: { ...s.provisions, [id]: n } }, id)), [100, 10_000, 1_000_000, 100_000_000], id);
  const g = new Game(s);
  s.gold = 10_500;
  s.upgrades.elixirProvision = 1;
  assert.ok(g.gear.buyProvision("heal") && g.gear.buyProvision("heal"));
  assert.equal(s.gold, 10_500 - 100 - 10_000);
  assert.equal(g.gear.buyProvision("heal"), false, "1,000,000 Gold, 400 held");
  assert.equal(s.provisions.heal, 2);
});

test("no provision is open from the start: each opens with its skill, in the Inspiration or Breakthrough tree", () => {
  const s = defaults(), g = new Game(s);
  s.gold = 1000;
  assert.equal(provisionsOpen(s), false);
  for (const { id } of GOLD_SHOP) assert.equal(g.gear.buyProvision(id), false, id);
  const skills = { heal: "elixirProvision", edge: "whetstoneProvision", guard: "aegisProvision", yellowKey: "extraKey", bomb: "bombs" } as const;
  for (const { id } of GOLD_SHOP) {
    const skill = UPGRADES.find((u) => u.id === skills[id])!;
    assert.ok(skill.currency === "inspiration" || skill.currency === "breakthrough", id);
    s.upgrades[skill.id] = 1;
    assert.ok(provisionOpen(s, id) && provisionsOpen(s), id);
    s.upgrades[skill.id] = 0;
  }
  // The Inspiration tree's three follow Regen, ATK Up and DEF Up, 5 Inspiration each.
  const at = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(["elixirProvision", "whetstoneProvision", "aegisProvision"].map((id) => [at(id).requires, cost(id as UpgradeId, 0)]),
    [[["regen"], 5], [["cardAtkUp"], 5], [["cardDefUp"], 5]]);
});

test("Extra Key opens the Gold Key provision, which adds no key to the loadout", () => {
  const s = defaults(), g = new Game(s);
  g.newRun({ outside: true });
  s.gold = 1000;
  assert.equal(g.gear.buyProvision("yellowKey"), false, "closed without Extra Key");
  s.upgrades.extraKey = 1;
  const keys = loadout(s).keys.yellow;
  assert.ok(g.gear.buyProvision("yellowKey"));
  assert.equal(s.gold, 900);
  assert.equal(loadout(s).keys.yellow, keys, "its keys come during a run");
});

/** Opens Equipment and adds a Common Knight's Sword (+3 ATK at level 1). */
function armoury(g: Game) {
  const e = g.save.equipment;
  e.unlocked = true;
  const sword = addItem(e, "knightsSword", "common")!;
  return sword.id;
}

test("changing gear mid-run keeps the ATK gathered", () => {
  const g = new Game(defaults());
  g.newRun();
  assert.equal(g.run.player.attack, 12);
  g.run.player.attack += 2; // an attack shard picked up
  const sword = armoury(g);
  assert.ok(g.equipment.equip("tower", sword));
  assert.equal(g.run.player.attack, 17);
  assert.deepEqual(g.run.loadout, { attack: 15, defense: 0, maxHp: 100 });
  g.equipment.unequip("tower", "weapon");
  assert.equal(g.run.player.attack, 14);
  assert.deepEqual(g.run.loadout, { attack: 12, defense: 0, maxHp: 100 });
  assert.equal(g.run.player.hp, 100);
});

test("a gear change reaches a run still outside, which starts at its new full HP", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  const e = g.save.equipment;
  e.unlocked = true;
  g.equipment.equip("tower", addItem(e, "knightsSword", "common")!.id);
  g.equipment.equip("tower", addItem(e, "giantsHauberk", "common")!.id);
  assert.deepEqual([g.run.player.attack, g.run.player.maxHp, g.run.player.hp], [15, 130, 130]);
});

test("ATK, DEF, Max HP, Regen and Shroud train to 1,000 levels, and each Limit Break owned raises that by 500, Shroud's but by the first eight", () => {
  const save = defaults();
  const caps = () => (["attack", "defense", "hp", "regen", "shroud"] as const).map((id) => trainingCap(TRAINING.find((t) => t.id === id)!, save.upgrades));
  assert.deepEqual(caps(), [1000, 1000, 1000, 1000, 1000]);
  assert.equal(trainingCap(TRAINING.find((t) => t.id === "lifesteal")!, save.upgrades), 80, "rows without breaks keep their most");
  save.upgrades.limitBreak1 = 1;
  assert.deepEqual(caps(), [1500, 1500, 1500, 1500, 1500]);
  for (const id of LIMIT_BREAKS) save.upgrades[id] = 1;
  assert.deepEqual(caps(), [6000, 6000, 6000, 6000, 5000]);
  assert.deepEqual(LIMIT_BREAKS.map((id) => UPGRADES.find((u) => u.id === id)!).map((u) => [u.currency, u.base, u.max]), LIMIT_BREAKS.map(() => ["breakthrough", 5, 1]));
});

test("a rank can't be trained past the cap, and a saved rank above it is kept until Limit Breaks raise the cap to it", () => {
  const save = defaults();
  save.training.attack = 999;
  assert.equal(trainingFull(save, "attack"), false);
  save.training.attack = 1000;
  assert.equal(trainingFull(save, "attack"), true, "1,000 without a Limit Break");
  assert.equal(trainingBulk(save, "attack", "max").count, 0);
  save.upgrades.limitBreak1 = 1;
  assert.equal(trainingFull(save, "attack"), false);
  const raw: any = defaults();
  raw.training.attack = 3000;
  const loaded = decode(JSON.stringify(raw));
  assert.equal(loaded.training.attack, 3000, "kept, though over the cap without Limit Breaks");
  assert.equal(trainingFull(loaded, "attack"), true);
});
