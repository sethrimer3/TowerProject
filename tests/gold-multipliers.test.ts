import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { goldMultipliers, goldMultiplierTotal, silverFound } from "../src/gold-multipliers.ts";
import { addItem, equip } from "../src/equipment/inventory.ts";
import { wornEffects } from "../src/equipment/effects.ts";
import { snap } from "../src/exact.ts";
import { THEME_IDS } from "../src/theme-collection.ts";
import { rowValue } from "../src/loadout.ts";
import type { Enemy } from "../src/entities.ts";
import type { TowerRun } from "../src/runs.ts";

const NOW = 1_000_000;

/** What a run can carry that multiplies Gold or Silver, mixed. */
type Setup = { tier: number; packs: ("adFree" | "coins2" | "coins3")[]; themes: number; mantle: boolean; boost: boolean; boons: number; silverRanks: number };

const SETUPS: Setup[] = [
  { tier: 1, packs: [], themes: 0, mantle: false, boost: false, boons: 0, silverRanks: 0 },
  { tier: 3, packs: ["coins2"], themes: 3, mantle: true, boost: false, boons: 0, silverRanks: 7 },
  { tier: 5, packs: ["adFree", "coins3"], themes: 11, mantle: true, boost: true, boons: 2, silverRanks: 40 },
  { tier: 2, packs: ["adFree"], themes: 0, mantle: false, boost: true, boons: 1, silverRanks: 0 },
  { tier: 7, packs: ["adFree", "coins2", "coins3"], themes: 32, mantle: true, boost: false, boons: 3, silverRanks: 150 },
];

/** A Tower run with `setup`'s multipliers (none, for the plain run that
 * stands for Gold found before them). */
function runWith(setup: Setup | null) {
  const save = defaults();
  const g = new Game(save);
  g.newRun({ seed: 7 });
  if (!setup) {
    // Not even the theme a new save owns: Gold banked here is Gold found.
    save.themes = [];
    assert.equal(goldMultiplierTotal(goldMultipliers({ ...g.goldContext, now: NOW })), 1);
    return g;
  }
  save.entitlements = [...setup.packs];
  save.themes = THEME_IDS.slice(0, setup.themes);
  save.goldBoostUntil = setup.boost ? NOW + 60_000 : 0;
  save.archives.levels.unlockShrines = 1;
  save.upgrades.wealthy = 1;
  save.training.silverBonus = setup.silverRanks;
  save.archives.levels.silverBonus = 4;
  if (setup.mantle) {
    const e = save.equipment;
    e.unlocked = true;
    equip(e, "tower", addItem(e, "magpieMantle", "rare")!.id);
    assert.ok(wornEffects(save, "tower").goldFind > 0 && wornEffects(save, "tower").silverFind > 0);
  }
  const run = g.run as TowerRun;
  run.tier = setup.tier;
  run.shrine = { picked: Array(setup.boons).fill("gold").concat(setup.boons ? ["silver"] : []), rolls: 0 };
  return g;
}

const purse = (g: Game) => new RunPurse(g.save, g.mode, g.run, () => 0.5, NOW);
const enemy = (strength: Enemy["strength"]) => ({ strength, attack: 1, defense: 1, hp: 1 }) as Enemy;

test("every Gold a run banks is what it found times the total the HUD shows", () => {
  for (const setup of SETUPS) {
    const plain = runWith(null), rich = runWith(setup);
    const shown = goldMultiplierTotal(goldMultipliers({ ...rich.goldContext, now: NOW }));
    const p = purse(plain), r = purse(rich);
    const pays: [string, (q: RunPurse) => number][] = [
      ["a kill", (q) => q.enemyLoot(enemy("normal"), 1, 1).gold],
      ["a boss", (q) => q.enemyLoot(enemy("boss"), 2, 1).gold],
      ["an item", (q) => q.pickupGold(3, 3, 2)],
      ["a chest", (q) => q.treasure(4, 4)!.gold],
      ["Gold Touch", (q) => q.badgeGold("touch", 5)],
      ["the run's end", (q) => q.gold(17.5)],
    ];
    for (const [what, pay] of pays) {
      const found = pay(p), banked = pay(r);
      assert.ok(found > 0, what);
      assert.equal(banked, snap(found * shown), `${what}, ${JSON.stringify(setup)}`);
    }
  }
});

test("the Gold multipliers list Gold found from the hero's equipment, and paying counts it", () => {
  const g = runWith({ tier: 1, packs: [], themes: 0, mantle: true, boost: false, boons: 0, silverRanks: 0 });
  const gear = goldMultipliers(g.goldContext).find((m) => m.id === "gear")!;
  assert.equal(gear.name, "Gold Found");
  assert.equal(gear.factor, (100 + wornEffects(g.save, "tower").goldFind) / 100);
  const bare = runWith(null);
  assert.equal(goldMultipliers(bare.goldContext).find((m) => m.id === "gear")!.factor, null, "none worn: Inactive");
});

test("the Gold ad's boost and Ad-Disable are one slot: only the boost counts while it runs", () => {
  const g = runWith({ tier: 1, packs: ["adFree"], themes: 0, mantle: false, boost: true, boons: 0, silverRanks: 0 });
  const context = { ...g.goldContext, now: NOW };
  assert.equal(goldMultiplierTotal(goldMultipliers(context)), 1.5);
  const q = purse(g);
  assert.equal(q.gold(10), 15);
  assert.equal(g.save.tower.runBoostGold, 10, "what it would have banked unboosted");
  assert.equal(goldMultiplierTotal(goldMultipliers({ ...context, now: NOW + 120_000 })), 1.5, "Ad-Disable once the boost ends");
});

test("a kill's and a chest's Gold previews bank what paying then banks", () => {
  for (const setup of SETUPS) {
    const g = runWith(setup), q = purse(g);
    const preview = q.killGoldPreview(enemy("strong"), 5, 5);
    assert.equal(q.enemyLoot(enemy("strong"), 5, 5).gold, preview);
    assert.equal(q.killGoldPreview(enemy("strong"), 5, 5), 0, "paid once");
  }
});

test("Silver found, as the Training rows show it, is what paying multiplies by", () => {
  for (const setup of SETUPS) {
    const g = runWith(setup), run = g.run as TowerRun;
    const factor = silverFound(g.save, "tower", setup.silverRanks, g.boons?.silverFound);
    assert.equal(rowValue(g.save, "silverBonus", 0, { mode: "tower", run }).value, snap(factor));
    assert.equal(purse(g).silver(25), snap(25 * factor));
  }
});
