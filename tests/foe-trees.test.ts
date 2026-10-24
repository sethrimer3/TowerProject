import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { MAX_CARD_XP } from "../src/cards/levels.ts";
import { CARD_TREES, FOE_TREE_CARDS, foeStat, runExtras, treeBonus, type CardTreeLevels } from "../src/cards/trees.ts";
import type { CardId } from "../src/cards/cards.ts";
import { attackAgainst, bout, critAgainst, facing, heroHpAfter, predict } from "../src/combat.ts";
import { critRule } from "../src/progression/loadout.ts";
import { volleyTurn, type VolleyTurn } from "../src/volley.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { snap } from "../src/exact.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { playedSave } from "./first-skills.ts";

const hero: Player = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
const foe = (strength: Enemy["strength"], hp = 50, attack = 1): Enemy => ({ name: "rat", hp, attack, defense: 0, tier: 0, strength });

/** A Tower run on seed 7 whose hand holds `cards`, with `trees` on them. */
function foeRun(cards: CardId[], trees: CardTreeLevels) {
  const s = playedSave();
  for (const card of cards) {
    s.cardXp[card] = MAX_CARD_XP;
    s.cardBuys.opened[card] = Object.fromEntries(CARD_TREES[card]!.map((n) => [n.id, n.max - n.levels]));
  }
  s.cardTrees = trees;
  s.hand = [...s.hand.filter((c) => !cards.includes(c)), ...cards].slice(-Math.max(s.hand.length, cards.length));
  const g = new Game(s);
  g.newRun({ seed: 7 });
  return g;
}
/** A purse over a fresh Tower run whose hand is `hand` and card trees
 * `trees`, Equipment open, its finds drawing `roll` every time. */
function purse(hand: CardId[], trees: CardTreeLevels, roll = 0.5) {
  const g = new Game(playedSave());
  g.save.equipment.unlocked = true;
  g.newRun({ seed: 7 });
  g.run.hand = hand;
  g.run.cardTrees = trees;
  return { g, purse: new RunPurse(g.save, g.mode, g.run, () => roll, 0, () => roll) };
}

