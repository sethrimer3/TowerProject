import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { RoomWorld, generateTowerRoom } from "../src/tower/room-world.ts";
import { predict } from "../src/combat.ts";
import { isDeadlocked } from "../src/analysis.ts";
import { enemyTier, getTowerGateEnemy, TOWER_ZONE_ENEMIES, towerZoneIndex } from "../src/scaling.ts";
import { enemyStats } from "../src/enemy-curves.ts";
import { TOWER_HEIGHT, TOWER_START_X, TOWER_WIDTH } from "../src/config.ts";
import { point, type Tile } from "../src/entities.ts";

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

// isDeadlocked() overlays each floor's changes on top of the same
// deterministic generateTowerRoom(seed, h) the real game regenerates, so a
// test gets full control over the *effective* tile map by first painting
// every one of that room's real tiles to "wall" in the overlay, then
// carving open exactly the tiles it cares about.
function wallOverlay(seed: number, height: number): Record<string, Tile> {
  const overlay: Record<string, Tile> = {};
  for (const k of generateTowerRoom(seed, height).keys()) overlay[k] = { kind: "wall" };
  return overlay;
}
function deadlockGame(): Game {
  const g = new Game(defaults());
  // run.changes is the SAME object RoomWorld.changes already holds a
  // reference to; mutate it in place rather than replacing it, or the live
  // world would keep reading the old (now-orphaned) object.
  const overlay = wallOverlay(g.run.seed, 0);
  for (const k of Object.keys(g.run.changes)) delete g.run.changes[k];
  Object.assign(g.run.changes, overlay);
  g.run.player.x = TOWER_START_X;
  g.run.player.y = 0;
  g.run.changes[point(TOWER_START_X, 0)] = { kind: "floor" };
  return g;
}

// ---------- Combat: impervious vs lethal ----------

test("impervious enemy blocks manual movement harmlessly: no combat, no damage, no undo consumed, run continues", () => {
  const g = deadlockGame();
  // A second, genuinely reachable pickup proves the run legitimately
  // continues afterward (isn't merely un-terminated by coincidence) —
  // plain floor alone isn't a "viable action" for deadlock purposes.
  g.run.changes[point(TOWER_START_X - 1, 0)] = { kind: "defense" };
  g.run.changes[point(TOWER_START_X + 1, 0)] = { kind: "enemy", enemy: IMPERVIOUS };
  const startX = g.run.player.x,
    hpBefore = g.run.player.hp,
    historyBefore = g.save.tower.history.length;
  assert.equal(g.move(1, 0, true), false); // manual (force) attempt
  assert.equal(g.run.player.hp, hpBefore);
  assert.equal(g.run.player.x, startX);
  assert.equal(g.save.tower.history.length, historyBefore);
  assert.equal(g.fallen, false);
  assert.deepEqual(
    (g.world as RoomWorld).tile(TOWER_START_X + 1, 0).enemy,
    IMPERVIOUS,
    "the enemy itself must be untouched",
  );
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
  assert.equal(g.fallen, false);
  assert.equal(g.move(1, 0, true), false); // manual attempt is allowed to fight...
  assert.ok(g.fallen); // ...and it is fatal.
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
  assert.equal(g.run.changes[point(1, 0)]?.kind, "floor");
  g.advanceTowerRoom();
  assert.equal(g.run.floors![0][point(1, 0)]?.kind, "floor", "floor 0 keeps its changes while away");
  g.descendTowerRoom();
  assert.equal((g.world as RoomWorld).tile(1, 0).kind, "floor", "collected pickup stays gone");
  assert.equal(g.run.player.attack, attackAfterPickup, "no double credit on revisit");
  // The mutation map itself, not just the coincidentally-matching base
  // generation, is what proves persistence here.
  assert.equal(g.run.changes[point(1, 0)]?.kind, "floor");
});
test("an item never collected is left exactly as the deterministic base generation produced it on revisit", () => {
  const g = arena();
  g.advanceTowerRoom();
  g.descendTowerRoom();
  // Floor 0's mutation map is untouched (nothing was ever collected/cleared
  // there), so revisiting it must reproduce the exact same base layout —
  // this is what "uncollected items remain" reduces to once persistence is
  // reference-based rather than a copied snapshot.
  assert.deepEqual(g.run.changes, {});
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
  const p1 = point(TOWER_START_X + 1, 0);
  const g = arena();
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: SURVIVABLE });
  assert.ok(g.move(1, 0, false));
  g.advanceTowerRoom();
  // advanceTowerRoom() re-centers the player on the new room's own entrance.
  (g.world as RoomWorld).cells.set(p1, { kind: "attack" });
  assert.ok(g.move(1, 0));
  const reloaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(reloaded.run.height, 1);
  // Floor 0 was cleared, so its chests were paid on leaving and left floor.
  const floor0 = reloaded.run.floors?.[0] ?? {};
  assert.deepEqual(floor0[point(1, 0)], { kind: "floor" });
  assert.ok(Object.values(floor0).every((t) => t.kind === "floor"));
  assert.deepEqual(reloaded.run.changes, { [p1]: { kind: "floor" } });
});

