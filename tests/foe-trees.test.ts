import { givePowers, holdPowers, type GivenPowers } from "./powers-helper.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { MAX_CARD_XP } from "../src/cards/levels.ts";
import { FOE_TREE_CARDS, foeStat, powerBonus } from "../src/cards/powers.ts";
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

/** A Tower run on seed 7 whose hand holds `cards`, each raising its stats in `powers`. */
function foeRun(cards: CardId[], powers: GivenPowers) {
  const s = playedSave();
  for (const card of cards) holdPowers(s, card, powers[card] ?? {});
  s.hand = [...s.hand.filter((c) => !cards.includes(c)), ...cards].slice(-Math.max(s.hand.length, cards.length));
  const g = new Game(s);
  g.newRun({ seed: 7 });
  return g;
}
/** A purse over a fresh Tower run whose hand is `hand` raising `powers`,
 * Equipment open, its finds drawing `roll` every time. */
function purse(hand: CardId[], powers: GivenPowers, roll = 0.5) {
  const g = new Game(playedSave());
  g.save.equipment.unlocked = true;
  g.newRun({ seed: 7 });
  g.run.hand = hand;
  g.run.handLevels = givePowers(powers);
  return { g, purse: new RunPurse(g.save, g.mode, g.run, () => roll, 0, () => roll) };
}

test("the enemy cards with powers of their own are BOSS, NON-BOSS and ARCHER", () => {
  assert.deepEqual(FOE_TREE_CARDS, ["bossEnemy", "nonBossEnemy", "archer"]);
});

test("an enemy card's powers raise its stats against the enemies it covers only, and two cards covering one add theirs", () => {
  const bonus = powerBonus(givePowers({ nonBossEnemy: { nonBossEnemyGold: 15 }, bossEnemy: { bossEnemyGold: 10 }, archer: { archerGold: 5 } }));
  assert.equal(foeStat(bonus, foe("weak"), "Gold"), 20, "NON-BOSS's 15 and ARCHER's 5");
  assert.equal(foeStat(bonus, foe("greaterBoss"), "Gold"), 15, "BOSS covers a Greater Boss too");
  const g = foeRun(["bossEnemy", "nonBossEnemy"], { bossEnemy: { bossEnemyAttack: 20 }, nonBossEnemy: { nonBossEnemyAttack: 10 } });
  const p = g.run.player;
  assert.deepEqual(p.foeAttack, { bossEnemy: 25, nonBossEnemy: 15 }, "each card's own 5% and its power's");
  assert.equal(attackAgainst(p, foe("boss")), snap((p.attack * 125) / 100));
  assert.equal(attackAgainst(p, foe("strong")), snap((p.attack * 115) / 100));
});

test("an enemy card's DEF, shroud and Lifesteal Overheal hold in fights with its enemies only", () => {
  const p: Player = { ...hero, defense: 10, shroud: 20, lifesteal: 100, foeDefense: { bossEnemy: 25 }, foeShroud: { nonBossEnemy: 50 }, foeStealOverheal: { nonBossEnemy: 25, archer: 10 }, stealOverheal: 5 };
  assert.equal(facing(p, foe("boss")).defense, 12.5);
  assert.equal(facing(p, foe("weak")).defense, 10);
  assert.equal(facing(p, foe("strong")).shroud, 30);
  assert.equal(facing(p, foe("weak")).stealOverheal, 40, "ENEMY's 5 and the two cards' added");
  assert.equal(facing(p, foe("boss")).stealOverheal, 15, "ARCHER's covers a boss, NON-BOSS's doesn't");
  const thief = { ...hero, lifesteal: 100, foeStealOverheal: { nonBossEnemy: 25 } };
  assert.equal(heroHpAfter(bout(thief, foe("weak")), 100), 125);
  assert.equal(predict(thief, foe("weak")).hpAfter, 125);
  assert.equal(heroHpAfter(bout(thief, foe("boss")), 100), 100);
  const g = foeRun(["nonBossEnemy", "bossEnemy"], { nonBossEnemy: { nonBossEnemyShroud: 10, nonBossEnemyStealOverheal: 15 }, bossEnemy: { bossEnemyDefense: 20 } });
  assert.deepEqual([g.run.player.foeShroud, g.run.player.foeDefense, g.run.player.foeStealOverheal], [{ nonBossEnemy: 10 }, { bossEnemy: 20 }, { nonBossEnemy: 15 }]);
});

