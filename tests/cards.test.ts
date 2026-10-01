import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_HAND, BASE_HAND_SLOTS, CARD_IDS, HAND_SLOT_GEMS, MAX_HAND_SLOTS, deckCards, handSlots, nextHandSlotGems, moveCard, placeCard, planHand, upgradeCard, type CardId } from "../src/cards.ts";
import { defaults } from "../src/save.ts";
import type { Board, Position } from "../src/board.ts";
import type { Enemy, Run, Tile } from "../src/entities.ts";

const WEAK: Enemy = { name: "Weak", hp: 1, attack: 1, defense: 0, tier: 0, strength: "normal" };
/** Hits hard enough to kill the hero, but can be fought. */
const LETHAL: Enemy = { name: "Lethal", hp: 500, attack: 500, defense: 0, tier: 0, strength: "normal" };
/** Too well armoured to be hurt at all. */
const IMPERVIOUS: Enemy = { name: "Wall", hp: 5, attack: 1, defense: 99, tier: 0, strength: "normal" };

const LEGEND: Record<string, Tile> = {
  "#": { kind: "wall" }, ".": { kind: "floor" }, "@": { kind: "floor" }, S: { kind: "stairs" },
  P: { kind: "potion" }, D: { kind: "door", color: "yellow" }, H: { kind: "door", door: { type: "fullHp" } },
  K: { kind: "key", color: "yellow" }, M: { kind: "enemy", enemy: WEAK }, L: { kind: "enemy", enemy: LETHAL },
  I: { kind: "enemy", enemy: IMPERVIOUS }, A: { kind: "attack" }, T: { kind: "treasure" }, O: { kind: "oneway" },
  V: { kind: "stairsDown" },
};

/** A board drawn row by row, the first row highest; `@` is the hero. The
 * board wraps sideways when `wrap` is set, like the Delve. */
function board(rows: string[], hero: Partial<Run["player"]> = {}, wrap = false): Position {
  const height = rows.length, width = rows[0].length;
  const at = (x: number, y: number) => rows[height - 1 - y]?.[x];
  let px = 0, py = 0;
  rows.forEach((row, j) => [...row].forEach((c, x) => { if (c === "@") [px, py] = [x, height - 1 - j]; }));
  const world: Board = {
    width,
    floor: 0,
    tile: (x, y) => LEGEND[at(x, y) ?? "#"],
    step: (x, y, dx, dy) => {
      let nx = x + dx;
      if (wrap) nx = (nx + width) % width;
      if (nx < 0 || nx >= width || y + dy < 0 || y + dy >= height) return null;
      // A one-way gate is only entered climbing.
      if (at(nx, y + dy) === "O" && dy !== 1) return null;
      return { x: nx, y: y + dy };
    },
    clear: () => {},
  };
  const player = { x: px, y: py, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...hero };
  return { world, run: { player } as Run };
}

/** The card the hand plays, and where its path ends. */
function play(at: Position, hand: readonly CardId[] = CARD_IDS, mode: "tower" | "delve" = "tower") {
  const plan = planHand(at, hand, mode);
  if (!plan) return null;
  const end = plan.path.at(-1)!;
  return { card: hand[plan.card], to: [end.x, end.y], steps: plan.path.length };
}

test("the first card in the hand that can reach a target moves the hero", () => {
  const rows = [
    "S#...",
    "##...",
    "@..PK",
  ];
  // The stairs are walled off, so STAIRS falls through to HEAL.
  assert.deepEqual(play(board(rows)), { card: "heal", to: [3, 0], steps: 3 });
  assert.deepEqual(play(board(rows), ["key", "heal"]), { card: "key", to: [4, 0], steps: 4 });
});

test("each card heads for its own kind of target", () => {
  const only = (tile: string, hero = {}) => play(board([`@.${tile}`], hero), CARD_IDS)?.card ?? null;
  assert.equal(only("S"), "stairs");
  assert.equal(only("P"), "heal");
  assert.equal(only("K"), "key");
  assert.equal(only("M"), "monster");
  assert.equal(only("A"), "equipment");
  assert.equal(only("D", { keys: { yellow: 1, blue: 0, red: 0 } }), "door");
  assert.equal(only("T"), null, "EQUIPMENT doesn't head for chests");
  assert.equal(only("."), null, "an empty floor gives no card anything to do");
});

test("a door is a target only with its keys held, a Heart Door only at full HP", () => {
  assert.equal(play(board(["@.D"])), null);
  assert.equal(play(board(["@.H"]))?.card, "door");
  assert.equal(play(board(["@.H"], { hp: 50 })), null);
});

test("MONSTER takes on any monster that can be fought, lethal or not, but never an impervious one", () => {
  assert.equal(play(board(["@.L"]))?.card, "monster");
  assert.equal(play(board(["@.I"])), null);
  assert.deepEqual(play(board(["M.@.I"]))?.to, [0, 0]);
});

test("the closest target is the one fewest steps away, not the nearest as the crow flies", () => {
  const rows = [
    "@#P",
    ".#.",
    "...",
    "P..",
  ];
  // The potion two tiles to the right is seven steps round the wall.
  assert.deepEqual(play(board(rows)), { card: "heal", to: [0, 0], steps: 3 });
});

test("a path crosses items, taking them, but not doors, monsters or other stairs", () => {
  assert.deepEqual(play(board(["@KPTS"])), { card: "stairs", to: [4, 0], steps: 4 });
  assert.equal(play(board(["@MS"]), ["stairs"]), null, "a monster in the way blocks the path");
  assert.equal(play(board(["@DS"], { keys: { yellow: 1, blue: 0, red: 0 } }), ["stairs"]), null, "so does a door");
  assert.equal(play(board(["@SS"]), ["key"]), null, "stairs are only ever a target");
});