// ---------- Deadlock detection ----------

test("a deadlocked floor leaves the hand stuck, and the run waits for the player to end it", () => {
  const g = deadlockGame();
  assert.ok(isDeadlocked(g.run));
  g.autoTurn();
  assert.equal(g.fallen, false);
  assert.ok(!g.run.outside, "only End Run ends a stuck run");
  assert.ok(g.handStuck);
  assert.deepEqual([g.run.player.x, g.run.player.y], [TOWER_START_X, 0]);
});

test("a reachable survivable enemy, item, or unlocked door each mean the run is not deadlocked", () => {
  const withTile = (tile: Tile) => {
    const g = deadlockGame();
    g.run.changes[point(TOWER_START_X + 1, 0)] = tile;
    return g;
  };
  assert.equal(isDeadlocked(withTile({ kind: "enemy", enemy: SURVIVABLE }).run), false);
  assert.equal(isDeadlocked(withTile({ kind: "attack" }).run), false);
  const doorGame = withTile({ kind: "door", color: "yellow" });
  doorGame.run.player.keys.yellow = 1;
  assert.equal(isDeadlocked(doorGame.run), false);
  // A locked door with no key, by contrast, is a genuine dead end.
  const locked = withTile({ kind: "door", color: "yellow" });
  assert.ok(isDeadlocked(locked.run));
});

test("a reachable unexplored upward stair always means the run is not deadlocked", () => {
  const g = deadlockGame();
  g.run.changes[point(TOWER_START_X + 1, 0)] = { kind: "stairs" };
  // Floor 1 deliberately unvisited: it has never been generated by play,
  // so climbing there is still an open, unexplored option.
  assert.equal(g.run.floors?.[1], undefined);
  assert.equal(isDeadlocked(g.run), false);
});

test("the deadlock search follows stairs into visited floors above and below", () => {
  const find = (seed: number, h: number, kind: string) =>
    [...generateTowerRoom(seed, h)].find(([, t]) => t.kind === kind)![0].split(",").map(Number);
  for (const up of [true, false])
    for (const stocked of [false, true]) {
      const g = deadlockGame();
      const floors = [g.run.changes, wallOverlay(g.run.seed, 1)];
      // Stand beside stairs on one visited floor; the other floor's matching
      // stairs have a pickup beside them, or nothing.
      const [from, to] = up ? [0, 1] : [1, 0];
      g.run.height = from;
      g.run.changes = floors[from];
      g.run.floors = { [to]: floors[to] };
      floors[from][point(TOWER_START_X, 0)] = { kind: "floor" };
      floors[from][point(TOWER_START_X + 1, 0)] = { kind: up ? "stairs" : "stairsDown" };
      const [sx, sy] = find(g.run.seed, to, up ? "stairsDown" : "stairs");
      // The stairs stand on the outer wall; stock the tile just inside it.
      const [ix, iy] = [[0, 1], [0, -1], [1, 0], [-1, 0]]
        .map(([dx, dy]) => [sx + dx, sy + dy])
        .find(([x, y]) => x > 0 && x < TOWER_WIDTH - 1 && y > 0 && y < TOWER_HEIGHT - 1)!;
      if (stocked) floors[to][point(ix, iy)] = { kind: "attack" };
      assert.equal(isDeadlocked(g.run), !stocked, `${up ? "up" : "down"}, ${stocked ? "stocked" : "bare"}`);
    }
});

