import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activeBossParts,
  bossMinionAt,
  bossPartAt,
  decodeTrial,
  effectiveBossDef,
  effectiveBossRegen,
  ELEMENTAL,
  OBELISK_DEFAULT_TURNS,
  OBELISK_SHOT_INTERVAL,
  OBELISK_SPECIAL_INTERVAL,
  startTrial,
  trialDamageThisRun,
  trialDpt,
  trialStep,
} from "../src/proving-grounds/trial.ts";
import { focusTrialCard, trialBoard, trialPlan } from "../src/proving-grounds/autoplay.ts";
import { saveTrialDamage, settleTrialVictory } from "../src/proving-grounds/progression.ts";
import { decodeTrialAccess, defaultTrialAccess } from "../src/proving-grounds/access.ts";
import { defaultArchives, researched } from "../src/progression/archives.ts";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";

function enterArena(s: ReturnType<typeof startTrial>) {
  for (let i = 0; i < 4; i++) trialStep(s, 0, 1, s.mode === "cards" ? "cards" : "manual");
  assert.equal(s.room, "arena");
}

function walkToBossAdjacent(s: ReturnType<typeof startTrial>) {
  const input = s.mode === "cards" ? "cards" : "manual";
  while (s.player.y < ELEMENTAL.y - 1) {
    const res = trialStep(s, 0, 1, input);
    assert.equal(res.changed, true);
  }
  assert.equal(s.player.x, ELEMENTAL.x);
  assert.equal(s.player.y, ELEMENTAL.y - 1);
}

