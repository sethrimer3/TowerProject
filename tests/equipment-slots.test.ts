import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save/save.ts";
import { loadout } from "../src/progression/loadout.ts";
import { predict } from "../src/combat.ts";
import { random } from "../src/random.ts";
import { CATEGORY_IDS, type CategoryId } from "../src/equipment/catalog.ts";
import {
  EFFECT_CANDIDATES, EQUIP_RARITIES, openSlots, RARITY_TIERS, rarityRank, REFINE_CHOICE_EVERY, REFINE_COST, REFINE_GUARANTEE_EVERY,
  SUBSTAT_POWER, SUBSTAT_RARITIES, SUBSTAT_SLOT_LEVELS, substatCap, type EquipRarity,
} from "../src/equipment/balance.ts";
import {
  addItem, decodeEquipment, defaultEquipment, equip, findItem, levelUp, merge, setLocked, type EquipItem, type EquipmentSave,
} from "../src/equipment/inventory.ts";
import { CATEGORY_FAMILIES, effectPool, FAMILIES, SLOT_EFFECTS, slotEffectDef, slotEffectName, slotValue } from "../src/equipment/slot-effects.ts";
import {
  choicesLeft, firstRoll, improve, improveCost, keepCurrent, nextMilestone, refine, rollCandidates, slotPlan, spendChoice, takeCandidate,
} from "../src/equipment/slots.ts";
import { equipmentEffects } from "../src/equipment/effects.ts";
import type { Enemy } from "../src/entities.ts";
import { snap } from "../src/exact.ts";

const open = (): EquipmentSave => ({ ...defaultEquipment(), unlocked: true, rng: 12345 });
const rich = () => ({ gold: 1e12 });
const seed = random(7);
/** A piece of `def` at `rarity` and `level`, its slots filled as leveling would. */
function piece(e: EquipmentSave, def: string, rarity: EquipRarity, level: number) {
  const item = addItem(e, def, rarity)!;
  if (level) levelUp(e, rich(), item.id, level, true);
  return item;
}
/** Gives slot `index` its first effect: the first candidate of its free roll. */
function settle(e: EquipmentSave, item: EquipItem, index: number) {
  firstRoll(e, item.id, index, seed);
  takeCandidate(e, item.id, index, 0);
  return item.slots[index];
}
const stock = (e: EquipmentSave) => {
  for (const m of Object.keys(e.materials) as (keyof EquipmentSave["materials"])[]) e.materials[m] = 1e9;
};

// --- Rarity, levels and slots ---

