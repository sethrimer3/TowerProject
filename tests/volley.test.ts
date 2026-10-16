import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { volleyTurn, type VolleyTurn } from "../src/volley.ts";
import { FOE_GAIN, foeShotCost, type Volleys } from "../src/ranged.ts";
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

test("ready Ranged enemies shoot closest first, and the first shot that fells the hero ends the volley: the rest hold, the Archer doesn't shoot", () => {
  const t = turn({ "2,1": { ...shooter, name: "Third" }, "1,0": { ...shooter, name: "First" }, "0,2": { ...shooter, name: "Second" } }, { hero: hero({ hp: 10 }), archer: true });
  const out = volleyTurn(t);
  assert.deepEqual(out.shots.map((s) => [s.by, s.from, s.damage]), [["enemy", { x: 1, y: 0 }, 7], ["enemy", { x: 0, y: 2 }, 7]]);
  assert.equal(out.hp, 0);
  assert.equal(out.fell?.name, "Second");
  assert.ok(out.hurt);
  assert.deepEqual(out.kills, []);
  assert.deepEqual(out.volleys, { turn: 1, foes: { "1,0": 0, "0,2": 0 } });
  assert.equal(t.hero.hp, 10, "the hero it was given is left alone");
});

test("a charge whose tile no longer holds a Ranged enemy is dropped; one out of reach charges on; a charge over the cost carries past the shot", () => {
  const cost = foeShotCost(1);
  const volleys: Volleys = { turn: 4, foes: { "5,5": 100, "8,8": 1000, "1,0": cost - FOE_GAIN + 300 } };
  const out = volleyTurn(turn({ "8,8": shooter, "1,0": shooter }, { volleys }));
  assert.deepEqual(out.shots.map((s) => s.from), [{ x: 1, y: 0 }]);
  assert.deepEqual(out.volleys.foes, { "8,8": 1000 + FOE_GAIN, "1,0": 300 });
  assert.equal(out.hp, 93);
});

test("under Rapid Fire the Archer fires several arrows a turn, each leaving later, the next aiming at what the last left standing", () => {
  const t = turn({ "1,0": goblin, "2,0": goblin }, { archer: true, volleys: { turn: 1, hero: 0, rapid: 100 } });
  t.ranks.training.attackSpeed = 100;
  const out = volleyTurn(t);
  assert.deepEqual(out.shots.map((s) => [s.by, s.to.x, s.hp]), [["hero", 1, 0], ["hero", 2, 0]]);
  assert.ok(out.shots[0]!.lead! < out.shots[1]!.lead!);
  assert.deepEqual(out.kills.map((k) => [k.at, k.enemy.name, k.instakill]), [[{ x: 1, y: 0 }, "Goblin", true], [{ x: 2, y: 0 }, "Goblin", true]]);
  assert.equal(t.board.tiles.size, 0, "both cleared from the board");
});

test("an arrow that doesn't fell its enemy wounds it on the board; one shot a turn flies without a lead", () => {
  const t = turn({ "0,1": { ...goblin, hp: 3000 } }, { archer: true });
  const out = volleyTurn(t);
  assert.deepEqual(out.shots.map((s) => [s.damage, s.before, s.hp, s.full, s.lead]), [[1000, 3000, 2000, 3000, undefined]]);
  assert.equal(t.board.tiles.get("0,1")!.wound, 1000);
  assert.deepEqual(out.kills, []);
  assert.deepEqual(out.volleys, { turn: 1, hero: 0 });
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
