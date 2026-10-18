import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { CARD_IDS, cardBonus, cardBonusLines, handBonus } from "../src/cards.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { rollChestPiece, rollSupplies } from "../src/equipment/acquire.ts";
import { EQUIPMENT_CHEST_RARITY, SUPPLY_CHEST_MATERIALS } from "../src/equipment/balance.ts";
import { itemDef, standardOf } from "../src/equipment/catalog.ts";
import { addItem } from "../src/equipment/inventory.ts";
import { equipmentEffects } from "../src/equipment/effects.ts";
import { chestKindAt } from "../src/board.ts";
import { snap } from "../src/exact.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { attackAgainst } from "../src/combat.ts";
import { foeGold } from "../src/foe-cards.ts";

test("only YELLOW, BLUE and RED KEY, CHEST, the enemy cards but ENEMY and ARCHER carry a bonus, and KEY none", () => {
  assert.deepEqual(CARD_IDS.filter((id) => cardBonus(id)), [
    "yellowKey", "blueKey", "weakEnemy", "baseEnemy", "strongEnemy", "eliteEnemy", "bossEnemy", "nonBossEnemy", "fastEnemy", "chest", "redKey", "flyingEnemy", "archer",
  ]);
  assert.equal(cardBonus("monster"), undefined, "ENEMY gives none");
  assert.deepEqual(cardBonus("weakEnemy"), { foe: { attack: 5, gold: 5 } });
  assert.deepEqual(cardBonus("yellowKey"), { key: { color: "yellow", percent: 5, gold: 1 } });
  assert.deepEqual(cardBonus("blueKey"), { key: { color: "blue", percent: 5, gold: 2 } });
  assert.deepEqual(cardBonus("redKey"), { key: { color: "red", percent: 5, gold: 3 } });
  assert.deepEqual(cardBonus("chest"), { chest: { supply: 1.5, equipment: 0.5 } });
  assert.deepEqual(cardBonus("flyingEnemy"), { shot: { attack: 5, speed: 5 }, foe: { attack: 5, gold: 5 } });
  assert.deepEqual(cardBonus("archer"), { boss: { attack: 5 } });
  assert.deepEqual(cardBonusLines("archer").map((l) => l.text), ["+5% Shot ATK for Bosses"]);
  assert.equal(cardBonus("key"), undefined);
});

test("a card's bonus reads as short lines, the chest's chances light blue and purple", () => {
  assert.deepEqual(cardBonusLines("chest"), [{ text: "1.5% Supplies", tone: "supply" }, { text: "0.5% Equipment", tone: "equipment" }]);
  assert.deepEqual(cardBonusLines("blueKey").map((l) => l.text), ["+5% Blue Keys", "+2 Gold a key"]);
  assert.deepEqual(cardBonusLines("door"), []);
  assert.deepEqual(cardBonusLines("nonBossEnemy").map((l) => l.text), ["+5% ATK vs Non-Boss Enemies", "+5% Gold from Non-Boss Enemies"]);
});

test("a hand's bonuses add up by key colour, with the chest's chances", () => {
  assert.deepEqual(handBonus(["stairs", "yellowKey", "redKey", "chest"]), {
    keys: { yellow: { percent: 5, gold: 1 }, red: { percent: 5, gold: 3 } },
    chest: { supply: 1.5, equipment: 0.5 },
    shot: { attack: 0, speed: 0, boss: 0 },
    foe: {},
  });
  assert.deepEqual(handBonus(["stairs", "key"]), { keys: {}, chest: { supply: 0, equipment: 0 }, shot: { attack: 0, speed: 0, boss: 0 }, foe: {} });
  assert.deepEqual(handBonus(["weakEnemy", "fastEnemy"]).foe, { weakEnemy: { attack: 5, gold: 5 }, fastEnemy: { attack: 5, gold: 5 } });
});

const TILES: Record<string, Tile> = {
  K: { kind: "key", color: "yellow" }, B: { kind: "key", color: "blue" }, T: { kind: "treasure" },
};
/** A Tower floor drawn row by row; `@` is the hero. No theme's Gold, so
 * the figures are the bonus's alone. */
function floor(rows: string[]) {
  const g = new Game(defaults());
  g.save.themes = [];
  const w = g.world as RoomWorld, height = rows.length;
  w.cells = new Map();
  rows.forEach((row, j) => [...row].forEach((c, x) => {
    const y = height - 1 - j;
    w.cells.set(`${x},${y}`, TILES[c] ?? { kind: "floor" });
    if (c === "@") [g.run.player.x, g.run.player.y] = [x, y];
  }));
  return g;
}
const turns = (g: Game, n: number) => { for (let i = 0; i < n; i++) g.autoTurn(); };

