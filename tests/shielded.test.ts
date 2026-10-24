import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { ENEMY_GOLD, SHIELDED_GOLD } from "../src/config.ts";
import { attackForFewerHits, bout, predict } from "../src/combat.ts";
import { arrowDamage } from "../src/enemies/ranged.ts";
import { DamagePredictions } from "../src/damage-labels.ts";
import { bubbleRadius, extraShare, inBubble, placeShield, SHIELD_CUT, shieldShare, walkDistances, type ShieldFloor } from "../src/enemies/shielded.ts";
import { enemyTitle } from "../src/enemies/scaling.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { delveShields, World } from "../src/delve/world.ts";
import { point, type Enemy, type Player, type Tile } from "../src/entities.ts";

const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 20, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 100, attack: 5, defense: 10, tier: 0, strength: "normal" };
const guard = (e: Enemy): Enemy => ({ ...e, guard: SHIELD_CUT });

test("a floor holds a Shielded enemy from the fourth tier: 1% a tier, and 1% more every 250 floors to floor 4,000", () => {
  assert.deepEqual([1, 4000].map((f) => shieldShare(3, f)), [0, 0]);
  assert.deepEqual([1, 250, 1000, 4000, 9000].map((f) => shieldShare(4, f)), [4004, 5000, 8000, 20_000, 20_000]);
  assert.deepEqual([1, 4000].map((f) => shieldShare(5, f)), [5004, 21_000]);
});

test("extras in front of a lone Shielded enemy: none on the fourth tier's floor 1, 5% a tier after, 0.05% a floor without end", () => {
  assert.equal(extraShare(3, 4000), 0);
  assert.deepEqual([1, 2, 2001, 4000, 6001].map((f) => extraShare(4, f)), [0, 50, 100_000, 199_950, 300_000]);
  assert.equal(extraShare(5, 1), 5000);
});

test("a bubble reaches a tile, half a tile more every 1,000 floors, 3 from floor 4,000, taking in each ring of tiles at its floor", () => {
  const rings: [number, number, number][] = [[1, 0, 1], [1, 1, 829], [2, 0, 2000], [2, 1, 2473], [2, 2, 3657], [3, 0, 4000]];
  for (const [dx, dy, from] of rings) {
    assert.ok(inBubble(dx, dy, from) && inBubble(dy, -dx, from), `(${dx}, ${dy}) from ${from}`);
    if (from > 1) assert.ok(!inBubble(dx, dy, from - 1), `(${dx}, ${dy}) not before ${from}`);
  }
  assert.ok(!inBubble(3, 1, 100_000), "never past 3 tiles");
  assert.ok(inBubble(0, 0, 1), "its own tile");
  assert.deepEqual([1, 2000, 4000, 9000].map(bubbleRadius), [1.0005, 2, 3, 3]);
});

test("a bubble's guard cuts the hero's strikes by 60% after DEF, as a parry cuts the enemy's, never making an enemy impervious", () => {
  const p = hero();
  assert.equal(predict(p, brute).hit, 10);
  assert.equal(predict(p, guard(brute)).hit, 4);
  assert.equal(predict(p, guard(brute)).turns, 25);
  assert.deepEqual(bout(p, guard(brute)).strikes.filter((s) => s.by === "hero").map((s) => s.damage).slice(0, 2), [4, 4]);
  // A strike that can't get past DEF stays impervious, and one that does still lands.
  assert.ok(predict(hero({ attack: 10 }), guard(brute)).impervious);
  assert.equal(predict(hero({ attack: 10.01 }), guard(brute)).impervious, false);
  // Arrows are cut too.
  assert.deepEqual([arrowDamage(p, brute), arrowDamage(p, guard(brute))], [10, 4]);
  // Attack Lore asks for the ATK the cut needs: 25 hits to 24 takes 100 / 24 / 0.4 past DEF.
  assert.equal(attackForFewerHits(p, guard(brute)), 1);
  assert.equal(predict(hero({ attack: 21 }), guard(brute)).turns, 23);
  // Damage Visual tells a guarded enemy from one that isn't.
  const labels = new DamagePredictions();
  assert.deepEqual([labels.cost(p, brute).turns, labels.cost(p, guard(brute)).turns], [10, 25]);
});

