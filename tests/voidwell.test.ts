// Voidwell (docs/agents/arcana.md): a cooldown's vortex, placed out on the floor at the
// hero's shot range, which stuns the enemies within it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANA, ARCANUM_IDS, arcanum, valuesAt } from "../src/arcana/arcana.ts";
import { boundsOf, clearVoidwell, inVortex, placeVortex, stepVoidwell, stunnedTile, validVoidwell, voidwellRoll, type FloorBounds, type VoidwellRun, type Vortex } from "../src/arcana/voidwell.ts";
import { predict } from "../src/combat.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { aggroTurn } from "../src/enemies/flying.ts";
import { enemiesWithin } from "../src/enemies/ranged.ts";
import { enemyTitle } from "../src/enemies/scaling.ts";
import { noEnemies } from "../src/tower/climb.ts";
import { guardedTile } from "../src/enemies/shielded.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { startTrial } from "../src/proving-grounds/trial.ts";
import { decodeTrialArcana } from "../src/proving-grounds/trial-arcana.ts";
import { bossTurn, foeActs, stunnedIn } from "../src/proving-grounds/trial-spells.ts";
import { random } from "../src/random.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { tileInfo } from "../src/ui/tile-info.ts";
import { volleyTurn } from "../src/volley.ts";
import { World } from "../src/delve/world.ts";

const brute: Enemy = { name: "Brute", hp: 50, attack: 10, defense: 0, tier: 1, strength: "weak" };
const bounds: FloorBounds = { left: 0, right: 16, bottom: 0, top: 16 };
/** A vortex at (5, 5), its turns long. */
const here = (left = 10): Vortex => ({ x: 5, y: 5, left });

/** A Tower run at (3, 5), ATK 100, on plain floor holding `tiles`, holding Voidwell with a vortex at (5, 5) of 3 tiles' radius. */
function arena(tiles: Record<string, Tile> = {}, vortex: Vortex | null = here()) {
  const s = defaults();
  s.upgrades.inspirationUndos = 1;
  const g = new Game(s, random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) w.cells.set(`${x},${y}`, tiles[`${x},${y}`] ?? { kind: "floor" });
  Object.assign(g.run.player, { x: 3, y: 5, attack: 100, defense: 0, hp: 100_000, maxHp: 100_000 });
  g.save.arcana.owned.voidwell = [0, 0, 0];
  g.run.voidwell = { timer: 150, casts: 1, ...(vortex ? { vortex } : {}) };
  return g;
}

test("its tables are the spec's, level by level", () => {
  const [size, duration, cooldown] = ARCANA.voidwell.attributes;
  assert.deepEqual(size.steps, [[3, 0], [3.2, 5], [3.4, 12], [3.6, 19], [3.8, 26], [4, 34], [4.2, 43], [4.4, 53], [4.6, 64], [4.8, 76], [5, 89], [5.2, 103], [5.4, 118], [5.6, 134], [5.8, 151], [6, 169], [6.2, 189], [6.4, 211], [6.6, 236], [6.8, 264], [7, 295]]);
  assert.deepEqual(duration.steps, [[15, 0], [16, 5], [17, 14], [18, 23], [19, 32], [20, 41], [21, 50], [22, 59], [23, 68], [24, 77], [25, 86], [26, 95], [27, 104], [28, 113], [29, 122], [30, 131], [31, 165], [32, 224], [33, 308], [34, 417], [35, 551], [36, 710], [37, 894], [38, 1103]]);
  assert.deepEqual(cooldown.steps, [[200, 0], [190, 10], [180, 28], [170, 46], [160, 64], [150, 82], [140, 100], [130, 118], [120, 136], [110, 154], [100, 172], [90, 190], [80, 208], [70, 226], [60, 244], [50, 262]]);
  assert.deepEqual([size.name, duration.name, cooldown.name], ["Size", "Duration", "Cooldown"]);
  assert.equal(ARCANA.voidwell.trigger.on, "cooldown");
  assert.equal(ARCANUM_IDS.length, 9, "the ninth and last");
  assert.equal(ARCANUM_IDS.at(-1), "voidwell");
});

