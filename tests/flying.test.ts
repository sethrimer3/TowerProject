import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { ENEMY_GOLD, RANGED_GOLD } from "../src/config.ts";
import { aggroTurn, FLYING_TIER, flyingCells, flyingShare, walkToHero } from "../src/flying.ts";
import { FOE_GAIN, foeShotCost, rangedShare, woundMore } from "../src/ranged.ts";
import { planHand, handBonus, cardBonusLines, CARDS, type HandAt } from "../src/cards.ts";
import { volleyTurn, type VolleyTurn } from "../src/volley.ts";
import { enemyTitle } from "../src/scaling.ts";
import { tierCells } from "../src/tiers.ts";
import { generateTowerRoom, RoomWorld } from "../src/tower/room-world.ts";
import { checkpoint, goalUnlocked } from "../src/goals.ts";
import { tileInfo } from "../src/ui/tile-info.ts";
import type { Board } from "../src/board.ts";
import type { Run } from "../src/runs.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const bat: Enemy = { name: "Bat", hp: 3000, attack: 7, defense: 0, tier: 5, strength: "normal", flying: true };
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 5, strength: "normal" };
const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 1000, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;

test("Flying enemies come at the Ranged share from the fifth tier; none before", () => {
  for (const tier of [1, 2, 3, 4]) assert.deepEqual([1, 500, 9000].map((f) => flyingShare(tier, f)), [0, 0, 0]);
  for (const f of [1, 77, 3000]) assert.equal(flyingShare(FLYING_TIER, f), rangedShare(FLYING_TIER, f));
});

test("Tower V floors lift about 12.75% of their non-boss enemies off the ground, each over open floor, never Fast or Ranged as well", () => {
  let enemies = 0, flying = 0;
  for (const seed of [3, 41, 977])
    for (let room = 0; room < 60; room++) {
      for (const t of new RoomWorld(seed, room, {}, 0, 4).cells.values()) assert.ok(!t.flyer, "none in the fourth tier");
      const cells = new RoomWorld(seed, room, {}, 0, 5).cells, plain = tierCells(generateTowerRoom(seed, room, 5), 5);
      for (const [k, t] of cells) {
        if (t.enemy && t.enemy.strength !== "boss") enemies++;
        if (!t.flyer) continue;
        flying++, enemies++;
        assert.equal(t.kind, "floor", "the hero walks under it");
        const { flying: lifted, ...rest } = t.flyer;
        assert.equal(lifted, true);
        assert.ok(!rest.fast && !rest.ranged && !rest.shielded && rest.strength !== "boss" && rest.strength !== "greaterBoss");
        assert.deepEqual(rest, plain.get(k)!.enemy, `${seed}/${room} ${k}: the enemy as the tier made it`);
      }
    }
  const share = flying / enemies;
  assert.ok(share > 0.105 && share < 0.15, `about 12.75% Flying: ${share}`);
});

test("lifting leaves the board alone below the fifth tier", () => {
  const cells = new Map<string, Tile>([["1,1", { kind: "enemy", enemy: brute }]]);
  assert.equal(flyingCells(cells, 4, 7, () => 1), cells);
});

test("Flying enemies say so first, and pay the Ranged enemy's Gold", () => {
  assert.equal(enemyTitle({ name: "Bat", strength: "strong", flying: true }), "Flying Strong Bat");
  const { flying: _, ...grounded } = bat;
  const flyer = arena({ "1,0": bat }).enemyGold(1, 0), plain = arena({ "1,0": grounded }).enemyGold(1, 0), ranged = arena({ "1,0": { ...grounded, ranged: true } }).enemyGold(1, 0);
  assert.ok(flyer > plain, "more than the same enemy on the ground");
  assert.equal(flyer, ranged, "as much as a Ranged one");
  assert.equal(plain * (ENEMY_GOLD.normal + RANGED_GOLD), flyer * ENEMY_GOLD.normal);
});

/** A Tower V run inside on an open 9×9 floor, the hero at (0, 0), with
 * `foes` by tile (a Flying one over open floor) and `walls`. */
function arena(foes: Record<string, Enemy>, over: Partial<Player> = {}, walls: string[] = []) {
  const save = defaults();
  save.upgrades.inspirationUndos = 1;
  const g = new Game(save);
  g.save.themes = [];
  g.run.tier = 5;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  for (const k of walls) w.cells.set(k, { kind: "wall" });
  for (const [k, enemy] of Object.entries(foes)) w.cells.set(k, enemy.flying ? { kind: "floor", flyer: enemy } : { kind: "enemy", enemy });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 1000, defense: 0, hp: 100, maxHp: 100, ...over });
  return g;
}
const archer = (g: Game) => {
  g.save.goals.claimed[3] = [10];
  g.run.hand = [...g.hand, "archer"];
  return g;
};