/** A floor of open tiles `rows` (`#` wall, `.` floor, `E` enemy, `B` boss,
 * `D` door, `S` stairs, `>` the way in), the bottom row first. */
function floorOf(rows: string[], floor: number, seed: number, tier = 4) {
  const cells = new Map<string, Tile>(), band: { x: number; y: number }[] = [];
  let stairs = { x: 0, y: 0 }, entry = { x: 0, y: 0 };
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    band.push({ x, y });
    const enemy = (strength: Enemy["strength"]): Tile => ({ kind: "enemy", enemy: { ...brute, name: `${c}${x},${y}`, strength } });
    cells.set(point(x, y), c === "#" ? { kind: "wall" } : c === "E" ? enemy("normal") : c === "B" ? enemy("boss") : c === "D" ? { kind: "door", color: "yellow" } : c === "S" ? { kind: "stairs" } : { kind: "floor" });
    if (c === "S") stairs = { x, y };
    if (c === ">") entry = { x, y };
  }));
  const toExit = walkDistances(cells, rows[0]!.length, [stairs]), toEntrance = walkDistances(cells, rows[0]!.length, [entry]);
  const f: ShieldFloor = {
    cells, width: rows[0]!.length, wraps: false, band, avoid: new Set([point(entry.x, entry.y)]), seed, tier, floor,
    toExit: (p) => toExit.get(point(p.x, p.y)) ?? Infinity,
    toEntrance: (p) => toEntrance.get(point(p.x, p.y)) ?? Infinity,
    normal: () => ({ ...brute, name: "Standard" }),
  };
  return f;
}
/** The first seed from 1 whose floor `rows` rolls a Shielded enemy, and what it placed. */
function shielded(rows: string[], floor: number, tier = 4) {
  for (let seed = 1; ; seed++) {
    const placed = new Map<string, Tile>(), f = floorOf(rows, floor, seed, tier), shield = placeShield(f, placed);
    if (shield) return { shield, placed, f };
  }
}
const added = (placed: Map<string, Tile>, f: ShieldFloor) => [...placed].filter(([k]) => f.cells.get(k)?.kind === "floor").map(([k]) => k);

test("the Shielded enemy is the one nearest the stairs by walking, never a boss", () => {
  // The boss stands nearest; the enemy behind it, round the corner, next.
  const { shield, placed } = shielded([
    ">....E...",
    "########.",
    "S.B.E....",
  ], 3000);
  assert.deepEqual([shield.x, shield.y], [4, 2]);
  assert.equal(placed.get("4,2")?.enemy?.shielded, true);
  assert.equal(placed.get("2,2"), undefined, "never the boss");
});

test("a lone Shielded enemy gets a certain extra per 100% in its bubble, nearer the way in; none when another enemy shares it", () => {
  // Floor 4,000: 199.95% in the fourth tier, so one certain and almost always two.
  const lone = shielded([
    ">......E.S",
    ".........#",
    ".........#",
  ], 4000);
  assert.deepEqual([lone.shield.x, lone.shield.y], [7, 0]);
  const extras = added(lone.placed, lone.f);
  assert.ok(extras.length >= 1 && extras.length <= 2);
  for (const k of extras) {
    const [x, y] = k.split(",").map(Number);
    assert.ok(inBubble(x! - 7, y!, 4000), `${k} in the bubble`);
    assert.ok(lone.f.toEntrance({ x: x!, y: y! }) < lone.f.toEntrance({ x: 7, y: 0 }), `${k} in front`);
    assert.equal(lone.placed.get(k)!.enemy!.name, "Standard", "no normal enemy to copy: a standard one");
  }
  const shared = shielded([
    ">....E.E.S",
    ".........#",
  ], 4000);
  assert.deepEqual(added(shared.placed, shared.f), []);
  // Below the share's first whole 100% on floor 1 of the fourth tier: none.
  assert.deepEqual(added(shielded([">......E.S"], 1).placed, floorOf([">......E.S"], 1, 1)), []);
});

