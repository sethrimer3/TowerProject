import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { trainedAmount } from "../src/config.ts";
import { landsAt, leavesAt, volleyTurn, type VolleyTurn } from "../src/volley.ts";
import { ShotsInFlight, shotFlight } from "../src/render/volley-art.ts";
import { ARROW_COST, FOE_GAIN, FOE_REACH, foeGain, foeRange, foeShotCost, foeTickGain, reachTicks, TURN_TICKS, within, type Volleys } from "../src/enemies/ranged.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const shooter: Enemy = { name: "Archer", hp: 50, attack: 7, defense: 0, tier: 3, strength: "normal", ranged: true };
const goblin: Enemy = { name: "Goblin", hp: 50, attack: 7, defense: 0, tier: 3, strength: "normal" };

/** An open board holding `foes` by tile, wounding and clearing them as the
 * boards do. */
function board(foes: Record<string, Enemy>) {
  const tiles = new Map<string, Tile>(Object.entries(foes).map(([k, enemy]) => [k, { kind: "enemy", enemy }]));
  return {
    tiles,
    tile: (x: number, y: number): Tile => tiles.get(`${x},${y}`) ?? { kind: "floor" },
    clear: (x: number, y: number) => void tiles.delete(`${x},${y}`),
    wound(x: number, y: number, damage: number) {
      const t = tiles.get(`${x},${y}`)!;
      tiles.set(`${x},${y}`, { ...t, enemy: { ...t.enemy!, hp: t.enemy!.hp - damage }, wound: (t.wound ?? 0) + damage });
    },
  };
}
const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 1000, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
function turn(foes: Record<string, Enemy>, over: Partial<VolleyTurn> = {}): VolleyTurn & { board: ReturnType<typeof board> } {
  const save = defaults();
  return { board: board(foes), wrap: 0, floorOf: () => 1, hero: hero(), seed: 7, volleys: { turn: 1 }, archer: false, ranks: save, ...over } as VolleyTurn & { board: ReturnType<typeof board> };
}
/** The Archer's charge that fills its arrow at `tick` of the turn, at the default Attack Speed. */
const archerReadyAt = (tick: number) => ARROW_COST - tick * trainedAmount(defaults(), "attackSpeed");
/** A Ranged enemy's charge that fills its shot at `tick` of the turn, on floor 1. */
const foeReadyAt = (tick: number) => foeShotCost(1) - tick * foeTickGain(shooter);
const fired = (out: ReturnType<typeof volleyTurn>) => out.shots.map((s) => [s.by, s.tick]);

test("ready Ranged enemies shoot closest first, and the first shot that fells the hero ends the volley: the rest hold", () => {
  const t = turn({ "2,1": { ...shooter, name: "Third" }, "1,0": { ...shooter, name: "First" }, "0,2": { ...shooter, name: "Second" } }, { hero: hero({ hp: 10 }) });
  const out = volleyTurn(t);
  assert.deepEqual(out.shots.map((s) => [s.by, s.from, s.damage, s.tick]), [["enemy", { x: 1, y: 0 }, 7, 1], ["enemy", { x: 0, y: 2 }, 7, 1]]);
  assert.equal(out.hp, 0);
  assert.equal(out.fell?.name, "Second");
  assert.ok(out.hurt);
  assert.deepEqual(out.kills, []);
  assert.deepEqual(out.volleys, { turn: 1, foes: { "1,0": 0, "0,2": 0 } });
  assert.equal(t.hero.hp, 10, "the hero it was given is left alone");
});

test("in a tick both fire in, the Archer's arrow lands first: an enemy it fells doesn't shoot", () => {
  const t = turn({ "2,1": { ...shooter, name: "Third" }, "1,0": { ...shooter, name: "First" }, "0,2": { ...shooter, name: "Second" } }, { hero: hero({ hp: 10 }), archer: true });
  const out = volleyTurn(t);
  assert.deepEqual(out.shots.map((s) => [s.by, s.by === "hero" ? s.to : s.from, s.tick]), [["hero", { x: 1, y: 0 }, 1], ["enemy", { x: 0, y: 2 }, 1], ["enemy", { x: 2, y: 1 }, 1]]);
  assert.deepEqual(out.kills.map((k) => k.enemy.name), ["First"]);
  assert.equal(out.fell?.name, "Third");
  assert.deepEqual(out.volleys, { turn: 1, hero: 0, foes: { "0,2": 0, "2,1": 0 } });
});

