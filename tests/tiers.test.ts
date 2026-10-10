import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { ENEMY_GOLD, xpForKill } from "../src/config.ts";
import { MODES } from "../src/modes.ts";
import { snap } from "../src/exact.ts";
import { TIERS, TIER_BONUS_TENTHS, TIER_STEP_FACTORS, tierXp, tierBonusText, tierGold, tierNumeral, tierShard, tierStats, tierTile } from "../src/tiers.ts";
import { resolveStep, type StepEffect } from "../src/step-effects.ts";
import type { Enemy, Mode, Tile } from "../src/entities.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

const enemy = (strength: Enemy["strength"]): Enemy => ({ name: "Test", hp: 10, attack: 5, defense: 2, tier: 1, strength });

/** A Tower run inside in `tier` on an open 5×5 floor, a strong hero at (0, 0) and `foe` beside it. */
function arena(tier: number, foe: Enemy, height = 3) {
  const save = defaults();
  save.tower.tiersOpen = tier;
  save.tower.tier = tier;
  const g = new Game(save);
  g.run.height = height;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("1,0", { kind: "enemy", enemy: foe });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 1000, defense: 1000, hp: 100 });
  return g;
}

test("each tier multiplies the last's enemy stats and XP (×5, ×4, then ×3), and pays more Gold: ×2, ×3.1, ×4.3, … ×11.8", () => {
  assert.deepEqual(Array.from({ length: TIERS }, (_, i) => tierStats(i + 1)), [1, 5, 20, 60, 180, 540, 1620, 4860, 14580]);
  assert.deepEqual(TIER_BONUS_TENTHS, [10, 20, 31, 43, 56, 70, 85, 101, 118]);
  assert.deepEqual([1, 2, 3, 9].map(tierBonusText), ["×1", "×2", "×3.1", "×11.8"]);
  assert.deepEqual([tierXp(1, 7), tierXp(2, 7), tierXp(3, 10), tierXp(4, 1)], [7, 35, 200, 60]);
  assert.deepEqual([1, 4, 9].map(tierNumeral), ["I", "IV", "IX"]);
  const tile: Tile = { kind: "enemy", enemy: enemy("normal") };
  assert.equal(tierTile(tile, 1), tile);
  assert.deepEqual(tierTile(tile, 3), { kind: "enemy", enemy: { ...enemy("normal"), hp: 200, attack: 100, defense: 40 } });
  assert.deepEqual(tierTile({ kind: "potion", amount: 35 } as Tile, 3), { kind: "potion", amount: 35 });
});

test("ATK and DEF shards give 1 in the first tier, ×2.75 compounding each tier after", () => {
  assert.deepEqual([1, 2, 3, 4].map(tierShard), [1, 2.75, 7.5625, 20.796875]);
  const hero = { x: 0, y: 0, hp: 10, maxHp: 10, attack: 5, defense: 2, keys: { yellow: 0, blue: 0, red: 0 } };
  for (const kind of ["attack", "defense"] as const) {
    const gain = (tier: number) => (resolveStep(hero, tierTile({ kind }, tier)) as StepEffect).player[kind] - hero[kind];
    assert.deepEqual([gain(1), gain(2), gain(3)], [1, 2.75, 7.5625], kind);
  }
});

test("past the first, a tier's boards are the one before's with each matching enemy's stats multiplied", () => {
  for (const mode of ["tower", "delve"] as Mode[]) {
    const g = new Game(defaults());
    g.save.upgrades.delve = 1;
    g.switchMode(mode);
    assert.equal(g.mode, mode);
    g.newRun({ seed: 11 });
    const run = g.run, profile = MODES[mode] as (typeof MODES)["tower"];
    // The first tier keeps blue and red keys for later floors (key-schedule.test.ts).
    const one = profile.board({ ...run, tier: 2 } as never), three = profile.board({ ...run, tier: 3 } as never);
    let enemies = 0;
    const up = TIER_STEP_FACTORS[2]!; // tier 2 to tier 3
    for (let y = 0; y < 17; y++)
      for (let x = 0; x < one.width; x++) {
        const a = one.tile(x, y), b = three.tile(x, y);
        if (a.kind === "attack" || a.kind === "defense") { assert.deepEqual([a.amount, b], [tierShard(2), { ...a, amount: tierShard(3) }]); continue; }
        // Each tier has its own wooden share (`towerWoodPercent`), so a door
        // stays a door, Wooden or yellow; a Wooden Door's durability grows
        // with the enemies' stats.
        if (a.kind === "door") {
          if (a.door?.type === "wood" && b.kind === "door" && b.door?.type === "wood") assert.deepEqual(b, { ...a, door: { ...a.door, durability: snap(a.door.durability * up) } });
          else assert.equal(b.kind, "door");
          continue;
        }
        if (a.kind !== "enemy") { assert.deepEqual(b, a); continue; }
        // Each tier deals its own profile shares and starts its rosters a
        // zone further along, so an enemy stays an enemy, and one of the
        // same strength and profile has the step's factor times the stats.
        assert.equal(b.kind, "enemy");
        if (a.enemy!.strength !== b.enemy!.strength || a.enemy!.profile !== b.enemy!.profile) continue;
        enemies++;
        const { hp, attack, defense } = { hp: snap(a.enemy!.hp * up), attack: snap(a.enemy!.attack * up), defense: snap(a.enemy!.defense * up) };
        assert.deepEqual([b.enemy!.hp, b.enemy!.attack, b.enemy!.defense], [hp, attack, defense], "the step's factor times the second tier's");
      }
    assert.ok(enemies > 0, `${mode} has enemies to compare`);
  }
});

