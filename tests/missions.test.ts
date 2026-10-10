import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, load } from "../src/save.ts";
import { SAVE_KEY } from "../src/config.ts";
import {
  MISSION_CAPACITY, MISSION_EVERY_MS, MISSION_GOLD, MISSION_MATERIALS, MISSION_TYPES, MISSIONS,
  WEEKLY_MAX, WEEKLY_REWARDS, weeklyReward, type MissionType,
} from "../src/missions/catalog.ts";
import { decodeMissions, defaultMissions, isComplete, missionPeriod, missionWeek, weekEndsAt } from "../src/missions/progress.ts";
import { enemyFirstFloor } from "../src/enemy-schedule.ts";
import { keyFirstFloor } from "../src/key-schedule.ts";
import { DAY_MS } from "../src/shop/clock.ts";
import { CURRENCIES } from "../src/shop/currency.ts";
import type { Enemy, Save, Tile } from "../src/entities.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

/** Monday 5 October 2026, 00:00 GMT. */
const MONDAY = Date.UTC(2026, 9, 5);
const HOUR = 3_600_000;

/** A game on `save` (a fresh one, with the first run's lesson read) whose clock reads `at`. */
function gameAt(at: number, save: Save = defaults()) {
  save.tutorials.climb = true;
  const g = new Game(save);
  g.clock = () => at;
  return g;
}
/** Gives the player one incomplete mission of each type in `types`. */
function withMissions(g: Game, ...types: MissionType[]) {
  const m = g.save.missions;
  m.list = types.map((type, i) => ({ id: i + 1, type, progress: 0, material: "silk" as const }));
  m.nextId = types.length + 1;
  m.period = missionPeriod(g.clock());
}
const progress = (g: Game, type: MissionType) => g.missions.list.find((m) => m.type === type)?.progress;

const enemy = (strength: Enemy["strength"]): Enemy => ({ name: "rat", hp: 1, attack: 0, defense: 0, tier: 0, strength });
/** The Tower hero at (0, 0) with `tiles` to its right, one a step. */
function corridor(g: Game, ...tiles: Tile[]) {
  (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ...tiles.map((t, i) => [`${i + 1},0`, t] as [string, Tile])]);
  Object.assign(g.run.player, { x: 0, y: 0 });
}

test("the clock: 8-hour periods from 00:00 GMT, weeks from Monday 00:00 GMT", () => {
  assert.equal(MISSION_EVERY_MS, 8 * HOUR);
  assert.equal(missionPeriod(MONDAY + 8 * HOUR) - missionPeriod(MONDAY + 8 * HOUR - 1), 1);
  assert.equal(missionPeriod(MONDAY + 16 * HOUR) - missionPeriod(MONDAY), 2);
  const week = missionWeek(MONDAY);
  assert.equal(missionWeek(MONDAY - 1), week - 1, "Sunday's last moment is last week");
  assert.equal(missionWeek(MONDAY + 7 * DAY_MS - 1), week);
  assert.equal(missionWeek(MONDAY + 7 * DAY_MS), week + 1);
  assert.equal(weekEndsAt(week), MONDAY + 7 * DAY_MS);
});

test("two missions come at once, then two every 8 hours, up to 8 incomplete", () => {
  const g = gameAt(MONDAY + HOUR);
  assert.equal(g.missions.list.length, 0);
  assert.ok(g.missions.refresh());
  assert.equal(g.missions.list.length, 2);
  assert.equal(g.missions.refresh(), false, "nothing more in the same period");
  g.clock = () => MONDAY + 8 * HOUR;
  assert.ok(g.missions.refresh());
  assert.equal(g.missions.list.length, 4);
  // A day away gives three periods' worth, but never more than 8 incomplete.
  g.save.upgrades.cardBadges = g.save.upgrades.onTheJob = g.save.upgrades.focus = 1;
  g.clock = () => MONDAY + 32 * HOUR;
  g.missions.refresh();
  assert.equal(g.missions.open, MISSION_CAPACITY);
  // Missions never expire; a completed one waiting to be claimed still
  // takes its room, until it is claimed.
  const first = g.missions.list[0]!;
  first.progress = MISSIONS[first.type].target;
  g.clock = () => MONDAY + 40 * HOUR;
  assert.equal(g.missions.refresh(), false);
  assert.ok(g.missions.full);
  assert.deepEqual([g.missions.open, g.missions.list.length], [MISSION_CAPACITY - 1, MISSION_CAPACITY]);
  assert.ok(g.missions.claim(first.id));
  g.clock = () => MONDAY + 48 * HOUR;
  g.missions.refresh();
  assert.deepEqual([g.missions.open, g.missions.list.length], [MISSION_CAPACITY, MISSION_CAPACITY]);
});