test("an enemy card's Crit % and Crit x add to ENEMY's percents against its enemies, as one card factor", () => {
  const s = playedSave();
  s.upgrades.critical = 1;
  s.training.critChance = 20;
  s.training.critFactor = 8;
  const plain = critRule(s)!, carded = critRule(s, { chance: 5, factor: 10 })!;
  const p = { ...hero, foeCritChance: { nonBossEnemy: 10 }, foeCritFactor: { nonBossEnemy: 20 } };
  assert.deepEqual(critAgainst(plain, p, foe("normal")), { chance: 22, factor: 2.4, cards: { chance: 10, factor: 20 } });
  assert.deepEqual(critAgainst(carded, p, foe("normal")), { chance: 23, factor: 2.6, cards: { chance: 15, factor: 30 } }, "20 × 1.15 and 2 × 1.3");
  assert.equal(critAgainst(carded, p, foe("boss")), carded, "nothing against an enemy it doesn't cover");
  assert.equal(critAgainst(undefined, p, foe("normal")), undefined, "no crits without Crit %");
  const g = foeRun(["bossEnemy"], { bossEnemy: { bossEnemyAttack: 10, bossEnemyCritChance: 6, bossEnemyCritFactor: 4 } });
  assert.deepEqual([g.run.player.foeCritChance, g.run.player.foeCritFactor], [{ bossEnemy: 6 }, { bossEnemy: 4 }]);
});

test("an enemy card's Gold, Instakill Gold and Silver pay its kills more", () => {
  const plain = purse(["nonBossEnemy"], {}).purse, raised = purse(["nonBossEnemy"], { nonBossEnemy: { nonBossEnemyGold: 20, nonBossEnemySilver: 0.5, nonBossEnemyInstakillGold: 10 } }).purse;
  // The card's own 5%, its power's 20%, and 10% more for an Instakill, added into one factor.
  const base = plain.killGoldPreview(foe("weak"), 3, 3) / 1.05;
  assert.equal(raised.killGoldPreview(foe("weak"), 3, 3), snap(base * 1.25));
  assert.equal(raised.killGoldPreview(foe("weak"), 3, 3, true), snap((plain.killGoldPreview(foe("weak"), 3, 3, true) / 1.05) * 1.35));
  assert.equal(raised.killGoldPreview(foe("boss"), 3, 3), plain.killGoldPreview(foe("boss"), 3, 3), "a boss's Gold isn't NON-BOSS's to raise");
  assert.equal(raised.killSilver(foe("weak"), 20), snap(plain.killSilver(foe("weak"), 20) + plain.silver(0.5)));
  assert.equal(raised.killSilver(foe("boss"), 20), plain.killSilver(foe("boss"), 20));
});

test("an enemy card's Kill XP raises the XP of its kills only", () => {
  // Each run reads NON-BOSS's powers as they stand, so each is measured before the next is made.
  const xp = (g: Game, e: Enemy) => {
    const before = g.save.xp;
    g.gainXp(e, 20);
    return g.save.xp - before;
  };
  const plain = foeRun(["nonBossEnemy"], {}), plainWeak = xp(plain, foe("weak")), plainBoss = xp(plain, foe("boss"));
  const raised = foeRun(["nonBossEnemy"], { nonBossEnemy: { nonBossEnemyKillXp: 10 } });
  assert.equal(xp(raised, foe("weak")), Math.round(plainWeak * 1.1));
  assert.equal(xp(raised, foe("boss")), plainBoss);
});

test("BOSS ENEMY's Takedown and Tangle cut bosses and Greater Bosses both, beside ATK UP's, DEF UP's and TORCH's", () => {
  const g = foeRun(["bossEnemy", "atkUp", "torch"], { bossEnemy: { bossEnemyTangle: 15, bossEnemyTakedown: 10 }, atkUp: { takedown: 5 }, torch: { greaterTangle: 6 } });
  assert.deepEqual(g.run.player.takedown, { boss: 15, greaterBoss: 10 });
  assert.deepEqual(g.run.player.tangle, { boss: 15, greaterBoss: 21 });
});

test("an enemy card's drops: upgrade materials by Salvage (Instakill Salvage on an Instakill), a piece by Equipment Drop, Lore", () => {
  const salvage = purse(["nonBossEnemy"], { nonBossEnemy: { nonBossEnemyInstakillMaterial: 1 } }, 0).purse;
  assert.deepEqual(salvage.enemyLoot(foe("weak"), 2, 2).equipment, [], "Instakill Salvage only on an Instakill");
  const [materials] = salvage.enemyLoot(foe("weak"), 3, 3, 1, true).equipment;
  assert.ok(materials?.materials && materials.materials.quantity > 0);
  const bossDrop = purse(["bossEnemy"], { bossEnemy: { bossEnemyEquipment: 0.1 } }, 0).purse;
  const piece = bossDrop.enemyLoot(foe("boss"), 2, 2).equipment.find((l) => l.item || l.salvaged);
  assert.ok(piece?.item || piece?.salvaged, "a piece kept or salvaged");
  assert.deepEqual(bossDrop.enemyLoot(foe("strong"), 3, 3).equipment, []);
  const locked = purse(["bossEnemy"], { bossEnemy: { bossEnemyEquipment: 0.1 } }, 0);
  locked.g.save.equipment.unlocked = false;
  assert.deepEqual(locked.purse.enemyLoot(foe("elite"), 2, 2).equipment, [], "nothing before Equipment opens");
  const boss = purse(["bossEnemy"], { bossEnemy: { bossEnemyCells: 3 } }).purse;
  assert.equal(boss.enemyLoot(foe("boss"), 2, 2).cells, 3, "a boss's Lore, its own");
  assert.equal(boss.enemyLoot(foe("greaterBoss"), 3, 3).cells, 4, "a Greater Boss's 1 in tower I, and BOSS's 3");
  assert.equal(boss.enemyLoot(foe("elite"), 4, 4).cells, 0);
});