test("every arcanum with a cooldown shows a bar on its card, reading its own timer", () => {
  const g = arena();
  for (const id of ARCANUM_IDS.filter((id) => arcanum(id).trigger.on === "cooldown")) {
    const shown = g.arcana.cooldown({ id, levels: [0, 0, 0], lent: false });
    assert.ok(shown, id);
    assert.ok(shown.turns > 0 && shown.left <= shown.turns, id);
  }
  assert.deepEqual(g.arcana.cooldown({ id: "voidwell", levels: [0, 0, 0], lent: false }), { left: 150, turns: 200 });
  assert.equal(g.arcana.cooldown({ id: "overseer", levels: [0, 0, 0], lent: false }), undefined);
});

/** The distance of (x, y) from `hero`. */
const away = (hero: { x: number; y: number }, at: { x: number; y: number }) => Math.sqrt((at.x - hero.x) * (at.x - hero.x) + (at.y - hero.y) * (at.y - hero.y));
/** The vortex's edge reaches no more than a tile past the floor's, tile centers lying half a tile inside it. */
function assertFits(at: { x: number; y: number }, radius: number, b = bounds) {
  const eps = 1e-9, wide = b.right - b.left + 3 >= 2 * radius, tall = b.top - b.bottom + 3 >= 2 * radius;
  if (wide) assert.ok(at.x - radius >= b.left - 1.5 - eps && at.x + radius <= b.right + 1.5 + eps, `${JSON.stringify(at)} r ${radius}`);
  if (tall) assert.ok(at.y - radius >= b.bottom - 1.5 - eps && at.y + radius <= b.top + 1.5 + eps, `${JSON.stringify(at)} r ${radius}`);
}

test("a vortex opens at the shot range, not bound to whole tiles, at any angle that keeps it on the floor", () => {
  const hero = { x: 8, y: 8 };
  const places = Array.from({ length: 200 }, (_, i) => placeVortex({ hero, distance: 3, radius: 3, bounds, roll: i / 200 }));
  for (const at of places) {
    assert.ok(Math.abs(away(hero, at) - 3) < 1e-9, "at its range");
    assertFits(at, 3);
  }
  assert.ok(places.some((p) => !Number.isInteger(p.x)), "off the tile grid");
  // All round the hero: every quarter has some.
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) assert.ok(places.some((p) => (p.x - 8) * sx > 0 && (p.y - 8) * sy > 0));
});

test("a larger shot range puts it farther off, until the floor stops it, and then the angle keeps it on", () => {
  const hero = { x: 8, y: 8 };
  const far = (distance: number) => away(hero, placeVortex({ hero, distance, radius: 3, bounds, roll: 0.3 }));
  assert.ok(far(3) < far(5) && far(5) < far(7), "farther with range");
  for (let x = 0; x <= 16; x++) for (let y = 0; y <= 16; y += 4) for (const radius of [3, 5, 7]) for (const distance of [0.5, 3, 6, 9.5, 14, 40, 1000]) for (const roll of [0, 0.4, 0.999]) {
    const at = placeVortex({ hero: { x, y }, distance, radius, bounds, roll });
    assertFits(at, radius);
    if (distance === 3 && radius === 3) assert.ok(Math.abs(away({ x, y }, at) - 3) < 1e-9, "fits at its range anywhere on the floor");
  }
});

test("a range too long for the floor lands as far off as fits, shrinking the distance no more than it must", () => {
  const hero = { x: 2, y: 2 }, at = placeVortex({ hero, distance: 500, radius: 3, bounds, roll: 0.5 });
  assertFits(at, 3);
  // The farthest center that fits is (14.5, 14.5), its corner.
  assert.ok(away(hero, at) > away(hero, { x: 14.5, y: 14.5 }) - 1, "as far as it fits");
});

test("a vortex too wide for the floor lies across its middle", () => {
  const narrow = { left: 0, right: 4, bottom: 0, top: 16 }, at = placeVortex({ hero: { x: 1, y: 8 }, distance: 3, radius: 7, bounds: narrow, roll: 0.2 });
  assert.equal(at.x, 2);
  assertFits(at, 7, { ...narrow, left: at.x, right: at.x, bottom: 0, top: 16 });
});

test("a hero too far from anywhere it fits has it open at the nearest place that does", () => {
  const hero = { x: 0, y: 0 }, at = placeVortex({ hero, distance: 3, radius: 7, bounds, roll: 0.5 });
  assertFits(at, 7);
  assert.ok(away(hero, at) > 3, "past its range, the floor's limit outranking it");
});