test("YELLOW KEY held makes each yellow key worth 5% more and pay 1 more Gold, whichever card takes it", () => {
  const plain = floor(["@.K"]);
  plain.run.hand = ["key"];
  let gold = plain.save.gold;
  turns(plain, 2);
  assert.equal(plain.run.player.keys.yellow, 1);
  const pickup = plain.save.gold - gold;
  assert.equal(pickup, 1, "a yellow key's own Pickup Gold");

  const held = floor(["@.K"]);
  held.run.hand = ["key", "yellowKey"];
  gold = held.save.gold;
  turns(held, 2);
  assert.equal(held.run.player.keys.yellow, 1.05, "KEY took it, but YELLOW KEY is held");
  assert.equal(held.save.gold - gold, pickup + 1);

  const blue = floor(["@.B"]);
  blue.run.hand = ["key", "yellowKey"];
  turns(blue, 2);
  assert.equal(blue.run.player.keys.blue, 1, "YELLOW KEY gives nothing for a blue key");
});

test("a Supply or Equipment Chest pays its finds once Equipment is open, from Equipment's stream", () => {
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  const draws: number[] = [];
  const purse = (roll: number) => new RunPurse(g.save, g.mode, g.run, () => 0.5, 0, () => (draws.push(roll), roll));
  assert.equal(purse(0).treasure(3, 3, "equipment")!.kind, "plain", "before Equipment opens");
  assert.equal(draws.length, 0, "and it draws nothing");
  g.save.equipment.unlocked = true;
  assert.equal(purse(0).treasure(3, 4)!.kind, "plain", "a plain chest");
  assert.equal(draws.length, 0, "draws nothing");
  const equipment = purse(0).treasure(3, 5, "equipment")!;
  assert.equal(equipment.kind, "equipment");
  assert.ok(equipment.equipment?.item, "its piece goes into the inventory");
  assert.equal(equipment.equipment.item.rarity, "common", "a low roll picks Common");
  assert.ok(g.save.equipment.items.some((i) => i.id === equipment.equipment!.item!.id));
  const supply = purse(0).treasure(3, 6, "supply")!;
  assert.equal(supply.kind, "supply");
  assert.equal(supply.equipment?.materials?.quantity, SUPPLY_CHEST_MATERIALS.base);
  assert.equal(g.save.equipment.materials[supply.equipment!.materials!.id], supply.equipment!.materials!.quantity);
  assert.equal(purse(0).treasure(3, 6, "supply"), null, "a chest pays once");
});

/** Every treasure tile of Tower floors 1 to 30 under `odds`, as generated
 * and as the board reads it. */
function chests(odds?: { supply: number; equipment: number }) {
  const found: { world: RoomWorld; x: number; y: number; tile: Tile }[] = [];
  for (let room = 1; room <= 30; room++) {
    const world = new RoomWorld(11, room, {}, 0, 1, undefined, undefined, odds);
    for (let y = 0; y < world.height; y++)
      for (let x = 0; x < world.width; x++) if (world.tile(x, y).kind === "treasure") found.push({ world, x, y, tile: world.tile(x, y) });
  }
  return found;
}

test("a floor's chests are Supply or Equipment Chests as it is generated, under the run's odds, and stay marked once opened", () => {
  const plain = chests(), all = chests({ supply: 0, equipment: 100 }), some = chests({ supply: 30, equipment: 20 });
  assert.ok(plain.length > 5, "the floors have chests");
  assert.ok(plain.every((c) => !c.tile.chest), "none without odds");
  assert.ok(all.every((c) => c.tile.chest === "equipment"));
  const kinds = some.map((c) => c.tile.chest ?? "plain");
  assert.ok(new Set(kinds).size === 3, `all three kinds at these odds: ${kinds}`);
  assert.deepEqual(chests({ supply: 30, equipment: 20 }).map((c) => c.tile.chest), some.map((c) => c.tile.chest), "the same floor, the same chests");
  for (const c of some) assert.equal(chestKindAt(c.tile, c.x, c.y, c.world.seed ^ Math.imul(c.world.room + 1, 0x9e3779b1), { supply: 30, equipment: 20 }), c.tile.chest ?? "plain");
  // Opened, the chest's floor keeps its kind for the board to show.
  const marked = some.find((c) => c.tile.chest)!;
  marked.world.changes[`${marked.x},${marked.y}`] = { kind: "floor" };
  assert.deepEqual(marked.world.tile(marked.x, marked.y), { kind: "floor", chest: marked.tile.chest });
});

