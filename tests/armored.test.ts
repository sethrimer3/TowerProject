import { test } from "node:test";
import assert from "node:assert/strict";
import { ARMORED_DEF, defenseAgainst, impervious, predict } from "../src/combat.ts";
import { ARMORED_TIER, armoredCells, armoredShare, mayBeArmored } from "../src/enemies/armored.ts";
import { flyingShare } from "../src/enemies/flying.ts";
import { traitOdds } from "../src/enemies/odds.ts";
import { enemyTitle } from "../src/enemies/scaling.ts";
import { World } from "../src/delve/world.ts";
import { resolveStep } from "../src/step-effects.ts";
import { contentsFrom, type ContentPainters } from "../src/render/boards/themed-board.ts";
import { kitEnemy } from "../src/sprites/kit.ts";
import { tierCells } from "../src/tiers.ts";
import { generateTowerRoom, RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const foe = (over: Partial<Enemy> = {}): Enemy => ({ name: "Golem", hp: 1000, attack: 50, defense: 100, tier: 1, strength: "normal", ...over });
const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 1000, maxHp: 1000, attack: 150, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;

test("Armored enemies come from the sixth tier, at the share Flying has one tier below", () => {
  assert.equal(ARMORED_TIER, 6);
  for (const tier of [1, 2, 3, 4, 5]) assert.deepEqual([1, 500, 9000].map((f) => armoredShare(tier, f)), [0, 0, 0]);
  assert.equal(armoredShare(6, 1), 12_750, "12.75% on Tower VI's floor 1");
  for (const tier of [6, 7, 9]) for (const f of [1, 77, 3000]) assert.equal(armoredShare(tier, f), flyingShare(tier - 1, f));
});

test("Tower VI floors make about 12.75% of their non-boss enemies Armored, each with twice the DEF and every other stat its own, and never a boss", () => {
  let enemies = 0, armored = 0, fast = 0, ranged = 0, flying = 0;
  for (const seed of [3, 41, 977])
    for (let room = 0; room < 60; room++) {
      for (const t of new RoomWorld(seed, room, {}, 0, 5).cells.values()) assert.ok(!(t.enemy ?? t.flyer)?.armored, "none in the fifth tier");
      const plain = tierCells(generateTowerRoom(seed, room, 6), 6);
      for (const [k, t] of new RoomWorld(seed, room, {}, 0, 6).cells) {
        const e = t.enemy ?? t.flyer;
        if (!e) continue;
        const was = plain.get(k)?.enemy;
        if (e.strength !== "boss" && e.strength !== "greaterBoss") enemies++;
        // A Shielded enemy's extras stand on tiles open before the shield.
        if (was) {
          assert.equal(e.defense, e.armored ? was.defense * ARMORED_DEF : was.defense, `${seed}/${room} ${k}`);
          assert.equal(e.hp, was.hp, `${seed}/${room} ${k}: its HP is its own`);
        }
        if (!e.armored) continue;
        armored++;
        assert.ok(mayBeArmored(e), "never a boss or Greater Boss");
        if (e.fast) fast++;
        if (e.ranged) ranged++;
        if (e.flying) flying++;
      }
    }
  const share = armored / enemies;
  assert.ok(share > 0.105 && share < 0.15, `about 12.75% Armored: ${share}`);
  assert.ok(fast && ranged && flying, `alongside the other attributes: ${fast} Fast, ${ranged} Ranged, ${flying} Flying`);
});

test("armoring leaves the board alone below the sixth tier, and is fixed by the seed, floor and tile", () => {
  const cells = new Map<string, Tile>([["1,1", { kind: "enemy", enemy: foe() }]]);
  assert.equal(armoredCells(cells, 5, 7, () => 1), cells);
  assert.deepEqual(new RoomWorld(41, 7, {}, 0, 6).cells, new RoomWorld(41, 7, {}, 0, 6).cells);
});

test("a Shielded enemy may be Armored, and a boss may not", () => {
  const many = (over: Partial<Enemy>) => new Map<string, Tile>(Array.from({ length: 400 }, (_, i) => [`${i},0`, { kind: "enemy", enemy: foe(over) }]));
  const armored = (over: Partial<Enemy>) => [...armoredCells(many(over), 6, 5, () => 1).values()].filter((t) => t.enemy!.armored).length;
  assert.ok(armored({ shielded: true }) > 0);
  assert.equal(armored({ strength: "boss" }), 0);
  assert.equal(armored({ strength: "greaterBoss" }), 0);
});

test("Delve VI has Armored enemies too, Delve V none", () => {
  const scan = (tier: number) => {
    const w = new World({ seed: 23, changes: {}, floor: 0, milestone: 0, tier, percentPotions: 0 } as never);
    let enemies = 0, armored = 0;
    for (let y = 0; y < 400; y++)
      for (let x = 0; x < w.width; x++) {
        const t = w.tile(x, y), e = t.enemy ?? t.flyer;
        if (e && mayBeArmored(e)) (enemies++, e.armored && armored++);
      }
    return { enemies, armored };
  };
  assert.equal(scan(5).armored, 0);
  const { enemies, armored } = scan(6);
  assert.ok(enemies > 50 && armored / enemies > 0.05 && armored / enemies < 0.22, `${armored} of ${enemies}`);
});

test("Armored says so before its strength", () => {
  assert.equal(enemyTitle({ name: "Bat", strength: "strong", armored: true }), "Armored Strong Bat");
  assert.equal(enemyTitle({ name: "Bat", strength: "elite", flying: true, fast: true, armored: true }), "Flying Fast Armored Elite Bat");
});

test("the Iron Knight keeps the art drawn for it", () => {
  assert.equal(kitEnemy("Iron Knight"), "enemy-armored-knight");
});

test("every fight and prediction reads the doubled DEF, and past the hero's ATK it can't be fought", () => {
  const plain = foe(), armored = foe({ armored: true, defense: plain.defense * ARMORED_DEF });
  assert.equal(predict(hero(), plain).hit, 50);
  assert.ok(impervious(hero(), armored));
  assert.equal((resolveStep(hero(), { kind: "enemy", enemy: armored }) as { blocked?: string }).blocked, "impervious");
  assert.equal(predict(hero({ attack: 250 }), armored).hit, 50);
});

test("Piercing's cap cancels Armored exactly", () => {
  const plain = foe(), armored = foe({ armored: true, defense: plain.defense * ARMORED_DEF });
  assert.equal(defenseAgainst(hero({ pierce: 50 }), armored), plain.defense);
});

test("Armor Break takes its share of the DEF before Armored, so a hit never breaks more for it", () => {
  const plain = foe(), armored = foe({ armored: true, defense: plain.defense * ARMORED_DEF });
  for (const broken of [0, 25, 50, 100, 150, 400]) {
    assert.equal(defenseAgainst(hero(), armored, broken), plain.defense * ARMORED_DEF - plain.defense * (broken / 100), `${broken}%`);
    assert.equal(defenseAgainst(hero(), armored, broken) - defenseAgainst(hero(), plain, broken), plain.defense, "always one DEF more");
  }
  for (const armorBreak of [0.5, 5, 25, 50, 150]) {
    const h = hero({ armorBreak, attack: 60 });
    assert.ok(predict(h, armored).turns >= predict(h, plain).turns, `${armorBreak}% a hit: an Armored enemy lasts at least as long`);
  }
  assert.ok(!impervious(hero({ armorBreak: 0.5, attack: 1 }), armored), "any rank can still fight it");
});

test("the enemy stats box lists Armored from the sixth tier", () => {
  assert.equal(traitOdds(5, 0).some((r) => r.trait === "armored"), false);
  assert.deepEqual(traitOdds(6, 0).find((r) => r.trait === "armored"), { trait: "armored", chance: 12.75 });
});

test("every Game theme's board wears the mark, over the enemy's own art", () => {
  const drew: string[] = [];
  const canvas = { fillRect: () => drew.push("mark") } as unknown as CanvasRenderingContext2D;
  const painters = { enemy: () => drew.push("enemy") } as unknown as ContentPainters;
  contentsFrom(painters)(canvas, { kind: "enemy", enemy: foe() }, 0, 0, 0);
  assert.deepEqual(drew, ["enemy"]);
  drew.length = 0;
  contentsFrom(painters)(canvas, { kind: "enemy", enemy: foe({ armored: true }) }, 0, 0, 0);
  assert.equal(drew[0], "enemy");
  assert.ok(drew.length > 2 && drew.slice(1).every((d) => d === "mark"));
});
