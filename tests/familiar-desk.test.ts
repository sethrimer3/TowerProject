import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILIAR_IDS, statAt } from "../src/familiars/catalog.ts";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { random } from "../src/random.ts";
import { CHECKPOINTS, goalUnlocked, unlockAt } from "../src/goals.ts";
import { RESEARCH, cannotStart } from "../src/progression/archives.ts";

/** A game with Events earned and `medals` held. */
function game(medals = 0, earned = true) {
  const save = defaults();
  if (earned) {
    const at = unlockAt("events");
    save.goals.claimed[at.tower] = [at.floor];
  }
  save.medals = medals;
  return new Game(save, random(5));
}
const COOLDOWN_SLOT = { dragon: 2, slime: 1, wolf: 1, falcon: 1, wisp: 1 } as const;

test("each egg costs more by how many are hatched, whichever it is", () => {
  const g = game(3150);
  const paid: number[] = [];
  for (const id of ["wisp", "dragon", "falcon", "slime", "wolf"] as const) {
    const before = g.save.medals;
    assert.ok(g.familiars.hatch(id), id);
    assert.ok(g.familiars.isOn(id), `${id} starts switched on`);
    paid.push(before - g.save.medals);
  }
  assert.deepEqual(paid, [150, 300, 600, 900, 1200]);
  assert.equal(g.save.medals, 0);
  assert.equal(g.familiars.hatchPrice, null);
});

test("a hatch is refused while locked, short or already hatched, paying nothing", () => {
  const locked = game(1000, false);
  assert.equal(locked.familiars.hatchRefusal("dragon"), "locked");
  assert.equal(locked.familiars.hatch("dragon"), false);
  const short = game(149);
  assert.equal(short.familiars.hatchRefusal("dragon"), "short");
  assert.equal(short.familiars.hatch("dragon"), false);
  assert.deepEqual([short.save.medals, short.save.familiars], [149, {}]);
  const g = game(1000);
  g.familiars.hatch("dragon");
  assert.equal(g.familiars.hatchRefusal("dragon"), "hatched");
  assert.equal(g.familiars.hatch("dragon"), false);
  assert.equal(g.save.medals, 850);
});

test("Access to Everything shows the eggs but sells none", () => {
  const g = game(1000, false);
  g.save.settings.accessAll = true;
  assert.ok(g.events.unlocked);
  assert.equal(g.familiars.hatchRefusal("slime"), "locked");
});

test("an upgrade costs 100, then 40 more a level, up to the stat's last", () => {
  const g = game(150 + 2800);
  g.familiars.hatch("slime");
  const prices: number[] = [];
  while (g.familiars.upgradePrice("slime", 0) !== null) {
    prices.push(g.familiars.upgradePrice("slime", 0)!);
    assert.ok(g.familiars.upgrade("slime", 0));
  }
  assert.deepEqual(prices, [100, 140, 180, 220, 260, 300, 340, 380, 420, 460]);
  assert.deepEqual([g.save.medals, g.familiars.values("slime").duration], [0, 15]);
  assert.equal(g.familiars.upgradeRefusal("slime", 0), "maxed");
  assert.equal(g.familiars.upgrade("slime", 0), false);
});

test("an upgrade is refused for an egg or while short, changing nothing", () => {
  const g = game(249);
  assert.equal(g.familiars.upgradeRefusal("wolf", 2), "unhatched");
  assert.equal(g.familiars.upgrade("wolf", 2), false);
  g.familiars.hatch("wolf");
  assert.equal(g.familiars.upgradeRefusal("wolf", 2), "short");
  assert.equal(g.familiars.upgrade("wolf", 2), false);
  assert.deepEqual([g.save.medals, g.save.familiars.wolf], [99, { levels: [0, 0, 0, 0] }]);
});

test("free purchases pay nothing", () => {
  const g = game(0);
  g.save.settings.freePurchases = true;
  assert.ok(g.familiars.hatch("falcon"));
  assert.ok(g.familiars.upgrade("falcon", 3));
  assert.deepEqual([g.save.medals, g.save.familiars.falcon], [0, { levels: [0, 0, 0, 1] }]);
});

