import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { MAX_CARD_XP } from "../src/card-levels.ts";
import { CARD_TREES, FOE_TREE_CARDS, foeStat, runExtras, treeBonus, type CardTreeLevels } from "../src/card-trees.ts";
import type { CardId } from "../src/cards.ts";
import { attackAgainst, bout, critAgainst, facing, heroHpAfter, predict } from "../src/combat.ts";
import { critRule } from "../src/loadout.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { snap } from "../src/exact.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, Player } from "../src/entities.ts";

const hero: Player = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
const foe = (strength: Enemy["strength"], hp = 50, attack = 1): Enemy => ({ name: "rat", hp, attack, defense: 0, tier: 0, strength });

/** A Tower run on seed 7 whose hand holds `cards`, with `trees` on them. */
function foeRun(cards: CardId[], trees: CardTreeLevels) {
  const s = defaults();
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
  const g = new Game(defaults());
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
    "gold:common:8/10:bossEnemyGold=10", "shroud:uncommon:0/5:bossEnemyShroud=5", "defense:rare:0/5:bossEnemyDefense=5",
    "equipment:epic:0/5:bossEnemyEquipment=0.3", "tangle:legendary:0/5:bossEnemyTangle=3",
    "attack:common:2/5:bossEnemyAttack=5", "critChance:uncommon:0/5:bossEnemyCritChance=3", "critFactor:rare:0/5:bossEnemyCritFactor=4",
    "cells:epic:0/5:bossEnemyCells=1", "takedown:legendary:0/5:bossEnemyTakedown=5",
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
  const s = defaults();
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
    const g = new Game(defaults());
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