test("a run fixes its chest odds as it goes inside: the CHEST card's, raised by Supply and Equipment Chest chance, once Equipment is open", () => {
  const run = (setup: (s: ReturnType<typeof defaults>) => void) => {
    const s = defaults();
    s.hand = ["chest", "stairs", "door", "key"];
    setup(s);
    const g = new Game(s);
    g.newRun({ seed: 5 });
    assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.chestOdds, g.run.chestOdds, "and saves them");
    return g.run.chestOdds;
  };
  assert.equal(run(() => {}), undefined, "before Equipment opens");
  assert.equal(run((s) => { s.equipment.unlocked = true; s.hand = ["stairs", "door", "key"]; }), undefined, "without the card");
  assert.deepEqual(run((s) => { s.equipment.unlocked = true; }), { supply: 1.5, equipment: 0.5 });
  const raisedBy = run((s) => { s.equipment = defaultsWithShroud(); })!;
  const find = equipmentEffects(defaultsWithShroud(), "tower").chestFind;
  assert.ok(find > 0);
  assert.deepEqual(raisedBy, { supply: snap((1.5 * (100 + find)) / 100), equipment: snap((0.5 * (100 + find)) / 100) });
});

/** A save wearing an Uncommon Gatherer's Shroud in the Tower. */
function defaultsWithShroud() {
  const s = defaults();
  s.equipment.unlocked = true;
  const item = addItem(s.equipment, "gatherersShroud", "uncommon")!;
  s.equipment.equipped.tower[itemDef(item.def)!.category] = item.id;
  return s.equipment;
}

test("an Equipment Chest's piece is Standard, at 67% Common, 30% Uncommon and 3% Rare", () => {
  assert.deepEqual(EQUIPMENT_CHEST_RARITY, { common: 67, uncommon: 30, rare: 3 });
  const rarity = (roll: number) => rollChestPiece(() => roll).rarity;
  assert.deepEqual([0, 0.669, 0.67, 0.969, 0.97, 0.999].map(rarity), ["common", "common", "uncommon", "uncommon", "rare", "rare"]);
  const piece = rollChestPiece(() => 0);
  assert.equal(piece.def, standardOf(piece.category).id);
});

test("a Supply Chest holds 5 materials in tower I and 2 more each tower after, raised by Material Find", () => {
  assert.deepEqual([1, 2, 3, 10].map((tier) => rollSupplies(tier, 0, () => 0).quantity), [5, 7, 9, 23]);
  assert.equal(rollSupplies(1, 50, () => 0).quantity, 7, "5 raised by half, rounded down");
  assert.equal(rollSupplies(3, 50, () => 0).quantity, 13);
});

const foe = (strength: Enemy["strength"], extra: Partial<Enemy> = {}): Enemy => ({ name: "Slime", hp: 100, attack: 10, defense: 0, tier: 1, strength, ...extra });

test("an enemy card held strikes the enemies it covers with 5% more ATK, each card adding its own", () => {
  const hero: Player = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 100, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
  const armed = { ...hero, foeAttack: { weakEnemy: 5, nonBossEnemy: 5 } };
  assert.equal(attackAgainst(armed, foe("weak")), 110, "WEAK ENEMY and NON-BOSS ENEMY both cover a weak enemy");
  assert.equal(attackAgainst(armed, foe("strong")), 105);
  assert.equal(attackAgainst(armed, foe("boss")), 100);
  assert.equal(attackAgainst({ ...hero, bossAttack: 10, foeAttack: { bossEnemy: 5 } }, foe("greaterBoss")), 115, "added to the equipment's boss ATK");
  assert.equal(attackAgainst({ ...hero, foeAttack: { fastEnemy: 5 } }, foe("normal", { fast: true })), 105);
  assert.equal(attackAgainst({ ...hero, foeAttack: { flyingEnemy: 5 } }, foe("normal", { flying: true })), 105);
});

test("a run going inside gives its hero the ATK of its hand's enemy cards", () => {
  const g = new Game(defaults());
  g.save.hand = ["stairs", "weakEnemy", "monster"];
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.player.foeAttack, { weakEnemy: 5 });
  g.save.hand = ["stairs", "monster"];
  g.newRun({ seed: 3 });
  assert.equal(g.run.player.foeAttack, undefined, "ENEMY gives none");
  assert.equal(decode(JSON.stringify({ ...g.save })).tower.run?.player.foeAttack, undefined);
});

test("an enemy card held makes each enemy it covers drop 5% more Gold, multiplying the other bonuses, and two cards' percents add", () => {
  assert.equal(foeGold(["weakEnemy"], foe("weak")), 1.05);
  assert.equal(foeGold(["weakEnemy", "nonBossEnemy", "monster"], foe("weak")), 1.1);
  assert.equal(foeGold(["weakEnemy"], foe("strong")), 1);
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  const purse = () => new RunPurse(g.save, g.mode, g.run, () => 0.5);
  g.run.hand = ["stairs"];
  const plain = purse().killGoldPreview(foe("elite"), 3, 3);
  g.run.hand = ["stairs", "eliteEnemy", "nonBossEnemy"];
  assert.equal(purse().killGoldPreview(foe("elite"), 3, 3), snap(plain * 1.1));
  assert.equal(purse().killGoldPreview(foe("weak"), 3, 3) > 0, true);
});