test("each enemy card's tree: two tracks of a common node then one of each rarity, ten levels from the start", () => {
  const shape = (card: CardId) => CARD_TREES[card]!.map((n) => `${n.id}:${n.rarity}:${n.levels}/${n.max}:${Object.entries(n.stats).map(([s, v]) => `${s}=${v}`).join("+")}`);
  assert.deepEqual(shape("weakEnemy"), [
    "gold:common:5/10:weakEnemyGold=5", "silver:uncommon:0/5:weakEnemySilver=0.1", "instakillGold:rare:0/5:weakEnemyInstakillGold=5",
    "instakillMaterial:epic:0/5:weakEnemyInstakillMaterial=1", "instakillMaxHp:legendary:0/5:weakEnemyInstakillMaxHp=0.01",
    "attack:common:5/10:weakEnemyAttack=5", "critFactor:uncommon:0/5:weakEnemyCritFactor=2", "killXp:rare:0/5:weakEnemyKillXp=2",
    "spawnRate:epic:0/5:weakEnemySpawnRate=4", "stealOverheal:legendary:0/5:weakEnemyStealOverheal=10",
  ]);
  assert.deepEqual(shape("eliteEnemy"), [
    "gold:common:4/10:eliteEnemyGold=8", "silver:uncommon:0/5:eliteEnemySilver=0.3", "freeUpgrade:rare:0/5:freeOffenseChance=0.5+freeDefenseChance=0.5+freeUtilityChance=0.5",
    "equipment:epic:0/5:eliteEnemyEquipment=0.1", "surpriseAttack:legendary:0/5:eliteEnemySurpriseAttack=5",
    "defense:common:4/5:eliteEnemyDefense=5",
    "attack:common:2/5:eliteEnemyAttack=5", "critChance:uncommon:0/5:eliteEnemyCritChance=2", "killXp:rare:0/5:eliteEnemyKillXp=4",
    "spawnRate:epic:0/5:eliteEnemySpawnRate=2", "stealOverheal:legendary:0/5:eliteEnemyStealOverheal=20",
  ]);
  assert.deepEqual(shape("bossEnemy"), [
    "gold:common:5/10:bossEnemyGold=10", "shroud:uncommon:0/5:bossEnemyShroud=5", "defense:rare:0/5:bossEnemyDefense=5",
    "equipment:epic:0/5:bossEnemyEquipment=0.3", "tangle:legendary:0/5:bossEnemyTangle=3",
    "attack:common:5/10:bossEnemyAttack=5", "critChance:uncommon:0/5:bossEnemyCritChance=3", "critFactor:rare:0/5:bossEnemyCritFactor=4",
    "cells:epic:0/5:bossEnemyCells=1", "takedown:legendary:0/5:bossEnemyTakedown=5",
  ]);
  assert.deepEqual(shape("fastEnemy"), [
    "gold:common:5/10:fastEnemyGold=5", "silver:uncommon:0/5:fastEnemySilver=0.1", "freeDefense:rare:0/5:freeDefenseChance=0.5",
    "material:epic:0/5:fastEnemyMaterial=1", "surpriseAttack:legendary:0/5:fastEnemySurpriseAttack=5",
    "attack:common:5/10:fastEnemyAttack=5", "critChance:uncommon:0/5:critChance=2", "critFactor:rare:0/5:critFactor=2",
    "firstStrike:epic:0/5:fastEnemyFirstStrike=5", "regen:legendary:0/5:regen=10",
  ]);
  assert.deepEqual(shape("flyingEnemy"), [
    "gold:common:5/10:flyingEnemyGold=5", "silver:uncommon:0/5:flyingEnemySilver=0.1", "freeOffense:rare:0/5:freeOffenseChance=0.5",
    "material:epic:0/5:flyingEnemyMaterial=1", "chargeShot:legendary:0/5:flyingEnemyChargeShot=10",
    "attack:common:5/10:flyingEnemyAttack=5", "critChance:uncommon:0/5:flyingEnemyCritChance=2", "critFactor:rare:0/5:flyingEnemyCritFactor=4",
    "shotSpeed:epic:0/5:shotSpeed=4", "range:legendary:0/5:shotRange=4",
  ]);
  assert.deepEqual(shape("archer"), [
    "instakillGold:common:5/10:archerInstakillGold=5", "silver:uncommon:0/5:archerSilver=0.1", "bossShot:rare:0/5:bossShotAttack=5",
    "material:epic:0/5:archerMaterial=1", "chargeShot:legendary:0/5:chargeShot=10",
    "shotAttack:common:5/10:shotAttack=5", "critChance:uncommon:0/5:critChance=2", "critFactor:rare:0/5:critFactor=5",
    "shotSpeed:epic:0/5:shotSpeed=6", "range:legendary:0/5:shotRange=6",
  ]);
  for (const card of FOE_TREE_CARDS) {
    const nodes = CARD_TREES[card]!;
    for (const n of nodes) if (n.rarity !== "common") assert.equal(nodes.find((m) => m.id === n.after)!.rarity, ["common", "uncommon", "rare", "epic"][["uncommon", "rare", "epic", "legendary"].indexOf(n.rarity)], `${card}.${n.id} follows the rarity before it`);
  }
});

test("an enemy card's tree raises its stats against the enemies it covers only, and two cards covering one add theirs", () => {
  const bonus = treeBonus({ weakEnemy: { gold: 2 }, nonBossEnemy: { gold: 3 }, bossEnemy: { gold: 1 } });
  assert.equal(foeStat(bonus, foe("weak"), "Gold"), 25, "WEAK's 10 and NON-BOSS's 15");
  assert.equal(foeStat(bonus, foe("normal"), "Gold"), 15);
  assert.equal(foeStat(bonus, foe("greaterBoss"), "Gold"), 10, "BOSS covers a Greater Boss too");
  const g = foeRun(["weakEnemy", "nonBossEnemy"], { weakEnemy: { attack: 4 }, nonBossEnemy: { attack: 2 } });
  const p = g.run.player;
  assert.deepEqual(p.foeAttack, { weakEnemy: 25, nonBossEnemy: 15 }, "each card's own 5% and its tree's");
  assert.equal(attackAgainst(p, foe("weak")), snap((p.attack * 140) / 100));
  assert.equal(attackAgainst(p, foe("strong")), snap((p.attack * 115) / 100));
  assert.equal(attackAgainst(p, foe("boss")), p.attack);
});