test("bumping an impervious enemy on a deadlocked floor leaves the run going", () => {
  const g = deadlockGame();
  g.run.changes[point(TOWER_START_X + 1, 0)] = { kind: "enemy", enemy: IMPERVIOUS };
  assert.equal(g.move(1, 0, true), false);
  assert.ok(!g.fallen && !g.run.outside);
});

// ---------- Enemy scaling ----------

test("each ten-room Tower zone has one fixed enemy per combat profile", () => {
  assert.equal(TOWER_ZONE_ENEMIES.length, 10);
  for (const roster of TOWER_ZONE_ENEMIES) {
    assert.equal(roster.length, 3);
    assert.deepEqual(new Set(roster.map((enemy) => enemy.profile)), new Set(["attackHeavy", "balanced", "defenseHeavy"]));
  }
  for (let room = 0; room < 100; room++) assert.equal(towerZoneIndex(room), Math.floor(room / 10));
});

test("an enemy type keeps its name through its zone and grows floor by floor", () => {
  for (let zone = 0; zone < 10; zone++) {
    for (const profile of ["attackHeavy", "balanced", "defenseHeavy"] as const) {
      const first = getTowerGateEnemy(zone * 10, "normal", profile), last = getTowerGateEnemy(zone * 10 + 9, "normal", profile);
      assert.equal(first.name, last.name);
      assert.equal(first.name, TOWER_ZONE_ENEMIES[zone].find((e) => e.profile === profile)!.name);
      for (const stat of ["hp", "attack", "defense"] as const) assert.ok(last[stat] > first[stat], `zone ${zone + 1} ${profile} ${stat}`);
    }
  }
  // The roster repeats every hundred floors, under the curve's own stats.
  assert.equal(getTowerGateEnemy(105, "normal", "balanced").name, getTowerGateEnemy(5, "normal", "balanced").name);
});

test("profiles reshape the floor's balanced enemy", () => {
  for (const room of [0, 9, 55, 99, 250]) {
    const attack = getTowerGateEnemy(room, "normal", "attackHeavy");
    const balanced = getTowerGateEnemy(room, "normal", "balanced");
    const defense = getTowerGateEnemy(room, "normal", "defenseHeavy");
    assert.ok(attack.attack > balanced.attack && attack.defense < balanced.defense);
    assert.ok(defense.defense > balanced.defense && defense.attack < balanced.attack);
  }
});

test("Tower gate enemies take their stats from the Tower's enemy curve; elites come from the next zone", () => {
  for (const room of [0, 14, 95, 250]) {
    for (const profile of ["attackHeavy", "balanced", "defenseHeavy"] as const) {
      for (const strength of ["weak", "normal", "strong", "boss"] as const) {
        const e = getTowerGateEnemy(room, strength, profile);
        assert.deepEqual(e, { name: getTowerGateEnemy(room, "normal", profile).name, ...enemyStats("tower", 1, room, strength, profile), tier: enemyTier(strength), strength });
      }
      const elite = getTowerGateEnemy(room, "elite", profile), visitor = getTowerGateEnemy(room + 10, "normal", profile);
      assert.deepEqual(elite, { ...visitor, tier: 3, strength: "elite" });
    }
  }
});

// ---------- Death / finalization ----------

test("a fallen hero's run waits at 0 HP with its own height and kills until defeat is accepted", () => {
  const g = arena();
  g.run.height = 7;
  g.run.kills = 3;
  (g.world as RoomWorld).cells.set(point(1, 0), { kind: "enemy", enemy: LETHAL });
  g.move(1, 0, true);
  assert.ok(g.fallen && !g.auto);
  assert.deepEqual([g.run.player.hp, g.run.height, g.run.kills], [0, 7, 3]);
  assert.equal(g.save.tower.fall?.by, LETHAL.name);
  assert.equal(g.move(0, 1, true), false, "a fallen hero takes no step");
  assert.ok(g.acceptDefeat());
  assert.ok(g.run.outside && !g.fallen);
  assert.equal(g.run.height, 0, "the next run starts afresh");
  assert.equal(g.save.tower.fall, null);
});