test("the place is fixed by the run's seed and activation, in whole arithmetic", () => {
  assert.equal(voidwellRoll(7, 1), voidwellRoll(7, 1));
  assert.notEqual(voidwellRoll(7, 1), voidwellRoll(7, 2));
  assert.notEqual(voidwellRoll(7, 1), voidwellRoll(8, 1));
  const place = () => placeVortex({ hero: { x: 8, y: 8 }, distance: 3, radius: 3, bounds, roll: voidwellRoll(7, 3) });
  assert.deepEqual(place(), place());
});

test("the bounds are what the floor spans", () => {
  assert.deepEqual(boundsOf([{ x: 3, y: 9 }, { x: 7, y: 2 }]), { left: 3, right: 7, bottom: 2, top: 9 });
  assert.equal(boundsOf([]), undefined);
  const g = arena();
  (g.world as RoomWorld).cells.set("0,0", { kind: "wall" });
  assert.deepEqual((g.world as RoomWorld).floorBounds(), bounds);
  for (let i = 0; i < 17; i++) (g.world as RoomWorld).cells.set(`0,${i}`, { kind: "wall" });
  assert.equal((g.world as RoomWorld).floorBounds()!.left, 1, "a wall isn't the floor");
});

test("in the Delve the bounds hold the hero's own tile", () => {
  const s = defaults(), g = new Game(s, random(5));
  g.switchMode("delve");
  g.newRun({ seed: 7 });
  const p = g.run.player, b = (g.world as World).floorBounds(p.x, p.y);
  assert.ok(b && b.left <= p.x && p.x <= b.right && b.bottom <= p.y && p.y <= b.top);
});

test("the cooldown opens a vortex that stands its Duration, then ends", () => {
  const s: VoidwellRun = { timer: 2 }, rule = { duration: 3, turns: 2 }, place = () => ({ x: 1.5, y: 2.5 });
  assert.deepEqual([stepVoidwell(s, rule, place), stepVoidwell(s, rule, place)], [false, true]);
  assert.deepEqual(s.vortex, { x: 1.5, y: 2.5, left: 3 });
  assert.equal(s.casts, 1);
  const long = { duration: 3, turns: 100 }, t: VoidwellRun = { timer: 50, casts: 1, vortex: here(3) };
  stepVoidwell(t, long, place);
  assert.equal(t.vortex?.left, 2);
  stepVoidwell(t, long, place);
  assert.equal(t.vortex?.left, 1);
  stepVoidwell(t, long, place);
  assert.equal(t.vortex, undefined);
});

/** A hero about to climb real stairs at (4, 5), holding every arcanum with a cooldown, each mid-way through what it does. */
function aboutToClimb() {
  const g = arena({ "4,5": { kind: "stairs" } });
  for (const id of ["thunderbolt", "lifespring", "timeDilation", "phantasm", "necroticFrost"] as const) g.save.arcana.owned[id] = [0, 0, 0];
  g.save.tower.runArcana.timers.thunderbolt = 100;
  g.save.tower.runArcana.bolts = 2;
  g.run.lifespring = { timer: 100, pool: 1e12 };
  g.run.timeDilation = { timer: 100, left: 4 };
  g.run.phantasm = { timer: 100, turns: 3, ring: 3, ghosts: [0, 1, 2] };
  g.run.necroticFrost = { timer: 100, casts: 1, fields: [{ id: 1, angle: 9000, left: 4 }] };
  return g;
}

