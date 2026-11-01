// Overseer (docs/agents/arcana.md): beams that turn with each turn and multiply
// the hero's ATK against what stands in them, on every hit that comes from ATK.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANA, arcanaOpen, valuesAt } from "../src/arcana/arcana.ts";
import { beamDirection, beamFactor, inBeams, type Beams } from "../src/arcana/overseer.ts";
import { predict, thornDamage } from "../src/combat.ts";
import { ARROW_COST, arrowDamage, TURN_TICKS } from "../src/enemies/ranged.ts";
import { bearing } from "../src/exact.ts";
import { trainedAmount } from "../src/progression/training.ts";
import { shownTick } from "../src/render/effects/overseer-beams.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { volleyTurn, type VolleyTurn } from "../src/volley.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import type { TowerRun } from "../src/runs.ts";
import { playedSave } from "./first-skills.ts";

const rat = (hp = 50, over: Partial<Enemy> = {}): Enemy => ({ name: "rat", hp, attack: 1, defense: 0, tier: 0, strength: "normal", ...over });
const beams = (over: Partial<Beams> = {}): Beams => ({ count: 1, width: 30, bonus: 8, turns: 0, ...over });

test("the attribute tables hold the spec's rows", () => {
  const [bonus, angle, quantity] = ARCANA.overseer.attributes;
  assert.equal(bonus.steps.length, 31);
  assert.deepEqual([bonus.steps[0], bonus.steps[1], bonus.steps[12], bonus.steps[30]], [[8, 0], [9.4, 5], [24.8, 150], [50, 2900]]);
  bonus.steps.forEach(([value], i) => assert.equal(value, (80 + 14 * i) / 10));
  assert.equal(angle.steps.length, 61);
  assert.deepEqual([angle.steps[0], angle.steps[1], angle.steps[30], angle.steps[31], angle.steps[60]], [[30, 0], [31, 5], [60, 324], [61, 337], [90, 1584]]);
  angle.steps.forEach(([value], i) => assert.equal(value, 30 + i));
  assert.deepEqual(quantity.steps, [[1, 0], [2, 375], [3, 850], [4, 2500]]);
  assert.deepEqual(valuesAt("overseer", [0, 0, 0]), [8, 30, 1]);
  assert.equal(bonus.shown(9.4), "9.4×");
  assert.equal(angle.shown(31), "31°");
});

test("bearing agrees with Math.atan2, clockwise from up the board", () => {
  assert.deepEqual([[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]].map(([x, y]) => Math.round(bearing(x!, y!))), [0, 45, 90, 135, 180, 225, 270, 315]);
  for (let dx = -40; dx <= 40; dx += 0.37)
    for (let dy = -40; dy <= 40; dy += 0.53) {
      const exact = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, off = Math.abs(bearing(dx, dy) - exact);
      assert.ok(Math.min(off, 360 - off) < 1e-9, `${dx}, ${dy}`);
    }
});

test("whether a tile is in a beam calls no function an engine may round its own way", () => {
  const names = ["atan", "atan2", "sin", "cos", "tan", "asin", "acos", "pow", "exp", "log", "hypot"] as const, kept = names.map((n) => Math[n]);
  for (const n of names) (Math as unknown as Record<string, () => never>)[n] = () => { throw new Error(`Math.${n}`); };
  try {
    assert.ok(inBeams(beams(), 0, 0.2, 3));
  } finally {
    names.forEach((n, i) => ((Math as unknown as Record<string, unknown>)[n] = kept[i]));
  }
});

test("the beams turn 4 degrees a turn, a hundredth of that each tick, and wrap round", () => {
  assert.deepEqual([beamDirection(0), beamDirection(1), beamDirection(2, 50), beamDirection(89), beamDirection(90)], [0, 400, 1000, 35600, 0]);
  assert.equal(beamDirection(3, TURN_TICKS), beamDirection(4));
});

test("the beams as drawn turn with the turn being shown", () => {
  assert.equal(shownTick(null, 500, false), TURN_TICKS, "no turn showing: its end");
  assert.equal(shownTick({ at: 100, ms: 200 }, 200, false), TURN_TICKS / 2);
  assert.equal(shownTick({ at: 100, ms: 200 }, 50, false), 0, "stamped after the frame");
  assert.equal(shownTick({ at: 100, ms: 200 }, 900, false), TURN_TICKS);
  assert.equal(shownTick({ at: 100, ms: 200 }, 200, true), TURN_TICKS, "reduced motion");
});

