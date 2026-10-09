import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { TRAINING, cost, levelForXp, trainingWorth, type StatTrainingRow, type UpgradeId } from "../src/config.ts";
import { deckCards, planHand, upgradeCard, type CardId } from "../src/cards.ts";
import { TREES } from "../src/skill-trees.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { EnemyStrength, Save, Tile } from "../src/entities.ts";

/** The new Inspiration card nodes, in the order they can be bought, with
 * their price, the node each needs and its card (null for a node that opens
 * research instead). */
const NODES: [UpgradeId, number, UpgradeId, CardId | null][] = [
  ["cardYellowDoor", 5, "buyQuantity", "yellowDoor"],
  ["heartDoorResilience", 10, "cardYellowDoor", null],
  ["cardHeartDoor", 5, "heartDoorResilience", "heartDoor"],
  ["cardWeakEnemy", 10, "heartDoorResilience", "weakEnemy"],
  ["cardBaseEnemy", 10, "cardWeakEnemy", "baseEnemy"],
  ["cardStrongEnemy", 10, "cardBaseEnemy", "strongEnemy"],
  ["cardEliteEnemy", 10, "cardWeakEnemy", "eliteEnemy"],
  ["cardBossEnemy", 10, "cardEliteEnemy", "bossEnemy"],
  ["cardChest", 10, "cardWeakEnemy", "chest"],
  ["blueSiphon", 10, "cardChest", "blueSiphon"],
  ["blueTrader", 10, "blueSiphon", "blueTrader"],
  ["keyToHp", 10, "blueTrader", "keyToHp"],
  ["cardRedKey", 10, "blueSiphon", "redKey"],
  ["redSiphon", 10, "cardRedKey", "redSiphon"],
  ["floorSkipReward", 10, "blueSiphon", null],
  ["cardTorch", 10, "floorSkipReward", "torch"],
  ["cardWoodenDoor", 10, "floorSkipReward", "woodenDoor"],
];

test("each card node costs its price, waits for the node above it and adds its card to the deck", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 10_000;
  for (const id of ["combatStance", "buildout", "trainers", "largerHand", "archives", "delve", "keySiphon", "buyQuantity"] as const) assert.ok(g.buy(id));
  const nodes = TREES.find((t) => t.id === "inspiration")!.nodes;
  for (const [id, price, requires, card] of NODES) {
    assert.deepEqual(nodes.find((n) => n.id === id)!.requires, [requires], id);
    assert.equal(cost(id, 0), price, id);
    assert.equal(upgradeCard(id) ?? null, card);
    if (card) assert.ok(!deckCards(g.save.upgrades).includes(card));
    const before = g.save.tower.inspiration;
    assert.ok(g.buy(id), id);
    assert.equal(before - g.save.tower.inspiration, price);
    if (card) assert.ok(deckCards(g.save.upgrades).includes(card), `${card} joins the deck`);
  }
  assert.equal(g.buy("cardTorch"), false, "bought once");
});

test("a card node can't be bought before the one above it", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 10_000;
  assert.equal(g.buy("cardYellowDoor"), false);
  g.save.upgrades.buyQuantity = 1;
  assert.equal(g.buy("cardHeartDoor"), false);
  assert.ok(g.buy("cardYellowDoor"));
  assert.equal(g.buy("cardHeartDoor"), false);
  assert.ok(g.buy("heartDoorResilience"));
  assert.ok(g.buy("cardHeartDoor"));
});

const enemy = (strength: EnemyStrength): Tile => ({ kind: "enemy", enemy: { name: "rat", hp: 1, attack: 0, defense: 0, tier: 0, strength } });

/** A Tower floor: a corridor along row 0, from x = 0 to 12, with the hero
 * at x = 6 and `side` tiles in the pockets above it (row 1). */
function floor(side: Record<number, Tile>, edit: (save: Save) => void = () => {}) {
  const save = defaults();
  save.upgrades.inspirationUndos = 1;
  edit(save);
  const g = new Game(save);
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x <= 12; x++) w.cells.set(`${x},0`, { kind: "floor" });
  for (const [x, t] of Object.entries(side)) w.cells.set(`${x},1`, t);
  w.torches = [];
  Object.assign(g.run.player, { x: 6, y: 0 });
  return g;
}
/** Where card `card` alone heads on `g`'s floor: its path's last tile. */
function target(g: Game, card: CardId) {
  const plan = planHand(g, [card], "tower");
  const last = plan?.path.at(-1);
  return last ? [last.x, last.y] : null;
}

