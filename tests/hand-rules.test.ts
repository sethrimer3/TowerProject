import { test } from "node:test";
import assert from "node:assert/strict";
import { HandRules } from "../src/hand-rules.ts";
import { defaults } from "../src/save.ts";
import type { BadgeId } from "../src/badges.ts";
import type { Board } from "../src/board.ts";
import type { CardId } from "../src/cards.ts";
import type { Enemy, Tile } from "../src/entities.ts";
import type { Run } from "../src/runs.ts";

const BOSS: Enemy = { name: "Boss", hp: 9, attack: 1, defense: 0, tier: 0, strength: "boss" };
const LEGEND: Record<string, Tile> = {
  "#": { kind: "wall" }, ".": { kind: "floor" }, "@": { kind: "floor" }, K: { kind: "key", color: "yellow" },
  S: { kind: "stairs" }, B: { kind: "enemy", enemy: BOSS },
};

/** Hand rules over a Tower floor drawn row by row, the first row highest
 * (`@` is the hero), with a plain object as their host: no Game. */
function rules(rows: string[], hand: CardId[] = ["yellowKey"]) {
  const height = rows.length, width = rows[0].length;
  const at = (x: number, y: number) => rows[height - 1 - y]?.[x];
  let px = 0, py = 0;
  rows.forEach((row, j) => [...row].forEach((c, x) => { if (c === "@") [px, py] = [x, height - 1 - j]; }));
  const world: Board = {
    width,
    floor: 0,
    tile: (x, y) => LEGEND[at(x, y) ?? "#"],
    step: (x, y, dx, dy) => (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height ? null : { x: x + dx, y: y + dy }),
    clear: () => {},
  };
  const player = { x: px, y: py, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
  const run = { player, seed: 7, height: 10, hand } as unknown as Run & { height: number };
  const host = { save: defaults(), run, world, mode: "tower" as const, hand, keyCost: 1000 };
  return { r: new HandRules(host), run, host };
}
function badge(run: Run, card: CardId, id: BadgeId, level = 1, pick = 0) {
  run.badges = { ...run.badges, [card]: [...(run.badges?.[card] ?? []), { id, level, pick }] };
}

test("Stairward works on the floor it was used on, then rests until its floors have passed", () => {
  const { r, run } = rules(["@.K"]);
  badge(run, "yellowKey", "stairward");
  assert.deepEqual(r.cardRules("yellowKey"), { stairward: true }, "never used: it works");
  r.coolDown("yellowKey");
  assert.deepEqual(run.badgeFloors, { stairward: 10 });
  assert.deepEqual(r.cardRules("yellowKey"), { stairward: true }, "the floor it was used on");
  run.height = 16;
  assert.equal(r.cardRules("yellowKey"), undefined, "level 1 rests for 7 floors");
  run.height = 17;
  assert.deepEqual(r.cardRules("yellowKey"), { stairward: true });
  run.outside = true;
  assert.equal(r.cardRules("yellowKey"), undefined, "in the forest no badge has a rule");
});

test("gates merge: any closed one closes the card, and a focused card's path isn't dropped", () => {
  const { r, run } = rules(["@.K"]);
  badge(run, "yellowKey", "hpGate");
  badge(run, "yellowKey", "yellowAtLeast");
  run.player.hp = 50;
  assert.deepEqual(r.cardRules("yellowKey"), { closed: true }, "below full HP, but no yellow key held");
  assert.ok(r.gateShut("yellowKey"));
  run.player.keys.yellow = 1;
  assert.deepEqual(r.cardRules("yellowKey"), { closed: false });
  run.player.hp = 100;
  assert.ok(r.gateShut("yellowKey"));
  run.focused = "yellowKey";
  assert.ok(!r.gateShut("yellowKey"), "a focus overrides the gate");
});

test("Skip draws its run's own stream, moving on only once a roll is spent", () => {
  const draws = () => {
    const { r, run } = rules(["@.K"]);
    badge(run, "yellowKey", "skip", 7);
    const out: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      assert.equal(r.skipHits("yellowKey"), r.skipHits("yellowKey"), "asking again draws nothing");
      out.push(r.skipHits("yellowKey"));
      r.skipRolled();
    }
    assert.equal(run.skipRolls, 40);
    return out;
  };
  const a = draws();
  assert.deepEqual(draws(), a, "the same seed skips the same rolls");
  assert.ok(a.includes(true) && a.includes(false));
});

test("Skip rolls for neither a boss, a torch, nor STAIRS short of the stairs", () => {
  const { r, run } = rules(["@BKS"], ["monster", "yellowKey", "stairs", "torch"]);
  for (const card of ["monster", "yellowKey", "stairs", "torch"] as const) badge(run, card, "skip");
  assert.ok(!r.rollsSkip("monster", 1, 0), "a boss");
  assert.ok(r.rollsSkip("yellowKey", 2, 0));
  assert.ok(!r.rollsSkip("stairs", 2, 0), "the Delve's climb has no stairs");
  assert.ok(r.rollsSkip("stairs", 3, 0));
  assert.ok(!r.rollsSkip("torch", 2, 0));
});

test("Deprioritize marks its level's targets, rests, and raises the ? nearest by walk", () => {
  // (0,2) is closer as the crow flies, but the wall makes (4,0) nearer by walk.
  const { r, run } = rules([".....", "####.", "@...."]);
  badge(run, "yellowKey", "deprioritize", 2);
  const mark = r.cardRules("yellowKey")!.deprioritize!;
  mark(0, 2);
  mark(4, 0);
  assert.deepEqual(r.badgeMarks, { asked: ["0,2", "4,0"], bangs: [] });
  assert.deepEqual([...r.marked], ["0,2", "4,0"]);
  assert.deepEqual(r.cardRules("yellowKey"), { closed: true }, "its marks made, it closes");
  assert.ok(r.cardResting("yellowKey"));
  assert.ok(r.raiseBang());
  assert.deepEqual(r.badgeMarks, { asked: ["0,2"], bangs: ["4,0"] }, "the nearer by walk became !");
  assert.ok(!r.cardResting("yellowKey"), "it heads for the !");
  assert.deepEqual(r.cardRules("yellowKey"), { bang: new Set(["4,0"]) });
  r.unmark(4, 0);
  assert.deepEqual(r.badgeMarks, { asked: ["0,2"], bangs: [] });
  run.height = 11;
  assert.deepEqual(r.badgeMarks, { asked: [], bangs: [] }, "the marks stay on their floor");
});

test("Ignore takes a tile once a floor, never a wall or the hero's own", () => {
  const { r, run } = rules(["@.#"]);
  assert.ok(!r.ignore(2, 0), "a wall");
  assert.ok(!r.ignore(0, 0), "the hero's tile");
  assert.ok(r.ignore(1, 0));
  assert.ok(!r.ignore(1, 0), "already ignored");
  assert.deepEqual([...r.ignored], ["1,0"]);
  run.height = 11;
  assert.equal(r.ignored.size, 0, "a new floor");
  assert.ok(r.ignore(1, 0));
});

test("Card Groups' links: the run's inside, the saved ones in the forest", () => {
  const { r, run, host } = rules(["@.K"], ["stairs", "yellowKey"]);
  host.save.cardLinks = [["stairs", "yellowKey"]];
  assert.deepEqual(r.links, [false, false], "the run went in without them");
  delete run.hand;
  assert.deepEqual(r.links, [true, false]);
});
