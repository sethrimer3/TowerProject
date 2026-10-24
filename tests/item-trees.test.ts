import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { MAX_CARD_XP } from "../src/cards/levels.ts";
import { CARD_TREES, freeUpChances, nodeOpen, treeBonus, type CardTreeLevels } from "../src/cards/trees.ts";
import { bout, OPENING_HOLD_MS, OPENING_SHRINK_MS, predict, squaredUp } from "../src/combat.ts";
import { enemyBar } from "../src/board-popups.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { isTreasureFloor } from "../src/board.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import type { CardId } from "../src/cards/cards.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const hero: Player = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
const foe = (hp: number, strength: Enemy["strength"] = "normal", attack = 4): Enemy => ({ name: "rat", hp, attack, defense: 0, tier: 0, strength });

/** A Tower run on seed 7 with `card` in its hand, `levels` on its tree. */
function treeRun(card: CardId, levels: Record<string, number>) {
  const s = defaults();
  s.cardXp[card] = MAX_CARD_XP;
  s.cardBuys.opened = { [card]: Object.fromEntries(CARD_TREES[card]!.map((n) => [n.id, n.max - n.levels])) };
  s.cardTrees = { [card]: levels };
  s.hand = [...s.hand.filter((c) => c !== card), card];
  const g = new Game(s);
  g.newRun({ seed: 7 });
  return g;
}
/** A corridor along y = 0: the hero at x = 0 and `tiles` from x = 1 on,
 * the run's trees `trees`. */
function corridor(tiles: Tile[], trees: CardTreeLevels) {
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 8; x++) w.cells.set(`${x},0`, tiles[x - 1] ?? { kind: "floor" });
  w.torches = [];
  Object.assign(g.run.player, { x: 0, y: 0 });
  g.run.cardTrees = trees;
  return g;
}

test("ATK UP, DEF UP, TORCH and CHEST trees: their tracks through every rarity", () => {
  const shape = (card: CardId) => CARD_TREES[card]!.map((n) => `${n.id}:${n.rarity}:${n.levels}/${n.max}${n.after ? `<${n.after}` : ""}`);
  assert.deepEqual(shape("atkUp"), ["shard:common:5/10", "sharper:uncommon:0/5<shard", "critChance:rare:0/5<sharper", "freeOffense:epic:0/5<critChance", "powerStrike:legendary:0/5<freeOffense",
    "gold:common:5/10", "shardSilver:uncommon:0/5<gold", "silverBoost:rare:0/5<shardSilver", "goldBonus:epic:0/5<silverBoost", "takedown:legendary:0/5<goldBonus"]);
  assert.deepEqual(shape("defUp"), ["shard:common:5/10", "sturdier:uncommon:0/5<shard", "regen:rare:0/5<sturdier", "freeDefense:epic:0/5<regen", "parry:legendary:0/5<freeDefense",
    "gold:common:5/10", "shardSilver:uncommon:0/5<gold", "silverBoost:rare:0/5<shardSilver", "goldBonus:epic:0/5<silverBoost", "tangle:legendary:0/5<goldBonus"]);
  assert.deepEqual(shape("torch"), ["attack:common:5/10", "bossDefense:uncommon:0/10<attack", "bossShroud:rare:0/5<bossDefense", "greaterTangle:epic:0/5<bossShroud", "revive:legendary:0/5<greaterTangle",
    "gold:common:5/5", "cellDrop:uncommon:0/5<gold", "cellHaul:rare:0/5<cellDrop", "greaterTakedown:epic:0/5<cellHaul", "chestCells:legendary:0/5<greaterTakedown"]);
  assert.deepEqual(shape("chest"), ["gold:common:10/10", "goldUp:uncommon:0/5<gold", "silver:rare:0/5<goldUp", "treasureFloor:epic:0/5<silver", "rarityUp:legendary:0/5<treasureFloor",
    "supplyChance:uncommon:0/10<gold", "equipmentChance:rare:0/10<supplyChance", "double:epic:0/5<equipmentChance", "triple:legendary:0/5<double"]);
  // TORCH's Boss Defense waits for 5 levels before Boss Shroud opens, and CHEST's Chest Gold 5 of its 10 before either fork.
  const opened = (card: CardId) => ({ [card]: Object.fromEntries(CARD_TREES[card]!.map((n) => [n.id, n.max - n.levels])) });
  const node = (card: CardId, id: string) => CARD_TREES[card]!.find((n) => n.id === id)!;
  assert.equal(nodeOpen({ torch: { attack: 5, bossDefense: 4 } }, opened("torch"), "torch", node("torch", "bossShroud")), false);
  assert.equal(nodeOpen({ torch: { attack: 5, bossDefense: 5 } }, opened("torch"), "torch", node("torch", "bossShroud")), true);
  assert.equal(nodeOpen({ chest: { gold: 4 } }, opened("chest"), "chest", node("chest", "supplyChance")), false);
  for (const id of ["goldUp", "supplyChance"]) assert.equal(nodeOpen({ chest: { gold: 5 } }, opened("chest"), "chest", node("chest", id)), true, id);
});

