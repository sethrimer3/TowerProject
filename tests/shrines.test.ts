import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { RESEARCH, missing, type ResearchId } from "../src/archives.ts";
import { checkpoint } from "../src/goals.ts";
import type { Save, TowerRun } from "../src/entities.ts";
import {
  BOONS, BOON_IDS, autoChoice, boonEffects, boonsEarned, floorsFor, foeTile, nextBoonFloor, rollOffer, standardTotal, type BoonId,
} from "../src/shrines.ts";
import { RoomWorld } from "../src/tower/room-world.ts";

// Shrines: the research and Goals that open them, the boon schedule, offers,
// boon math, and a Tower run's boons surviving undo.

/** A profile with `levels` of research done. */
function researched(levels: Partial<Record<ResearchId, number>>, save = defaults()) {
  save.archives.levels = { ...save.archives.levels, ...levels };
  return save;
}
const open = (levels: Partial<Record<ResearchId, number>> = {}) => researched({ unlockShrines: 1, ...levels });

test("Tower II's floor 150 Goal opens Unlock Shrines, which opens its labs", () => {
  assert.deepEqual(checkpoint(2, 150)?.reward, { kind: "unlock", unlock: "shrines" });
  assert.deepEqual(checkpoint(2, 250)?.reward, { kind: "unlock", unlock: "firstBoonChoice" });
  assert.deepEqual(checkpoint(2, 400)?.reward, { kind: "unlock", unlock: "improveTradeoffs" });
  assert.deepEqual(checkpoint(4, 50)?.reward, { kind: "unlock", unlock: "autoPickBoons" });
  assert.deepEqual(checkpoint(4, 80)?.reward, { kind: "unlock", unlock: "boonOptions" });
  assert.deepEqual(checkpoint(5, 40)?.reward, { kind: "unlock", unlock: "banBoons" });
  assert.deepEqual(checkpoint(6, 10)?.reward, { kind: "unlock", unlock: "autoPickRanking" });
  const s = defaults();
  s.upgrades.archives = 1;
  assert.equal(missing(s, "unlockShrines").length, 1);
  s.goals.claimed[2] = [150];
  assert.equal(missing(s, "unlockShrines").length, 0);
  assert.equal(missing(s, "shrineFloors").length, 1);
  researched({ unlockShrines: 1 }, s);
  assert.equal(missing(s, "shrineFloors").length, 0);
  assert.equal(missing(s, "standardBoonBonus").length, 0);
  // The rest wait for their own Goals too.
  assert.equal(missing(s, "firstBoonChoice").length, 1);
  assert.equal(missing(s, "autoPickRanking").length, 2);
});

test("Shrine research is priced and timed as specified", () => {
  const levels = (id: ResearchId) => RESEARCH[id].levels;
  const minutes = (id: ResearchId, i: number) => Math.round(levels(id)[i]!.hours * 60);
  assert.deepEqual([levels("unlockShrines").length, levels("unlockShrines")[0]!.gold, minutes("unlockShrines", 0)], [1, 1.5e6, 4999]);
  assert.deepEqual([levels("shrineFloors").length, levels("shrineFloors")[0]!.gold, levels("shrineFloors")[1]!.gold, minutes("shrineFloors", 0), minutes("shrineFloors", 1)], [100, 100e3, 220e3, 99, 201]);
  assert.equal(levels("standardBoonBonus").length, 25);
  assert.deepEqual([0, 1, 2, 3].map((i) => minutes("standardBoonBonus", i)), [99, 334, 579, 864]);
  assert.deepEqual([levels("standardBoonBonus")[8]!.gold, levels("standardBoonBonus")[13]!.gold, levels("standardBoonBonus")[20]!.gold], [950e6, 10e9, 95e9]);
  assert.deepEqual(levels("improveTradeoffs").map((l) => l.gold), [600e6, 700e6, 800e6, 900e6, 1e9, 1.25e9, 1.6e9, 2.2e9, 3.2e9, 4.9e9]);
  assert.deepEqual([minutes("improveTradeoffs", 0), minutes("improveTradeoffs", 1)], [1499, 2339]);
  assert.deepEqual(levels("banBoons").map((l) => l.gold), [10e6, 100e6, 1e9, 10e9, 100e9, 1e12, 100e12, 1e15]);
  assert.deepEqual(levels("boonOptions").map((l) => l.gold), [200e6, 2e9]);
  assert.equal(levels("autoPickRanking").length, 32);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => levels("autoPickRanking")[i]!.gold), [100e3, 180e3, 875e3, 4.46e6, 15.7e6]);
  assert.deepEqual([0, 1, 2].map((i) => minutes("autoPickRanking", i)), [2866, 3201, 3558]);
});

