import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { RoomWorld } from "../src/generation.ts";
import { predict } from "../src/combat.ts";
import { isDeadlocked } from "../src/analysis.ts";
import { getTowerEnemy } from "../src/scaling.ts";
import { ENEMY_ARCHETYPES, TOWER_SCALING, TOWER_START_X } from "../src/config.ts";
import { point } from "../src/entities.ts";

/** A tiny, fully controlled 5x5 room so each test can hand-place exactly
 * the tiles it needs without depending on procedural generation. */
function arena() {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(point(x, y), { kind: "floor" });
  w.cells.set(point(4, 4), { kind: "stairs" });
  g.run.player.x = 0;
  g.run.player.y = 0;
  return g;
}
const IMPERVIOUS = { name: "Colossus", hp: 50, attack: 5, defense: 999, tier: 3 };
const LETHAL = { name: "doom", hp: 99999, attack: 999, defense: 0, tier: 3 };
const SURVIVABLE = { name: "rat", hp: 5, attack: 1, defense: 0, tier: 0 };

// ---------- Combat: impervious vs lethal ----------

test("impervious enemy blocks manual movement harmlessly: no combat, no damage, no undo consumed, run continues", () => {
  const g = arena();
  g.world.tile(1, 0); // touch tile lookup path once, no-op
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: IMPERVIOUS });
  const hpBefore = g.run.player.hp,
    historyBefore = g.save.tower.history.length;
  assert.equal(g.move(1, 0, true), false); // manual (force) attempt
  assert.equal(g.run.player.hp, hpBefore);
  assert.equal(g.run.player.x, 0);
  assert.equal(g.save.tower.history.length, historyBefore);
  assert.equal(g.summary, null);
  assert.deepEqual((g.world as RoomWorld).cells.get(point(1, 0))!.enemy, IMPERVIOUS);
  assert.match(g.message, /Impervious/);
});

test("impervious enemy's rejection reports the exact additional ATK required", () => {
  const g = arena();
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: IMPERVIOUS });
  const required = IMPERVIOUS.defense - g.run.player.attack + 1;
  g.move(1, 0, true);
  assert.equal(g.message, `Impervious — requires ${required} more ATK`);
  assert.equal(predict(g.run.player, IMPERVIOUS).requiredAttack, required);
});

test("a lethal but damageable enemy can still be entered manually, and it kills the player", () => {
  const g = arena();
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: LETHAL });
  assert.equal(predict(g.run.player, LETHAL).impervious, false);
  assert.equal(g.move(1, 0, false), false); // automation refuses
  assert.equal(g.summary, null);
  assert.equal(g.move(1, 0, true), false); // manual attempt is allowed to fight...
  assert.ok(g.summary?.dead); // ...and it is fatal.
});

test("a survivable encounter resolves normally: damage applies, enemy clears, run continues", () => {
  const g = arena();
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: SURVIVABLE });
  assert.ok(g.move(1, 0, false));
  assert.equal(g.run.player.x, 1);
  assert.equal(g.run.kills, 1);
  assert.equal((g.world as RoomWorld).tile(1, 0).kind, "floor");
});

// ---------- Persistence: revisitable floors ----------

test("a defeated enemy stays dead after descending and re-ascending", () => {
  const g = arena();
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: SURVIVABLE });
  assert.ok(g.move(1, 0, false));
  assert.equal((g.world as RoomWorld).tile(1, 0).kind, "floor");
  g.advanceTowerRoom();
  g.descendTowerRoom();
  assert.equal((g.world as RoomWorld).tile(1, 0).kind, "floor", "enemy must not respawn");
});

