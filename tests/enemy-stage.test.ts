import test from "node:test";
import assert from "node:assert/strict";
import { TOWER_START_X } from "../src/config.ts";
import { point } from "../src/entities.ts";
import { RANKED_STRENGTHS, enemyCountPercent, enemyShare, type RankedStrength } from "../src/enemy-schedule.ts";
import { extraEnemies, rankStrengths } from "../src/enemy-stage.ts";
import { random } from "../src/random.ts";
import { ENTRY } from "../src/tower/embedder.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { FULL } from "./test-size.ts";

const ORDER = (s: string) => RANKED_STRENGTHS.indexOf(s as RankedStrength);

test("ranking deals each strength its share to within one, and never ranks a weaker-asked enemy above a stronger", () => {
  const rng = random(7);
  for (let trial = 0; trial < 200; trial++) {
    const n = 1 + Math.floor(rng() * 25);
    const shares = [[40, 37, 20, 3], [0, 35, 45, 20], [16, 84, 0, 0], [25, 25, 25, 25]][trial % 4];
    const asked = Array.from({ length: n }, () => RANKED_STRENGTHS[Math.floor(rng() * 4)]);
    const dealt = rankStrengths(asked, shares, rng);
    RANKED_STRENGTHS.forEach((k, i) => {
      const got = dealt.filter((d) => d === k).length, want = (n * shares[i]) / 100;
      assert.ok(got >= Math.floor(want) - 1 && got <= Math.ceil(want) + 1, `${k}: ${got} of ${n} for ${shares[i]}%`);
      if (!shares[i]) assert.equal(got, 0);
    });
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++)
        if (ORDER(asked[a]) < ORDER(asked[b])) assert.ok(ORDER(dealt[a]) <= ORDER(dealt[b]), `${asked[a]}→${dealt[a]} above ${asked[b]}→${dealt[b]}`);
  }
});

test("a floor adds the count's whole part of its baseline and the fraction by chance", () => {
  assert.equal(extraEnemies(10, 0, () => 0), 0);
  assert.equal(extraEnemies(10, 5999, () => 0.99), 20, "three times the baseline at floor 6,000");
  // Floor 300: 110%, one extra for 10; 1.5 for 15, the half by chance.
  assert.equal(extraEnemies(10, 299, () => 0.99), 1);
  assert.equal(extraEnemies(15, 299, () => 0.49), 2);
  assert.equal(extraEnemies(15, 299, () => 0.5), 1);
});

test("Tower floors hold the schedule's count and shares, and keep the way in clear", () => {
  const seeds = FULL ? 60 : 20;
  for (const [tower, room] of [[1, 30], [1, 999], [5, 400], [9, 2999]]) {
    const dealt = Object.fromEntries(RANKED_STRENGTHS.map((k) => [k, 0])) as Record<RankedStrength, number>;
    let baseline = 0, total = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const { cells, embedding } = generateTowerFloor(seed * 7919, room, tower);
      const count = embedding.graph.enemyCount!;
      assert.equal(count.dropped, 0, `Tower ${tower} floor ${room + 1} seed ${seed}`);
      for (const k of [point(TOWER_START_X, 0), point(...ENTRY)]) assert.notEqual(cells.get(k)?.kind, "enemy");
      const lanes = new Set(embedding.doorways.filter((d) => d.lane !== undefined).map((d) => point(d.x, d.y)));
      for (const [k, t] of cells)
        if (t.kind === "enemy" && !lanes.has(k) && t.enemy!.strength in dealt) dealt[t.enemy!.strength as RankedStrength]++;
      baseline += count.baseline;
      total += count.baseline + count.added;
    }
    const want = (baseline * enemyCountPercent(room)) / 100;
    assert.ok(Math.abs(total - want) <= 1 + want * 0.03, `Tower ${tower} floor ${room + 1}: ${total} enemies for ${want}`);
    for (const k of RANKED_STRENGTHS) {
      const share = (dealt[k] / total) * 100, wanted = enemyShare(k, room, tower);
      assert.ok(Math.abs(share - wanted) < 3, `Tower ${tower} floor ${room + 1}: ${k} ${share.toFixed(1)}% against ${wanted}%`);
    }
  }
});

test("strong and elite enemies stand from each tower's own first floors", () => {
  const strengths = (tower: number, room: number) => {
    const out = new Set<string>();
    for (let seed = 1; seed <= 15; seed++)
      for (const t of generateTowerFloor(seed * 7919, room, tower).cells.values()) if (t.kind === "enemy") out.add(t.enemy!.strength);
    return out;
  };
  assert.ok(!strengths(1, 9).has("strong") && !strengths(1, 39).has("elite"), "Tower I: strong from 11, elite from 41");
  assert.ok(!strengths(9, 1).has("strong"), "Tower IX: no strong on floor 2");
  assert.ok(strengths(9, 2).has("strong") && strengths(9, 8).has("elite"), "Tower IX: strong from 3, elite from 9");
});