test("shots resolve in the order they become ready through the turn: an arrow at 0.4 fells an enemy that would shoot at 0.6, and the other way round", () => {
  const play = (archerAt: number, foeAt: number, foe: Enemy = shooter) =>
    volleyTurn(turn({ "1,0": foe }, { archer: true, volleys: { turn: 1, hero: archerReadyAt(archerAt), foes: { "1,0": foeReadyAt(foeAt) } } }));
  const first = play(40, 60);
  assert.deepEqual(fired(first), [["hero", 40]], "felled before it was ready");
  assert.deepEqual([first.hp, first.kills.length, first.volleys.foes], [100, 1, undefined]);
  const second = play(60, 40);
  assert.deepEqual(fired(second), [["enemy", 40], ["hero", 60]]);
  assert.deepEqual([second.hp, second.kills.length], [93, 1]);
  const felled = play(60, 40, { ...shooter, attack: 500 });
  assert.deepEqual(fired(felled), [["enemy", 40]], "the hero fell before its arrow was ready");
  assert.deepEqual([felled.hp, felled.kills], [0, []]);
  assert.deepEqual(fired(play(50, 50)), [["hero", 50]], "the same tick: the arrow first");
});

test("a shot fires the tick its target comes into reach mid-step: 4 tiles off, stepping toward it with 3.5 tiles' reach, halfway", () => {
  const t = turn({ "4,0": { ...goblin, hp: 3000 } }, { archer: true, hero: hero({ x: 1 }), from: { x: 0, y: 0 } });
  t.ranks.training.attackRange = 10;
  assert.equal(trainedAmount(t.ranks, "attackRange"), 350);
  const out = volleyTurn(t);
  assert.deepEqual(out.shots.map((s) => [s.tick, s.from, s.to]), [[50, { x: 0.5, y: 0 }, { x: 4, y: 0 }]]);
  // Its cooldown runs from that tick: half a turn charged by the turn's end.
  assert.equal(out.volleys.hero, 50 * trainedAmount(t.ranks, "attackSpeed"));
  // A Ranged enemy's 2.5 tiles, stepping from 3 off to 2: halfway too, its shot landing where the step ends.
  const foe = volleyTurn(turn({ "7,0": shooter }, { hero: hero({ x: 5 }), from: { x: 4, y: 0 } }));
  assert.deepEqual(foe.shots.map((s) => [s.tick, s.from, s.to]), [[50, { x: 7, y: 0 }, { x: 5, y: 0 }]]);
});

test("a turn that came farther than a step (a dash) counts as standing all turn where it ended", () => {
  const out = volleyTurn(turn({ "7,0": shooter }, { hero: hero({ x: 5 }), from: { x: 2, y: 0 } }));
  assert.deepEqual(fired(out), [["enemy", 1]]);
  assert.deepEqual(fired(volleyTurn(turn({ "7,0": shooter }, { hero: hero({ x: 5 }) }))), [["enemy", 1]], "no tile it began on: it stood still");
});

test("a cooldown starts over from the tick its shot fired: every 10 turns at the same tick", () => {
  let volleys: Volleys = { turn: 0, foes: { "1,0": foeReadyAt(40) } };
  const shots: [number, number][] = [];
  for (let i = 1; i <= 21; i++) {
    const out = volleyTurn(turn({ "1,0": shooter }, { volleys: { ...volleys, turn: i } }));
    for (const s of out.shots) shots.push([i, s.tick]);
    volleys = out.volleys;
  }
  assert.deepEqual(shots, [[1, 40], [11, 40], [21, 40]]);
});

