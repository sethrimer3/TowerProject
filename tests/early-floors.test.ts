import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_HAND, planHand } from "../src/cards.ts";
import { predict } from "../src/combat.ts";
import { doorCost } from "../src/doors.ts";
import { point, type Player, type Run, type Tile } from "../src/entities.ts";
import { loadout } from "../src/loadout.ts";
import { defaults } from "../src/save.ts";
import { reachable } from "../src/board.ts";
import { TOWER_START_X } from "../src/config.ts";
import { generateTowerFloor, isBossFloor, type TowerFloor } from "../src/tower/index.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { FULL } from "./test-size.ts";

/** How many seeds each floor is checked over. */
const SEEDS = FULL ? 400 : 120;
const seeds = Array.from({ length: SEEDS }, (_, i) => (i + 1) * 7919);

/** A hero standing at the floor's entrance, with the new profile's stats
 * unless `stats` says otherwise. */
function heroOn(seed: number, room: number, stats: Partial<Player> = {}) {
  const l = loadout(defaults());
  const player: Player = { x: TOWER_START_X, y: 0, hp: l.maxHp, maxHp: l.maxHp, attack: l.attack, defense: l.defense, keys: { ...l.keys }, ...stats };
  const run = { seed, height: room, player, changes: {} } as unknown as Run;
  return { world: new RoomWorld(seed, room, run.changes), run };
}

/** The tile inside the stairs: the only way on to them. */
function beforeStairs({ cells, embedding }: TowerFloor): Tile {
  const [x, y] = embedding.stairs;
  const inside = x === 0 ? [1, y] : x === 16 ? [15, y] : y === 0 ? [x, 1] : [x, 15];
  return cells.get(point(inside[0], inside[1]))!;
}

test("floor 1's stairs are the STAIRS card's target from the entrance, with no fight or door on the way", () => {
  for (const seed of seeds) {
    const at = heroOn(seed, 0);
    const plan = planHand(at, BASE_HAND, "tower");
    assert.equal(plan?.card, 0, `seed ${seed}: STAIRS leads`);
    const last = plan.path[plan.path.length - 1];
    assert.equal(at.world.tile(last.x, last.y).kind, "stairs", `seed ${seed}`);
  }
});

test("floors 2 to 5 have a yellow door before the stairs and a yellow key reachable from the entrance without a fight or a door", () => {
  for (let room = 1; room <= 4; room++)
    for (const seed of seeds) {
      const floor = generateTowerFloor(seed, room), { cells } = floor;
      const t = beforeStairs(floor);
      assert.ok(t.kind === "door" && t.color === "yellow", `floor ${room + 1}, seed ${seed}: ${t.kind}`);
      const blockers = new Set([...cells].filter(([, t]) => t.kind === "enemy" || t.kind === "door").map(([k]) => k));
      const free = [...reachable(cells, point(TOWER_START_X, 0), blockers)].filter((k) => {
        const t = cells.get(k)!;
        return t.kind === "key" && t.color === "yellow";
      });
      assert.ok(free.length, `floor ${room + 1}, seed ${seed}: no free yellow key`);
    }
});

/** Plays the base hand on a floor with a hero no fight can hurt, taking
 * what each step lands on, until it reaches the stairs; returns the steps
 * taken, or null when no card can act. */
function climbWithBaseHand(seed: number, room: number) {
  const at = heroOn(seed, room, { hp: 1e9, maxHp: 1e9, attack: 1e6 });
  const p = at.run.player;
  for (let steps = 0; steps < 2000; steps++) {
    const plan = planHand(at, BASE_HAND, "tower");
    if (!plan) return null;
    const { x, y } = plan.path[0];
    const t = at.world.tile(x, y);
    if (t.kind === "stairs") return steps;
    if (t.kind === "door") {
      const cost = doorCost(t, p);
      assert.ok(cost, "the DOOR card only heads for a door it can open");
      for (const c of cost) p.keys[c]--;
    }
    if (t.kind === "key") p.keys[t.color!]++;
    if (t.kind !== "floor") at.run.changes[point(x, y)] = { kind: "floor" };
    p.x = x;
    p.y = y;
  }
  return null;
}

test("the base hand always climbs floors 2 to 5: every door it opens has a key behind it", () => {
  for (let room = 1; room <= 4; room++)
    for (const seed of seeds) assert.notEqual(climbWithBaseHand(seed, room), null, `floor ${room + 1}, seed ${seed}: the hand got stuck`);
});

test("no enemy on floors 1 to 10 beats a new hero in one fight, but floor 10's boss does", () => {
  const l = loadout(defaults());
  const hero = { x: 0, y: 0, hp: l.maxHp, maxHp: l.maxHp, attack: l.attack, defense: l.defense, keys: l.keys };
  let worst = 0;
  for (let room = 0; room < 10; room++)
    for (const seed of seeds)
      for (const [, t] of generateTowerFloor(seed, room).cells) {
        if (t.kind !== "enemy") continue;
        const { damage } = predict(hero, t.enemy!);
        if (t.enemy!.strength === "boss") {
          assert.ok(isBossFloor(room));
          assert.ok(damage >= hero.hp, `the boss does ${damage}`);
        } else {
          assert.ok(damage < hero.hp, `floor ${room + 1}, seed ${seed}: ${t.enemy!.name} (${t.enemy!.strength}) does ${damage}`);
          worst = Math.max(worst, damage);
        }
      }
  // Strong enemies wait for floor 11, so the hardest here is a normal one.
  assert.ok(worst >= 30, `the hardest still hurts: ${worst}`);
});

test("past floor 5, unguarded stairs sometimes have a yellow door in front instead", () => {
  const seen: Record<string, number> = {};
  for (let room = 5; room < 30; room++) {
    if (isBossFloor(room)) continue;
    for (const seed of seeds.slice(0, 40)) {
      const t = beforeStairs(generateTowerFloor(seed, room));
      const kind = t.kind === "door" ? `door:${t.color}` : t.kind;
      seen[kind] = (seen[kind] ?? 0) + 1;
    }
  }
  const all = Object.values(seen).reduce((a, b) => a + b, 0);
  assert.ok(seen.floor > 0 && seen.enemy > 0, JSON.stringify(seen));
  // Stairs with an open way in are unguarded half the time, and half of those
  // get the door.
  assert.ok(seen["door:yellow"] > all * 0.04, JSON.stringify(seen));
});