test("an enemy card's DEF, shroud and Lifesteal Overheal hold in fights with its enemies only", () => {
  const p: Player = { ...hero, defense: 10, shroud: 20, lifesteal: 100, foeDefense: { bossEnemy: 25 }, foeShroud: { strongEnemy: 50 }, foeStealOverheal: { weakEnemy: 25, nonBossEnemy: 10 }, stealOverheal: 5 };
  assert.equal(facing(p, foe("boss")).defense, 12.5);
  assert.equal(facing(p, foe("weak")).defense, 10);
  assert.equal(facing(p, foe("strong")).shroud, 30);
  assert.equal(facing(p, foe("weak")).stealOverheal, 40, "ENEMY's 5 and the two cards' added");
  assert.equal(facing(p, foe("boss")).stealOverheal, 5);
  const thief = { ...hero, lifesteal: 100, foeStealOverheal: { weakEnemy: 25 } };
  assert.equal(heroHpAfter(bout(thief, foe("weak")), 100), 125);
  assert.equal(predict(thief, foe("weak")).hpAfter, 125);
  assert.equal(heroHpAfter(bout(thief, foe("normal")), 100), 100);
  const g = foeRun(["strongEnemy", "eliteEnemy"], { strongEnemy: { attack: 5, shroud: 2, killXp: 1, spawnRate: 1, stealOverheal: 1 }, eliteEnemy: { defense: 4 } });
  assert.deepEqual([g.run.player.foeShroud, g.run.player.foeDefense, g.run.player.foeStealOverheal], [{ strongEnemy: 10 }, { eliteEnemy: 20 }, { strongEnemy: 15 }]);
});

test("an enemy card's Crit % and Crit x add to ENEMY's percents against its enemies, as one card factor", () => {
  const s = playedSave();
  s.upgrades.critical = 1;
  s.training.critChance = 20;
  s.training.critFactor = 8;
  const plain = critRule(s)!, carded = critRule(s, { chance: 5, factor: 10 })!;
  const p = { ...hero, foeCritChance: { baseEnemy: 10 }, foeCritFactor: { baseEnemy: 20 } };
  assert.deepEqual(critAgainst(plain, p, foe("normal")), { chance: 22, factor: 2.4, cards: { chance: 10, factor: 20 } });
  assert.deepEqual(critAgainst(carded, p, foe("normal")), { chance: 23, factor: 2.6, cards: { chance: 15, factor: 30 } }, "20 × 1.15 and 2 × 1.3");
  assert.equal(critAgainst(carded, p, foe("weak")), carded, "nothing against an enemy it doesn't cover");
  assert.equal(critAgainst(undefined, p, foe("normal")), undefined, "no crits without Crit %");
  const g = foeRun(["bossEnemy"], { bossEnemy: { attack: 2, critChance: 2, critFactor: 1 } });
  assert.deepEqual([g.run.player.foeCritChance, g.run.player.foeCritFactor], [{ bossEnemy: 6 }, { bossEnemy: 4 }]);
});