test("each enemy card heads for its own strength, the boss card for a Greater Boss too", () => {
  const g = floor({ 5: enemy("weak"), 4: enemy("normal"), 8: enemy("strong"), 3: enemy("elite"), 10: enemy("greaterBoss") });
  assert.deepEqual(target(g, "weakEnemy"), [5, 1]);
  assert.deepEqual(target(g, "baseEnemy"), [4, 1]);
  assert.deepEqual(target(g, "strongEnemy"), [8, 1]);
  assert.deepEqual(target(g, "eliteEnemy"), [3, 1]);
  assert.deepEqual(target(g, "bossEnemy"), [10, 1]);
  const boss = floor({ 9: enemy("boss"), 11: enemy("greaterBoss") });
  assert.deepEqual(target(boss, "bossEnemy"), [9, 1], "the closest");
});

test("an enemy card passes over one it can't hurt", () => {
  const g = floor({ 5: { kind: "enemy", enemy: { name: "golem", hp: 9, attack: 0, defense: 999, tier: 0, strength: "weak" } }, 9: enemy("weak") });
  assert.deepEqual(target(g, "weakEnemy"), [9, 1]);
});

test("YELLOW DOOR heads for a single yellow door, while a yellow key is held", () => {
  const wood: Tile = { kind: "door", door: { type: "wood", durability: 30 } };
  const yellow: Tile = { kind: "door", color: "yellow" };
  const g = floor({ 5: wood, 4: { kind: "door", color: "blue" }, 9: yellow, 3: { kind: "door", door: { type: "fullHp" } } });
  g.run.player.keys.yellow = 0;
  assert.equal(target(g, "yellowDoor"), null, "no key, no target");
  g.run.player.keys.yellow = 1;
  g.run.player.keys.blue = 1;
  assert.deepEqual(target(g, "yellowDoor"), [9, 1], "not the Wooden Door or the blue one");
  assert.deepEqual(target(g, "heartDoor"), [3, 1]);
});

test("WOODEN DOOR heads for a Wooden Door a key opens or the hero can break down; DOOR only with a key", () => {
  const wood: Tile = { kind: "door", door: { type: "wood", durability: 30 } };
  const g = floor({ 4: { kind: "door", color: "yellow" }, 9: wood, 3: { kind: "door", door: { type: "fullHp" } } });
  g.run.player.keys.yellow = 0;
  g.run.player.hp = 30;
  assert.equal(target(g, "woodenDoor"), null, "no key, and breaking it would fell the hero");
  g.run.player.hp = 31;
  assert.deepEqual(target(g, "woodenDoor"), [9, 1], "it can be broken down; not the yellow door or the Heart Door");
  assert.deepEqual(target(g, "door"), [3, 1], "DOOR never breaks one down");
  g.run.player.hp = 5;
  g.run.player.keys.red = 1;
  assert.deepEqual(target(g, "woodenDoor"), [9, 1], "any one key opens it");
});

test("HEART DOOR heads for a keyed door that drains HP too, while its keys are held", () => {
  const blueHeart: Tile = { kind: "door", color: "blue", door: { type: "keys", keys: ["blue"], mode: "all", heart: true } };
  const g = floor({ 9: blueHeart });
  g.run.player.keys.blue = 0;
  assert.equal(target(g, "heartDoor"), null);
  g.run.player.keys.blue = 1;
  assert.deepEqual(target(g, "heartDoor"), [9, 1]);
});

test("CHEST heads for a treasure chest or an area reward chest, never an opened one", () => {
  const g = floor({ 5: { kind: "openedChest" }, 3: { kind: "reward", tier: "gold" }, 10: { kind: "treasure", amount: 1 } });
  assert.deepEqual(target(g, "chest"), [3, 1]);
  const t = floor({ 5: { kind: "openedChest" }, 9: { kind: "treasure", amount: 1 } });
  assert.deepEqual(target(t, "chest"), [9, 1]);
});