test("with no open tile in front within the bubble, an extra stands on the nearest open tile on the way back to the way in", () => {
  // Radius 1 on floor 2,001 (100%: one certain extra); the door in front fills the bubble's only tile nearer the way in.
  const { placed, f } = shielded(["#####", ">..DES"], 2001);
  assert.deepEqual(added(placed, f), ["2,1"]);
});

/** A Tower floor of the fourth tier holding a Shielded enemy with another enemy in its bubble. */
function towerShield() {
  for (let seed = 1; ; seed++) {
    const w = new RoomWorld(seed, 3999, {}, 0, 4), [s] = w.shields();
    if (!s) continue;
    for (let y = s.y - 3; y <= s.y + 3; y++)
      for (let x = s.x - 3; x <= s.x + 3; x++)
        if ((x !== s.x || y !== s.y) && w.tile(x, y).enemy?.guard) return { w, s, other: { x, y } };
  }
}

test("on a Tower floor, enemies in the bubble are guarded while the Shielded enemy stands, and undo's restored changes guard them again", () => {
  const { w, s, other } = towerShield();
  const shielder = w.tile(s.x, s.y).enemy!;
  assert.equal(shielder.shielded, true);
  assert.equal(shielder.guard, SHIELD_CUT, "it guards itself");
  assert.match(enemyTitle(shielder), /^(Fast )?(Ranged )?Shielded /);
  const before = { ...w.changes };
  w.clear(s.x, s.y);
  assert.deepEqual(w.shields(), []);
  assert.equal(w.tile(other.x, other.y).enemy!.guard, undefined, "the bubble goes with it");
  // Undo restores the changes the board reads.
  for (const k of Object.keys(w.changes)) delete w.changes[k];
  Object.assign(w.changes, before);
  assert.equal(w.tile(other.x, other.y).enemy!.guard, SHIELD_CUT);
  // A wound keeps the Shielded enemy, and its bubble.
  w.wound(s.x, s.y, 1);
  assert.equal(w.shields().length, 1);
});

test("no floor below the fourth tier holds a Shielded enemy", () => {
  for (const tier of [1, 2, 3])
    for (let seed = 1; seed <= 40; seed++) {
      const w = new RoomWorld(seed, 99, {}, 0, tier);
      assert.deepEqual(w.shields(), []);
      for (const t of w.cells.values()) assert.ok(!t.enemy?.shielded);
    }
});

test("the Delve's equivalent floors from the fourth delve hold Shielded enemies too, whose bubbles guard as the Tower's do", () => {
  let found: { seed: number; area: number } | null = null;
  for (let seed = 1; !found && seed < 40; seed++) if (delveShields(seed, 300, 4).shields.length) found = { seed, area: 300 };
  assert.ok(found, "a Shielded enemy in some delve");
  const { shields } = delveShields(found.seed, found.area, 4), s = shields[0]!;
  assert.ok(s.floor > 3000 && s.floor <= 3010, "on the area's own equivalent floors");
  const w = new World({ seed: found.seed, changes: {}, floor: 0, milestone: found.area, tier: 4 });
  const t = w.tile(s.x, s.y);
  assert.equal(t.enemy?.shielded, true);
  assert.equal(t.enemy?.guard, SHIELD_CUT);
  assert.ok(w.shields().some((b) => b.x === s.x && b.y === s.y));
  w.clear(s.x, s.y);
  assert.ok(!w.shields().some((b) => b.x === s.x && b.y === s.y));
  assert.equal(delveShields(found.seed, found.area, 3).shields.length, 0, "none below the fourth delve");
});

test("a Shielded enemy pays 1 Gold more", () => {
  const g = new Game(defaults());
  g.save.themes = [];
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("1,0", { kind: "enemy", enemy: { name: "Test", hp: 10, attack: 0, defense: 0, tier: 1, strength: "strong", shielded: true } });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 1000, defense: 0, hp: 100, maxHp: 100 });
  assert.ok(g.move(1, 0));
  assert.equal(SHIELDED_GOLD, 1);
  assert.equal(g.save.gold, ENEMY_GOLD.strong + 1);
});