test("a climb interrupts no cooldown arcanum: what each has in progress carries on, its turns counted", () => {
  const g = aboutToClimb(), height = g.run.height;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.height, height + 1, "it climbed");
  assert.equal(g.world.floor, 0);
  assert.deepEqual(g.run.voidwell!.vortex, here(9), "the vortex stands where it was, a turn shorter");
  assert.equal(g.run.voidwell!.timer, 149);
  assert.ok(g.vortex, "and stands on the board");
  assert.equal(g.save.tower.runArcana.timers.thunderbolt, 99);
  assert.equal(g.save.tower.runArcana.strikes, 1, "the bolts waiting strike on arrival");
  assert.ok(g.volley?.shots.some((s) => s.thunderbolt), "at the new floor's enemies");
  assert.equal(g.run.lifespring!.timer, 99);
  assert.ok(g.run.lifespring!.pool! > 0, "the field holds");
  assert.ok(g.lifespringField);
  assert.equal(g.run.timeDilation!.timer, 99);
  assert.equal(g.run.timeDilation!.left, 3);
  assert.ok(g.dilation, "the field holds");
  assert.equal(g.run.phantasm!.timer, 99);
  assert.ok(g.run.phantasm!.ghosts!.length > 0, "the ring rides along");
  assert.ok(g.phantasms);
  assert.equal(g.run.necroticFrost!.timer, 99);
  assert.deepEqual(g.run.necroticFrost!.fields, [{ id: 1, angle: 9000, left: 3 }]);
  assert.ok(g.frostArea);
  for (const { id, left } of [{ id: "voidwell", left: 149 }, { id: "thunderbolt", left: 99 }, { id: "lifespring", left: 99 }, { id: "timeDilation", left: 99 }, { id: "phantasm", left: 99 }, { id: "necroticFrost", left: 99 }] as const)
    assert.equal(g.arcana.cooldown({ id, levels: [0, 0, 0], lent: false })!.left, left, `${id}'s bar goes on`);
});

test("a vortex carried to a new floor stuns what stands in it there, and runs out as ever", () => {
  const g = arena({ "4,5": { kind: "stairs" } }, here(2));
  assert.ok(g.move(1, 0));
  assert.equal(g.run.voidwell!.vortex!.left, 1);
  const w = g.world as RoomWorld;
  w.cells.set("5,5", { kind: "enemy", enemy: brute });
  assert.ok(w.tile(5, 5).enemy!.stunned);
  Object.assign(g.run.player, { x: 12, y: 12 });
  w.cells.set("13,12", { kind: "floor" });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.voidwell!.vortex, undefined);
  assert.ok(!w.tile(5, 5).enemy!.stunned);
});

test("the Delve's vortex goes on the same, wherever the hero walks", () => {
  const s: VoidwellRun = { timer: 50, vortex: here(10) };
  stepVoidwell(s, { duration: 3, turns: 100 }, () => ({ x: 0, y: 0 }));
  assert.deepEqual(s.vortex, here(9));
  assert.equal(s.timer, 49);
  const g = new Game(defaults(), random(5));
  g.switchMode("delve");
  g.newRun({ seed: 7 });
  g.save.arcana.owned.voidwell = [0, 0, 0];
  g.run.voidwell = { vortex: here() };
  assert.deepEqual(g.vortex, { x: 5, y: 5, radius: 3, wrap: g.world.width });
});

test("switched off, the vortex and its cooldown go, and its tiles read as they were", () => {
  const raw: Enemy = { ...brute, flying: true }, g = arena({ "5,5": { kind: "floor", flyer: raw } });
  assert.equal(g.world.tile(5, 5).kind, "enemy");
  assert.ok(g.arcana.toggle("voidwell"));
  assert.equal(g.run.voidwell!.vortex, undefined);
  assert.equal(g.run.voidwell!.timer, undefined);
  assert.equal(g.run.voidwell!.casts, 1, "the rolls go on");
  assert.equal(g.world.tile(5, 5).kind, "floor");
  const none: VoidwellRun = { timer: 1, casts: 2, vortex: here() };
  clearVoidwell(none);
  assert.deepEqual(none, { casts: 2 });
});

test("reach is Euclidean to the tile's center, round the Delve's wrap", () => {
  const zone = { x: 5, y: 5, radius: 3, wrap: 0 };
  assert.ok(inVortex(zone, 8, 5) && inVortex(zone, 5, 2));
  assert.ok(!inVortex(zone, 8, 6), "over the radius");
  assert.ok(inVortex({ ...zone, x: 0.5, y: 0, wrap: 41 }, 40, 0), "round the wrap");
  assert.ok(!inVortex({ ...zone, x: 0.5, y: 0 }, 40, 0));
  assert.ok(!stunnedTile({ kind: "enemy", enemy: brute }, 8, 6, () => zone).enemy!.stunned);
  assert.ok(stunnedTile({ kind: "enemy", enemy: brute }, 8, 5, () => zone).enemy!.stunned);
  assert.ok(!stunnedTile({ kind: "enemy", enemy: brute }, 5, 5, undefined).enemy!.stunned);
});