test("no two incomplete missions share a type, and none asks for what isn't unlocked", () => {
  for (let seed = 0; seed < 20; seed++) {
    const g = gameAt(MONDAY);
    g.save.missions.rng = seed * 7919;
    for (let h = 0; h < 80; h += 8) {
      g.clock = () => MONDAY + h * HOUR;
      g.missions.refresh();
      const open = g.missions.list.filter((m) => !isComplete(m)).map((m) => m.type);
      assert.equal(new Set(open).size, open.length);
      // Complete one now and then, so its type may come again.
      if (h % 24 === 0 && g.missions.list[0]) g.missions.list[0].progress = MISSIONS[g.missions.list[0].type].target;
    }
    // A new player can only be offered what anyone can do.
    const types = new Set(g.missions.list.map((m) => m.type));
    for (const t of types) assert.ok(["floors", "bosses", "train", "basic", "potions"].includes(t), t);
  }
});

test("each locked mission is offered once what it needs is unlocked", () => {
  const save = defaults(), offered = (t: MissionType) => MISSIONS[t].offered(save);
  for (const t of ["strong", "elite", "badge", "runTraining", "blueKeys", "redKeys", "focus"] as const) assert.equal(offered(t), false, t);
  save.upgrades.onTheJob = 1;
  save.upgrades.focus = 1;
  save.upgrades.cardBadges = 1;
  assert.ok(offered("runTraining") && offered("focus") && offered("badge"));
  // Enemies and keys: from the floor they first stand on, in any open tower.
  save.tower.best = enemyFirstFloor("strong", 1) - 2;
  assert.equal(offered("strong"), false);
  save.tower.best = enemyFirstFloor("strong", 1) - 1;
  assert.ok(offered("strong"));
  assert.equal(offered("elite"), false);
  save.tower.best = keyFirstFloor("blue", 1) - 1;
  assert.ok(offered("blueKeys") && offered("elite"));
  assert.equal(offered("redKeys"), false);
  // A later tower's record counts by its own schedule, wherever it is kept.
  save.tower.best = 0;
  save.tower.tiersOpen = 3;
  save.tower.tierRecords[3] = { best: keyFirstFloor("red", 3) - 1, reached: 0 };
  assert.ok(offered("redKeys"));
  // So does the Delve, by equivalent floor.
  const delve = defaults();
  delve.delve.best = (enemyFirstFloor("elite", 1) - 1) * 10;
  assert.ok(MISSIONS.elite.offered(delve));
});

test("kills count by strength, once a tile, so undo can't count one twice", () => {
  const g = gameAt(MONDAY);
  g.save.upgrades.inspirationUndos = 1;
  withMissions(g, "basic", "strong", "elite", "bosses");
  const tiles: Tile[] = (["normal", "weak", "strong", "elite", "boss", "greaterBoss"] as const).map((s) => ({ kind: "enemy", enemy: enemy(s) }));
  corridor(g, ...tiles);
  assert.ok(g.move(1, 0));
  assert.equal(progress(g, "basic"), 1);
  // Undo brings the enemy back (the board is rebuilt: lay the corridor again).
  assert.ok(g.undo());
  corridor(g, ...tiles);
  assert.ok(g.move(1, 0));
  assert.equal(progress(g, "basic"), 1, "the same kill again counts nothing");
  for (let i = 0; i < 5; i++) assert.ok(g.move(1, 0));
  assert.deepEqual(["basic", "strong", "elite", "bosses"].map((t) => progress(g, t as MissionType)), [2, 1, 1, 2]);
});