test("a beam covers half its width each side, its edge counted, and more beams spread evenly", () => {
  const north = beams();
  assert.ok(inBeams(north, 0, 0, 5));
  assert.equal(inBeams(north, 0, 5, 0), false);
  assert.equal(inBeams(north, 0, 0, -5), false, "one beam has no back");
  assert.ok(inBeams(beams({ width: 90 }), 0, 5, 5), "45 degrees off a 90 degree beam");
  assert.equal(inBeams(beams({ width: 89 }), 0, 5, 5), false);
  assert.ok(inBeams(beams({ count: 2 }), 0, 0, -5), "two are 180 degrees apart");
  assert.equal(inBeams(beams({ count: 2 }), 0, 5, 0), false);
  assert.ok(inBeams(beams({ count: 3 }), 0, 5 * Math.sin((Math.PI * 2) / 3), 5 * Math.cos((Math.PI * 2) / 3)), "three are 120 degrees apart");
  assert.ok(inBeams(beams({ count: 4 }), 0, 5, 0), "four are 90 degrees apart");
  assert.ok(inBeams(beams({ count: 4 }), 0, -5, 0));
  for (let d = 0; d < 360; d += 7) assert.ok(inBeams(beams({ count: 4, width: 90 }), 33, 3 * Math.sin((d * Math.PI) / 180), 3 * Math.cos((d * Math.PI) / 180)), "four at 90 degrees miss nothing");
  assert.ok(inBeams(north, 0, 0, 0), "the hero's own spot is in them");
  assert.equal(beamFactor(undefined, 0, 0, 5), 1);
  assert.equal(beamFactor(north, 0, 0, 5), 8);
  assert.equal(beamFactor(north, 0, 5, 0), 1);
});

/** An open board holding `foes` by tile, wounding and clearing them as the boards do. */
function board(foes: Record<string, Enemy>) {
  const tiles = new Map<string, Tile>(Object.entries(foes).map(([k, enemy]) => [k, { kind: "enemy", enemy }]));
  return {
    tile: (x: number, y: number): Tile => tiles.get(`${x},${y}`) ?? { kind: "floor" },
    clear: (x: number, y: number) => void tiles.delete(`${x},${y}`),
    wound(x: number, y: number, damage: number) {
      const t = tiles.get(`${x},${y}`)!;
      tiles.set(`${x},${y}`, { ...t, enemy: { ...t.enemy!, hp: t.enemy!.hp - damage }, wound: (t.wound ?? 0) + damage });
    },
    floorEnemies: () => [...tiles.keys()].map((k) => { const [x, y] = k.split(",").map(Number); return { x: x!, y: y! }; }),
  };
}
const hero = (over: Partial<Player> = {}) => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
/** The shots of a turn on `foes`, the Archer's charge filling at `tick`. */
function arrowAt(tick: number, foes: Record<string, Enemy>, over: Partial<VolleyTurn> = {}) {
  const save = defaults(), speed = trainedAmount(save, "attackSpeed");
  return volleyTurn({ board: board(foes), wrap: 0, floorOf: () => 1, hero: hero(), seed: 7, volleys: { turn: 1, hero: ARROW_COST - tick * speed }, archer: true, ranks: save, ...over } as VolleyTurn).shots;
}
const huge = rat(1e6);

test("an arrow strikes with the bonus only while its target is in a beam, read as the beams stand the tick it fires", () => {
  // The beam reaches due north at tick 25 of the turn after 86 (344 + 1 = 345 degrees: 15 off).
  const turned = beams({ turns: 86 });
  assert.equal(arrowAt(24, { "0,2": huge }, { beams: turned })[0]!.damage, arrowAt(24, { "0,2": huge })[0]!.damage, "not yet");
  assert.equal(arrowAt(25, { "0,2": huge }, { beams: turned })[0]!.damage, 8 * arrowAt(25, { "0,2": huge })[0]!.damage, "the beam has reached it");
});

test("an arrow reads where the hero stands mid-step", () => {
  // Walking north to (0, 1), an enemy at (1, 1) goes from 45 degrees off to due east, into the beam at 88 degrees.
  const walk = { hero: hero({ x: 0, y: 1 }), from: { x: 0, y: 0 } }, turned = beams({ turns: 22 }), foes = { "1,1": huge };
  assert.equal(arrowAt(1, foes, { ...walk, beams: turned })[0]!.damage, arrowAt(1, foes, walk)[0]!.damage, "45 degrees off as it sets out");
  assert.ok(Math.abs(arrowAt(100, foes, { ...walk, beams: turned })[0]!.damage / arrowAt(100, foes, walk)[0]!.damage - 8) < 1e-9, "in the beam as it arrives");
});