test("a boss or Greater Boss in it is immune: not stunned, and a Flying one stays in the air", () => {
  const zone = { x: 5, y: 5, radius: 3, wrap: 0 };
  for (const strength of ["boss", "greaterBoss"] as const) {
    const boss: Enemy = { ...brute, strength, fast: true };
    assert.equal(stunnedTile({ kind: "enemy", enemy: boss }, 5, 5, () => zone).enemy!.stunned, undefined);
    const flyer: Tile = { kind: "floor", flyer: { ...boss, flying: true } };
    assert.equal(stunnedTile(flyer, 5, 5, () => zone), flyer);
  }
  const g = arena({ "4,5": { kind: "enemy", enemy: { ...brute, strength: "boss", name: "Warden" } } });
  assert.equal(g.world.tile(4, 5).enemy!.stunned, undefined);
  assert.doesNotMatch(tileInfo(g, 4, 5).title, /Stunned/);
});

test("a Flying enemy in it comes down, wing and all, and the hero can start a fight with it", () => {
  const flyer: Enemy = { ...brute, flying: true }, g = arena({ "4,5": { kind: "floor", flyer } });
  const t = g.world.tile(4, 5);
  assert.equal(t.kind, "enemy");
  assert.equal(t.flyer, undefined);
  assert.ok(t.enemy!.flying, "its attribute shows");
  assert.ok(t.enemy!.stunned);
  assert.match(tileInfo(g, 4, 5).title, /Stunned Flying/);
  assert.match(tileInfo(g, 4, 5).body, /Stunned/);
  assert.ok(g.move(1, 0));
  assert.deepEqual([g.run.player.x, g.run.player.y], [4, 5], "the fight won, it stands there");
  assert.equal(foeOf(g, 4, 5), undefined, "it fell");
});
const foeOf = (g: Game, x: number, y: number) => { const t = g.world.tile(x, y); return t.enemy ?? t.flyer; };

test("outside it, a Flying enemy hovers as ever, and the hero walks under it", () => {
  const flyer: Enemy = { ...brute, flying: true }, g = arena({ "4,5": { kind: "floor", flyer } }, null);
  assert.equal(g.world.tile(4, 5).kind, "floor");
  assert.ok(g.move(1, 0));
  assert.ok(g.world.tile(4, 5).flyer, "still up there");
});

test("once the vortex ends, a Flying enemy is back in the air, its wound kept", () => {
  const flyer: Enemy = { ...brute, flying: true }, g = arena({ "9,5": { kind: "floor", flyer } }, { ...here(), x: 9 });
  g.world.wound!(9, 5, 5);
  assert.equal(g.world.tile(9, 5).kind, "enemy");
  delete g.run.voidwell!.vortex;
  const back = g.world.tile(9, 5);
  assert.equal(back.kind, "floor");
  assert.equal(back.flyer?.hp, 45);
  assert.equal(back.flyer?.stunned, undefined);
});

test("brought down, a Flying enemy still doesn't hold back a cleared floor, and arrows still find it over the hero", () => {
  const flyer: Enemy = { ...brute, flying: true }, g = arena({ "4,5": { kind: "floor", flyer } });
  assert.equal(g.world.tile(4, 5).kind, "enemy");
  assert.ok(noEnemies(g.world as RoomWorld), "no more than one in the air would");
  assert.ok(!noEnemies(arena({ "4,5": { kind: "enemy", enemy: brute } }).world as RoomWorld));
  assert.deepEqual(enemiesWithin(g.world, { x: 4, y: 5 }, 100).map((e) => [e.x, e.y]), [[4, 5]]);
  assert.deepEqual(enemiesWithin(arena({ "4,5": { kind: "enemy", enemy: brute } }).world, { x: 4, y: 5 }, 100), [], "an enemy on the ground under the asker isn't found");
});

test("a Fast enemy in it strikes no first blow; its attribute still shows", () => {
  const fast: Enemy = { ...brute, fast: true, hp: 1 };
  const g = arena({ "4,5": { kind: "enemy", enemy: fast } });
  const stunned = g.world.tile(4, 5).enemy!;
  assert.ok(stunned.fast, "its attribute shows");
  assert.equal(predict(g.run.player, stunned).damage, 0, "dead before it can answer");
  assert.equal(predict(g.run.player, fast).damage, 10, "out of the vortex it strikes first");
  assert.match(enemyTitle(stunned), /Stunned Fast/);
  const before = g.run.player.hp;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, before);
});