test("an enemy card's Bounty, Instakill Bounty and Spoils pay its kills more Gold and Silver", () => {
  const plain = purse(["weakEnemy"], {}).purse, raised = purse(["weakEnemy"], { weakEnemy: { gold: 4, silver: 5, instakillGold: 2 } }).purse;
  // The card's own 5%, its tree's 20%, and 10% more for an Instakill, added into one factor.
  const base = plain.killGoldPreview(foe("weak"), 3, 3) / 1.05;
  assert.equal(raised.killGoldPreview(foe("weak"), 3, 3), snap(base * 1.25));
  assert.equal(raised.killGoldPreview(foe("weak"), 3, 3, true), snap((plain.killGoldPreview(foe("weak"), 3, 3, true) / 1.05) * 1.35));
  assert.equal(raised.killGoldPreview(foe("normal"), 3, 3), plain.killGoldPreview(foe("normal"), 3, 3), "a base enemy's Gold is the card's to raise, not WEAK's");
  assert.equal(raised.killSilver(foe("weak"), 20), snap(plain.killSilver(foe("weak"), 20) + plain.silver(0.5)));
  assert.equal(raised.killSilver(foe("normal"), 20), plain.killSilver(foe("normal"), 20));
});

test("an enemy card's Kill XP and Spawn Rate: more XP from its kills, and more of its enemies on each floor", () => {
  const plain = foeRun(["weakEnemy"], {}), raised = foeRun(["weakEnemy"], { weakEnemy: { attack: 5, critFactor: 1, killXp: 5 } });
  const xp = (g: Game, e: Enemy) => {
    const before = g.save.xp;
    g.gainXp(e, 20);
    return g.save.xp - before;
  };
  assert.equal(xp(raised, foe("weak")), Math.round(xp(plain, foe("weak")) * 1.1));
  assert.equal(xp(raised, foe("normal")), xp(plain, foe("normal")));
  assert.deepEqual(runExtras({ badges: undefined, cardTrees: { weakEnemy: { spawnRate: 5 }, nonBossEnemy: { spawnRate: 5 }, monster: { spawnRate: 1 } } }),
    { weak: 37, normal: 17, strong: 17, elite: 17, boss: 2 }, "WEAK's 20, NON-BOSS's 15 on each but the boss, ENEMY's 2 on all");
});

test("BOSS ENEMY's Takedown and Tangle cut bosses and Greater Bosses both, beside ATK UP's, DEF UP's and TORCH's", () => {
  const g = foeRun(["bossEnemy", "atkUp", "torch"], { bossEnemy: { gold: 5, shroud: 5, defense: 5, equipment: 5, tangle: 5, attack: 2, critChance: 5, critFactor: 5, cells: 5, takedown: 2 }, atkUp: { takedown: 1 }, torch: { greaterTangle: 2 } });
  assert.deepEqual(g.run.player.takedown, { boss: 15, greaterBoss: 10 });
  assert.deepEqual(g.run.player.tangle, { boss: 15, greaterBoss: 21 });
});

test("the trees' new Takedown and Tangle amounts: ATK UP 5%, DEF UP 3%, TORCH's Greater ones 3% a level", () => {
  const level = (card: CardId, id: string) => Object.values(CARD_TREES[card]!.find((n) => n.id === id)!.stats)[0];
  assert.deepEqual([level("atkUp", "takedown"), level("defUp", "tangle"), level("torch", "greaterTakedown"), level("torch", "greaterTangle")], [5, 3, 3, 3]);
});

test("an enemy card's drops: upgrade materials by Salvage (Instakill Salvage on an Instakill), a piece by Equipment Drop, Cells", () => {
  const weak = purse(["weakEnemy"], { weakEnemy: { instakillMaterial: 1 } }, 0).purse;
  assert.deepEqual(weak.enemyLoot(foe("weak"), 2, 2).equipment, [], "Instakill Salvage only on an Instakill");
  const [materials] = weak.enemyLoot(foe("weak"), 3, 3, 1, true).equipment;
  assert.ok(materials?.materials && materials.materials.quantity > 0);
  const elite = purse(["eliteEnemy"], { eliteEnemy: { equipment: 1 } }, 0).purse;
  const [piece] = elite.enemyLoot(foe("elite"), 2, 2).equipment;
  assert.ok(piece?.item || piece?.salvaged, "a piece kept or salvaged");
  assert.deepEqual(elite.enemyLoot(foe("strong"), 3, 3).equipment, []);
  assert.deepEqual(purse(["eliteEnemy"], { eliteEnemy: { equipment: 1 } }, 0.5).purse.enemyLoot(foe("elite"), 2, 2).equipment, [], "a roll over its 0.1% finds nothing");
  const locked = purse(["eliteEnemy"], { eliteEnemy: { equipment: 1 } }, 0);
  locked.g.save.equipment.unlocked = false;
  assert.deepEqual(locked.purse.enemyLoot(foe("elite"), 2, 2).equipment, [], "nothing before Equipment opens");
  const boss = purse(["bossEnemy"], { bossEnemy: { cells: 3 } }).purse;
  assert.equal(boss.enemyLoot(foe("boss"), 2, 2).cells, 3, "a boss's Cells, its own");
  assert.equal(boss.enemyLoot(foe("greaterBoss"), 3, 3).cells, 4, "a Greater Boss's 1 in tower I, and BOSS's 3");
  assert.equal(boss.enemyLoot(foe("elite"), 4, 4).cells, 0);
});