test("potions and blue and red keys count when picked up; floors as they are climbed for the first time", () => {
  const g = gameAt(MONDAY);
  withMissions(g, "potions", "blueKeys", "redKeys", "floors");
  corridor(g, { kind: "potion" }, { kind: "key", color: "yellow" }, { kind: "key", color: "blue" }, { kind: "key", color: "red" }, { kind: "stairs" });
  for (let i = 0; i < 5; i++) assert.ok(g.move(1, 0));
  assert.deepEqual(["potions", "blueKeys", "redKeys", "floors"].map((t) => progress(g, t as MissionType)), [1, 1, 1, 1]);
  // Down and up again is no new floor.
  const height = g.run.height;
  g.run.maxHeight = height;
  (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "stairs" }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
  g.run.height = height - 1;
  assert.ok(g.move(1, 0));
  assert.equal(progress(g, "floors"), 1);
});

test("run training and Focus count only past the most the run has had, so undo can't farm them", () => {
  const g = gameAt(MONDAY);
  g.save.upgrades.onTheJob = 1;
  g.save.upgrades.inspirationUndos = 1;
  withMissions(g, "runTraining");
  g.run.silver = 1e6;
  assert.ok(g.trainInRun("attack"));
  assert.ok(g.trainInRun("attack"));
  assert.equal(progress(g, "runTraining"), 2);
  assert.ok(g.undo());
  assert.ok(g.trainInRun("attack"));
  assert.equal(progress(g, "runTraining"), 2, "the rank undone and bought again counts once");
  assert.ok(g.trainInRun("defense"));
  assert.equal(progress(g, "runTraining"), 3);
  // The marks are per run: a new run's purchases count from nothing.
  g.missions.mark("focus", "tower", 1, 1);
  g.missions.mark("focus", "tower", 1, 1);
  assert.equal(g.save.missions.marks["focus:tower:1"], 1);
});

test("Training ranks and badges drawn count through the desks", () => {
  const g = gameAt(MONDAY);
  withMissions(g, "train", "badge");
  g.save.xp = 1e6;
  assert.ok(g.training.train("attack"));
  assert.equal(progress(g, "train"), 1);
  g.save.upgrades.cardBadges = 1;
  g.save.gems = 1000;
  assert.ok(g.badges.draw(1));
  assert.equal(progress(g, "badge"), 1);
});

test("a completed mission is claimed once for 3 Gems, its tower's Gold and material", () => {
  const g = gameAt(MONDAY);
  withMissions(g, "floors");
  assert.equal(g.missions.claim(1), null, "not before it is complete");
  assert.equal(g.missions.waiting, false);
  g.missions.record("floors", 25);
  assert.equal(progress(g, "floors"), 10, "progress stops at the target");
  assert.ok(g.missions.waiting);
  const paid = g.missions.claim(1)!;
  assert.deepEqual([paid.gems, paid.gold, paid.material], [3, 100, undefined], "Tower I pays no material");
  assert.deepEqual([g.save.gems, g.save.gold], [3, 100]);
  assert.equal(g.missions.list.length, 0);
  assert.equal(g.missions.claim(1), null);
  // By the highest tower open.
  assert.deepEqual([...MISSION_GOLD], [100, 1000, 10000, 30000, 100000, 300000, 1000000, 3000000, 10000000]);
  assert.deepEqual([...MISSION_MATERIALS], [0, 3, 5, 8, 12, 15, 20, 25, 30]);
  g.save.tower.tiersOpen = 4;
  withMissions(g, "bosses");
  g.missions.record("bosses", 3);
  const four = g.missions.claim(1)!;
  assert.deepEqual([four.gold, four.material], [30000, { id: "silk", amount: 8 }]);
  assert.equal(g.save.equipment.materials.silk, 8);
});

