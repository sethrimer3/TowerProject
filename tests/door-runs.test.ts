import { test } from "node:test";
import assert from "node:assert/strict";
import { point, type Tile } from "../src/entities.ts";
import { doorId } from "../src/doors.ts";
import { BASE_RULES, resolveStep } from "../src/step-effects.ts";
import { YELLOW_RUNS, yellowRun } from "../src/key-schedule.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { lockColors } from "../src/tower/resource-planner.ts";
import { region } from "../src/delve/labyrinth.ts";
import type { StrategicNode } from "../src/tower/types.ts";

/** Door runs (docs/DOOR_AND_KEY_SCHEDULE.md section 7): two or three of the
 * same door in a row in one gate, each paid in turn. */

const node = (gate: StrategicNode["gate"]) => ({ gate }) as StrategicNode;

test("a door run asks the key supply for each of its doors, but a yellow run for one key", () => {
  assert.deepEqual(lockColors(node({ kind: "door", color: "blue", run: 3 })), ["blue", "blue", "blue"]);
  assert.deepEqual(lockColors(node({ kind: "door", color: "yellow", run: 2 })), ["yellow"], "a key sink");
  assert.deepEqual(lockColors(node({ kind: "wood", run: 3 })), ["yellow"]);
  assert.deepEqual(lockColors(node({ kind: "heart", run: 2 })), []);
});

test("yellow runs wait for floor 6", () => {
  assert.equal(YELLOW_RUNS.fromFloor, 6);
  assert.equal(yellowRun(4, () => { throw new Error("no draw below floor 6"); }), undefined);
  assert.equal(yellowRun(5, () => 0), 3);
  assert.equal(yellowRun(5, () => 0.99), undefined);
});

test("a Heart Door run compounds its drain with Heart Door Resilience", () => {
  const heart: Tile = { kind: "door", door: { type: "fullHp" } };
  let player = { x: 0, y: 0, hp: 101, maxHp: 101, attack: 1, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
  const hp: number[] = [];
  for (let i = 0; i < 3; i++) {
    player = resolveStep(player, heart, { ...BASE_RULES, heartToll: 50 }).player!;
    hp.push(player.hp);
  }
  assert.deepEqual(hp, [51, 26, 13.5]);
});

/** The same door on each side of tile (x, y), counting it. */
function runAt(cells: Map<string, Tile>, x: number, y: number) {
  const id = doorId(cells.get(point(x, y))!), seen = new Set([point(x, y)]), queue = [[x, y]];
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = point(queue[i][0] + dx, queue[i][1] + dy), t = cells.get(k);
      if (t?.kind === "door" && doorId(t) === id && !seen.has(k)) { seen.add(k); queue.push([queue[i][0] + dx, queue[i][1] + dy]); }
    }
  return seen.size;
}

test("a Tower run stands in a row through its doorway, mostly in full, yellow ones off the way to the stairs", () => {
  let planned = 0, laid = 0, yellow = 0;
  for (let seed = 1; seed <= 40; seed++)
    for (const room of [7, 60, 300, 700]) {
      const { cells, embedding } = generateTowerFloor(seed * 7919, room, room > 300 ? 3 : 1);
      for (const n of embedding.graph.nodes) {
        const run = "run" in n.gate ? n.gate.run : undefined;
        if (!run) continue;
        const d = embedding.doorways.find((w) => w.child === n.id && !w.shortcut)!;
        const doors = runAt(cells, d.x, d.y);
        assert.ok(doors <= run, `seed ${seed} floor ${room + 1}: ${doors} doors for a run of ${run}`);
        planned += run;
        laid += doors;
        const yellowLock = n.gate.kind === "wood" || (n.gate.kind === "door" && n.gate.color === "yellow");
        if (yellowLock) {
          yellow++;
          assert.ok(n.route !== "main" && room + 1 >= YELLOW_RUNS.fromFloor, `seed ${seed} floor ${room + 1}: a yellow run on the way to the stairs`);
        }
      }
    }
  assert.ok(yellow > 0, "yellow runs appear");
  assert.ok(laid / planned > 0.85, `${laid} of ${planned} run doors laid`);
});

test("the Delve's runs stand in a row in their throat or corridor", () => {
  let runs = 0;
  for (const seed of [7919, 15838, 23757])
    for (const [area, tier] of [[3, 1], [60, 1], [30, 9]]) {
      const r = region(seed, area, tier);
      for (const [k, t] of r.cells) {
        if (t.kind !== "door") continue;
        const [x, y] = k.split(",").map(Number), doors = runAt(r.cells, x, y);
        assert.ok(doors <= 3, `seed ${seed} area ${area}: a run of ${doors}`);
        if (doors > 1) runs++;
      }
    }
  assert.ok(runs > 0, "runs appear");
});
