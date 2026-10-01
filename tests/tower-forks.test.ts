import { test } from "node:test";
import assert from "node:assert/strict";
import { TOWER_START_X } from "../src/config.ts";
import { point } from "../src/entities.ts";
import { reachable } from "../src/board.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { FORK_PATTERNS, forkKeyDemand, laneKeys, laneSpends, laneValue } from "../src/tower/forks.ts";
import type { Fork, Lane, LaneStep, StrategicNode } from "../src/tower/types.ts";

const Y: LaneStep = { kind: "door", color: "yellow" };
const B: LaneStep = { kind: "door", color: "blue" };
const yKey: LaneStep = { kind: "reward", reward: { kind: "key", color: "yellow" } };
const keys = (yellow: number, blue = 0, red = 0) => ({ yellow, blue, red });

/** Every fork a pattern can roll: one option per lane, all combinations. */
function combinations(lanes: (typeof FORK_PATTERNS)[number]["lanes"]): Lane[][] {
  return lanes.reduce<Lane[][]>((out, options) => out.flatMap((pre) => options.map((o) => [...pre, o.v])), [[]]);
}

test("every fork pattern's lanes cost about the same, and none is cheaper in every way", () => {
  for (const p of FORK_PATTERNS)
    for (const lanes of combinations(p.lanes)) {
      assert.ok(lanes.length >= 2 && lanes.length <= 3, p.id);
      assert.ok(lanes.every((l) => l.length >= 1 && l.length <= 3), `${p.id}: lanes are one to three tiles deep`);
      const values = lanes.map(laneValue);
      assert.ok(values.every((v) => v > 0), `${p.id}: every lane costs something`);
      if (p.fallback) {
        // One door, and beside it a door of the next rarity up.
        assert.ok(lanes.every((l) => l.length === 1 && l[0].kind === "door"), `${p.id}: fallback lanes are single doors`);
        const colors = lanes.map((l) => (l[0] as { color: string }).color);
        assert.ok(["yellow,blue", "blue,red"].includes(colors.join()), `${p.id}: ${colors}`);
        continue;
      }
      assert.ok(Math.max(...values) <= Math.min(...values) * 1.6, `${p.id}: lane values ${values}`);
      lanes.forEach((a, i) => lanes.forEach((b, j) => {
        if (i === j) return;
        const sa = laneSpends(a), sb = laneSpends(b);
        assert.ok([...sa].some((s) => !sb.has(s)) || [...sb].some((s) => !sa.has(s)) || a.length !== b.length,
          `${p.id}: lanes ${i} and ${j} spend the same things`);
        const subset = [...sa].every((s) => sb.has(s));
        assert.ok(!(subset && laneValue(a) < laneValue(b)), `${p.id}: lane ${i} is cheaper than lane ${j} in every way`);
      }));
    }
});

test("a key found in a lane pays only for the doors after it", () => {
  assert.deepEqual(laneKeys([Y, yKey, Y]), { upfront: keys(1), net: keys(1) });
  assert.deepEqual(laneKeys([Y, yKey]), { upfront: keys(1), net: keys(0) });
  assert.deepEqual(laneKeys([yKey, Y]), { upfront: keys(0), net: keys(0) });
  assert.deepEqual(laneKeys([B, yKey, yKey]), { upfront: keys(0, 1), net: keys(-2, 1) });
  assert.deepEqual(laneKeys([Y, Y]), { upfront: keys(2), net: keys(2) });
  assert.deepEqual(laneKeys([{ kind: "steel" }]), { upfront: keys(1), net: keys(1) });
});

test("a fork asks for keys only when every lane needs one, and then for its cheapest lane's", () => {
  const fork = (...lanes: Lane[]): Fork => ({ patternId: "test", lanes });
  assert.deepEqual(forkKeyDemand(fork([Y], [{ kind: "enemy", strength: "normal" }])), []);
  assert.deepEqual(forkKeyDemand(fork([Y], [{ kind: "heart" }])), []);
  assert.deepEqual(forkKeyDemand(fork([Y, Y], [B])), ["yellow", "yellow"]);
  assert.deepEqual(forkKeyDemand(fork([B, yKey, yKey], [Y, Y])), ["blue"]);
});

/** Whether entering a region is worth paying for (the rule forks follow). */
function worthReaching(nodes: StrategicNode[], id: number): boolean {
  const n = nodes[id];
  return n.route === "main" || n.rewards.length + n.guarded.length > 0 || !!n.ringGuard ||
    n.children.some((c) => worthReaching(nodes, c));
}

test("built forks lead into their region by every lane, and never into a region with nothing in it", () => {
  const built = new Set<string>();
  let lanesSeen = 0;
  for (let seed = 0; seed < 120; seed++)
    // Blue and red doors open on floors 20 and 50 of the first tower.
    for (const room of [0, 2, 5, 25, 55]) {
      const { cells, embedding } = generateTowerFloor(seed, room);
      const start = point(TOWER_START_X, 0);
      const shortcuts = embedding.doorways.filter((d) => d.shortcut).map((d) => point(d.x, d.y));
      for (const node of embedding.graph.nodes.filter((n) => n.forks)) {
        const fork = node.forks![0];
        built.add(fork.patternId);
        assert.ok(worthReaching(embedding.graph.nodes, node.id), `seed ${seed} room ${room}: fork into an empty dead end`);
        const r = embedding.rects[embedding.leafOf[node.id]];
        const inside: string[] = [];
        for (let y = r.y1; y <= r.y2; y++)
          for (let x = r.x1; x <= r.x2; x++) if (cells.get(point(x, y))?.kind !== "wall") inside.push(point(x, y));
        const lanes = fork.lanes.map((_, i) =>
          embedding.doorways.filter((d) => d.child === node.id && d.lane === i).map((d) => point(d.x, d.y)));
        assert.equal(lanes.length, fork.lanes.length);
        lanes.forEach((tiles, i) => {
          lanesSeen++;
          assert.equal(tiles.length, Math.max(...fork.lanes.map((l) => l.length)));
          // The lane's steps stand on its tiles in order from the parent's side.
          fork.lanes[i].forEach((step, k) => {
            const t = cells.get(tiles[k])!;
            const want = step.kind === "reward" ? step.reward.kind : step.kind === "open" ? "floor" : step.kind === "steel" || step.kind === "heart" ? "door" : step.kind;
            assert.equal(t.kind, want, `seed ${seed} room ${room} lane ${i} step ${k}`);
          });
          const others = lanes.filter((_, j) => j !== i).flat();
          const seen = reachable(cells, start, new Set([...shortcuts, ...others]));
          assert.ok(inside.every((k) => seen.has(k)),
            `seed ${seed} room ${room}: lane ${i} into region ${node.id} doesn't lead in`);
        });
      }
    }
  assert.ok(lanesSeen > 0);
  for (const p of FORK_PATTERNS) assert.ok(built.has(p.id), `pattern ${p.id} never built`);
});