test("ATK UP's and DEF UP's shards: Gold by percent, Silver with each, Free Offense and Defense chances added to training's", () => {
  const take = (trees: CardTreeLevels, kind: "attack" | "defense") => {
    const g = corridor([{ kind }], trees), gold = g.save.gold, silver = g.run.silver ?? 0;
    assert.ok(g.move(1, 0));
    return { gold: g.save.gold - gold, silver: (g.run.silver ?? 0) - silver };
  };
  const plain = take({}, "attack"), raised = take({ atkUp: { gold: 10, shardSilver: 5 } }, "attack");
  assert.ok(plain.gold > 0);
  assert.equal(raised.gold, Math.round(plain.gold * 2 * 1e6) / 1e6, "+100% at 10 levels");
  assert.equal(raised.silver, 0.5);
  assert.equal(take({ defUp: { gold: 5, shardSilver: 2 } }, "defense").silver, 0.2);
  assert.deepEqual(freeUpChances(treeBonus({ atkUp: { freeOffense: 3 }, defUp: { freeDefense: 2 }, heal: { freeDefense: 2 } })), { offense: 300, defense: 300 });
});

test("TORCH's Revive adds its percent to Revive's chance, trained or not", () => {
  const plain = treeRun("torch", { attack: 5 }), raised = treeRun("torch", { attack: 5, bossDefense: 5, bossShroud: 1, greaterTangle: 1, revive: 3 });
  assert.equal(plain.reviveChance, 0);
  assert.equal(raised.reviveChance, 300, "3%, in hundredths of a percent");
});

test("ATK UP's Power Strike: an ATK shard may charge the next fight with twice the hero's ATK, every strike in the gold ring", () => {
  const g = corridor([{ kind: "attack" }, { kind: "floor" }, { kind: "enemy", enemy: foe(100) }], { atkUp: { powerStrike: 100 } });
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.powerStrike, true);
  assert.match(g.message, /Power Strike charged$/);
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.powerStrike, true, "a step without a fight keeps it");
  const p = g.run.player, charged = predict(p, foe(100)), plain = predict({ ...p, powerStrike: undefined }, foe(100));
  assert.ok(charged.turns < plain.turns, "twice the ATK: fewer strikes");
  assert.equal(charged.hit, plain.hit + p.attack);
  const fight = bout(p, foe(100));
  assert.ok(fight.strikes.filter((s) => s.by === "hero").every((s) => s.pronounced), "each strike's number in the gold ring");
  assert.ok(g.move(1, 0));
  assert.match(g.message, /^Power Strike · /);
  assert.equal(g.run.player.powerStrike, undefined, "the fight used it up");
  // Without the tree a shard charges nothing.
  const none = corridor([{ kind: "attack" }], {});
  none.move(1, 0);
  assert.equal(none.run.player.powerStrike, undefined);
});

test("Takedown and Tangle cut a boss as a fight with it begins, their Greater kin a Greater Boss, behind an opening before the first strike", () => {
  const cuts: Player = { ...hero, takedown: { boss: 30, greaterBoss: 12 }, tangle: { boss: 20 } };
  assert.deepEqual([squaredUp(cuts, foe(100, "boss")).enemy.hp, squaredUp(cuts, foe(100, "boss")).enemy.attack], [70, 3.2]);
  assert.equal(squaredUp(cuts, foe(100, "greaterBoss")).enemy.hp, 88, "Greater Takedown, no Tangle");
  assert.equal(squaredUp(cuts, foe(100, "greaterBoss")).enemy.attack, 4);
  assert.equal(squaredUp(cuts, foe(100)).enemy.hp, 100, "not a boss");
  assert.equal(squaredUp(cuts, { ...foe(40, "boss"), fullHp: 100 }).enemy.hp, 10, "a share of its max HP, though arrows wounded it");
  assert.equal(squaredUp({ ...hero, takedown: { boss: 100 } }, foe(100, "boss")).enemy.hp, 1, "at least 1 HP left");
  // The prediction and the fight played out agree.
  const fight = bout(cuts, foe(100, "boss")), odds = predict(cuts, foe(100, "boss"));
  assert.equal(fight.strikes.filter((s) => s.by === "hero").length, odds.turns);
  assert.deepEqual(fight.opening, { at: OPENING_SHRINK_MS + OPENING_HOLD_MS, hp: 70, takedown: true, tangle: true });
  assert.equal(fight.strikes[0].start, OPENING_SHRINK_MS + OPENING_HOLD_MS, "the first strike waits for it");
  assert.equal(bout({ ...hero, tangle: { boss: 20 } }, foe(100, "boss")).opening!.at, OPENING_HOLD_MS, "Tangle alone holds without the X's shrink");
  assert.equal(bout(cuts, foe(100)).opening, undefined);
  // The boss's HP bar drops by the cut as the opening ends.
  const shown = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, bout: fight, start: 0, hp: 100, summary: false };
  assert.equal(enemyBar(shown, fight.opening!.at - 1), null, "no bar before it");
  assert.equal(enemyBar(shown, fight.opening!.at + 1000)!.hp <= 70, true);
  // A run with the trees carries the cuts on the hero.
  const g = treeRun("atkUp", { shard: 5, gold: 5, shardSilver: 1, silverBoost: 1, goldBonus: 1, takedown: 2 });
  assert.deepEqual(g.run.player.takedown, { boss: 10 }, "5% a level");
  assert.equal(g.run.player.tangle, undefined);
});