test("every 5 missions completed in the week opens a weekly reward, claimed once, until the week turns", () => {
  const g = gameAt(MONDAY + 2 * DAY_MS);
  assert.equal(WEEKLY_MAX, 35);
  assert.deepEqual(WEEKLY_REWARDS.map((w) => [w.missions, w.gold, w.gems, w.medals, w.shards]),
    [[5, 3, 10, 0, 0], [10, 4, 15, 10, 0], [15, 5, 20, 15, 0], [20, 7, 25, 20, 0], [25, 10, 30, 25, 10], [30, 15, 35, 30, 15], [35, 20, 50, 35, 20]]);
  for (let i = 0; i < 10; i++) {
    withMissions(g, "potions");
    g.missions.record("potions", 20);
  }
  assert.equal(g.missions.week.completed, 10, "counted as each completes, claimed or not");
  assert.ok(g.missions.weeklyReady(0) && g.missions.weeklyReady(1));
  assert.equal(g.missions.weeklyReady(2), false);
  g.save.tower.tiersOpen = 2;
  assert.deepEqual(weeklyReward(g.save, 1), { gold: 4000, gems: 15, medals: 10, shards: 0 });
  const paid = g.missions.claimWeekly(1)!;
  assert.deepEqual([g.save.gold, g.save.gems, g.save.medals, g.save.ascensionShards], [4000, 15, 10, 0]);
  assert.equal(paid.medals, 10);
  assert.equal(g.missions.claimWeekly(1), null, "once a week");
  assert.equal(g.missions.claimWeekly(2), null, "not before it is reached");
  assert.ok(g.missions.waiting, "reward 0 still waits");
  // Monday 00:00 GMT starts the tally over, and the rewards can be earned again.
  g.clock = () => MONDAY + 7 * DAY_MS;
  assert.equal(g.missions.week.completed, 0);
  assert.equal(g.missions.weeklyReady(0), false);
  assert.equal(CURRENCIES.medals.balance(g.save), 10);
});

test("missions save and load, and malformed state is dropped", () => {
  const g = gameAt(MONDAY);
  g.missions.refresh();
  g.missions.record(g.missions.list[0]!.type, 1);
  g.save.medals = 7;
  const store = new Map([[SAVE_KEY, JSON.stringify(g.save)]]);
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem() {}, removeItem() {} };
  const back = load();
  delete (globalThis as any).localStorage;
  assert.deepEqual(back.missions, g.save.missions);
  assert.equal(back.medals, 7);
  assert.deepEqual(decodeMissions(null), defaultMissions());
  const bad = decodeMissions({
    list: [
      { id: 1, type: "floors", progress: 3, material: "silk" },
      { id: 1, type: "potions", progress: 0, material: "silk" }, // a repeated id
      { id: 2, type: "floors", progress: 0, material: "silk" }, // a second incomplete of a type
      { id: 3, type: "nope", progress: 0, material: "silk" },
      { id: 4, type: "bosses", progress: 9, material: "silk" }, // past the target
      { id: 5, type: "bosses", progress: 3, material: "gravel" },
      { id: 6, type: "floors", progress: 10, material: "amber" }, // complete: may share a type
      ...[7, 8, 9, 10, 11, 12, 13].map((id) => ({ id, type: "train", progress: 1, material: "silk" })), // past 8 in all
    ],
    period: 5, nextId: 2, rng: 12, week: { id: 3, completed: 7, claimed: [0, 1, 1, 9] }, counted: ["a", 3], marks: { x: 2, y: -1 },
  });
  assert.deepEqual(bad.list.map((m) => m.id), [1, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(bad.nextId, 13);
  assert.deepEqual(bad.week, { id: 3, completed: 7, claimed: [0] }, "a reward claimed must have been reached");
  assert.deepEqual([bad.counted, bad.marks], [["a"], { x: 2 }]);
});

test("every mission type is listed with a target", () => {
  assert.deepEqual(MISSION_TYPES, ["floors", "bosses", "train", "basic", "strong", "elite", "potions", "badge", "runTraining", "blueKeys", "redKeys", "focus"]);
  assert.deepEqual(MISSION_TYPES.map((t) => MISSIONS[t].target), [10, 3, 1, 50, 30, 10, 20, 1, 10, 10, 5, 2]);
});