test("floors per boon follow the formula, rounded down", () => {
  // The worked example: base 200, Floors Required 3, Standard Boon Bonus
  // 8% and three Boon Floor Requirement boons: (200 − 3) × (1 − 0.648).
  const s = open({ shrineFloors: 3, standardBoonBonus: 8 });
  const picked: BoonId[] = ["floorReq", "floorReq", "floorReq"];
  assert.equal(boonEffects(picked, s).floorReq, 6480);
  assert.equal(floorsFor(1, s, 6480), 69);
  // The base rises after 20, 30 and 40 boons.
  const plain = open();
  assert.deepEqual([1, 20, 21, 30, 31, 40, 41].map((k) => floorsFor(k, plain, 0)), [200, 200, 250, 250, 300, 300, 350]);
});

test("boons are earned at absolute floors, and a shorter schedule earns several at once", () => {
  const s = open();
  assert.equal(boonsEarned(199, [], s), 0);
  assert.equal(boonsEarned(200, [], s), 1);
  assert.equal(boonsEarned(399, [], s), 1);
  assert.equal(nextBoonFloor(250, [], s), 400);
  // Twenty boons at 200 floors each, then 250.
  assert.equal(boonsEarned(4000, [], s), 20);
  assert.equal(nextBoonFloor(4000, [], s), 4250);
  // A Boon Floor Requirement boon (−20%: 160 floors each) at floor 650
  // makes four boons earned where there were three.
  assert.equal(boonsEarned(650, [], s), 3);
  assert.equal(boonsEarned(650, ["floorReq"], s), 4);
  // No Shrines, no boons.
  assert.equal(boonsEarned(10_000, [], defaults()), 0);
});

test("standard boons multiply or add, strengthened by Standard Boon Bonus", () => {
  const s = open({ standardBoonBonus: 25 });
  // Multiplicative: (1 + 0.2 × 3) × 1.25.
  assert.equal(standardTotal("maxHp", 3, s), 2);
  // Additive: 4 × 2 × 1.25.
  assert.equal(standardTotal("parry", 2, s), 10);
  // Max Play Speed: +1.25 steps a second.
  assert.equal(boonEffects(["playSpeed"], s).playSpeed, 1.25);
  assert.equal(boonEffects([], s).attack, 1);
});

test("trade-off boons' benefits grow with Improve Trade-off Boons, their costs don't", () => {
  const s = open({ improveTradeoffs: 10 });
  const e = boonEffects(["attackBossHp", "goldMaxHp", "fastSecond"], s);
  assert.equal(e.attack, 1 + 0.5 * 1.1);
  assert.equal(e.foes.bossHp, 8);
  assert.equal(e.gold, 1 + 0.8 * 1.1);
  assert.equal(e.maxHp, 0.3);
  assert.equal(e.foes.fastAttack, 2.5);
});

test("enemies under the boons: HP, ATK, bosses striking first and Fast ones second", () => {
  const s = open();
  const enemy = (strength: "normal" | "boss", fast = false) => ({ kind: "enemy" as const, enemy: { name: "x", hp: 100, attack: 10, defense: 0, strength, ...(fast ? { fast: true as const } : {}) } as any });
  const halved = boonEffects(["enemyHpRegen"], s).foes;
  assert.equal(foeTile(enemy("normal"), halved).enemy!.hp, 50);
  const bosses = boonEffects(["bossHp"], s).foes;
  const boss = foeTile(enemy("boss"), bosses).enemy!;
  assert.equal(boss.hp, 30);
  assert.equal(boss.fast, true);
  const second = foeTile(enemy("normal", true), boonEffects(["fastSecond"], s).foes).enemy!;
  assert.equal(second.fast, undefined);
  assert.equal(second.attack, 25);
});