test("RED KEY heads for a red key; TORCH for the closest lit torch, putting it out", () => {
  const g = floor({ 5: { kind: "key", color: "yellow" }, 9: { kind: "key", color: "red" } });
  assert.deepEqual(target(g, "redKey"), [9, 1]);
  const torch = (x: number, active: boolean) => ({ x, y: 0, lightRadius: 3, baseIntensity: 1, active });
  g.world.torches = [torch(4, false), torch(10, true), torch(3, true)];
  assert.deepEqual(target(g, "torch"), [3, 0], "the unlit one at x = 4 doesn't count");
  g.run.hand = ["torch", "stairs"];
  for (let i = 0; i < 3; i++) g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [3, 0]);
  assert.equal(g.world.torches![2].active, false, "put out");
  assert.deepEqual(target(g, "torch"), [10, 0]);
});

const row = (id: "attack" | "defense") => TRAINING.find((t) => t.id === id)! as StatTrainingRow;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

for (const [card, id, color] of [["blueSiphon", "defense", "blue"], ["redSiphon", "attack", "red"]] as const) {
  test(`${card} trades ${id} training levels for a ${color} key without moving, one level more each use`, () => {
    const g = floor({}, (s) => (s.training[id] = 3));
    g.run.hand = [card, "stairs"];
    const p = g.run.player, stat = p[id], keys = p.keys[color];
    const worth = trainingWorth(row(id), levelForXp(g.save.xp));
    assert.equal(g.canAct(card), true);
    g.autoTurn();
    assert.deepEqual([p.x, p.y], [6, 0], "no step");
    assert.equal(p.keys[color], keys + 1);
    assert.ok(near(p[id], stat - worth), "the first use takes one level");
    assert.equal(g.run.loadout![id], p[id]);
    assert.deepEqual([g.cardUses(card), g.siphonLevel(card), g.siphonCost(card)], [1, 2, 2]);
    assert.equal(g.cardUses("keySiphon"), 0, "counted apart from KEY SIPHON");
    g.autoTurn();
    assert.ok(near(p[id], stat - 3 * worth), "the second takes two");
    assert.equal(g.canAct(card), false, "none left for a third");
    assert.ok(g.undo());
    assert.equal(g.cardUses(card), 1, "undo takes a use back");
    assert.equal(g.save.training[id], 3, "the hero's own training is untouched");
  });
}

test("BK TRADER trades 3 yellow keys for a blue key, while 3 are held", () => {
  const g = floor({});
  g.run.hand = ["blueTrader", "stairs"];
  const p = g.run.player;
  Object.assign(p.keys, { yellow: 7, blue: 0 });
  g.autoTurn();
  assert.deepEqual([p.x, p.keys.yellow, p.keys.blue], [6, 4, 1]);
  g.autoTurn();
  assert.deepEqual([p.keys.yellow, p.keys.blue], [1, 2]);
  assert.equal(g.canAct("blueTrader"), false);
  assert.ok(g.undo());
  assert.deepEqual([g.run.player.keys.yellow, g.run.player.keys.blue], [4, 1], "undo takes a trade back");
});

test("YK TO HP trades a yellow key for 10% of max HP, only while that much is missing", () => {
  const g = floor({});
  g.run.hand = ["keyToHp", "stairs"];
  const p = g.run.player;
  p.keys.yellow = 2;
  p.hp = p.maxHp;
  assert.equal(g.canAct("keyToHp"), false, "full HP");
  p.hp = p.maxHp * 0.95;
  assert.equal(g.canAct("keyToHp"), false, "missing only 5%");
  p.hp = p.maxHp * 0.5;
  g.autoTurn();
  assert.deepEqual([p.x, p.keys.yellow], [6, 1]);
  assert.ok(near(p.hp, p.maxHp * 0.6));
  p.keys.yellow = 0;
  assert.equal(g.canAct("keyToHp"), false, "no key");
});

test("no card acts in place in the forest", () => {
  const g = floor({}, (s) => Object.assign(s.training, { attack: 3, defense: 3 }));
  g.run.player.keys.yellow = 5;
  g.newRun({ outside: true, seed: 9 });
  for (const card of ["blueSiphon", "redSiphon", "blueTrader", "keyToHp"] as const) assert.equal(g.canAct(card), false, card);
});