test("it still answers in a fight", () => {
  const g = arena({ "4,5": { kind: "enemy", enemy: { ...brute, hp: 150 } } }), before = g.run.player.hp;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, before - 10, "one reply between the two strikes");
});

/** The volley of a turn with the hero at the origin, a shooter at (1, 0) as the board reads it. */
function shot(tile: Tile, charge?: number) {
  const hero: Player = { x: 0, y: 0, hp: 1000, maxHp: 1000, attack: 1, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } } as Player;
  const board = { tile: (x: number, y: number): Tile => (x === 1 && y === 0 ? tile : { kind: "floor" }), clear() {}, wound() {} };
  return volleyTurn({ board, wrap: 0, floorOf: () => 1, hero, seed: 1, volleys: { turn: 1, ...(charge === undefined ? {} : { foes: { "1,0": charge } }) }, archer: false, ranks: defaults() });
}

test("a Ranged enemy in it doesn't fire, and its cooldown stands still", () => {
  const ranged: Enemy = { ...brute, ranged: true };
  assert.equal(shot({ kind: "enemy", enemy: ranged }).shots.length, 1, "out of it, ready, it fires");
  const stunned = shot({ kind: "enemy", enemy: { ...ranged, stunned: true } });
  assert.equal(stunned.shots.length, 0);
  assert.equal(stunned.volleys.foes, undefined, "ready it was, ready it stays");
  assert.deepEqual(shot({ kind: "enemy", enemy: { ...ranged, stunned: true } }, 123).volleys.foes, { "1,0": 123 });
});

test("through a real turn, a stunned shooter holds its fire", () => {
  const ranged: Enemy = { ...brute, ranged: true };
  const g = arena({ "5,6": { kind: "enemy", enemy: ranged } });
  g.save.tower.tier = 3;
  const hp = g.run.player.hp;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, hp);
  assert.ok(!g.volley?.shots.some((s) => s.by === "enemy"));
});

test("an Aggroed enemy in it doesn't step, or gather its stride", () => {
  const flyer: Enemy = { ...brute, flying: true, aggro: true, stride: 10 };
  const changes: Record<string, Tile> = { "5,5": { kind: "floor", flyer } };
  const board = { floor: 0, tile: (x: number, y: number): Tile => changes[`${x},${y}`] ?? { kind: "floor" }, step: (x: number, y: number, dx: number, dy: number) => ({ x: x + dx, y: y + dy }) };
  const turn = { board, changes, hero: { x: 5, y: 3 }, floorOf: () => 1, lit: new Set<string>() };
  const held = aggroTurn({ ...turn, stunnedAt: () => true });
  assert.deepEqual(held.steps, []);
  assert.equal(changes["5,5"]!.flyer!.stride, 10);
  const free = aggroTurn(turn);
  assert.equal((changes["5,5"]!.flyer ?? flyer).stride! > 10 || free.steps.length > 0, true);
});

test("a Shielded enemy's bubble still guards what the vortex stuns", () => {
  const shieldBearer: Enemy = { ...brute, shielded: true };
  const g = arena({ "5,5": { kind: "enemy", enemy: shieldBearer } });
  const stunned = g.world.tile(5, 5).enemy!;
  assert.ok(stunned.stunned && stunned.shielded);
  // A bubble over a stunned tile, the board guarding after the stun.
  const t = guardedTile(stunnedTile({ kind: "floor", flyer: { ...brute, flying: true } }, 5, 5, () => ({ x: 5, y: 5, radius: 3, wrap: 0 })), 5, 5, [{ x: 5, y: 5, floor: 1 }], () => true);
  assert.ok(t.enemy!.guard, "the bubble cuts the fight with it");
});

test("a turn's activation opens it on the floor at the hero's shot range, and undo takes it back", () => {
  const g = arena({}, null);
  g.run.voidwell = { timer: 1 };
  assert.ok(g.move(1, 0));
  const v = g.run.voidwell.vortex!, hero = g.run.player;
  assert.ok(v, "it opened");
  assert.equal(v.left, 15);
  assert.ok(Math.abs(away(hero, v) - 3) < 1e-9);
  assert.deepEqual(g.vortex, { x: v.x, y: v.y, radius: 3, wrap: 0 });
  assert.ok(g.undo());
  assert.equal(g.run.voidwell!.vortex, undefined);
  assert.equal(g.run.voidwell!.timer, 1);
});