test("WEAK ENEMY's Instakill Vigor boosts max HP for the run with each Instakill of a weak enemy", () => {
  const g = foeRun(["weakEnemy"], { weakEnemy: { instakillMaxHp: 5 } }), max = g.run.player.maxHp;
  g.finds.kill(foe("weak"), { x: 2, y: 2 }, 1, false);
  assert.equal(g.run.player.maxHp, max, "no boost without an Instakill");
  g.finds.kill(foe("weak"), { x: 3, y: 3 }, 1, true);
  assert.equal(g.run.maxHpBoost, 0.05);
  assert.ok(g.run.player.maxHp > max);
  g.finds.kill(foe("normal"), { x: 4, y: 4 }, 1, true);
  assert.equal(g.run.maxHpBoost, 0.05, "a base enemy's Instakill isn't WEAK's");
});

test("an enemy card's Surprise Attack adds to ENEMY's chance against its enemies", () => {
  /** A corridor: the hero at its west end, a base rat of 20 HP on x = 5, Dash owned with `trees` on the run. */
  const corridor = (trees: CardTreeLevels, strength: Enemy["strength"] = "normal") => {
    const g = new Game(playedSave());
    g.save.upgrades.dash = 1;
    g.save.archives.levels.dash = 10;
    const w = g.world as RoomWorld;
    w.cells = new Map();
    for (let x = 0; x < 8; x++) w.cells.set(`${x},0`, { kind: "floor" });
    w.cells.set("5,0", { kind: "enemy", enemy: foe(strength, 20) });
    w.torches = [];
    Object.assign(g.run.player, { x: 0, y: 0, attack: 12 });
    g.run.hand = ["monster"];
    g.run.cardTrees = trees;
    return g;
  };
  const g = corridor({ baseEnemy: { surpriseAttack: 20 } });
  g.autoTurn();
  g.autoTurn();
  assert.match(g.message, /^Surprise Attack · /);
  const other = corridor({ baseEnemy: { surpriseAttack: 20 } }, "weak");
  other.autoTurn();
  other.autoTurn();
  assert.doesNotMatch(other.message, /Surprise/, "BASE's chance is against base enemies only");
});

test("FAST and FLYING ENEMY's trees raise theirs against Fast and Flying enemies, ARCHER's against every enemy", () => {
  const bonus = treeBonus({ fastEnemy: { gold: 2 }, flyingEnemy: { gold: 4 }, archer: { instakillGold: 1, silver: 3, material: 2 } });
  const fast = { ...foe("normal"), fast: true as const }, flying = { ...foe("strong"), flying: true as const };
  assert.deepEqual([foeStat(bonus, fast, "Gold"), foeStat(bonus, flying, "Gold"), foeStat(bonus, foe("normal"), "Gold")], [10, 20, 0]);
  for (const e of [foe("weak"), fast, flying, foe("greaterBoss")])
    assert.deepEqual([foeStat(bonus, e, "InstakillGold"), foeStat(bonus, e, "Silver"), foeStat(bonus, e, "Material")], [5, 0.3, 2], e.strength);
});