test("beams read the short way round a board that wraps", () => {
  // Column 9 of a 10-wide board lies one tile west.
  const west = beams({ turns: 68 }), plain = arrowAt(1, { "9,0": huge }, { wrap: 10 })[0]!.damage;
  assert.equal(arrowAt(1, { "9,0": huge }, { wrap: 10, beams: west })[0]!.damage, 8 * plain, "272 degrees points west");
});

test("the beams let an arrow hurt what it could not, so it aims there", () => {
  const armored = rat(1e6, { defense: 40 }), shots = arrowAt(1, { "0,1": armored }, { beams: beams() });
  assert.equal(shots.length, 1);
  assert.equal(shots[0]!.damage, 80 - 40);
  assert.equal(arrowAt(1, { "0,1": armored }).length, 0, "no beam, no target");
});

test("a ricochet strikes with the bonus only on an enemy in a beam, whatever the arrow's target", () => {
  const rule = { boost: 2, rebounds: 1, chance: 100 }, foes = { "0,1": huge, "2,0": huge };
  const out = arrowAt(1, foes, { ricochet: rule, beams: beams() });
  assert.deepEqual(out.filter((s) => s.ricochet).map((s) => [s.to, s.damage]), [[{ x: 2, y: 0 }, 20]], "east of the beam: plain");
  const both = arrowAt(1, foes, { ricochet: rule, beams: beams({ count: 4 }) });
  assert.equal(both.find((s) => s.ricochet)!.damage, 160, "in a beam: 2 x 8 x ATK");
});

test("thorns take a share of HP, the same in a beam or out", () => {
  const p = hero({ thorns: 10 }), foe = rat(100);
  assert.equal(thornDamage({ ...p, beamAttack: 50 }, foe), thornDamage(p, foe));
});

test("the bonus comes before DEF", () => {
  assert.equal(arrowDamage(hero(), rat(100, { defense: 5 }), 0, 1, 8), 80 - 5);
  assert.equal(predict(hero({ beamAttack: 8 }), rat(100, { defense: 5 })).hit, 80 - 5);
});

function lay(g: Game, cells: Record<number, Tile>) {
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 30; x++) w.cells.set(`${x},0`, cells[x] ?? { kind: "floor" });
  w.torches = [];
}
/** A Tower corridor along the bottom row, the hero at its west end with ATK
 * 10, holding Overseer at these levels (four beams, one due east, by default). */
function corridor(cells: Record<number, Tile>, levels: [number, number, number] = [0, 0, 3]) {
  const s = playedSave();
  s.upgrades.inspirationUndos = 1;
  s.arcana.owned.overseer = levels;
  const g = new Game(s);
  g.newRun({ seed: 7 });
  lay(g, cells);
  Object.assign(g.run.player, { x: 0, y: 0, attack: 10, hp: 100, maxHp: 100 });
  g.run.hand = ["monster"];
  return g;
}
const foe = (hp: number, over: Partial<Enemy> = {}): Tile => ({ kind: "enemy", enemy: rat(hp, over) });

test("a fight strikes with the bonus against an enemy in a beam, and previews go without", () => {
  const g = corridor({ 1: foe(80) });
  assert.equal(g.fighterAt({ x: 1, y: 0 }).beamAttack, 8);
  assert.equal(g.run.player.beamAttack, undefined);
  assert.equal(predict(g.run.player, rat(80)).turns, 8, "the preview counts ATK 10");
  assert.equal(predict(g.fighterAt({ x: 1, y: 0 }), rat(80)).turns, 1, "the fight, ATK 80");
  assert.ok(g.move(1, 0));
  assert.equal(g.world.tile(1, 0).kind, "floor");
  assert.equal(g.run.player.hp, 100, "felled at a stroke");
  assert.equal(g.run.player.attack, 10, "the hero's ATK is its own again");
  assert.equal(g.run.player.beamAttack, undefined);
});

test("a fight outside the beams, or with Overseer off, strikes plainly", () => {
  const g = corridor({ 1: foe(80) }, [0, 0, 0]);
  assert.equal(g.fighterAt({ x: 1, y: 0 }).beamAttack, undefined, "one beam points north, the enemy lies east");
  g.run.beamTurns = 23;
  assert.equal(g.fighterAt({ x: 1, y: 0 }).beamAttack, 8, "92 degrees");
  g.arcana.toggle("overseer");
  assert.equal(g.fighterAt({ x: 1, y: 0 }).beamAttack, undefined);
});