test("substat slots open by level alone: one at 1, then at 41, 61, 81, 121, 161, 201 and 241", () => {
  assert.deepEqual(SUBSTAT_SLOT_LEVELS, [1, 41, 61, 81, 121, 161, 201, 241]);
  assert.deepEqual([0, 1, 40, 41, 60, 61, 80, 81, 120, 121, 160, 161, 200, 201, 240, 241, 300].map(openSlots), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
  assert.equal(openSlots(RARITY_TIERS.legendary.maxLevel), 4, "a Standard piece at its Legendary cap has four");
  assert.equal(openSlots(300), 8, "a five-Star Ancestral all eight");
  assert.equal(addItem(open(), "knightsSword", "rare")!.slots.length, 0, "a new piece, at level 0, has none");
  // Substats have no Common: a Common piece's are Uncommon, the rest up to the piece's own.
  assert.deepEqual(SUBSTAT_RARITIES, EQUIP_RARITIES.slice(1));
  assert.equal(substatCap("common"), "uncommon");
  for (const r of SUBSTAT_RARITIES) assert.equal(substatCap(r), r);
  assert.deepEqual([SUBSTAT_POWER.uncommon, SUBSTAT_POWER.rare], [1, 1.5]);
});

test("a piece can't level past its rarity's cap", () => {
  const e = open();
  stock(e);
  const item = piece(e, "travelersBoots", "common", 20);
  assert.equal(levelUp(e, rich(), item.id, 1, false), "maxed");
  assert.equal(item.level, 20);
  assert.equal(item.slots.length, 1);
});

test("leveling to 41 opens the second slot", () => {
  const e = open();
  stock(e);
  const item = piece(e, "travelersBoots", "rare", 40);
  assert.equal(item.slots.length, 1);
  levelUp(e, rich(), item.id, 1, false);
  assert.equal(item.level, 41);
  assert.equal(item.slots.length, 2);
  assert.deepEqual(item.slots[1], {}, "an empty slot, ready for its free roll");
});

test("merging keeps effects, Refinement and the lock; leveling past the old cap then opens a slot", () => {
  const e = open();
  stock(e);
  const target = piece(e, "travelersBoots", "uncommon", 40);
  settle(e, target, 0);
  for (let i = 0; i < 3; i++) {
    refine(e, rich(), target.id, 0, false, seed);
    keepCurrent(e, target.id, 0);
  }
  setLocked(e, target.id, true);
  const before = structuredClone(target.slots);
  const copies = [piece(e, "travelersBoots", "uncommon", 1), piece(e, "travelersBoots", "uncommon", 1)];
  copies.forEach((c) => settle(e, c, 0));
  merge(e, target.id, copies.map((c) => c.id));
  assert.equal(target.rarity, "rare");
  assert.equal(target.level, 40);
  assert.equal(target.locked, true);
  assert.deepEqual(target.slots, before, "effects and Refinement untouched by the merge");
  assert.equal(target.slots[0].refinement, 3);
  levelUp(e, rich(), target.id, 1, false);
  assert.equal(target.slots.length, 2);
  assert.deepEqual(target.slots[0], before[0]);
});

// --- Effect pools ---

test("every category rolls only from its families, with room for a full offer beside its other slots", () => {
  const families = new Set(Object.values(CATEGORY_FAMILIES).flat());
  for (const f of Object.keys(FAMILIES)) assert.ok(families.has(f as never), `${f} rolls somewhere`);
  assert.equal(new Set(SLOT_EFFECTS.map((d) => d.id)).size, SLOT_EFFECTS.length, "ids are unique");
  for (const c of CATEGORY_IDS) {
    const pool = effectPool(c);
    assert.ok(pool.length >= EFFECT_CANDIDATES, `${c} has ${pool.length}`);
    for (const d of pool) assert.ok(CATEGORY_FAMILIES[c].includes(d.family));
  }
  // Each starting category keeps to its own focus: speed on the Chestplate, Gold on Boots, crits on Swords.
  assert.ok(effectPool("chestplate").some((d) => d.kind === "moveSpeed"));
  assert.ok(!effectPool("boots").some((d) => d.kind === "moveSpeed"));
  assert.ok(effectPool("boots").some((d) => d.kind === "goldFind"));
  assert.ok(effectPool("weapon").some((d) => d.kind === "critChance") && !effectPool("shield").some((d) => d.kind === "critChance"));
  // No substat is a flat stat.
  for (const d of SLOT_EFFECTS) assert.ok(!["attack", "defense", "maxHp", "shroud", "regen"].includes(d.kind), d.id);
});

test("candidates are different effects from the pool, never rarer than the item, never another slot's effect", () => {
  for (const rarity of EQUIP_RARITIES) {
    const e = open();
    stock(e);
    const item = piece(e, "kiteShield", rarity, 41);
    for (let i = 0; i < item.slots.length; i++) settle(e, item, i);
    const rng = random(99);
    const seen = new Set<EquipRarity>();
    for (let n = 0; n < 3000; n++) {
      const index = n % item.slots.length;
      const offer = rollCandidates(item, index, false, rng);
      assert.equal(offer.length, EFFECT_CANDIDATES);
      assert.equal(new Set(offer.map((c) => c.effect)).size, offer.length, "no repeats in one offer");
      const others = item.slots.filter((_, i) => i !== index).map((s) => s.effect);
      for (const c of offer) {
        assert.ok(effectPool("shield").some((d) => d.id === c.effect), c.effect);
        assert.ok(!others.includes(c.effect), "not held by another slot");
        assert.ok(rarityRank(c.rarity) <= rarityRank(substatCap(rarity)), `${c.rarity} on ${rarity}`);
        assert.notEqual(c.rarity, "common", "no substat is Common");
        seen.add(c.rarity);
      }
    }
    assert.equal(seen.size, rarityRank(substatCap(rarity)), `${rarity} rolls every substat rarity up to its own`);
  }
});

// --- First roll, Refine, keeping and taking ---

test("a new slot's first roll is free, offers three, and is rolled only once", () => {
  const e = open();
  const purse = { gold: 0 };
  const item = piece(e, "chronoStrider", "common", 1);
  const offer = firstRoll(e, item.id, 0, seed);
  assert.ok(Array.isArray(offer));
  assert.equal(offer.length, EFFECT_CANDIDATES);
  assert.equal(firstRoll(e, item.id, 0, seed), "offered", "no free reroll by asking again");
  assert.equal(keepCurrent(e, item.id, 0), "empty", "there is nothing to keep yet");
  assert.deepEqual(takeCandidate(e, item.id, 0, 1), offer[1]);
  assert.equal(item.slots[0].effect, offer[1].effect);
  assert.equal(item.slots[0].offer, undefined);
  assert.equal(item.slots[0].refinement, undefined, "the free roll is no Refine");
  assert.equal(purse.gold, 0);
  assert.equal(firstRoll(e, item.id, 0, seed), "chosen");
  assert.equal(firstRoll(e, item.id, 1, seed), "closed", "slot 2 isn't open at level 1");
});

test("a paid Refine never replaces the effect held: keeping it costs nothing more, and Refinement still rises", () => {
  const e = open();
  stock(e);
  const item = piece(e, "chronoStrider", "common", 5);
  const held = { ...settle(e, item, 0) };
  const purse = { gold: REFINE_COST.common.gold };
  const before = e.materials.hobnails;
  const offer = refine(e, purse, item.id, 0, false, seed);
  assert.ok(Array.isArray(offer));
  assert.equal(offer.length, EFFECT_CANDIDATES);
  assert.equal(purse.gold, 0);
  assert.equal(e.materials.hobnails, before - REFINE_COST.common.material);
  assert.equal(item.slots[0].effect, held.effect, "still held while the candidates wait");
  assert.equal(refine(e, rich(), item.id, 0, false, seed), "offered", "one offer at a time");
  assert.equal(keepCurrent(e, item.id, 0), true);
  assert.equal(item.slots[0].effect, held.effect);
  assert.equal(item.slots[0].rarity, held.rarity);
  assert.equal(item.slots[0].refinement, 1, "kept, and the Refine still counted");
  assert.equal(refine(e, { gold: 0 }, item.id, 0, false, seed), "gold");
  assert.equal(item.slots[0].refinement, 1, "a refused Refine counts nothing");
  // Taking a candidate replaces it.
  const next = refine(e, rich(), item.id, 0, false, seed);
  assert.ok(Array.isArray(next));
  takeCandidate(e, item.id, 0, 2);
  assert.equal(item.slots[0].effect, next[2].effect);
  assert.equal(item.slots[0].refinement, 2);
});

test("an empty slot can't be Refined before its first choice", () => {
  const e = open();
  const item = piece(e, "chronoStrider", "common", 1);
  assert.equal(refine(e, rich(), item.id, 0, false, seed), "empty");
});

test("Refinement survives saving and loading, offers too, so reloading never rerolls", () => {
  const e = open();
  stock(e);
  const item = piece(e, "kiteShield", "rare", 41);
  settle(e, item, 0);
  settle(e, item, 1);
  for (let i = 0; i < 4; i++) {
    refine(e, rich(), item.id, 1, false, seed);
    keepCurrent(e, item.id, 1);
  }
  const offer = refine(e, rich(), item.id, 1, false, seed);
  const back = decodeEquipment(JSON.parse(JSON.stringify(e)));
  const loaded = findItem(back, item.id)!;
  assert.deepEqual(loaded.slots, item.slots);
  assert.equal(loaded.slots[1].refinement, 5);
  assert.deepEqual(loaded.slots[1].offer, offer);
  assert.deepEqual(back.streams, e.streams, "the stream stands where it stopped");
  assert.ok(e.streams.substats !== undefined, "substat rolls keep a stream of their own");
});

// --- Milestones and the deterministic endpoint ---

test("every fifth Refine guarantees a candidate at the item's highest effect rarity", () => {
  // With a stream that always rolls the lowest rarity, only the guarantee makes a Rare.
  const e = open();
  const item = piece(e, "kiteShield", "rare", 1);
  settle(e, item, 0);
  const low = () => 0;
  assert.ok(rollCandidates(item, 0, false, low).every((c) => c.rarity === "uncommon"));
  const sure = rollCandidates(item, 0, true, low);
  assert.equal(sure[0].rarity, "rare");
  // Through Refine: the 5th and 10th offers each lead with a Rare.
  stock(e);
  for (let n = 1; n <= 2 * REFINE_GUARANTEE_EVERY; n++) {
    const offer = refine(e, rich(), item.id, 0, false, seed);
    assert.ok(Array.isArray(offer));
    if (n % REFINE_GUARANTEE_EVERY === 0) assert.equal(offer[0].rarity, "rare", `Refine ${n}`);
    keepCurrent(e, item.id, 0);
  }
  assert.deepEqual(nextMilestone({ refinement: 7 }), { at: 10, reward: "choice" });
  assert.deepEqual(nextMilestone({ refinement: 10 }), { at: 15, reward: "guarantee" });
});

test("every tenth Refine earns a Choice: any effect of the pool at the item's top rarity, so any effect is reachable", () => {
  const e = open();
  stock(e);
  const item = piece(e, "hoarderGreaves", "legendary", 61);
  settle(e, item, 0);
  settle(e, item, 1);
  settle(e, item, 2);
  assert.equal(spendChoice(e, item.id, 2, "prospector"), "choice", "none earned yet");
  for (let n = 0; n < REFINE_CHOICE_EVERY; n++) {
    refine(e, rich(), item.id, 2, false, seed);
    keepCurrent(e, item.id, 2);
  }
  assert.equal(choicesLeft(item.slots[2]), 1);
  const others = [item.slots[0].effect, item.slots[1].effect];
  const wanted = effectPool("boots").find((d) => !others.includes(d.id) && d.id !== item.slots[2].effect)!;
  assert.deepEqual(spendChoice(e, item.id, 2, wanted.id), { effect: wanted.id, rarity: "legendary" });
  assert.equal(item.slots[2].effect, wanted.id);
  assert.equal(choicesLeft(item.slots[2]), 0);
  assert.equal(item.slots[2].refinement, REFINE_CHOICE_EVERY, "spending a Choice takes no Refinement away");
  assert.equal(spendChoice(e, item.id, 2, "ferocity"), "choice");
  // Any effect another slot doesn't hold can be chosen; one outside the pool can't.
  for (let n = 0; n < REFINE_CHOICE_EVERY; n++) {
    refine(e, rich(), item.id, 2, false, seed);
    keepCurrent(e, item.id, 2);
  }
  assert.equal(spendChoice(e, item.id, 2, "ferocity"), "pick", "a weapon's effect isn't the boots'");
  assert.equal(spendChoice(e, item.id, 2, others[0]!), "pick", "nor another slot's effect");
});

test("Improve raises the effect held one rarity, up to the item's, for its cost", () => {
  const e = open();
  stock(e);
  const item = piece(e, "kiteShield", "epic", 1);
  settle(e, item, 0);
  item.slots[0].rarity = "uncommon";
  const cost = improveCost(item);
  const purse = { gold: cost.gold * 2 };
  assert.equal(improve(e, purse, item.id, 0, false), "rare");
  assert.equal(improve(e, purse, item.id, 0, false), "epic");
  assert.equal(purse.gold, 0);
  assert.equal(improve(e, rich(), item.id, 0, false), "top");
  // On an Uncommon item it stops at Uncommon, and on a Common one too.
  for (const r of ["uncommon", "common"] as const) {
    const u = piece(e, "kiteShield", r, 1);
    settle(e, u, 0);
    u.slots[0].rarity = "uncommon";
    assert.equal(improve(e, rich(), u.id, 0, false), "top", r);
  }
});

test("taking a candidate another slot holds now is refused", () => {
  const e = open();
  const item = piece(e, "kiteShield", "rare", 41);
  settle(e, item, 0);
  item.slots[1].offer = [{ effect: item.slots[0].effect!, rarity: "uncommon" }];
  assert.equal(takeCandidate(e, item.id, 1, 0), "pick");
});

// --- What slots do ---

test("worn slot effects add to the loadout, each in its own mode", () => {
  const save = defaults();
  save.equipment = open();
  const ring = piece(save.equipment, "kiteShield", "rare", 41);
  ring.slots[0] = { effect: "ferocity", rarity: "rare" };
  ring.slots[1] = { effect: "constitution", rarity: "uncommon" };
  const base = loadout(save, "tower");
  equip(save.equipment, "tower", ring.id);
  const worn = loadout(save, "tower");
  const atk = slotValue(slotEffectDef("ferocity")!, "rare");
  assert.equal(atk, 3 * 1.5, "Rare is ×1.5, whatever the piece's level");
  assert.equal(worn.attack, snap((base.attack * (100 + atk)) / 100), "the slot's ATK % counts");
  assert.equal(worn.maxHp, snap((base.maxHp * 103) / 100));
  equip(save.equipment, "delve", ring.id);
  const before = loadout(save, "delve").attack;
  ring.slots[0] = { effect: "ferocity", rarity: "uncommon" };
  assert.ok(loadout(save, "delve").attack < before, "a lower effect rarity is weaker");
  // Each mode's hero counts only what it wears.
  const boots = piece(save.equipment, "travelersBoots", "common", 1);
  boots.slots[0] = { effect: "prospector", rarity: "uncommon" };
  equip(save.equipment, "tower", boots.id);
  assert.equal(equipmentEffects(save.equipment, "tower").goldFind, snap(1.12 + 3), "the Boots' main effect and the substat");
  assert.equal(equipmentEffects(save.equipment, "delve").goldFind, 0);
});

test("Piercing ignores a share of enemy DEF, and stays deterministic", () => {
  const enemy: Enemy = { name: "Golem", hp: 100, attack: 5, defense: 10, strength: "normal", tier: 1 } as Enemy;
  const p = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
  assert.equal(predict(p, enemy).hit, 2);
  assert.equal(predict({ ...p, pierce: 50 }, enemy).hit, 7);
  assert.equal(predict({ ...p, attack: 4, pierce: 50 }, enemy).requiredAttack, 2);
  const save = defaults();
  save.equipment = open();
  const sword = piece(save.equipment, "knightsSword", "common", 1);
  sword.slots[0] = { effect: "piercing", rarity: "uncommon" };
  equip(save.equipment, "tower", sword.id);
  assert.equal(loadout(save, "tower").pierce, 3);
});

// --- Saves ---

test("pieces saved before effect slots load with empty slots for their rarity and level, ready for a free roll", () => {
  const raw = {
    unlocked: true,
    items: [
      { id: "e1", def: "knightsSword", rarity: "common", level: 12 },
      { id: "e2", def: "raptorBlade", rarity: "uncommon", level: 30, locked: true },
      { id: "e3", def: "zenithGuard", rarity: "rare", level: 55, spent: { gold: 10, material: 1 } },
    ],
    equipped: { tower: { weapon: "e2" }, delve: {} },
  };
  const e = decodeEquipment(raw);
  assert.deepEqual(e.items.map((i) => i.slots.length), [1, 1, 2]);
  assert.ok(e.items.every((i) => i.slots.every((s) => !s.effect && !s.offer)));
  assert.equal(e.equipped.tower.weapon, "e2", "nothing else changes");
  assert.equal(findItem(e, "e2")!.locked, true);
  // A save from before Equipment existed still loads.
  assert.deepEqual(decode({ ...defaults(), equipment: undefined } as never).equipment.items, []);
});

test("decoding clamps an effect's rarity to the item's and drops effects its category can't hold or that repeat", () => {
  const e = decodeEquipment({
    unlocked: true,
    items: [{ id: "e1", def: "travelersBoots", rarity: "rare", level: 45, slots: [
      { effect: "prospector", rarity: "epic", refinement: 12, choicesUsed: 5 },
      { effect: "prospector", rarity: "common", refinement: 3 },
      { effect: "interest", rarity: "rare" },
    ] }, { id: "e2", def: "travelersBoots", rarity: "common", level: 3, slots: [{ effect: "ferocity", rarity: "common" }] },
    { id: "e3", def: "travelersBoots", rarity: "common", level: 3, slots: [{ effect: "prospector", rarity: "common" }] },
    { id: "e4", def: "travelersBoots", rarity: "uncommon", level: 3, slots: [{ effect: "redsmith", rarity: "uncommon" }] },
    { id: "e5", def: "travelersBoots", rarity: "rare", level: 3, slots: [{ effect: "redsmith", rarity: "uncommon" }] }],
  });
  const [a, b, c, d, f] = e.items;
  assert.deepEqual(a.slots[0], { effect: "prospector", rarity: "rare", refinement: 12 }, "rarity clamped; more Choices spent than earned dropped");
  assert.deepEqual(a.slots[1], { refinement: 3 }, "a repeated effect goes, its Refinement stays");
  assert.equal(a.slots.length, 2, "no more slots than its level opens");
  assert.deepEqual(b.slots[0], {}, "a weapon's effect isn't the boots'");
  assert.deepEqual(c.slots[0], { effect: "prospector", rarity: "uncommon" }, "a Common substat, from before they had none, comes back Uncommon");
  assert.deepEqual(d.slots[0], {}, "a substat only Rare and up roll can't sit on an Uncommon piece");
  assert.deepEqual(f.slots[0], { effect: "redsmith", rarity: "rare" }, "and comes up to its own lowest rarity");
});

test("a piece lists only the slots it can ever reach, and a substat's numeral starts at I for Uncommon", () => {
  const e = open();
  assert.equal(slotPlan(addItem(e, "knightsSword", "common")!).length, 1, "a Common piece never merges past level 20");
  assert.equal(slotPlan(addItem(e, "knightsSword", "uncommon")!).length, 4, "a Standard piece reaches Legendary's 120");
  assert.equal(slotPlan(addItem(e, "raptorBlade", "epic")!).length, 8, "a Unique reaches 300");
  const plan = slotPlan(addItem(e, "raptorBlade", "epic")!);
  assert.deepEqual(plan.map((p) => p.needs && [p.needs.rarity, p.needs.stars]), [null, null, null, ["legendary", 0], ["mythic", 0], ["ancestral", 0], ["ancestral", 1], ["ancestral", 3]]);
  const def = slotEffectDef("ferocity")!;
  assert.deepEqual(["uncommon", "rare", "ancestral"].map((r) => slotEffectName(def, r as EquipRarity)), ["Ferocity I", "Ferocity II", "Ferocity VI"]);
});