test("the hand only looks at the floor the hero stands on: it never heads down or through stairs", () => {
  assert.equal(play(board(["@.V"])), null, "the stairs down are never a target");
  assert.equal(play(board(["@VP"])), null, "nor crossed");
  assert.deepEqual(play(board(["@SP"])), { card: "stairs", to: [1, 0], steps: 1 }, "the stairs up end a path");
});

test("in the Delve, STAIRS climbs to the highest open tile in view above the hero", () => {
  const rows = [
    ".##",
    "...",
    "#.#",
    "#@#",
  ];
  assert.deepEqual(play(board(rows), ["stairs"], "delve"), { card: "stairs", to: [0, 3], steps: 4 });
  assert.equal(play(board(["...", ".@."]), ["stairs"], "tower"), null, "a Tower floor has no climbing without stairs");
  assert.equal(play(board(["###", ".@."]), ["stairs", "heal"], "delve"), null, "nothing above: the card falls through");
});

test("the Delve's paths wrap across the sides and climb through one-way gates", () => {
  const wrapped = board(["P#@"], {}, true);
  assert.deepEqual(play(wrapped, ["heal"]), { card: "heal", to: [0, 0], steps: 1 });
  const gate = board([".", "O", "@"]);
  assert.deepEqual(play(gate, ["stairs"], "delve"), { card: "stairs", to: [0, 2], steps: 2 });
});

test("the deck starts as the base hand, and HEAL and EQUIPMENT join it with their skills", () => {
  const none = defaults().upgrades;
  assert.deepEqual(BASE_HAND, ["stairs", "door", "key", "monster"]);
  assert.equal(BASE_HAND.length, BASE_HAND_SLOTS, "the base hand fills the base slots");
  assert.deepEqual(deckCards(none), ["stairs", "door", "key", "monster"]);
  assert.deepEqual(deckCards({ ...none, cardHeal: 1 }), ["stairs", "heal", "door", "key", "monster"]);
  assert.deepEqual(deckCards({ ...none, cardHeal: 1, cardGear: 1 }), CARD_IDS);
  assert.equal(upgradeCard("cardGear"), "equipment");
  assert.equal(upgradeCard("focus"), undefined);
});

test("a deck card dropped on a slot slides the others later, or in a full hand swaps out the card there, never STAIRS", () => {
  const hand: CardId[] = ["stairs", "door", "key"];
  assert.deepEqual(placeCard(hand, "heal", 1, 5), ["stairs", "heal", "door", "key"]);
  assert.deepEqual(placeCard(hand, "heal", 0, 5), ["heal", "stairs", "door", "key"]);
  assert.deepEqual(placeCard(hand, "heal", 4, 5), ["stairs", "door", "key", "heal"], "an empty slot takes it after the last card");
  const full: CardId[] = ["stairs", "door", "key", "monster"];
  assert.deepEqual(placeCard(full, "heal", 2, 4), ["stairs", "door", "heal", "monster"]);
  assert.equal(placeCard(full, "heal", 0, 4), null);
  assert.deepEqual(full, ["stairs", "door", "key", "monster"], "the hand itself is left alone");
});

test("the hand holds four cards, five with Larger Hand, and one more for each slot bought with Gems", () => {
  const upgrades = defaults().upgrades;
  assert.equal(handSlots({ upgrades, handSlots: 0 }), 4);
  assert.equal(nextHandSlotGems({ upgrades, handSlots: 0 }), null, "none for sale before Larger Hand");
  const larger = { ...upgrades, largerHand: 1 };
  assert.equal(handSlots({ upgrades: larger, handSlots: 0 }), 5);
  assert.deepEqual(HAND_SLOT_GEMS, [50, 200, 400, 600, 800, 1000]);
  assert.deepEqual(HAND_SLOT_GEMS.map((_, n) => nextHandSlotGems({ upgrades: larger, handSlots: n })), [...HAND_SLOT_GEMS]);
  assert.equal(nextHandSlotGems({ upgrades: larger, handSlots: HAND_SLOT_GEMS.length }), null, "every slot bought");
  assert.equal(handSlots({ upgrades: larger, handSlots: HAND_SLOT_GEMS.length }), MAX_HAND_SLOTS);
  assert.equal(MAX_HAND_SLOTS, 11);
});

test("a hand can plan one card alone, for a Focus", () => {
  const rows = ["S..", "...", "@.K"];
  assert.equal(play(board(rows), ["stairs", "key"])?.card, "stairs");
  assert.deepEqual(planHand(board(rows), ["stairs", "key"], "tower", 1)?.card, 1);
  assert.equal(planHand(board(["@.K"]), ["stairs", "key"], "tower", 0), null, "the focused card alone, never the next");
});

test("moving a card shifts each card between its old and new slots over one", () => {
  const hand: CardId[] = ["stairs", "heal", "door", "key", "monster"];
  assert.deepEqual(moveCard(hand, 0, 3), ["heal", "door", "key", "stairs", "monster"]);
  assert.deepEqual(moveCard(hand, 4, 1), ["stairs", "monster", "heal", "door", "key"]);
  assert.deepEqual(moveCard(hand, 2, 2), hand);
  assert.deepEqual(hand, ["stairs", "heal", "door", "key", "monster"], "the hand given is left alone");
});