test("the hero walks under a Flying enemy without a fight, and it shoots the hero as a Ranged one does", () => {
  const g = arena({ "1,0": { ...bat, attack: 7 } });
  assert.ok(g.move(1, 0), "a step onto its tile is a step onto floor");
  assert.deepEqual([g.run.player.x, g.fights.shown], [1, null]);
  assert.equal(g.world.tile(1, 0).flyer?.name, "Bat", "untouched overhead");
  assert.equal(g.run.player.hp, 93, "and it shoots the hero standing under it");
  assert.deepEqual(g.volley?.shots.map((s) => [s.by, s.from, s.to]), [["enemy", { x: 1, y: 0 }, { x: 1, y: 0 }]]);
});

test("the Archer's arrows reach a Flying enemy, the one over the hero first; one wounded becomes Aggroed, one felled pays its kill", () => {
  const g = archer(arena({ "1,0": { ...bat, attack: 0 }, "0,2": { ...brute, hp: 5000, attack: 0 } }));
  assert.ok(g.move(1, 0));
  assert.deepEqual(g.volley?.shots.filter((s) => s.by === "hero").map((s) => s.to), [{ x: 1, y: 0 }], "the closest: the one overhead");
  const t = g.world.tile(1, 0);
  assert.equal(t.flyer!.hp, 2000);
  assert.equal(t.flyer!.aggro, true, "wounded: Aggroed");
  assert.equal(g.run.changes["1,0"]!.wound, 1000);
  g.run.volleys!.hero = undefined;
  const gold = g.save.gold;
  g.world.tile(1, 0);
  g.run.changes["1,0"] = { kind: "floor", flyer: { ...bat, hp: 500, attack: 0, aggro: true } };
  assert.ok(g.move(0, 1));
  assert.equal(g.world.tile(1, 0).flyer, undefined, "felled");
  assert.ok(g.save.gold > gold, "its kill pays");
});

test("a wound makes only a Flying enemy Aggroed", () => {
  assert.equal(woundMore({ kind: "floor", flyer: bat }, 5).flyer!.aggro, true);
  assert.equal(woundMore({ kind: "enemy", enemy: brute }, 5).enemy!.aggro, undefined);
});

/** A stub board from rows (bottom row first): `#` wall, `.` floor, `k` a
 * key, `@` the hero, `F` an Aggroed Flying enemy, `G` an Aggroed one on
 * the ground. */
function stub(rows: string[]) {
  const changes: Record<string, Tile> = {};
  let at = { x: 0, y: 0 };
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "#") changes[`${x},${y}`] = { kind: "wall" };
    if (c === "k") changes[`${x},${y}`] = { kind: "key", color: "yellow" };
    if (c === "F") changes[`${x},${y}`] = { kind: "floor", flyer: { ...bat, aggro: true } };
    if (c === "G") changes[`${x},${y}`] = { kind: "enemy", enemy: { ...brute, aggro: true } };
    if (c === "@") at = { x, y };
  }));
  const width = rows[0]!.length, height = rows.length;
  const board = {
    floor: 0,
    tile: (x: number, y: number): Tile => (x < 0 || y < 0 || x >= width || y >= height ? { kind: "wall" } : changes[`${x},${y}`] ?? { kind: "floor" }),
    step: (x: number, y: number, dx: number, dy: number) => ({ x: x + dx, y: y + dy }),
  };
  return { board, changes, hero: at };
}
const turnOf = (s: ReturnType<typeof stub>, foes?: Record<string, number>) => aggroTurn({ board: s.board, changes: s.changes, hero: s.hero, floorOf: () => 1, lit: new Set(), ...(foes ? { foes } : {}) });
const where = (s: ReturnType<typeof stub>) => Object.keys(s.changes).filter((k) => s.changes[k]!.flyer || s.changes[k]!.kind === "enemy").sort();

test("an Aggroed enemy steps toward the hero along open floor once a shot's worth of turns has charged, round walls, keeping its home", () => {
  const s = stub(["@....", "####.", "F...."]);
  const cost = foeShotCost(1), turns = cost / FOE_GAIN;
  for (let i = 1; i < turns; i++) assert.deepEqual(turnOf(s).steps, [], `turn ${i}: charging`);
  assert.deepEqual(turnOf(s).steps, [{ from: { x: 0, y: 2 }, to: { x: 1, y: 2 } }]);
  const moved = s.changes["1,2"]!.flyer!;
  assert.deepEqual([moved.stride, moved.home, s.changes["0,2"]], [0, "0,2", { kind: "floor" }]);
  // On round the wall: right along the bottom row, up the open column, left along the top.
  for (let i = 0; i < 10 * turns; i++) turnOf(s);
  assert.deepEqual(where(s), ["0,0"], "it hovers over the hero at last");
  assert.equal(s.changes["0,0"]!.flyer!.home, "0,2");
});