describe("Boss Fights / Trials adjustments (Magic Tower & Obelisk)", () => {
  it("resolves one round of combat per turn against the boss, keeps boss ATK constant, and records fight animation data", () => {
    const s = startTrial({ maxHp: 500, attack: 20, defense: 5 }, "manual", [], 1234, 1, "magic-tower");
    enterArena(s);
    walkToBossAdjacent(s);
    // Clear minions so only boss damage is measured on the strike turn
    s.bossVariant!.minions = [];

    const hpBefore = s.bossHp;
    const playerHpBefore = s.player.hp;
    const r1 = trialStep(s, 0, 1);
    assert.equal(r1.changed, true);
    assert.equal(s.status, "active", "single turn performs one round rather than fighting to the death");
    assert.ok(s.bossHp < hpBefore && s.bossHp > 0);
    assert.ok(s.player.hp < playerHpBefore && s.player.hp > 0);

    const damageTakenRound1 = playerHpBefore - s.player.hp;
    assert.ok(s.bossVariant?.lastRound);
    assert.equal(s.bossVariant.lastRound.step, s.steps);
    assert.ok(s.bossVariant.lastRound.heroDamage > 0);
    assert.equal(s.bossVariant.lastRound.enemyDamage, damageTakenRound1);

    s.bossVariant!.minions = [];
    const playerHpBeforeRound2 = s.player.hp;
    trialStep(s, 0, 1);
    const damageTakenRound2 = playerHpBeforeRound2 - s.player.hp;
    assert.equal(damageTakenRound2, damageTakenRound1, "Boss ATK does not increase with each hit on the player");
  });

  it("allows breaking off combat and switching targets at any turn by selecting a card in hand", () => {
    const hand = ["bossEnemy", "atkUp", "heal", "chest"] as const;
    const s = startTrial({ maxHp: 500, attack: 20, defense: 5 }, "hybrid", hand, 4242, 1, "magic-tower");
    enterArena(s);
    walkToBossAdjacent(s);

    // Perform one round of combat against the boss
    trialStep(s, 0, 1, "cards");
    assert.ok(s.bossHp < s.bossMaxHp);

    // Default plan with bossEnemy first in hand (slot 0) targets the boss
    const planBoss = trialPlan(s);
    assert.equal(planBoss?.card, 0);

    // Player selects the atkUp card (slot 1) in hand to break off and target an ATK pickup on the floor
    assert.equal(focusTrialCard(s, 1), true);
    assert.equal(s.bossVariant?.focusedCard, 1);
    const planAtk = trialPlan(s);
    assert.equal(planAtk?.card, 1);
    assert.ok(planAtk!.path.length > 0);
    const firstStep = planAtk!.path[0];
    assert.notDeepEqual(
      { x: s.player.x + firstStep.dx, y: s.player.y + firstStep.dy },
      { x: ELEMENTAL.x, y: ELEMENTAL.y },
      "Focused atkUp card breaks off from the boss toward an attack shard",
    );

    // Player can later select bossEnemy card (slot 0) to return to attacking the boss
    assert.equal(focusTrialCard(s, 0), true);
    assert.equal(s.bossVariant?.focusedCard, 0);
    assert.equal(trialPlan(s)?.card, 0);
  });

  it("Magic Tower (Variant 1): high HP (~30x), regenerates away from combat, pops coins on hit for mid-run stat upgrades, and has no turn limit", () => {
    const game = new Game(defaults());
    game.newRun({ outside: true, seed: 7777 });
    game.save.upgrades.onTheJob = 1;
    const s = startTrial({ maxHp: 600, attack: 25, defense: 8 }, "manual", [], 7777, 1, "magic-tower");
    game.save.provingGrounds = s;
    const session = new TrialSession(game, s);

    assert.ok(s.bossMaxHp >= 25 * 30, "Magic Tower has ~30x player ATK HP");
    assert.equal(s.bossVariant?.turnLimit, 0, "Magic Tower has no turn limit");
    assert.ok((s.bossVariant?.bossRegen ?? 0) > 0, "Magic Tower has positive Regen");

    enterArena(s);
    walkToBossAdjacent(s);

    const silverBefore = s.purchases?.silver ?? 0;
    const goldBefore = s.bossVariant!.goldEarned;
    trialStep(s, 0, 1);
    const hpAfterHit = s.bossHp;
    assert.ok((s.purchases?.silver ?? 0) > silverBefore, "Silver coins pop out on hit for in-run stat training");
    assert.equal(s.bossVariant!.goldEarned, goldBefore, "Gold is credited only when collected");
    assert.ok(s.bossVariant!.lastRound?.coins.some(c=>c.kind==="gold"));
    assert.ok((s.bossVariant?.lastRound?.coins.length ?? 0) >= 2, "Coin pop-out animation entries are recorded");

    // Taking a turn away from combat lets the boss regenerate HP
    trialStep(s, 0, 0);
    assert.ok(s.bossHp > hpAfterHit, "Boss regenerates HP on turns the player does not hit it");

    // Player can spend popped Silver coins on mid-run stat upgrades via TrialSession
    for (let i = 0; i < 6; i++) trialStep(s, 0, 1);
    session.sync();
    const atkBefore = s.player.attack;
    assert.equal(session.game.trainInRun("attack"), true, "Popped coins fund mid-run stat upgrades");
    assert.ok(s.player.attack > atkBefore);
  });

  it("Obelisk (Variant 2): very high HP, turn limit (increased by trialTurns research), periodic shots & pulses, and saves damage across runs", () => {
    const archives = defaultArchives();
    assert.equal(researched(archives, "trialTurns"), OBELISK_DEFAULT_TURNS);
    archives.levels.trialTurns = 3;
    const turnLimit = researched(archives, "trialTurns");
    assert.equal(turnLimit, 130, "trialTurns Archives research increases turn limit by +10 per level");

    const s = startTrial({ maxHp: 2000, attack: 30, defense: 10 }, "manual", [], 8888, 1, "obelisk", { turnLimit: 18 });
    assert.ok(s.bossMaxHp >= 30 * 150, "Obelisk has very high HP (~150x player ATK)");
    assert.equal(s.bossVariant?.turnLimit, 18);

    enterArena(s);
    walkToBossAdjacent(s);

    // Hit the Obelisk and observe periodic shots (every 3 turns) and special pulse (every 8 turns)
    let sawShot = false;
    let sawSpecial = false;
    while (s.status === "active") {
      const res = trialStep(s, 0, 1);
      if (s.steps % OBELISK_SHOT_INTERVAL === 0 || s.steps % OBELISK_SPECIAL_INTERVAL === 0) {
        assert.equal(res.fired, true);
      }
      if (s.bossVariant?.lastRound?.shots.some((sh) => !sh.special)) sawShot = true;
      if (s.bossVariant?.lastRound?.shots.some((sh) => sh.special)) sawSpecial = true;
    }
    assert.equal(sawShot, true, "Obelisk fires periodic shots");
    assert.equal(sawSpecial, true, "Obelisk fires periodic special attacks");
    assert.equal(s.status, "lost");
    assert.equal(s.bossVariant?.outOfTurns, true, "Encounter ends when turns run out");
    assert.equal(s.steps, 18);

    const damageRun1 = trialDamageThisRun(s);
    assert.ok(damageRun1 > 0);
    assert.ok(trialDpt(s) > 0);

    // Save damage inflicted and start the next trial run
    const save = { trialAccess: defaultTrialAccess() };
    assert.equal(saveTrialDamage(save, s), true);
    assert.equal(save.trialAccess.progress.obelisk?.savedBoss?.damage, Math.round(s.bossMaxHp - s.bossHp));

    // Round-trip trialAccess decoding preserves savedBoss
    const decodedAccess = decodeTrialAccess(JSON.parse(JSON.stringify(save.trialAccess)));
    assert.deepEqual(decodedAccess.progress.obelisk?.savedBoss, save.trialAccess.progress.obelisk?.savedBoss);

    // Next trial run resumes from the saved damage while tracking this run's own damage & DPT from 0
    const s2 = startTrial(
      { maxHp: 2000, attack: 30, defense: 10 },
      "manual",
      [],
      9999,
      1,
      "obelisk",
      { turnLimit: 20, savedBoss: decodedAccess.progress.obelisk?.savedBoss },
    );
    assert.equal(s2.bossHp, s2.bossMaxHp - save.trialAccess.progress.obelisk!.savedBoss!.damage);
    assert.equal(trialDamageThisRun(s2), 0, "Damage this run starts at 0 on the new run");
    enterArena(s2);
    walkToBossAdjacent(s2);
    trialStep(s2, 0, 1);
    assert.ok(trialDamageThisRun(s2) > 0);
    assert.equal(trialDpt(s2), Math.round((trialDamageThisRun(s2) / s2.steps) * 10) / 10);
  });

  it("Multi-part bosses (1b / 2b): parts have distinct effects, perform single-round combat, and stop activity & cannot regenerate once knocked out", () => {
    const s = startTrial({ maxHp: 2000, attack: 40, defense: 10 }, "manual", ["eliteEnemy", "bossEnemy"], 5555, 1, "magic-tower", { multiPart: true });
    enterArena(s);
    const bv = s.bossVariant!;
    assert.equal(bv.multiPart, true);
    assert.equal(bv.parts.length, 3);
    assert.equal(activeBossParts(bv).length, 3);

    const baseDefWithWard = effectiveBossDef(s);
    const baseRegenWithConduit = effectiveBossRegen(s);
    assert.ok(baseDefWithWard > bv.bossDef, "Ward Crystal increases effective boss DEF while active");
    assert.ok(baseRegenWithConduit > bv.bossRegen, "Regen Conduit increases effective boss Regen while active");

    // Walk adjacent to the Ward Crystal at (12, 15) and attack it one round per turn until knocked out
    const ward = bv.parts.find((p) => p.id === "ward")!;
    s.player.x = ward.x;
    s.player.y = ward.y - 1;
    const wardHpBefore = ward.hp;
    trialStep(s, 0, 1);
    assert.ok(ward.hp < wardHpBefore && ward.hp > 0, "Attacking a boss part performs single-round combat per turn");

    while (ward.hp > 0) {
      trialStep(s, 0, 1);
    }
    assert.equal(ward.hp, 0);
    assert.equal(bossPartAt(bv, ward.x, ward.y), undefined, "Knocked-out part disappears from the floor");
    assert.equal(effectiveBossDef(s), bv.bossDef, "Knocked-out Ward Crystal stops shielding boss DEF");

    // Knock out the Regen Conduit at (15, 12)
    const regenPart = bv.parts.find((p) => p.id === "regen")!;
    s.player.x = regenPart.x;
    s.player.y = regenPart.y - 1;
    while (regenPart.hp > 0) {
      trialStep(s, 0, 1);
    }
    assert.equal(regenPart.hp, 0);
    assert.equal(effectiveBossRegen(s), bv.bossRegen, "Knocked-out Regen Conduit stops boosting boss Regen");

    // Wait several turns: knocked-out parts cannot regenerate HP
    for (let i = 0; i < 5; i++) trialStep(s, 0, 0);
    assert.equal(ward.hp, 0, "Knocked-out part HP cannot regenerate");
    assert.equal(regenPart.hp, 0, "Knocked-out part HP cannot regenerate");
    assert.equal(activeBossParts(bv).length, 1);

    // Board representation only includes the remaining active part
    bv.minions = [];
    const board = trialBoard(s);
    assert.equal(board.tile(ward.x, ward.y).enemy, undefined);
    assert.equal(board.tile(regenPart.x, regenPart.y).enemy, undefined);
    const turret = bv.parts.find((p) => p.id === "turret")!;
    assert.equal(board.tile(turret.x, turret.y).enemy?.strength, "elite");
  });

  it("resolves single-round combat against boss minions and round-trips state through decodeTrial", () => {
    const s = startTrial({ maxHp: 800, attack: 15, defense: 8 }, "hybrid", ["weakEnemy", "bossEnemy"], 31415, 2, "magic-tower", { multiPart: true });
    enterArena(s);
    // Entering arena spawns 2 initial minions
    assert.ok(s.bossVariant!.minions.length >= 2);
    const minion = s.bossVariant!.minions[0];
    assert.ok(bossMinionAt(s.bossVariant!, minion.x, minion.y));

    // Place hero adjacent to minion and strike it for 1 round
    s.player.x = minion.x;
    s.player.y = minion.y - 1;
    const minionHpBefore = minion.hp;
    trialStep(s, 0, 1);
    assert.ok(minion.hp < minionHpBefore && minion.hp > 0, "Minion combat resolves one round per turn");

    // Verify decodeTrial preserves the entire TrialState
    const raw = JSON.parse(JSON.stringify(s));
    const decoded = decodeTrial(raw);
    assert.deepEqual(decoded, s);
  });

  it("clears saved Obelisk damage upon victory", () => {
    const s = startTrial({ maxHp: 1000, attack: 500, defense: 20 }, "manual", [], 1111, 1, "obelisk");
    enterArena(s);
    walkToBossAdjacent(s);
    trialStep(s, 0, 1);

    const game = new Game(defaults());
    assert.equal(saveTrialDamage(game.save, s), true);
    assert.ok(game.save.trialAccess.progress.obelisk?.savedBoss);

    // Finish off the Obelisk
    s.bossHp = 10;
    trialStep(s, 0, 1);
    assert.equal(s.status, "won");
    settleTrialVictory(game.save, s);
    assert.equal(game.save.trialAccess.progress.obelisk?.savedBoss, undefined, "Saved damage is cleared when difficulty is won");
  });
});