test("a collected pickup stays collected (and is never re-credited) across a floor round-trip", () => {
  const g = arena();
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "attack" });
  assert.ok(g.move(1, 0)); // collects the attack pickup
  const attackAfterPickup = g.run.player.attack;
  assert.equal(g.run.floors![0][point(1, 0)]?.kind, "floor");
  g.advanceTowerRoom();
  g.descendTowerRoom();
  assert.equal((g.world as RoomWorld).tile(1, 0).kind, "floor", "collected pickup stays gone");
  assert.equal(g.run.player.attack, attackAfterPickup, "no double credit on revisit");
  // The mutation map itself, not just the coincidentally-matching base
  // generation, is what proves persistence here.
  assert.equal(g.run.floors![0][point(1, 0)]?.kind, "floor");
});
test("an item never collected is left exactly as the deterministic base generation produced it on revisit", () => {
  const g = arena();
  g.advanceTowerRoom();
  g.descendTowerRoom();
  // Floor 0's mutation map is untouched (nothing was ever collected/cleared
  // there), so revisiting it must reproduce the exact same base layout —
  // this is what "uncollected items remain" reduces to once persistence is
  // reference-based rather than a copied snapshot.
  assert.deepEqual(g.run.floors![0], {});
});

test("an opened door stays open across a floor round-trip", () => {
  const g = arena();
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "door", color: "yellow" });
  g.run.player.keys.yellow = 1;
  assert.ok(g.move(1, 0));
  assert.equal((g.world as RoomWorld).tile(1, 0).kind, "floor");
  g.advanceTowerRoom();
  g.descendTowerRoom();
  assert.equal((g.world as RoomWorld).tile(1, 0).kind, "floor", "door stays open, no new key required");
});

test("multi-floor Tower state survives a save encode/decode round trip", () => {
  const g = arena();
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: SURVIVABLE });
  assert.ok(g.move(1, 0, false));
  g.advanceTowerRoom();
  // advanceTowerRoom() re-centers the player on the new room's own entrance.
  const p1 = point(TOWER_START_X + 1, 0);
  (g.world as RoomWorld).cells.set(p1, { kind: "attack" });
  assert.ok(g.move(1, 0));
  const reloaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(reloaded.run.height, 1);
  assert.deepEqual(reloaded.run.floors?.[0], { [point(1, 0)]: { kind: "floor" } });
  assert.deepEqual(reloaded.run.floors?.[1], { [p1]: { kind: "floor" } });
});

// ---------- Deadlock detection ----------

test("no viable actions on any visited or reachable-next floor ends the run without granting Revive", () => {
  const g = arena();
  g.save.upgrades.revive = 1;
  g.linkTowerFloor();
  // Nothing but bare floor and the entrance/stairs already visited: no
  // items, no enemies, no doors, no unexplored stairs anywhere.
  g.run.floors = { 0: { ...g.run.changes } };
  assert.ok(isDeadlocked(g.run));
  const shardsBefore = g.save.tower.shards;
  g.checkDeadlock();
  assert.ok(g.summary);
  assert.equal(g.summary!.reason, "No viable moves remain");
  assert.equal(g.summary!.dead, false);
  assert.equal(g.save.tower.revival, null, "a deadlock must never create a Revive opportunity");
});

test("a reachable survivable enemy, item, unlocked door, or unexplored stair each mean the run is not deadlocked", () => {
  const base = () => {
    const g = arena();
    g.linkTowerFloor();
    return g;
  };
  const withTile = (tile: import("../src/entities.ts").Tile) => {
    const g = base();
    g.run.floors![0][point(1, 0)] = tile;
    return g;
  };
  assert.equal(isDeadlocked(withTile({ kind: "enemy", enemy: SURVIVABLE }).run), false);
  assert.equal(isDeadlocked(withTile({ kind: "attack" }).run), false);
  const doorGame = base();
  doorGame.run.floors![0][point(1, 0)] = { kind: "door", color: "yellow" };
  doorGame.run.player.keys.yellow = 1;
  assert.equal(isDeadlocked(doorGame.run), false);
  // An unexplored upward stair (no floors[height+1] entry yet) is always
  // "not deadlocked" — the player can always climb to generate a new room.
  const stairGame = base();
  stairGame.run.floors![0][point(1, 0)] = { kind: "stairs" };
  assert.equal(isDeadlocked(stairGame.run), false);
  // A locked door with no key, by contrast, is a genuine dead end.
  const lockedGame = base();
  lockedGame.run.floors![0][point(1, 0)] = { kind: "door", color: "yellow" };
  assert.ok(isDeadlocked(lockedGame.run));
});