test("an Aggroed enemy never steps onto an item or another enemy; one on the ground stops beside the hero; cooldowns move with them", () => {
  const items = stub(["@k F"]);
  items.changes["2,0"] = { kind: "wall" };
  for (let i = 0; i < 40; i++) turnOf(items);
  assert.deepEqual(where(items), ["3,0"], "the key's tile and the wall block its only way");
  const ground = stub(["@...G"]);
  const cost = foeShotCost(1);
  ground.changes["4,0"] = { kind: "enemy", enemy: { ...brute, aggro: true, stride: cost - FOE_GAIN } };
  const out = turnOf(ground, { "4,0": 1234 });
  assert.deepEqual(out.foes, { "3,0": 1234 });
  for (let i = 0; i < 100; i++) turnOf(ground);
  assert.deepEqual(where(ground), ["1,0"], "beside the hero, never onto it");
  assert.equal(ground.changes["1,0"]!.enemy!.stride, cost, "waiting full");
});

test("every Aggroed enemy steps by one shared walk to the hero, the closest moving first", () => {
  const s = stub(["@..FF"]);
  for (const k of ["3,0", "4,0"]) s.changes[k] = { kind: "floor", flyer: { ...bat, aggro: true, stride: foeShotCost(1) } };
  const away = walkToHero(s.board, s.hero);
  assert.deepEqual([away.get("3,0"), away.get("4,0")], [3, 4]);
  assert.deepEqual(turnOf(s).steps.map((st) => [st.from.x, st.to.x]), [[3, 2], [4, 3]], "the nearer clears the way for the next");
});

test("Flying enemies shoot in the volley as Ranged ones do", () => {
  const tiles = new Map<string, Tile>([["1,1", { kind: "floor", flyer: bat }]]);
  const board = { tile: (x: number, y: number) => tiles.get(`${x},${y}`) ?? { kind: "floor" as const }, clear: () => {}, wound: () => {} };
  const out = volleyTurn({ board, wrap: 0, floorOf: () => 1, hero: hero(), seed: 7, volleys: { turn: 1 }, archer: false, ranks: defaults() } as VolleyTurn);
  assert.deepEqual(out.shots.map((s) => [s.by, s.from, s.damage]), [["enemy", { x: 1, y: 1 }, 7]]);
});

test("the hand's Shot ATK and Attack Speed bonuses come from FLYING ENEMY in hand", () => {
  assert.deepEqual(handBonus(["stairs", "monster"]).shot, { attack: 0, speed: 0, boss: 0 });
  assert.deepEqual(handBonus(["stairs", "flyingEnemy"]).shot, { attack: 5, speed: 5, boss: 0 });
  assert.deepEqual(cardBonusLines("flyingEnemy").map((l) => l.text), ["+5% Shot ATK", "+5% Attack Speed"], "its details say so");
  // An arrow strikes 5% harder with it.
  const tiles = new Map<string, Tile>([["0,1", { kind: "enemy", enemy: { ...brute, hp: 5000 } }]]);
  const board = { tile: (x: number, y: number) => tiles.get(`${x},${y}`) ?? { kind: "floor" as const }, clear: () => {}, wound: () => {} };
  const shoot = (handShot?: VolleyTurn["handShot"]) => volleyTurn({ board, wrap: 0, floorOf: () => 1, hero: hero(), seed: 7, volleys: { turn: 1 }, archer: true, ranks: defaults(), handShot }).shots[0]!.damage;
  assert.equal(shoot({ attack: 5, speed: 5 }), shoot() * 1.05);
});

/** A position from rows (bottom first): `#` wall, `.` floor, `@` the hero,
 * `F` a Flying enemy, `E` one on the ground. */
function position(rows: string[], reach?: number): HandAt {
  const tiles = new Map<string, Tile>(), player = hero();
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    tiles.set(`${x},${y}`, c === "#" ? { kind: "wall" } : c === "F" ? { kind: "floor", flyer: bat } : c === "E" ? { kind: "enemy", enemy: brute } : { kind: "floor" });
    if (c === "@") Object.assign(player, { x, y });
  }));
  const world: Board = {
    width: rows[0]!.length, floor: 0, clear: () => {},
    tile: (x, y) => tiles.get(`${x},${y}`) ?? { kind: "wall" },
    step: (x, y, dx, dy) => (tiles.has(`${x + dx},${y + dy}`) ? { x: x + dx, y: y + dy } : null),
  };
  return { world, run: { player } as Run, ...(reach ? { shotReach: { range: reach, wrap: 0 } } : {}) };
}