it("a minion struck by the hero cannot engage a second time that turn", () => {
  const s=startTrial({maxHp:800,attack:15,defense:8},"hybrid",["weakEnemy"],31415,2,"magic-tower");
  enterArena(s);
  const v=s.bossVariant!,m=v.minions[0];v.minions=[m];
  s.player.x=m.x;s.player.y=m.y-1;
  const hp=m.hp,heroHp=s.player.hp;
  const strike=Math.max(1,Math.round(s.player.attack-m.defense));
  trialStep(s,0,1);
  assert.equal(hp-m.hp,strike);
  assert.equal(heroHp-s.player.hp,v.lastRound!.enemyDamage);
  assert.equal(v.lastRound!.heroDamage,strike);
});

it("collecting Gold funds training once and survives a save round trip", () => {
  const s=startTrial({maxHp:800,attack:15,defense:8},"manual",[],31415,1,"magic-tower");
  enterArena(s); const v=s.bossVariant!;v.minions=[];
  v.pickups=[{id:++v.spawned,x:s.player.x,y:s.player.y,kind:"gold",amount:40}];
  const before=s.purchases?.silver??0;
  trialStep(s,0,0);
  assert.equal(s.purchases!.silver,before+40);assert.equal(v.goldEarned,40);
  const decoded=decodeTrial(JSON.parse(JSON.stringify(s)))!;
  trialStep(decoded,0,0);
  assert.equal(decoded.purchases!.silver,before+40);
  assert.equal(decoded.bossVariant!.goldEarned,40);
});

it("Obelisk HP and knocked-out parts remain fixed after the character improves", () => {
  const s=startTrial({maxHp:800,attack:15,defense:8},"manual",[],31415,1,"obelisk",{multiPart:true});
  const v=s.bossVariant!;s.bossHp-=100;v.parts[0].hp=0;
  const save=defaults();saveTrialDamage(save,s);
  const access=decodeTrialAccess(JSON.parse(JSON.stringify(save.trialAccess)));
  const next=startTrial({maxHp:1600,attack:150,defense:80},"manual",[],31415,1,"obelisk",{multiPart:true,savedBoss:access.progress.obelisk!.savedBoss});
  assert.equal(next.bossMaxHp,s.bossMaxHp);assert.equal(next.bossHp,s.bossHp);
  assert.equal(next.bossVariant!.parts[0].hp,0);
  const standard=startTrial({maxHp:1600,attack:150,defense:80},"manual",[],31415,1,"obelisk",{savedBoss:access.progress.obelisk!.savedBoss});
  saveTrialDamage(save,standard);
  assert.equal(save.trialAccess.progress.obelisk!.savedBoss!.partDamage![v.parts[0].id],v.parts[0].maxHp);
});
