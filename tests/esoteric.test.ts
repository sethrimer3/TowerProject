// Esoteric Training and Esoteric Research (docs/agents/progression.md): the
// 1,000-level Training rows start at 500, and the Archives projects of 100
// or 150 levels 50 short, until the skill and the Goal open the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { TRAINING, trainingCap, trainingCeiling } from "../src/progression/training.ts";
import { ESOTERIC_LEVELS, maxLevel, RESEARCH, RESEARCH_IDS, status } from "../src/progression/archives.ts";
import { checkpoint, goalUnlocked } from "../src/goals.ts";
import { UPGRADES } from "../src/progression/upgrades.ts";

const LONG_ROWS = ["attack", "defense", "hp", "regen", "shroud"] as const;
const row = (id: string) => TRAINING.find((t) => t.id === id)!;

test("ATK, DEF, Max HP, Regen and Shroud train to 500 until Esoteric Training raises them 500 more, under the Limit Breaks", () => {
  const save = defaults();
  assert.deepEqual(LONG_ROWS.map((id) => trainingCap(row(id), save.upgrades)), [500, 500, 500, 500, 500]);
  save.upgrades.esotericTraining = 1;
  assert.deepEqual(LONG_ROWS.map((id) => trainingCap(row(id), save.upgrades)), [1000, 1000, 1000, 1000, 1000]);
  save.upgrades.limitBreak1 = 1;
  assert.deepEqual(LONG_ROWS.map((id) => trainingCap(row(id), save.upgrades)), [1500, 1500, 1500, 1500, 1500]);
  assert.deepEqual(LONG_ROWS.map((id) => trainingCeiling(row(id))), [6000, 6000, 6000, 6000, 5000], "the most a saved rank may hold is as before");
  assert.equal(trainingCap(row("parry"), defaults().upgrades), 100, "no other row moves");
  const skill = UPGRADES.find((u) => u.id === "esotericTraining")!;
  assert.deepEqual([skill.name, skill.base, skill.max, skill.currency], ["Esoteric Training", 2, 1, "breakthrough"]);
});

test("Tower VI's floor 150 Goal is Esoteric Research, which opens the last 50 levels of every 100- or 150-level project", () => {
  assert.deepEqual(checkpoint(6, 150), { floor: 150, reward: { kind: "unlock", unlock: "esotericResearch" }, premium: { kind: "currency", currency: "gold", amount: 20_000_000 } });
  const save = defaults();
  const long = RESEARCH_IDS.filter((id) => [100, 150].includes(RESEARCH[id].levels.length));
  assert.ok(long.includes("researchSpeed") && long.includes("potionHp") && long.includes("attack"));
  for (const id of long) assert.equal(maxLevel(id, save), RESEARCH[id].levels.length - ESOTERIC_LEVELS, id);
  assert.equal(maxLevel("parry", save), 50, "a 50-level project is whole");
  assert.equal(maxLevel("researchSpeed"), 100, "without an owner, every level");
  // Short of the Goal, a project at its 50th level is complete.
  save.upgrades.archives = 1;
  save.goals.claimed[1] = [150];
  save.archives.levels.researchSpeed = 50;
  assert.equal(status(save, "researchSpeed"), "completed");
  save.goals.claimed[6] = [150];
  assert.ok(goalUnlocked(save, "esotericResearch"));
  assert.equal(maxLevel("researchSpeed", save), 100);
  assert.equal(status(save, "researchSpeed"), "available");
});