test("FAST ENEMY's First Strike: a Fast enemy may lose its first strike, so the hero strikes first", () => {
  /** A Tower run with the hero at (0, 0) and a Fast rat it fells in one strike at (1, 0). */
  const facingFast = (trees: CardTreeLevels) => {
    const g = new Game(playedSave());
    const w = g.world as RoomWorld;
    w.cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "enemy", enemy: { ...foe("normal", 10, 5), fast: true } }]]);
    w.torches = [];
    Object.assign(g.run.player, { x: 0, y: 0, attack: 12, defense: 0, hp: 100, maxHp: 100 });
    g.run.hand = ["fastEnemy"];
    g.run.cardTrees = trees;
    return g;
  };
  const struck = facingFast({});
  struck.move(1, 0);
  assert.ok(struck.run.player.hp < 100, "the Fast rat strikes first");
  const first = facingFast({ fastEnemy: { firstStrike: 20 } });
  first.move(1, 0);
  assert.equal(first.run.player.hp, 100, "felled before it strikes");
  assert.match(first.message, /^First Strike · /);
});

test("FLYING ENEMY's and ARCHER's trees raise the arrows: Shot ATK, Attack Speed, the boss bonus, Range and Charge Shot", () => {
  const s = playedSave();
  for (const card of ["archer", "flyingEnemy"] as const) s.cardXp[card] = MAX_CARD_XP;
  s.hand = ["archer", "flyingEnemy", ...s.hand].slice(0, s.hand.length);
  s.cardTrees = { archer: { shotAttack: 2, bossShot: 1, chargeShot: 1, shotSpeed: 1, range: 1 }, flyingEnemy: { chargeShot: 1, shotSpeed: 1, range: 1 } };
  const g = new Game(s);
  g.newRun({ seed: 7 });
  assert.deepEqual((g as unknown as { handShot: VolleyTurn["handShot"] }).handShot, { attack: 15, speed: 15, boss: 10, range: 10, charge: 10, foeCharge: { flyingEnemy: 10 } },
    "the cards' 5% Shot ATK, Attack Speed and boss bonus with the trees' added");
  assert.equal(g.shotReach?.range, 330, "3 m and 10% more");
});

test("the trees' Range lengthens the arrows' reach, and Charge Shot raises Charged Shot's percent, the enemy cards' against theirs", () => {
  const brute: Enemy = { ...foe("normal", 50_000), name: "Brute" };
  const at = (x: number, y: number, enemy = brute) => new Map<string, Tile>([[`${x},${y}`, { kind: "enemy", enemy }]]);
  const ranks = playedSave();
  ranks.archives.levels.chargedShot = 10;
  const shoot = (tiles: Map<string, Tile>, handShot?: VolleyTurn["handShot"]) => volleyTurn({ board: { tile: (x, y) => tiles.get(`${x},${y}`) ?? { kind: "floor" }, clear: () => {}, wound: () => {} },
    wrap: 0, floorOf: () => 1, hero: { ...hero, attack: 1000 }, seed: 7, volleys: { turn: 1, waited: 2 }, archer: true, ranks, handShot }).shots.filter((s) => s.by === "hero");
  assert.equal(shoot(at(0, 4)).length, 0, "4 m is past Attack Range's 3");
  assert.equal(shoot(at(0, 4), { attack: 0, speed: 0, range: 34 }).length, 1, "but not 3 m and 34% more");
  const charge = (handShot?: VolleyTurn["handShot"], enemy = brute) => shoot(at(0, 1, enemy), handShot)[0]!.charge;
  assert.equal(charge(), 20, "two turns waited at 10% a turn");
  assert.equal(charge({ attack: 0, speed: 0, charge: 10 }), 22, "ARCHER's 10% more of it");
  assert.equal(charge({ attack: 0, speed: 0, charge: 10, foeCharge: { flyingEnemy: 10 } }), 22, "FLYING's isn't for a grounded enemy");
  assert.equal(charge({ attack: 0, speed: 0, charge: 10, foeCharge: { flyingEnemy: 10 } }, { ...brute, flying: true }), 24, "but adds to ARCHER's against a Flying one");
});