test("CHEST's Double and Triple multiply a chest's Gold and finds, TORCH's Chest Cells adds a Greater Boss's, Rarity Up raises a piece", () => {
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  g.save.equipment.unlocked = true;
  const purse = (trees: CardTreeLevels = {}) => {
    g.run.cardTrees = trees;
    return new RunPurse(g.save, g.mode, g.run, () => 0.5, 0, () => 0);
  };
  const plain = purse().treasure(3, 3)!.gold;
  assert.equal(purse().treasure(3, 4, "plain", { multiplier: 6, cells: false })!.gold, Math.round(plain * 6 * 1e6) / 1e6, "Double and Triple: six times over");
  const supply = purse().treasure(3, 5, "supply", { multiplier: 2, cells: false })!;
  assert.equal(supply.equipment!.materials!.quantity, 2 * purse().treasure(3, 6, "supply")!.equipment!.materials!.quantity);
  const pieces = purse().treasure(3, 7, "equipment", { multiplier: 3, cells: false })!;
  assert.equal([pieces.equipment, ...pieces.more].length, 3, "three pieces");
  const cells = g.save.cells, found = purse().treasure(3, 8, "plain", { multiplier: 1, cells: true })!;
  assert.equal(found.cells, 1);
  assert.equal(g.save.cells, cells + 1);
  assert.equal(purse().treasure(3, 9, "equipment")!.equipment!.item!.rarity, "common", "a low roll picks Common");
  assert.equal(purse({ chest: { rarityUp: 100 } }).treasure(3, 10, "equipment")!.equipment!.item!.rarity, "uncommon", "a rarity higher");
  // In a run, the chest's tile rolls them, and the board flashes the multiplier.
  const run = corridor([{ kind: "treasure" }], { chest: { double: 100, triple: 100, silver: 2 }, torch: { chestCells: 100 } });
  assert.deepEqual(run.chestRoll(1, 0), { multiplier: 6, cells: true });
  assert.ok(run.move(1, 0));
  assert.ok(run.gains.some((gain) => gain.text === "×6" && gain.art && "multiplier" in gain.art));
  assert.match(run.message, /×6 · \+[\d.,]+ Gold · \+12 Silver · \+1 Cell/);
  assert.deepEqual(corridor([], {}).chestRoll(1, 0), { multiplier: 1, cells: false });
});

test("CHEST's Treasure Floor makes a floor's shards and potions treasure chests, in the Tower and the Delve", () => {
  const items = (cells: Map<string, Tile>) => [...cells.values()].filter((t) => t.kind === "attack" || t.kind === "defense" || t.kind === "potion").length;
  const chests = (cells: Map<string, Tile>) => [...cells.values()].filter((t) => t.kind === "treasure").length;
  const floor = [...Array(40).keys()].find((r) => isTreasureFloor(7, r + 1, 50) && items(new RoomWorld(7, r, {}).cells) > 0)!;
  const plain = new RoomWorld(7, floor, {}), treasure = new RoomWorld(7, floor, {}, 0, 1, undefined, undefined, undefined, undefined, 50);
  assert.equal(items(treasure.cells), 0);
  assert.equal(chests(treasure.cells), chests(plain.cells) + items(plain.cells));
  const other = [...Array(40).keys()].find((r) => !isTreasureFloor(7, r + 1, 50))!;
  assert.deepEqual(new RoomWorld(7, other, {}, 0, 1, undefined, undefined, undefined, undefined, 50).cells, new RoomWorld(7, other, {}).cells, "not every floor");
  // The Delve's floors roll as each equivalent floor.
  const run = { seed: 7, changes: {}, floor: 0, milestone: 0 }, all = new World({ ...run, treasureFloor: 100 }), none = new World(run);
  let shards = 0, turned = 0;
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const t = none.tile(x, y), u = all.tile(x, y);
    if (t.kind === "attack" || t.kind === "defense" || t.kind === "potion") {
      shards++;
      if (u.kind === "treasure") turned++;
    }
  }
  assert.ok(shards > 0);
  assert.equal(turned, shards);
  // A run takes its chance from CHEST's tree as it goes inside.
  assert.equal(treeRun("chest", { gold: 5, goldUp: 5, silver: 5, treasureFloor: 3 }).run.treasureFloor, 1.5);
});
