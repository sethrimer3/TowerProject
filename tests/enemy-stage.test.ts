import test from "node:test";
import assert from "node:assert/strict";
import { TOWER_START_X } from "../src/config.ts";
import { point } from "../src/entities.ts";
import { PROFILES, RANKED_STRENGTHS, enemyCountPercent, enemyShare, profileShare, type RankedStrength } from "../src/enemy-schedule.ts";
import { dealProfiles, extraEnemies, rankStrengths } from "../src/enemy-stage.ts";
import type { Tile } from "../src/entities.ts";
import { random } from "../src/random.ts";
import { entrance, region } from "../src/delve/labyrinth.ts";
import { ENTRY } from "../src/tower/embedder.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { FULL } from "./test-size.ts";

const ORDER = (s: string) => RANKED_STRENGTHS.indexOf(s as RankedStrength);

/** Counts each profile worn and each strength-profile pair among `tiles`. */
function countProfiles(profiles: Record<string, number>, pairs: Set<string>, t: Tile) {
  const e = t.enemy!;
  profiles[e.profile!] = (profiles[e.profile!] ?? 0) + 1;
  pairs.add(`${e.strength}:${e.profile}`);
}
/** Checks each profile's share of `total` against floor `depth`'s of `tower`. */
function assertProfiles(profiles: Record<string, number>, total: number, depth: number, tower: number, where: string) {
  for (const p of PROFILES) {
    const share = ((profiles[p] ?? 0) / total) * 100, wanted = profileShare(p, depth, tower);
    assert.ok(Math.abs(share - wanted) < 3, `${where}: ${p} ${share.toFixed(1)}% against ${wanted}%`);
  }
}

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
    const profiles: Record<string, number> = {};
    let baseline = 0, total = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const { cells, embedding } = generateTowerFloor(seed * 7919, room, tower);
      const count = embedding.graph.enemyCount!;
      assert.equal(count.dropped, 0, `Tower ${tower} floor ${room + 1} seed ${seed}`);
      for (const k of [point(TOWER_START_X, 0), point(...ENTRY)]) assert.notEqual(cells.get(k)?.kind, "enemy");
      const lanes = new Set(embedding.doorways.filter((d) => d.lane !== undefined).map((d) => point(d.x, d.y)));
      for (const [k, t] of cells)
        if (t.kind === "enemy" && !lanes.has(k) && t.enemy!.strength in dealt) {
          dealt[t.enemy!.strength as RankedStrength]++;
          countProfiles(profiles, new Set(), t);
        }
      baseline += count.baseline;
      total += count.baseline + count.added;
    }
    assertProfiles(profiles, total, room, tower, `Tower ${tower} floor ${room + 1}`);
    const want = (baseline * enemyCountPercent(room)) / 100;
    assert.ok(Math.abs(total - want) <= 1 + want * 0.03, `Tower ${tower} floor ${room + 1}: ${total} enemies for ${want}`);
    for (const k of RANKED_STRENGTHS) {
      const share = (dealt[k] / total) * 100, wanted = enemyShare(k, room, tower);
      assert.ok(Math.abs(share - wanted) < 3, `Tower ${tower} floor ${room + 1}: ${k} ${share.toFixed(1)}% against ${wanted}%`);
    }
  }
});

test("Delve areas hold the schedule's count and shares by equivalent floor, and keep the way in clear", () => {
  const seeds = FULL ? 30 : 10;
  for (const [tier, area] of [[1, 3], [1, 99], [5, 40], [9, 299]]) {
    const dealt = Object.fromEntries(RANKED_STRENGTHS.map((k) => [k, 0])) as Record<RankedStrength, number>;
    const profiles: Record<string, number> = {};
    let baseline = 0, total = 0, want = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = region(seed * 7919, area, tier), count = r.enemyCount;
      assert.equal(count.dropped, 0, `Delve ${tier} area ${area} seed ${seed}`);
      assert.notEqual(r.cells.get(point(entrance(seed * 7919, area).x, entrance(seed * 7919, area).y))?.kind, "enemy");
      const lanes = new Set(r.nodes.flatMap((n) => (n.lanes ?? []).flat().map((p) => point(p.x, p.y))));
      for (const [k, t] of r.cells)
        if (t.kind === "enemy" && !lanes.has(k) && t.enemy!.strength in dealt) {
          dealt[t.enemy!.strength as RankedStrength]++;
          countProfiles(profiles, new Set(), t);
        }
      baseline += count.baseline;
      total += count.baseline + count.added;
    }
    assertProfiles(profiles, total, area * 10 + 5, tier, `Delve ${tier} area ${area}`);
    // The area's ten floors each count their own; their percents differ by a point at most.
    want = (baseline * enemyCountPercent(area * 10 + 5)) / 100;
    assert.ok(Math.abs(total - want) <= 2 + want * 0.03, `Delve ${tier} area ${area}: ${total} enemies for ${want}`);
    for (const k of RANKED_STRENGTHS) {
      const share = (dealt[k] / total) * 100, wanted = enemyShare(k, area * 10 + 5, tier);
      assert.ok(Math.abs(share - wanted) < 3, `Delve ${tier} area ${area}: ${k} ${share.toFixed(1)}% against ${wanted}%`);
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

test("profiles are dealt to within one of their shares, whatever the strengths", () => {
  const rng = random(11);
  for (let trial = 0; trial < 200; trial++) {
    const n = Math.floor(rng() * 25), shares = [[20, 60, 20], [40, 20, 40], [33, 34, 33], [0, 100, 0]][trial % 4];
    const dealt = dealProfiles(n, shares, rng);
    assert.equal(dealt.length, n);
    PROFILES.forEach((p, i) => {
      const got = dealt.filter((d) => d === p).length, want = (n * shares[i]) / 100;
      assert.ok(got >= Math.floor(want) && got <= Math.ceil(want), `${p}: ${got} of ${n} for ${shares[i]}%`);
    });
  }
});

test("every strength wears every profile, in both modes; bosses stay balanced", () => {
  const pairs = new Set<string>(), bosses = new Set<string>(), profiles: Record<string, number> = {};
  for (let seed = 1; seed <= 12; seed++) {
    for (const t of generateTowerFloor(seed * 7919, 1199, 1).cells.values())
      if (t.kind === "enemy") (t.enemy!.strength === "boss" ? bosses.add(t.enemy!.profile!) : countProfiles(profiles, pairs, t));
    for (const t of region(seed * 7919, 80, 1).cells.values())
      if (t.kind === "enemy") (t.enemy!.strength === "boss" ? bosses.add(t.enemy!.profile!) : countProfiles(profiles, pairs, t));
  }
  for (const k of ["normal", "strong", "elite"]) for (const p of PROFILES) assert.ok(pairs.has(`${k}:${p}`), `${k} ${p}`);
  assert.deepEqual([...bosses], ["balanced"]);
});