test("a charge whose tile no longer holds a Ranged enemy is dropped; one out of reach charges on; a charge over the cost carries past the shot", () => {
  const cost = foeShotCost(1);
  const volleys: Volleys = { turn: 4, foes: { "5,5": 100, "8,8": 1000, "1,0": cost - FOE_GAIN + 300 } };
  const out = volleyTurn(turn({ "8,8": shooter, "1,0": shooter }, { volleys }));
  assert.deepEqual(out.shots.map((s) => [s.from, s.tick]), [[{ x: 1, y: 0 }, 40]]);
  assert.deepEqual(out.volleys.foes, { "8,8": 1000 + FOE_GAIN, "1,0": 300 });
  assert.equal(out.hp, 93);
});

test("a Fast Ranged enemy charges twice as fast, so it shoots twice as often as a plain one on the same floor, twice a turn once its cooldown is half a turn", () => {
  assert.equal(foeGain({ ...shooter, fast: true }), 2 * FOE_GAIN);
  assert.equal(foeGain(shooter), FOE_GAIN);
  assert.equal(foeTickGain(shooter) * TURN_TICKS, FOE_GAIN, "a whole number a tick");
  const fire = (enemy: Enemy, floor: number, turns: number) => {
    let volleys: Volleys = { turn: 0 }, shots = 0;
    const ticks: number[][] = [];
    for (let i = 1; i <= turns; i++) {
      const out = volleyTurn(turn({ "1,0": enemy }, { floorOf: () => floor, volleys: { ...volleys, turn: i } }));
      shots += out.shots.length;
      ticks.push(out.shots.map((s) => s.tick));
      volleys = out.volleys;
    }
    return { shots, ticks };
  };
  // 4,750 a shot: every 9.5 turns, or 4.75 for a Fast one.
  assert.equal(fire(shooter, 251, 40).shots, 5);
  assert.equal(fire({ ...shooter, fast: true }, 251, 40).shots, 9);
  assert.deepEqual(fire({ ...shooter, fast: true }, 4501, 2).ticks, [[1, 51], [1, 51]]);
});

test("under Rapid Fire the Archer fires several arrows a turn, each leaving later, the next aiming at what the last left standing", () => {
  const t = turn({ "1,0": goblin, "2,0": goblin }, { archer: true, volleys: { turn: 1, hero: 0, rapid: 100 } });
  t.ranks.training.attackSpeed = 100;
  const out = volleyTurn(t);
  assert.deepEqual(out.shots.map((s) => [s.by, s.to.x, s.hp]), [["hero", 1, 0], ["hero", 2, 0]]);
  assert.ok(out.shots[0]!.tick < out.shots[1]!.tick);
  assert.deepEqual(out.kills.map((k) => [k.at, k.enemy.name, k.instakill]), [[{ x: 1, y: 0 }, "Goblin", true], [{ x: 2, y: 0 }, "Goblin", true]]);
  assert.equal(t.board.tiles.size, 0, "both cleared from the board");
});

test("an arrow that doesn't fell its enemy wounds it on the board; an arrow waiting ready fires as the turn begins", () => {
  const t = turn({ "0,1": { ...goblin, hp: 3000 } }, { archer: true });
  const out = volleyTurn(t);
  assert.deepEqual(out.shots.map((s) => [s.damage, s.before, s.hp, s.full, s.tick]), [[1000, 3000, 2000, 3000, 1]]);
  assert.equal(t.board.tiles.get("0,1")!.wound, 1000);
  assert.deepEqual(out.kills, []);
  assert.deepEqual(out.volleys, { turn: 1, hero: (TURN_TICKS - 1) * trainedAmount(t.ranks, "attackSpeed") });
});

test("reachTicks gives exactly the ticks a step is within reach, against tick-by-tick distances, and a still hero's reach is the old Euclidean one", () => {
  const steps = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const range of [300, 305, 350, 495, 800])
    for (const [scale, limit] of [[1, range * range], [FOE_REACH.scale, FOE_REACH.limit(range)]] as const)
      for (let dx = -9; dx <= 9; dx++)
        for (let dy = -9; dy <= 9; dy++)
          for (const [ux, uy] of steps) {
            const ticks: number[] = [];
            for (let k = 1; k <= TURN_TICKS; k++) {
              const x = 100 * dx + ux! * k, y = 100 * dy + uy! * k;
              if ((x * x + y * y) * scale <= limit) ticks.push(k);
            }
            const span = reachTicks(dx, dy, ux!, uy!, limit, scale);
            const want = ticks.length ? { first: ticks[0], last: ticks.at(-1) } : undefined;
            assert.deepEqual(span, want, `range ${range}/${scale}, off (${dx}, ${dy}), step (${ux}, ${uy})`);
            if (want) assert.equal(ticks.length, want.last! - want.first! + 1, "one span");
            if (!ux && !uy) assert.equal(!!span, within(dx, dy, scale === 1 ? range : foeRange(range)));
          }
});