test("NON-BOSS ENEMY's Instakill Vigor boosts max HP for the run with each Instakill of a non-boss enemy", () => {
  const g = foeRun(["nonBossEnemy"], { nonBossEnemy: { nonBossEnemyInstakillMaxHp: 0.05 } }), max = g.run.player.maxHp;
  g.finds.kill(foe("weak"), { x: 2, y: 2 }, 1, false);
  assert.equal(g.run.player.maxHp, max, "no boost without an Instakill");
  g.finds.kill(foe("weak"), { x: 3, y: 3 }, 1, true);
  assert.equal(g.run.maxHpBoost, 0.05);
  assert.ok(g.run.player.maxHp > max);
  g.finds.kill(foe("boss"), { x: 4, y: 4 }, 1, true);
  assert.equal(g.run.maxHpBoost, 0.05, "a boss's Instakill isn't NON-BOSS's");
});

test("an enemy card's Surprise Attack adds to ENEMY's chance against its enemies", () => {
  /** A corridor: the hero at its west end, a rat of 20 HP on x = 5, Dash owned with `powers` on the run. */
  const corridor = (powers: GivenPowers, strength: Enemy["strength"] = "normal") => {
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
    g.run.handLevels = givePowers(powers);
    return g;
  };
  const g = corridor({ nonBossEnemy: { nonBossEnemySurpriseAttack: 100 } });
  g.autoTurn();
  g.autoTurn();
  assert.match(g.message, /^Surprise Attack · /);
  const other = corridor({ nonBossEnemy: { nonBossEnemySurpriseAttack: 100 } }, "boss");
  other.autoTurn();
  other.autoTurn();
  assert.doesNotMatch(other.message, /Surprise/, "NON-BOSS's chance is against non-boss enemies only");
});

test("ARCHER's powers count against every enemy", () => {
  const bonus = powerBonus(givePowers({ archer: { archerInstakillGold: 5, archerSilver: 0.3, archerMaterial: 2 } }));
  const fast = { ...foe("normal"), fast: true as const }, flying = { ...foe("strong"), flying: true as const };
  for (const e of [foe("weak"), fast, flying, foe("greaterBoss")])
    assert.deepEqual([foeStat(bonus, e, "InstakillGold"), foeStat(bonus, e, "Silver"), foeStat(bonus, e, "Material")], [5, 0.3, 2], e.strength);
});

test("ARCHER's powers raise the arrows: Shot ATK, Attack Speed, the boss bonus, Range and Charge Shot", () => {
  const s = playedSave();
  s.cardXp.flyingEnemy = MAX_CARD_XP;
  s.hand = ["archer", "flyingEnemy", ...s.hand].slice(0, s.hand.length);
  holdPowers(s, "archer", { shotAttack: 10, bossShotAttack: 5, chargeShot: 10, shotSpeed: 10, shotRange: 10 });
  const g = new Game(s);
  g.newRun({ seed: 7 });
  assert.deepEqual((g as unknown as { handShot: VolleyTurn["handShot"] }).handShot, { attack: 15, speed: 15, boss: 10, range: 10, charge: 10 },
    "the cards' 5% Shot ATK, Attack Speed and boss bonus with the powers' added");
  assert.equal(g.shotReach?.range, 330, "3 m and 10% more");
});

test("the powers' Range lengthens the arrows' reach, and Charge Shot raises Charged Shot's percent, the enemy cards' against theirs", () => {
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
  assert.equal(charge({ attack: 0, speed: 0, charge: 10, foeCharge: { nonBossEnemy: 10 } }, { ...brute, strength: "boss" }), 22, "NON-BOSS's isn't for a boss");
  assert.equal(charge({ attack: 0, speed: 0, charge: 10, foeCharge: { nonBossEnemy: 10 } }), 24, "but adds to ARCHER's against a non-boss one");
});