test("it survives the save", () => {
  const g = arena();
  const back = decode(JSON.stringify(g.save));
  assert.deepEqual(back.tower.run!.voidwell, g.run.voidwell);
  assert.ok(validVoidwell({ timer: 1, casts: 2, vortex: { x: 1.25, y: -0.5, left: 3 } }));
  assert.ok(!validVoidwell({ vortex: { x: "a", y: 1, left: 3 } }));
  assert.ok(!validVoidwell({ vortex: { x: 1, y: 1, left: 0 } }));
  assert.ok(!validVoidwell({ timer: -1 }));
});

test("its card reads its effect", () => {
  assert.equal(arcanum("voidwell").effect!(valuesAt("voidwell", [0, 0, 0])), "3.0 tiles · 15 turns");
  assert.match(arcanum("voidwell").summary(valuesAt("voidwell", [20, 23, 15])), /Every 50 turns, a vortex of 7\.0 tiles' radius.*38 turns/);
});

/** A trial's arena with the hero at the entrance, a vortex at the boss. */
function trial(vortex: Vortex | undefined) {
  const s = startTrial({ maxHp: 10000, attack: 50, defense: 0 }, "manual", [], 12, 1, "light-elemental");
  s.room = "arena";
  s.player.x = 12;
  s.player.y = 7;
  s.arcana = { run: { toggles: 0, off: [], timers: {} }, beamTurns: 0, voidwell: { timer: 50, casts: 1, ...(vortex ? { vortex } : {}) }, spells: { overseer: false, voidwell: { radius: 3, duration: 15, turns: 200, reach: 300 } } };
  return s;
}

test("in a trial, what it stuns takes no steps and a turret's clock stops, but it still answers a hit", () => {
  const s = trial({ x: 12, y: 12, left: 5 });
  assert.ok(stunnedIn(s, s.elemental));
  assert.ok(!stunnedIn(s, { x: 1, y: 12 }));
  assert.equal(foeActs(s, s.elemental, "move:minion:1"), false);
  assert.equal(foeActs(s, s.elemental, "minion:1"), true);
  s.steps = 10;
  const due = bossTurn(s, s.elemental, "turret");
  assert.equal(s.arcana!.lag!.turret, 100, "a whole turn held back");
  assert.equal(due(10), false, "what fell due doesn't");
  const free = trial(undefined);
  free.steps = 10;
  assert.equal(bossTurn(free, free.elemental, "turret")(10), true);
  assert.equal(foeActs(free, free.elemental, "move:minion:1"), true);
});

test("in a trial, the boss is immune: it steps and its clock runs in a vortex", () => {
  const s = trial({ x: 12, y: 12, left: 5 });
  assert.ok(stunnedIn(s, s.elemental), "it stands in the vortex");
  assert.equal(foeActs(s, s.elemental, "move:boss"), true);
  s.steps = 10;
  assert.equal(bossTurn(s, s.elemental)(10), true);
  assert.equal(s.arcana!.lag?.boss, undefined);
});

test("a trial's vortex opens on the arena's floor and is saved with the attempt", () => {
  const s = defaults();
  s.arcana.owned.voidwell = [20, 0, 0];
  const g = new Game(s, random(5));
  g.newRun({ outside: true, seed: 12 });
  const state = startTrial({ maxHp: 10000, attack: 50, defense: 0 }, "manual", [], 12, 1, "light-elemental");
  state.room = "arena";
  state.player.x = 12;
  state.player.y = 3;
  state.arcana = { run: { toggles: 0, off: [], timers: {} }, beamTurns: 0, voidwell: { timer: 1 } };
  const session = new TrialSession(g, state);
  session.sync();
  assert.equal(state.arcana.spells!.voidwell!.radius, 7);
  assert.equal(state.arcana.spells!.voidwell!.reach, 300);
  assert.equal(session.game.run.voidwell, state.arcana.voidwell);
  assert.equal(decodeTrialArcana({ run: {}, beamTurns: 0, voidwell: { timer: 3, vortex: { x: 12.5, y: 12, left: 3 } } })!.voidwell!.vortex!.x, 12.5);
  assert.equal(decodeTrialArcana({ run: {}, beamTurns: 0, voidwell: { vortex: "no" } })!.voidwell, undefined);
});