test("a shot leaves on the display frame nearest its tick, a tie going to the later frame, and lands SHOT_FLIGHT of a turn later", () => {
  const shot = { by: "hero" as const, from: { x: 0, y: 0 }, to: { x: 3, y: 0 }, damage: 1, tick: 50 }, volley = { at: 1000, ms: 100, shots: [shot] };
  assert.deepEqual([leavesAt(volley, shot), landsAt(volley, shot)], [1050, 1100]);
  // A turn drawn over five frames, its first as it begins: halfway shows on the third.
  const frames = (times: number[], dt: number) => times.map((now) => shotFlight(volley, shot, now, dt / 2));
  assert.deepEqual(frames([1000, 1025, 1050, 1075, 1100], 25), [undefined, undefined, 0, 0.5, undefined]);
  // Halfway between two frames: the later; just past one: that one, starting where it should have been.
  assert.deepEqual(frames([1020, 1040, 1060, 1080], 20), [undefined, undefined, 0.2, 0.6]);
  assert.deepEqual(frames([1030, 1047, 1064], 17), [undefined, 0, 0.28]);
});

test("a shot the hero lives through costs its shooter the hero's thorns, a share of its full HP, wounding or felling it; a shot that fells the hero costs nothing", () => {
  const thorny = hero({ thorns: 30 });
  const wounded = turn({ "1,0": shooter }, { hero: thorny });
  const out = volleyTurn(wounded);
  assert.deepEqual(out.shots.map((s) => [s.by, s.damage, s.thorns, s.before, s.hp, s.full, s.fell]), [["enemy", 7, 15, 50, 35, 50, undefined]]);
  assert.deepEqual([out.hp, out.kills], [93, []]);
  assert.deepEqual([wounded.board.tile(1, 0).enemy?.hp, wounded.board.tile(1, 0).wound], [35, 15]);
  // Wounded to 20 of its 50 HP, 30% of its full HP fells it, and it is paid as a Thorns kill.
  const felled = turn({}, { hero: thorny });
  felled.board.tiles.set("1,0", { kind: "enemy", enemy: { ...shooter, hp: 20 }, wound: 30 });
  const last = volleyTurn(felled);
  assert.deepEqual(last.shots.map((s) => [s.thorns, s.before, s.hp, s.full, s.fell?.name]), [[15, 20, 5, 50, undefined]]);
  felled.board.tiles.set("1,0", { kind: "enemy", enemy: { ...shooter, hp: 10 }, wound: 40 });
  const kill = volleyTurn(felled);
  assert.deepEqual(kill.shots.map((s) => [s.thorns, s.hp, s.fell?.name]), [[15, 0, "Archer"]]);
  assert.deepEqual(kill.kills, [{ enemy: { ...shooter, hp: 10 }, at: { x: 1, y: 0 }, instakill: false, crits: 0, thorns: true }]);
  assert.equal(felled.board.tile(1, 0).kind, "floor");
  assert.equal(kill.volleys.foes, undefined, "its cooldown goes with it");
  // The shot that fells the hero costs the shooter nothing.
  const fatal = turn({ "1,0": shooter }, { hero: hero({ thorns: 30, hp: 5 }) });
  const end = volleyTurn(fatal);
  assert.deepEqual([end.fell?.name, end.shots[0]!.thorns, fatal.board.tile(1, 0).enemy?.hp], ["Archer", undefined, 50]);
  // A shot the shroud blocks whole is still lived through.
  assert.equal(volleyTurn(turn({ "1,0": shooter }, { hero: hero({ thorns: 30, shroud: 10 }) })).shots[0]!.thorns, 15);
});

