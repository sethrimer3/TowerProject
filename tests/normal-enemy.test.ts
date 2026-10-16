import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { boonEffects } from "../src/shrines.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { CHUNK } from "../src/config.ts";
import type { Board } from "../src/board.ts";
import type { Enemy } from "../src/entities.ts";
import type { League } from "../src/tournament/leagues.ts";

// A board's normal enemy (`Board.normalEnemy`, which the HUD shows under
// the floor) against the real normal enemies standing on it: every stat
// step the board applies to them, it applies to the normal enemy too.

/** The board's plain normal, balanced enemies (neither Fast, Ranged nor
 * Shielded), with the depth each stands at. */
function plainNormals(board: Board, rows: number, depth: (x: number, y: number) => number) {
  const out: { enemy: Enemy; depth: number }[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < board.width; x++) {
      const e = board.tile(x, y).enemy;
      if (e && e.strength === "normal" && e.profile === "balanced" && !e.fast && !e.ranged && !e.shielded) out.push({ enemy: e, depth: depth(x, y) });
    }
  return out;
}

const stats = (e: Enemy) => ({ attack: e.attack, defense: e.defense, hp: e.hp });

/** Every plain normal enemy on `board` matches its normal enemy, and there is one. */
function matches(board: Board, rows: number, depth: (x: number, y: number) => number) {
  const found = plainNormals(board, rows, depth);
  assert.ok(found.length, "the board holds a plain normal enemy to compare");
  for (const f of found) assert.deepEqual(stats(board.normalEnemy!(f.depth)), stats(f.enemy), `at depth ${f.depth}`);
}

/** The first Tower floor from `room` holding a plain normal enemy. */
function towerFloor(room: number, tier: number, foes?: RoomWorld["foes"]) {
  for (let seed = 1; ; seed++) {
    const w = new RoomWorld(seed, room, {}, 0, tier, undefined, foes);
    if (plainNormals(w, w.height, () => room).length) return w;
  }
}

test("a Tower floor's normal enemy is its real normal enemies, in each tower", () => {
  for (const tier of [1, 2, 4]) for (const room of [12, 60]) matches(towerFloor(room, tier), 17, () => room);
});

test("a Tower floor's normal enemy carries the run's foe boons", () => {
  const save = defaults();
  save.archives.levels = { ...save.archives.levels, unlockShrines: 1 };
  const foes = boonEffects(["enemyAttack", "enemyHpRegen"], save).foes;
  const plain = towerFloor(30, 2), boons = towerFloor(30, 2, foes);
  matches(boons, 17, () => 30);
  const was = plain.normalEnemy(), now = boons.normalEnemy();
  assert.ok(now.attack < was.attack && now.hp < was.hp, "the boons weaken it");
  assert.equal(now.defense, was.defense);
});

/** A Delve board of `tier`, in `league`'s tournament or none. */
const delve = (seed: number, tier: number, league?: League) =>
  new World({ seed, changes: {}, floor: 0, milestone: 0, tier, ...(league ? { tournament: { league } as any } : {}) });

test("a Delve depth's normal enemy is its real normal enemies, in and out of a tournament", () => {
  for (const [tier, league] of [[1], [3], [1, "copper"], [3, "silver"]] as [number, League?][]) {
    const w = delve(7, tier, league);
    matches(w, CHUNK * 3, (x, y) => w.depth(x, y));
  }
  const plain = delve(7, 1).normalEnemy(40), copper = delve(7, 1, "copper").normalEnemy(40);
  assert.ok(copper.attack > plain.attack * 4, "a tournament's enemies stand as strong as the next cave's");
});

test("the forest holds no enemies, so it has no normal enemy", async () => {
  const { OutsideWorld } = await import("../src/outside.ts");
  assert.equal("normalEnemy" in OutsideWorld.prototype, false);
});