test("a hatched familiar switches off and on, in or out of a run", () => {
  const g = game(150);
  assert.equal(g.familiars.toggle("dragon"), false);
  g.familiars.hatch("dragon");
  for (const outside of [true, false]) {
    g.newRun({ outside, seed: 8 });
    assert.ok(g.familiars.toggle("dragon"));
    assert.equal(g.familiars.isOn("dragon"), false);
    assert.ok(g.familiars.toggle("dragon"));
    assert.deepEqual(g.save.familiars.dragon, { levels: [0, 0, 0, 0] });
  }
});

test("Tower V floor 60 opens Familiar Research, keeping its premium Gems", () => {
  assert.deepEqual(unlockAt("familiarResearch"), { tower: 5, floor: 60 });
  assert.deepEqual(CHECKPOINTS[5]!.find((c) => c.floor === 60), {
    floor: 60, reward: { kind: "unlock", unlock: "familiarResearch" }, premium: { kind: "currency", currency: "gems", amount: 50 },
  });
  const g = game();
  g.save.upgrades.archives = 1;
  g.save.gold = 1e12;
  for (const id of FAMILIAR_IDS) assert.equal(cannotStart(g.save, 0, `${id}Cooldown`), "Locked.", id);
  g.save.goals.claimed[5] = [60];
  assert.ok(goalUnlocked(g.save, "familiarResearch"));
  for (const id of FAMILIAR_IDS) assert.equal(cannotStart(g.save, 0, `${id}Cooldown`), null, id);
});

test("five Cooldown projects share one schedule of 25 levels, each a turn off", () => {
  for (const id of FAMILIAR_IDS) {
    const def = RESEARCH[`${id}Cooldown`];
    assert.deepEqual(def.requires, [{ upgrade: "archives" }, { goalUnlock: "familiarResearch" }], id);
    assert.deepEqual(def.categories, ["familiars"], id);
    assert.equal(def.levels.length, 25);
    assert.deepEqual(def.levels.map((l) => [l.gold, l.hours]), RESEARCH.dragonCooldown.levels.map((l) => [l.gold, l.hours]), id);
    assert.ok(def.levels.every((l) => l.effect.target === `${id}Cooldown` && l.effect.value === 1), id);
  }
  const { levels } = RESEARCH.dragonCooldown;
  assert.deepEqual([levels[0]!.gold, Math.round(levels[0]!.hours * 60)], [30_000_000, 1440 + 14 * 60 + 53]);
  assert.deepEqual([levels[24]!.gold, Math.round(levels[24]!.hours * 60)], [398_880_000_000, 85 * 1440 + 8 * 60 + 22]);
  for (let i = 1; i < 25; i++) assert.ok(levels[i]!.gold > levels[i - 1]!.gold && levels[i]!.hours > levels[i - 1]!.hours, `level ${i + 1}`);
});

test("research shortens each Cooldown as it is read: the Dragon's to 5 turns, the others' to 50", () => {
  const g = game();
  g.save.settings.freePurchases = true;
  for (const id of FAMILIAR_IDS) {
    g.familiars.hatch(id);
    const slot = COOLDOWN_SLOT[id];
    g.save.familiars[id]!.levels[slot] = statAt(id, slot).levels;
    assert.equal(g.familiars.values(id).cooldown, id === "dragon" ? 30 : 75, id);
    g.save.archives.levels[`${id}Cooldown`] = 25;
    assert.equal(g.familiars.values(id).cooldown, id === "dragon" ? 5 : 50, id);
    assert.deepEqual(g.familiars.preview(id, slot), { now: id === "dragon" ? 5 : 50, next: null }, id);
  }
  g.save.familiars.wolf!.levels[1] = 0;
  assert.deepEqual(g.familiars.preview("wolf", 1), { now: 95, next: 92 });
  assert.deepEqual(g.familiars.preview("wolf", 2), { now: 350, next: 390 });
});
