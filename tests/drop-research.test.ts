// Tower IV's floor 70 Goal and the two Archives projects it opens:
// Common Drop Chance (a boss's chance of a Common piece, RunPurse.killDrops)
// and Daily Mission Materials (missionReward's materials).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { CHECKPOINTS, unlockAt } from "../src/goals.ts";
import { duration, RESEARCH, RESEARCH_TARGETS } from "../src/progression/archives.ts";
import { MISSION_MATERIALS, missionReward } from "../src/missions/catalog.ts";
import { itemDef } from "../src/equipment/catalog.ts";
import type { Enemy } from "../src/entities.ts";

const enemy = (strength: Enemy["strength"]): Enemy => ({ name: "Test", hp: 10, attack: 1, defense: 0, strength });
/** A stream that returns `values` in turn, then the last forever. */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};
const minutes = (level: { hours: number }) => Math.round(level.hours * 60);

test("Tower IV's floor 70 opens both projects and pays 500,000 Gold premium", () => {
  assert.deepEqual(unlockAt("dropResearch"), { tower: 4, floor: 70 });
  assert.deepEqual(CHECKPOINTS[4]!.find((c) => c.floor === 70)!.premium, { kind: "currency", currency: "gold", amount: 500_000 });
  for (const id of ["commonDrop", "missionMaterials"] as const) {
    assert.deepEqual(RESEARCH[id].requires, [{ upgrade: "archives" }, { goalUnlock: "dropResearch" }]);
  }
});

test("Common Drop Chance: 10 levels of +0.1%, 5M Gold and 4d 4h 0m to 7.32B and 8d 5h 0m", () => {
  const levels = RESEARCH.commonDrop.levels;
  assert.equal(levels.length, 10);
  assert.deepEqual([levels[0]!.gold, minutes(levels[0]!)], [5e6, (4 * 24 + 4) * 60]);
  assert.deepEqual([levels[2]!.gold, minutes(levels[2]!)], [114_250_000, (4 * 24 + 20) * 60 + 50]);
  assert.deepEqual([levels[9]!.gold, minutes(levels[9]!)], [7_320_000_000, (8 * 24 + 5) * 60]);
  assert.equal(RESEARCH_TARGETS.commonDrop.shown(10), "1%");
  assert.equal(duration(defaults().archives, levels[0]!), (4 * 24 + 4) * 3_600_000);
});

test("Daily Mission Materials: 50 levels of +1, 1.2M Gold and 1d 9h 19m to 352.9B and 12d 7h 36m", () => {
  const levels = RESEARCH.missionMaterials.levels;
  assert.equal(levels.length, 50);
  assert.deepEqual([levels[0]!.gold, minutes(levels[0]!)], [1_200_000, (24 + 9) * 60 + 19]);
  assert.deepEqual([levels[27]!.gold, minutes(levels[27]!)], [59_050_000_000, (4 * 24 + 12) * 60 + 48]);
  assert.deepEqual([levels[49]!.gold, minutes(levels[49]!)], [352_900_000_000, (12 * 24 + 7) * 60 + 36]);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i]!.gold > levels[i - 1]!.gold && levels[i]!.hours > levels[i - 1]!.hours, `level ${i + 1}`);
});

test("each level of Daily Mission Materials adds one material to every daily mission", () => {
  const save = defaults();
  save.tower.tiersOpen = 4;
  assert.equal(missionReward(save, "rivets").materials, MISSION_MATERIALS[3]);
  save.archives.levels.missionMaterials = 50;
  assert.deepEqual(missionReward(save, "rivets"), { gems: 3, gold: 30_000, material: "rivets", materials: MISSION_MATERIALS[3] + 50 });
});

test("Common Drop Chance gives bosses alone a separate roll for a Common Standard piece", () => {
  const kill = (strength: Enemy["strength"], rolls: number[], level: number) => {
    const s = defaults();
    s.equipment.unlocked = true;
    s.archives.levels.commonDrop = level;
    const g = new Game(s, seq(rolls));
    g.newRun({ seed: 3, height: 9 });
    return { loot: (g as any).purse.enemyLoot(enemy(strength), 4, strength.length), e: g.save.equipment };
  };
  // The run start draws one, the material and piece rolls miss (0.5), then the Common roll.
  for (const strength of ["boss", "greaterBoss"] as const) {
    const { loot, e } = kill(strength, [0.5, 0.5, 0.5, 0.0099], 10);
    assert.equal(loot.equipment.length, 1, `${strength}: under 1%`);
    assert.equal(e.items.length, 1);
    assert.equal(e.items[0]!.rarity, "common");
    assert.equal(itemDef(e.items[0]!.def)!.class, "standard");
    assert.deepEqual(kill(strength, [0.5, 0.5, 0.5, 0.01], 10).loot.equipment, [], "1% and up: nothing");
    assert.deepEqual(kill(strength, [0.5, 0.5, 0.5, 0.0009], 1).loot.equipment.length, 1, "level 1: under 0.1%");
    assert.deepEqual(kill(strength, [0.5, 0.5, 0.5, 0.001], 1).loot.equipment, [], "level 1: 0.1% and up: nothing");
    assert.deepEqual(kill(strength, [0.5, 0.5, 0.5, 0], 0).loot.equipment, [], "no roll untrained");
  }
  assert.deepEqual(kill("elite", [0], 10).loot.equipment, [], "other kills never");
});