test("a Flying shooter's thorns wound it where it hovers", () => {
  const t = turn({}, { hero: hero({ thorns: 50 }) });
  t.board.tiles.set("1,0", { kind: "floor", flyer: { ...goblin, flying: true } });
  t.board.wound = (x, y, damage) => {
    const tile = t.board.tiles.get(`${x},${y}`)!;
    t.board.tiles.set(`${x},${y}`, { ...tile, flyer: { ...tile.flyer!, hp: tile.flyer!.hp - damage }, wound: (tile.wound ?? 0) + damage });
  };
  const out = volleyTurn(t);
  assert.deepEqual(out.shots.map((s) => [s.from, s.thorns, s.hp]), [[{ x: 1, y: 0 }, 25, 25]]);
  assert.equal(t.board.tile(1, 0).flyer?.hp, 25);
});

test("the shots in flight keep a turn's last shots flying into the next, and an enemy an arrow felled stands until it lands", () => {
  const goblinShot = (tick: number, x: number) => ({ by: "hero" as const, from: { x: 0, y: 0 }, to: { x, y: 0 }, damage: 50, tick, fell: goblin });
  const first = { at: 0, ms: 100, shots: [goblinShot(100, 2)] }, second = { at: 100, ms: 100, shots: [goblinShot(10, 3)] };
  const world = board({}), flying = new ShotsInFlight(), shown = flying.board(world);
  assert.equal(flying.board(world), shown, "one board object for as long as the board is");
  flying.update(first, 90, 0);
  assert.deepEqual([shown.tile(2, 0).kind, shown.tile(2, 0).enemy?.name], ["enemy", "Goblin"]);
  flying.update(second, 120, 0);
  assert.equal(flying.volleys.length, 2, "the first's arrow still flies as the next turn's leaves");
  assert.equal(shown.tile(3, 0).kind, "enemy");
  flying.update(second, 150, 0);
  assert.deepEqual([flying.volleys.length, shown.tile(2, 0).kind, shown.tile(3, 0).kind], [1, "floor", "enemy"], "landed at 150: gone");
  assert.ok(!flying.over(150) && flying.over(160));
  flying.update(null, 151, 0);
  assert.deepEqual([flying.volleys, shown.tile(3, 0).kind], [[], "floor"], "undo drops them all");
  // A felled flyer hovers on until its arrow lands.
  flying.update({ at: 0, ms: 100, shots: [{ ...goblinShot(50, 4), fell: { ...goblin, flying: true } }] }, 60, 0);
  assert.deepEqual([shown.tile(4, 0).kind, shown.tile(4, 0).flyer?.name], ["floor", "Goblin"]);
  // A shooter its own shot's thorns felled stands where it shot from until the shot lands.
  flying.update({ at: 0, ms: 100, shots: [{ by: "enemy", from: { x: 5, y: 0 }, to: { x: 0, y: 0 }, damage: 1, tick: 50, thorns: 50, fell: shooter }] }, 60, 0);
  assert.deepEqual([shown.tile(5, 0).enemy?.name, shown.tile(0, 0).kind], ["Archer", "floor"]);
});

test("Multishot Chance at 99 ranks makes about 49.5% of shots multishots, a fixed roll per run, turn and tile", () => {
  const multishots = (ranks: number, turns: number[]) =>
    turns.map((n) => {
      const t = turn({ "1,0": { ...goblin, hp: 3000 }, "0,1": { ...goblin, hp: 3000 } }, { archer: true, volleys: { turn: n } });
      t.ranks.training.multishotChance = ranks;
      return volleyTurn(t).shots.length === 2;
    });
  const all = Array.from({ length: 4000 }, (_, i) => i + 1);
  const hits = multishots(99, all).filter(Boolean).length;
  assert.ok(Math.abs(hits / 4000 - 0.495) < 0.03, `about 49.5%: ${hits / 4000}`);
  assert.deepEqual(multishots(99, [17, 17, 18, 18]), [...multishots(99, [17, 17]), ...multishots(99, [18, 18])]);
  assert.ok(multishots(0, all.slice(0, 200)).every((m) => !m));
});