test("offers: two boons by default, the First Boon Choice first, bans kept out, the same on replay", () => {
  const s = open({ firstBoonChoice: 1, banBoons: 2, boonOptions: 2 });
  s.shrines.firstChoice = "regen";
  s.shrines.banned = ["attack", "maxHp"];
  const run = { picked: [] as BoonId[], rolls: 0 };
  const offer = rollOffer(1234, run, s);
  assert.equal(offer.length, 4);
  assert.equal(offer[0], "regen");
  assert.ok(!offer.includes("attack") && !offer.includes("maxHp"));
  assert.equal(new Set(offer).size, 4);
  assert.deepEqual(rollOffer(1234, { picked: [], rolls: 0 }, s), offer);
  // Two without Boon Option Quantity; never the First Boon Choice after the first pick.
  const plain = open();
  assert.equal(rollOffer(1, { picked: [], rolls: 0 }, plain).length, 2);
  // Over many offers both kinds appear, a trade-off now and then.
  let tradeoffs = 0, slots = 0;
  for (let seed = 0; seed < 400; seed++)
    for (const id of rollOffer(seed, { picked: [], rolls: 0 }, plain)) {
      slots++;
      if (BOONS[id].kind === "tradeoff") tradeoffs++;
    }
  assert.ok(tradeoffs / slots > 0.1 && tradeoffs / slots < 0.3, `${tradeoffs} of ${slots}`);
});

test("Auto Pick takes the best ranked boon offered, or the top one", () => {
  const s = open({ autoPickBoons: 1, autoPickRanking: 2 });
  s.shrines.ranking = ["gold", "silver", "regen"];
  assert.equal(autoChoice(["regen", "silver"], s), "silver");
  // Only two are ranked at level 2: regen counts as unranked.
  assert.equal(autoChoice(["parry", "regen"], s), "parry");
});

test("decode keeps the Shrine Boons page's choices and a run's boons", () => {
  const s = defaults();
  s.shrines = { autoPick: true, firstChoice: "attack", banned: ["gold"], ranking: ["regen", "parry"] };
  const back = decode(JSON.stringify({ ...s, shrines: { ...s.shrines, banned: ["gold", "nope", "gold"], firstChoice: "fastSecond" } }));
  assert.deepEqual(back.shrines, { autoPick: true, banned: ["gold"], ranking: ["regen", "parry"] });
  assert.ok(BOON_IDS.length > 15);
});

/** A Tower run inside on floor `floor` with Shrines researched. */
function climbing(floor: number, levels: Partial<Record<ResearchId, number>> = {}) {
  const s: Save = open(levels);
  s.tutorials.climb = true;
  s.tutorials.enter = true;
  const g = new Game(s);
  g.finish("again");
  g.enterRun();
  g.run.height = g.run.maxHeight = floor - 1;
  return g;
}

test("a run picks an offered boon: the hero's stats change, and undo keeps the boon", () => {
  const g = climbing(200);
  assert.equal(g.shrine.unspent, 1);
  assert.equal(g.shrine.floorsToNext, 200);
  const offer = g.shrine.offer();
  assert.equal(offer.length, 2);
  // Take a step so there is something to undo.
  g.save.tower.history.push(g.snapshot());
  const attack = g.run.player.attack, maxHp = g.run.player.maxHp;
  const id = offer[0]!;
  assert.ok(g.shrine.pick(id));
  assert.equal(g.shrine.unspent, 0);
  const run = g.run as TowerRun;
  assert.deepEqual(run.shrine!.picked, [id]);
  const e = boonEffects([id], g.save);
  assert.equal(g.run.player.attack, Math.round(attack * e.attack * 1e6) / 1e6);
  assert.equal(g.run.player.maxHp, Math.round(maxHp * e.maxHp * 1e6) / 1e6);
  assert.ok(g.undo());
  assert.deepEqual((g.run as TowerRun).shrine!.picked, [id]);
  assert.equal(g.run.player.attack, Math.round(attack * e.attack * 1e6) / 1e6);
});

test("a boon changing enemies reaches the board at once", () => {
  const g = climbing(200);
  const run = g.run as TowerRun;
  run.shrine = { picked: [], rolls: 0, offer: ["enemyHpRegen", "gold"] };
  assert.ok(g.shrine.pick("enemyHpRegen"));
  assert.ok(g.world instanceof RoomWorld);
  assert.equal((g.world as RoomWorld).foes?.hp, 0.5);
});

test("Max Play Speed raises the most the arrows reach, by the Standard Boon Bonus too", () => {
  const g = climbing(200, { standardBoonBonus: 25 });
  const before = g.maxSpeed;
  (g.run as TowerRun).shrine = { picked: [], rolls: 0, offer: ["playSpeed", "gold"] };
  assert.ok(g.shrine.pick("playSpeed"));
  assert.equal(g.maxSpeed, before + 1.25);
});

test("Auto Pick takes boons as they are earned", () => {
  const g = climbing(600, { autoPickBoons: 1 });
  g.shrine.setAutoPick(true);
  assert.equal(g.shrine.unspent, 0);
  assert.equal((g.run as TowerRun).shrine!.picked.length, 3);
  assert.equal(g.save.shrines.autoPick, true);
});