test("a deadlock caused by an impervious bump also terminates the run harmlessly, without Revive", () => {
  const g = arena();
  g.linkTowerFloor();
  g.run.floors = { 0: { ...g.run.changes } };
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: IMPERVIOUS });
  g.run.floors[0] = { ...g.run.floors[0] };
  g.save.upgrades.revive = 1;
  g.move(1, 0, true); // bump the impervious enemy: rejected, then deadlock-checked
  assert.ok(g.summary);
  assert.equal(g.summary!.reason, "No viable moves remain");
  assert.equal(g.save.tower.revival, null);
});

// ---------- Enemy scaling ----------

test("Tower enemy stats come from the polynomial scaling curve, not a fixed tier table", () => {
  const rng = () => 0.4; // stable "balanced" archetype pick
  const low = getTowerEnemy(1, rng, "balanced");
  const high = getTowerEnemy(50, rng, "balanced");
  const veryHigh = getTowerEnemy(150, rng, "balanced");
  assert.ok(high.hp > low.hp && high.attack > low.attack && high.defense > low.defense);
  assert.ok(veryHigh.hp > high.hp && veryHigh.attack > high.attack && veryHigh.defense > high.defense);
  assert.equal(low.hp, Math.max(1, Math.floor(TOWER_SCALING.hp(1) * ENEMY_ARCHETYPES.balanced.hp)));
});

test("enemy archetypes apply distinct multipliers to the same base scaling", () => {
  const rng = () => 0;
  const tank = getTowerEnemy(40, rng, "tank");
  const glass = getTowerEnemy(40, rng, "glassCannon");
  assert.ok(tank.defense > glass.defense);
  assert.ok(glass.attack > tank.attack);
});

test("enemy scaling keeps growing well past the old tier-3/room-15 cap, with no plateau", () => {
  const rng = () => 0.4;
  const a = getTowerEnemy(100, rng, "balanced"),
    b = getTowerEnemy(300, rng, "balanced");
  assert.ok(b.hp > a.hp * 2, `expected continued growth, got ${a.hp} -> ${b.hp}`);
});

test("Tower enemy scaling is deterministic for a given seed/rng sequence", () => {
  let calls = 0;
  const rng = () => (calls++, 0.5);
  const a = getTowerEnemy(10, (() => { let c = 0; return () => (c++, 0.5); })());
  const b = getTowerEnemy(10, (() => { let c = 0; return () => (c++, 0.5); })());
  assert.deepEqual(a, b);
});

// ---------- Death / finalization ----------

test("the death summary reports the dying run's own height and kills, not the freshly reset run's", () => {
  const g = arena();
  g.run.height = 7;
  g.run.kills = 3;
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: LETHAL });
  g.move(1, 0, true);
  assert.ok(g.summary?.dead);
  assert.equal(g.summary!.height, 7);
  assert.equal(g.summary!.kills, 3);
  assert.equal(g.run.height, 0, "the new run itself must already be reset");
});

test("clear rewards are paid out exactly once across a fatal encounter", () => {
  const g = arena();
  g.checkClear(); // arena has no enemies/doors, so this floor is immediately clear
  assert.ok((g.run.rewards?.length ?? 0) > 0);
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: LETHAL });
  const shardsBefore = g.save.tower.shards;
  g.move(1, 0, true);
  assert.ok(g.summary?.dead);
  const shardsAfterDeath = g.save.tower.shards;
  assert.ok(shardsAfterDeath > shardsBefore);
  // Nothing left to claim a second time.
  assert.equal(g.claimRewards(), 0);
  assert.equal(g.save.tower.shards, shardsAfterDeath);
});