test("the beams multiply a Dash Combo's ATK, and get a fight past an impervious DEF", () => {
  const g = corridor({ 1: foe(1, { defense: 50 }) });
  g.run.combo = { next: 1, idle: 0 };
  assert.equal(predict(g.fighterAt({ x: 1, y: 0 }), rat(1000)).hit, 10 * 1.2 * 8);
  assert.ok(g.move(1, 0), "ATK 96 passes DEF 50");
  assert.equal(g.world.tile(1, 0).kind, "floor");
});

test("every turn turns the beams, on or off, however far it came; undo turns them back", () => {
  const g = corridor({ 3: { kind: "stairs" } });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.beamTurns, 1, "with no volley to play");
  assert.equal(g.arcana.beams?.turns, 1);
  assert.ok(g.turnClock, "the board turns them by its clock");
  g.arcana.toggle("overseer");
  assert.equal(g.arcana.beams, undefined);
  assert.ok(g.move(1, 0));
  assert.equal(g.run.beamTurns, 2, "off, they go on turning");
  g.undo();
  assert.equal(g.run.beamTurns, 1);
  lay(g, { 3: { kind: "stairs" } });
  g.arcana.toggle("overseer");
  assert.ok(g.move(1, 0));
  assert.ok(g.move(1, 0));
  assert.equal(g.run.height, 1, "climbed");
  assert.equal(g.run.beamTurns, 3, "a climb is a turn too");
  g.newRun({ seed: 7 });
  assert.equal(g.run.beamTurns, undefined, "a new run starts them over");
});

test("a Game's arrows read the beams from the turn just begun", () => {
  const damage = (on: boolean) => {
    const g = corridor({ 2: foe(1e6) });
    g.run.hand = [...g.hand, "archer"];
    assert.ok(g.isArcher);
    g.run.volleys = { turn: 0 };
    if (!on) g.arcana.toggle("overseer");
    assert.ok(g.move(1, 0));
    return g.world.tile(2, 0).wound!;
  };
  assert.ok(Math.abs(damage(true) / damage(false) - 8) < 1e-9);
});

test("a Bomb in a beam deals the bonus, one outside it doesn't", () => {
  const bomb = (levels: [number, number, number]) => {
    const g = corridor({ 3: foe(1000) }, levels);
    g.save.upgrades.bombs = 1;
    g.save.provisions.bomb = 1;
    g.newRun({ seed: 7 });
    lay(g, { 3: foe(1000) });
    Object.assign(g.run.player, { x: 0, y: 0, attack: 10 });
    assert.equal(g.arm("bomb"), "armed");
    assert.equal(g.useArmed(3, 0), "used");
    return g.world.tile(3, 0).wound;
  };
  assert.equal(bomb([0, 0, 3]), 80);
  assert.equal(bomb([0, 0, 0]), 10);
});

test("a save keeps the beams' turns, and drops a malformed count", () => {
  const g = corridor({});
  g.run.beamTurns = 12;
  assert.equal((decode(JSON.stringify(g.save)).tower.run as TowerRun).beamTurns, 12);
  (g.run as { beamTurns?: unknown }).beamTurns = -1;
  assert.equal((decode(JSON.stringify(g.save)).tower.run as TowerRun).beamTurns, undefined);
});

test("a lent Overseer works at its lent levels", () => {
  const g = new Game(playedSave());
  g.newRun({ seed: 7 });
  (g.run as TowerRun).shrine = { picked: [], rolls: 0, arcana: ["overseer"] };
  assert.deepEqual(g.arcana.beams, { bonus: 27.6, width: 45, count: 1, turns: 0 });
});

test("with Dev free purchases the Arcana tab opens with no Arcanite, and buying and upgrading cost nothing", () => {
  const g = new Game(defaults());
  assert.equal(arcanaOpen(g.save), false);
  g.save.settings.freePurchases = true;
  assert.equal(arcanaOpen(g.save), true);
  const [id] = g.arcana.offer();
  assert.equal(g.arcana.buy(id!), "done");
  assert.equal(g.arcana.upgrade(id!, 0), "done");
  assert.equal(g.save.arcana.owned[id!]![0], 1);
  assert.equal(g.save.arcanite, 0);
  g.save.settings.freePurchases = false;
  assert.equal(g.arcana.upgrade(id!, 0), "short");
});