test("kills in a higher tier pay its Gold bonus and its stat factor in XP, and the same Silver", () => {
  const one = arena(1, enemy("strong")), three = arena(3, enemy("strong"));
  assert.ok(one.move(1, 0) && three.move(1, 0));
  assert.equal(one.save.gold, ENEMY_GOLD.strong);
  assert.equal(three.save.gold, tierGold(3, ENEMY_GOLD.strong));
  assert.equal(three.save.gold, 6.2, "Gold keeps its fraction");
  assert.equal(three.save.xp, tierXp(3, xpForKill("strong", 3)));
  assert.equal(three.silver, one.silver);
  assert.equal(three.run.tier, 3);
  assert.equal(one.run.tier, undefined, "the first tier's runs carry no tier");
});

test("beating the floor-100 boss opens nothing by itself: its floor's goal opens the next tier (goals.test.ts)", () => {
  const g = arena(1, enemy("boss"), 99);
  assert.ok(g.move(1, 0));
  assert.deepEqual([g.save.tower.tiersOpen, g.save.delve.tiersOpen], [1, 1]);
  assert.doesNotMatch(g.message, /opened/);
});

test("the Delve's caves follow the Towers opened", () => {
  const saved: any = JSON.parse(JSON.stringify(defaults()));
  saved.tower.tiersOpen = 2;
  saved.delve.tiersOpen = 5;
  assert.equal(decode(JSON.stringify(saved)).delve.tiersOpen, 2, "a save's caves follow its Towers");
  saved.tower.tiersOpen = 4;
  assert.equal(decode(JSON.stringify(saved)).delve.tiersOpen, 4);
});

test("choosing a tier in the forest swaps in its own records; inside, or a closed one, is refused", () => {
  const g = new Game(defaults());
  const slice = g.save.tower;
  slice.tiersOpen = 2;
  assert.equal(g.selectTier(2), false, "not while a run is inside");
  g.newRun({ outside: true });
  Object.assign(slice, { best: 120, reached: 120 });
  assert.equal(g.selectTier(3), false, "not a tier not yet open");
  assert.ok(g.selectTier(2));
  assert.equal(g.run.tier, 2);
  assert.equal(g.run.outside, true);
  assert.deepEqual([slice.best, slice.reached], [0, 0]);
  assert.match(g.message, /Tower II · ×2 Gold · ×5 XP/);
  slice.reached = 4;
  assert.ok(g.selectTier(1));
  assert.equal(g.run.tier, undefined);
  assert.deepEqual([slice.best, slice.reached], [120, 120]);
  assert.deepEqual(slice.tierRecords["2"], { best: 0, reached: 4 });
});

test("each tier pays its own milestones again", () => {
  const g = new Game(defaults());
  g.save.tower.tiersOpen = 2;
  g.run.height = 9;
  g.recordProgress();
  assert.equal(g.save.tower.inspiration, 9);
  g.newRun({ outside: true });
  g.selectTier(2);
  g.newRun({});
  g.run.height = 9;
  g.recordProgress();
  assert.equal(g.save.tower.inspiration, 18, "tier II's first ten floors pay again");
});

test("the tiers survive a save and reload; bad ones fall back", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.save.tower.tiersOpen = g.save.delve.tiersOpen = 3;
  g.switchMode("delve");
  g.newRun({ outside: true });
  g.selectTier(3);
  g.save.delve.tierRecords["1"]!.reached = 50;
  const back = decode(JSON.stringify(g.save));
  assert.deepEqual([back.delve.tier, back.delve.tiersOpen, back.delve.tierRecords], [3, 3, { "1": { best: 50, reached: 50 } }]);
  assert.equal(back.delve.run!.tier, 3);
  const bad = decode(JSON.stringify({ ...g.save, tower: { ...g.save.tower, tiersOpen: 12 }, delve: { ...g.save.delve, tiersOpen: 12, tier: 5, tierRecords: { "7": { best: 1, reached: 1 } }, run: { ...g.save.delve.run, tier: 1 } } }));
  assert.deepEqual([bad.delve.tiersOpen, bad.delve.tier, bad.delve.tierRecords], [1, 1, {}]);
  assert.equal(bad.delve.run!.tier, undefined);
});