test("FLYING ENEMY walks toward the closest Flying enemy only until it is in reach, then holds its ground; ENEMY passes under them", () => {
  const at = position(["@........F"], 300);
  const plan = planHand(at, ["flyingEnemy"], "tower")!;
  assert.deepEqual(plan.path.map((s) => s.x), [1, 2, 3, 4, 5, 6], "it stops 3 tiles off");
  const near = position(["...@..F"], 300);
  assert.deepEqual(planHand(near, ["flyingEnemy"], "tower"), { card: 0, path: [] }, "in reach: a turn holding ground");
  assert.equal(planHand(position(["@..F"]), ["flyingEnemy"], "tower"), null, "no Archer, no plan");
  assert.equal(planHand(position(["@..F"], 300), ["flyingEnemy"], "tower")?.path.length, 0);
  // ENEMY walks under the Flying enemy to the one on the ground.
  assert.deepEqual(planHand(position(["@.F.E"], 300), ["monster"], "tower")!.path.map((s) => s.x), [1, 2, 3, 4]);
  assert.equal(planHand(position(["@.F.."], 300), ["monster"], "tower"), null, "nothing to fight");
});

test("in a run, FLYING ENEMY holds its ground with a Flying enemy in reach while the arrows bring it down, then the next card leads", () => {
  const g = archer(arena({ "6,0": { ...bat, attack: 0, hp: 2500 } }));
  g.run.hand = ["flyingEnemy", "stairs", "archer"];
  g.auto = true;
  for (let i = 0; i < 3; i++) g.autoTurn();
  assert.equal(g.run.player.x, 3, "it walked up to 3 tiles off");
  const turns: number[] = [];
  for (let i = 0; i < 40 && g.world.tile(6, 0).flyer; i++) {
    g.autoTurn();
    turns.push(g.run.player.x);
  }
  assert.ok(turns.every((x) => x === 3), "it held its ground");
  assert.equal(g.world.tile(6, 0).flyer, undefined, "and the arrows felled it");
});

test("Tower V's floor 10 Goal unlocks the Flying Enemy card, which joins the deck", () => {
  assert.deepEqual(checkpoint(5, 10)?.reward, { kind: "unlock", unlock: "flyingEnemyCard" });
  const save = defaults();
  assert.ok(!goalUnlocked(save, "flyingEnemyCard"));
  save.goals.claimed[5] = [10];
  assert.ok(goalUnlocked(save, "flyingEnemyCard"));
  assert.equal(CARDS.flyingEnemy.name, "Flying Enemy");
  const reloaded = decode(JSON.stringify({ ...save, hand: ["stairs", "flyingEnemy"] }));
  assert.deepEqual(reloaded.hand, ["stairs", "flyingEnemy"], "a hand may hold it once the Goal is claimed");
  assert.deepEqual(decode(JSON.stringify({ ...defaults(), hand: ["stairs", "flyingEnemy"] })).hand, ["stairs"], "and not before");
});

test("a Flying enemy that has moved keeps its loot key, so undo and a kill elsewhere can't pay it twice; saves keep it", () => {
  const g = archer(arena({}));
  g.run.changes["4,4"] = { kind: "floor", flyer: { ...bat, aggro: true, home: "2,2" }, wound: 5 };
  g.save.tower.run = g.towerRun;
  const back = decode(JSON.stringify(g.save));
  assert.deepEqual(back.tower.run.changes["4,4"], g.run.changes["4,4"], "kept with its wound");
  const bad = decode(JSON.stringify({ ...g.save, tower: { ...g.save.tower, run: { ...g.save.tower.run, changes: { "4,4": { kind: "floor", flyer: { name: 3 } } } } } }));
  assert.equal(bad.tower.run, null, "a broken one fails the run, as any broken change does");
  g.save.tower.lootedTiles = { ...g.save.tower.lootedTiles };
  const purse = (g as unknown as { purse: { killKey(e: Enemy, x: number, y: number): string } }).purse;
  assert.equal(purse.killKey({ ...bat, home: "2,2" }, 4, 4), purse.killKey(bat, 2, 2));
});

test("the inspect panel names a Flying enemy, its shots and arrows, and that only arrows reach it", () => {
  const g = arena({ "2,0": { ...bat, aggro: true } });
  const info = tileInfo(g, 2, 0);
  assert.equal(info.title, "Flying Bat");
  assert.match(info.body, /only your arrows reach it/);
  assert.match(info.body, /Aggroed/);
});
