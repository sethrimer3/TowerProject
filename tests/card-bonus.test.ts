import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { CARD_IDS, cardBonus, cardBonusLines, handBonus } from "../src/cards.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { rollChestPiece, rollSupplies } from "../src/equipment/acquire.ts";
import { EQUIPMENT_CHEST_RARITY, SUPPLY_CHEST_MATERIALS } from "../src/equipment/balance.ts";
import { standardOf } from "../src/equipment/catalog.ts";
import type { Tile } from "../src/entities.ts";

test("only YELLOW, BLUE and RED KEY and CHEST carry a bonus, and KEY none", () => {
  assert.deepEqual(CARD_IDS.filter((id) => cardBonus(id)), ["yellowKey", "blueKey", "chest", "redKey"]);
  assert.deepEqual(cardBonus("yellowKey"), { key: { color: "yellow", percent: 5, gold: 1 } });
  assert.deepEqual(cardBonus("blueKey"), { key: { color: "blue", percent: 5, gold: 2 } });
  assert.deepEqual(cardBonus("redKey"), { key: { color: "red", percent: 5, gold: 3 } });
  assert.deepEqual(cardBonus("chest"), { chest: { supply: 1.5, equipment: 0.5 } });
  assert.equal(cardBonus("key"), undefined);
});

test("a card's bonus reads as short lines, the chest's chances light blue and purple", () => {
  assert.deepEqual(cardBonusLines("chest"), [{ text: "1.5% Supplies", tone: "supply" }, { text: "0.5% Equipment", tone: "equipment" }]);
  assert.deepEqual(cardBonusLines("blueKey").map((l) => l.text), ["+5% Blue Keys", "+2 Gold a key"]);
  assert.deepEqual(cardBonusLines("door"), []);
});

test("a hand's bonuses add up by key colour, with the chest's chances", () => {
  assert.deepEqual(handBonus(["stairs", "yellowKey", "redKey", "chest"]), {
    keys: { yellow: { percent: 5, gold: 1 }, red: { percent: 5, gold: 3 } },
    chest: { supply: 1.5, equipment: 0.5 },
  });
  assert.deepEqual(handBonus(["stairs", "key"]), { keys: {}, chest: { supply: 0, equipment: 0 } });
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

test("CHEST held rolls each treasure chest's kind once Equipment is open, from Equipment's stream", () => {
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  const draws: number[] = [];
  const purse = (roll: number) => new RunPurse(g.save, g.mode, g.run, () => 0.5, 0, () => (draws.push(roll), roll));
  const odds = { supply: 1.5, equipment: 0.5 };
  assert.equal(purse(0).treasure(3, 3, odds)!.kind, "plain", "before Equipment opens");
  assert.equal(draws.length, 0, "and it draws nothing");
  g.save.equipment.unlocked = true;
  assert.equal(purse(0).treasure(3, 4)!.kind, "plain", "without the card");
  assert.equal(draws.length, 0, "and it draws nothing");
  // Under 0.5 an Equipment Chest, under 2 a Supply Chest, else plain.
  const equipment = purse(0.0049).treasure(3, 5, odds)!;
  assert.equal(equipment.kind, "equipment");
  assert.ok(equipment.equipment?.item, "its piece goes into the inventory");
  assert.equal(equipment.equipment.item.rarity, "common", "the same low roll picks Common");
  assert.ok(g.save.equipment.items.some((i) => i.id === equipment.equipment!.item!.id));
  const supply = purse(0.0199).treasure(3, 6, odds)!;
  assert.equal(supply.kind, "supply");
  assert.ok(supply.equipment?.materials && supply.equipment.materials.quantity >= SUPPLY_CHEST_MATERIALS);
  assert.equal(g.save.equipment.materials[supply.equipment.materials.id], supply.equipment.materials.quantity);
  assert.equal(purse(0.02).treasure(3, 7, odds)!.kind, "plain");
  assert.equal(purse(0).treasure(3, 7, odds), null, "a chest pays once");
});

test("an Equipment Chest's piece is Standard, at 67% Common, 30% Uncommon and 3% Rare", () => {
  assert.deepEqual(EQUIPMENT_CHEST_RARITY, { common: 67, uncommon: 30, rare: 3 });
  const rarity = (roll: number) => rollChestPiece(() => roll).rarity;
  assert.deepEqual([0, 0.669, 0.67, 0.969, 0.97, 0.999].map(rarity), ["common", "common", "uncommon", "uncommon", "rare", "rare"]);
  const piece = rollChestPiece(() => 0);
  assert.equal(piece.def, standardOf(piece.category).id);
});

test("a Supply Chest's materials grow with the floor as a kill's do", () => {
  assert.equal(rollSupplies(0, 0, () => 0).quantity, SUPPLY_CHEST_MATERIALS);
  assert.equal(rollSupplies(50, 0, () => 0).quantity, SUPPLY_CHEST_MATERIALS * 3);
  assert.equal(rollSupplies(0, 50, () => 0).quantity, SUPPLY_CHEST_MATERIALS * 1.5, "raised by Material Find");
});
