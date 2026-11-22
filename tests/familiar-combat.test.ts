// Familiars in combat (docs/agents/familiars.md): the Dragon's strike, burn and
// Damage Reduction, the Slime's stun and linger, the Wolf's tag and the
// Falcon's Gold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bout, heroHit, heroHpAfter, predict, replies, thornDamage } from "../src/combat.ts";
import { arrowDamage, foeOn } from "../src/enemies/ranged.ts";
import { getTowerGateEnemy } from "../src/enemies/scaling.ts";
import type { Enemy, Mode, Player, Tile } from "../src/entities.ts";
import type { FamiliarId, FamiliarLevels } from "../src/familiars/catalog.ts";
import { familiarTile, lingerMark, lingerWorn } from "../src/familiars/marks.ts";
import { foesIn } from "../src/familiars/strikes.ts";
import { arcanumBoost } from "../src/arcana/arcana.ts";
import { random } from "../src/random.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { startTrial } from "../src/proving-grounds/trial.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { arcaneStrike, ghostRush, lifespringContact, necroDecay, voidwellDamage, volleyTurn, type Shot, type VolleyKill } from "../src/volley.ts";

const BASE = getTowerGateEnemy(0, "normal", "balanced");
const foe = (over: Partial<Enemy> = {}): Enemy => ({ ...BASE, hp: 100_000, attack: 100, defense: 0, ...over });

/** A run holding `ids`, its floor's own enemies taken off and the hero strong enough to stand. */
function game(ids: Partial<Record<FamiliarId, FamiliarLevels>>, { mode = "tower" as Mode, tier = 1 } = {}) {
  const save = defaults();
  for (const [id, levels] of Object.entries(ids)) save.familiars[id as FamiliarId] = { levels: [...levels!] as FamiliarLevels };
  const g = new Game(save, random(21));
  if (mode === "delve") g.switchMode("delve");
  g.save[mode].tier = tier;
  g.newRun({ seed: 21 });
  const p = g.run.player;
  Object.assign(p, { attack: 100, defense: 1e6, hp: 1e6, maxHp: 1e6 });
  for (const { x, y } of g.world.floorEnemies?.(p.x, p.y) ?? []) g.run.changes[`${x},${y}`] = { kind: "floor" };
  g.run.familiars = {};
  return g;
}
const NONE: FamiliarLevels = [0, 0, 0, 0];
const place = (g: Game, x: number, y: number, over: Partial<Enemy> = {}) => void (g.run.changes[`${x},${y}`] = { kind: "enemy", enemy: foe(over) });
const at = (g: Game, x: number, y: number) => foeOn(g.world.tile(x, y));
const raw = (g: Game, x: number, y: number) => g.run.changes[`${x},${y}`]!;
const hold = (g: Game, turns = 1) => {
  for (let i = 0; i < turns; i++) (g as any).holdTurn();
};
/** Sets `id` to act this turn from the start of its path. */
const due = (g: Game, id: FamiliarId) => void (g.run.familiars![id] = { turns: 0, timer: 1 });
// At the start of its path the Dragon is at (12.5, 8), the Slime at (8, 13.5),
// the Falcon at (8, 12.5) and the Wisp at (8, 8).

// --- The Fire Dragon ---

test("the Dragon strikes everything in its radius at once, and nothing past it", () => {
  const g = game({ dragon: NONE });
  for (const x of [12, 10, 9]) place(g, x, 8);
  due(g, "dragon");
  hold(g);
  assert.equal(at(g, 12, 8)!.hp, 99_500, "×5 the hero's 100 ATK");
  assert.equal(at(g, 10, 8)!.hp, 99_500, "2.5 tiles out");
  assert.equal(at(g, 9, 8)!.hp, 100_000, "3.5 tiles out");
  assert.ok(raw(g, 12, 8).burn && !raw(g, 9, 8).burn);
});

test("its radius is Range alone: Attack Range doesn't widen it", () => {
  const g = game({ dragon: NONE });
  g.save.training.attackRange = 80;
  assert.ok(g.lifespringReach > 300);
  place(g, 9, 8);
  due(g, "dragon");
  hold(g);
  assert.equal(raw(g, 9, 8).burn, undefined);
  g.save.familiars.dragon!.levels[1] = 2;
  due(g, "dragon");
  hold(g);
  assert.ok(raw(g, 9, 8).burn, "3.8 tiles at level 2");
});

test("its damage is Arcanum Damage's: crits averaged, through DEF", () => {
  const g = game({ dragon: [2, 0, 0, 0] });
  g.save.upgrades.critical = 1;
  Object.assign(g.save.training, { critChance: 40, critFactor: 30 });
  place(g, 12, 8, { defense: 70 });
  due(g, "dragon");
  hold(g);
  const expected = 100 * arcanumBoost(24, g.crit) - 70;
  assert.ok(Math.abs(100_000 - at(g, 12, 8)!.hp - expected) < 1e-3, `${100_000 - at(g, 12, 8)!.hp} against ${expected}`);
});

test("a burn ticks once a turn from the turn after, while the enemy survives", () => {
  for (const tier of [1, 3]) {
    const g = game({ dragon: NONE }, { tier });
    place(g, 12, 8, { hp: 2400 });
    due(g, "dragon");
    hold(g);
    assert.equal(at(g, 12, 8)!.hp, 1900, `tier ${tier}: the strike alone`);
    hold(g);
    assert.equal(at(g, 12, 8)!.hp, 1400, `tier ${tier}`);
    hold(g, 2);
    assert.equal(at(g, 12, 8)!.hp, 400, `tier ${tier}`);
    const before = g.run.kills;
    hold(g);
    assert.equal(at(g, 12, 8), undefined, `tier ${tier}`);
    assert.equal(g.run.kills, before + 1, "paid once");
    hold(g);
    assert.equal(g.run.kills, before + 1);
  }
});

test("an enemy the strike fells is paid and doesn't burn", () => {
  const g = game({ dragon: NONE });
  place(g, 12, 8, { hp: 500 });
  due(g, "dragon");
  hold(g);
  assert.equal(g.run.kills, 1);
  assert.equal(raw(g, 12, 8).burn, undefined);
});

test("hero ATK and the Dragon's level are read as each tick lands", () => {
  const g = game({ dragon: NONE });
  place(g, 12, 8);
  due(g, "dragon");
  hold(g);
  g.run.player.attack = 200;
  g.save.familiars.dragon!.levels[0] = 1;
  hold(g);
  assert.equal(at(g, 12, 8)!.hp, 99_500 - 2900);
});

test("a tick that can't get past DEF takes nothing and raises no number", () => {
  const g = game({ dragon: NONE });
  place(g, 12, 8, { defense: 600 });
  due(g, "dragon");
  hold(g);
  g.volley = null;
  hold(g);
  assert.equal(at(g, 12, 8)!.hp, 100_000);
  assert.equal(g.volley, null);
});

test("Damage Reduction cuts a burned enemy's ATK everywhere it is read, and the save keeps it raw", () => {
  const g = game({ dragon: [0, 0, 0, 10] });
  place(g, 12, 8);
  due(g, "dragon");
  hold(g);
  assert.equal(at(g, 12, 8)!.attack, 50);
  assert.equal(at(g, 12, 8)!.burned, true);
  assert.equal(raw(g, 12, 8).enemy!.attack, 100);
  g.save.familiars.dragon!.levels[3] = 25;
  assert.equal(at(g, 12, 8)!.attack, 5, "95% at most");
  const back = new Game(decode(JSON.stringify(g.save)), random(21));
  assert.equal(raw(back, 12, 8).burn, 100);
  assert.equal(raw(back, 12, 8).enemy!.attack, 100);
  assert.equal(at(back, 12, 8)!.attack, 5);
});

test("a Dragon switched off burns, cuts and marks nothing, and its burns come back as they were", () => {
  const g = game({ dragon: NONE });
  place(g, 12, 8);
  due(g, "dragon");
  hold(g);
  g.familiars.toggle("dragon");
  assert.deepEqual([at(g, 12, 8)!.burned, at(g, 12, 8)!.attack], [undefined, 100]);
  hold(g, 3);
  assert.equal(at(g, 12, 8)!.hp, 99_500);
  g.familiars.toggle("dragon");
  assert.deepEqual([at(g, 12, 8)!.burned, at(g, 12, 8)!.attack], [true, 80]);
  hold(g);
  assert.equal(at(g, 12, 8)!.hp, 99_000);
});

test("the Wisp's boost on the Dragon goes on through its burn", () => {
  const g = game({ dragon: NONE, wisp: [0, 0, 0, 18] });
  place(g, 12, 8);
  due(g, "dragon");
  g.run.familiars!.wisp = { turns: 0, left: 1 };
  hold(g);
  assert.equal(raw(g, 12, 8).burn, 105);
  assert.equal(at(g, 12, 8)!.hp, 100_000 - 525);
  hold(g);
  assert.equal(at(g, 12, 8)!.hp, 100_000 - 1050, "the Wisp's effect over, the burn's boost stays");
});

test("a Flying enemy burns too, and is woken", () => {
  const g = game({ dragon: NONE }, { tier: 5 });
  g.run.changes["12,8"] = { kind: "floor", flyer: foe({ flying: true }) };
  due(g, "dragon");
  hold(g);
  const moved = Object.values(g.run.changes).find((t) => t.flyer?.aggro);
  assert.ok(moved, "Aggroed");
  assert.equal(moved!.burn, 100, "its burn goes with it");
  assert.equal(moved!.wound, 500, "lit this turn, so it ticks from the next, wherever it stepped");
});

test("a climb leaves the burns with the floor", () => {
  const g = game({ dragon: NONE });
  place(g, 12, 8);
  due(g, "dragon");
  hold(g);
  assert.ok(raw(g, 12, 8).burn);
  (g as any).advanceTowerRoom();
  assert.ok(Object.values(g.run.changes).every((t) => !t.burn));
});

test("in the Delve the Dragon flies round the hero and reaches across the wrap", () => {
  const g = game({ dragon: NONE }, { mode: "delve" }), p = g.run.player;
  p.x = 27;
  const x = (p.x + 5) % 30;
  place(g, x, p.y);
  due(g, "dragon");
  hold(g);
  assert.equal(raw(g, x, p.y).burn, 100);
});

test("only the area's own tiles are read", () => {
  const read: string[] = [];
  foesIn({ tile: (x, y) => (read.push(`${x},${y}`), { kind: "floor" }) }, { x: 8.5, y: 400, reach: 900, wrap: 30 });
  assert.equal(new Set(read).size, read.length, "each once");
  for (const key of read) {
    const y = Number(key.split(",")[1]);
    assert.ok(y >= 391 && y <= 409, key);
  }
});

// --- The Lightning Slime ---

test("the Slime stuns in its radius, half as long on a boss and a Greater Boss", () => {
  const g = game({ slime: [1, 0, 3, 0] });
  place(g, 8, 13);
  place(g, 7, 13, { strength: "boss" });
  place(g, 9, 13, { strength: "greaterBoss" });
  place(g, 8, 11);
  due(g, "slime");
  hold(g);
  // 6 turns and 3, the turn it struck worn off.
  assert.deepEqual([raw(g, 8, 13).stun, raw(g, 7, 13).stun, raw(g, 9, 13).stun], [5, 2, 2]);
  assert.deepEqual([raw(g, 8, 13).linger?.slow, raw(g, 7, 13).linger?.slow, raw(g, 9, 13).linger?.slow], [29, 14, 14]);
  assert.deepEqual([raw(g, 8, 11).stun, raw(g, 8, 11).linger], [undefined, undefined]);
});

test("a longer stun already on an enemy stays", () => {
  const g = game({ slime: NONE });
  place(g, 8, 13);
  raw(g, 8, 13).stun = 20;
  due(g, "slime");
  hold(g);
  assert.equal(raw(g, 8, 13).stun, 19);
});

test("Linger waits out the stun, then lasts exactly 3 turns, on a boss too", () => {
  for (const tier of [1, 3])
    for (const duration of [0, 10])
      for (const strength of ["normal", "boss"] as const) {
        const g = game({ slime: [duration, 0, 0, 0] }, { tier }), what = `tier ${tier}, level ${duration}, ${strength}`;
        place(g, 8, 13, { strength });
        due(g, "slime");
        let stunned = 0, slowed = 0;
        for (let turn = 0; turn < 24; turn++) {
          hold(g);
          const tile = raw(g, 8, 13);
          if (tile.stun) assert.equal(tile.linger!.turns, 3, what);
          if (tile.stun) stunned++;
          else if (tile.linger) slowed++;
        }
        const stun = Math.floor((5 + duration) / (strength === "boss" ? 2 : 1));
        assert.equal(stunned, stun - 1, what);
        // The turn its stun ends, and two more with a turn left: three whole turns' slow.
        assert.equal(slowed, 3, what);
        assert.equal(raw(g, 8, 13).linger, undefined, what);
      }
});

test("a linger keeps the stronger slow and wears a turn at a time", () => {
  const tile: Tile = { kind: "enemy", enemy: foe() }, marked = lingerMark(lingerMark(tile, 3, 40), 3, 25);
  assert.deepEqual(marked.linger, { turns: 3, slow: 40 });
  assert.deepEqual(lingerWorn(marked).linger, { turns: 2, slow: 40 });
  assert.equal(lingerWorn(lingerMark(tile, 1, 20)).linger, undefined);
});

test("the Wisp raises Linger, never past the Slowdown cap", () => {
  const g = game({ slime: [0, 0, 20, 0], wisp: [0, 0, 30, 18] });
  place(g, 8, 13);
  due(g, "slime");
  g.run.familiars!.wisp = { turns: 0, left: 5 };
  hold(g);
  assert.equal(raw(g, 8, 13).linger!.slow, 90);
});

test("a fight against a lingering enemy is slowed, and only the fight taken, not previews", () => {
  const g = game({ slime: NONE });
  place(g, 8, 8);
  raw(g, 8, 8).linger = { turns: 2, slow: 35 };
  assert.equal(g.fighterAt({ x: 8, y: 8 }).slowdown, 35);
  assert.equal(g.run.player.slowdown, undefined);
  g.familiars.toggle("slime");
  assert.equal(g.fighterAt({ x: 8, y: 8 }).slowdown, undefined);
});

test("a fight already begun keeps the familiars it began with", () => {
  const g = game({ slime: NONE, wolf: NONE });
  place(g, 8, 8);
  raw(g, 8, 8).linger = { turns: 2, slow: 35 };
  g.run.familiars!.wolf = { turns: 0, left: 5, at: { x: 8, y: 8 } };
  const begun = at(g, 8, 8)!;
  g.familiars.toggle("slime");
  g.familiars.toggle("wolf");
  const fighter = g.fighterAt({ x: 8, y: 8 }, begun);
  assert.equal(fighter.slowdown, 35);
  assert.equal(heroHit(fighter, begun), 350);
});

test("a lingering shooter's cooldown runs slower", () => {
  const charge = (linger?: number) => {
    const enemy = foe({ ranged: true, ...(linger ? { linger } : {}) });
    const out = volleyTurn({
      board: { tile: (x, y) => (x === 8 && y === 8 ? { kind: "enemy", enemy } : { kind: "floor" }), clear: () => {}, wound: () => {} },
      wrap: 0, floorOf: () => 1, hero: { x: 0, y: 0, attack: 1, defense: 0, hp: 100, maxHp: 100 } as Player, seed: 1,
      volleys: { turn: 1, foes: { "8,8": 1000 } }, archer: false, ranks: defaults(),
    });
    return out.volleys.foes!["8,8"]! - 1000;
  };
  assert.equal(charge(80) / charge(), 0.2);
});

test("predict agrees with bout through burn, stun, linger, the tag, Fast, Parry, thorns and Lifesteal", () => {
  const hero = { x: 0, y: 0, attack: 120, defense: 20, hp: 1e6, maxHp: 1e6 } as Player;
  const overs: Partial<Player>[] = [{}, { parry: 30 }, { thorns: 3 }, { lifesteal: 10 }, { shroud: 200 }, { parry: 20, thorns: 2, lifesteal: 5 }];
  for (const burn of [false, true])
    for (const stun of [0, 1, 4, 15])
      for (const slow of [0, 20, 50, 90])
        for (const fast of [false, true])
          for (const tagged of [0, 3.5])
            for (const over of overs) {
              const tile: Tile = { kind: "enemy", enemy: foe({ hp: 4000, attack: 300, ...(fast ? { fast: true } : {}), ...(stun ? { stun } : {}) }), ...(burn ? { burn: 100 } : {}) };
              const area = tagged ? { tag: { x: 0, y: 0, reach: 100, wrap: 0, factor: tagged } } : {};
              const enemy = familiarTile(tile, 0, 0, () => ({ cut: 44, ...area })).enemy!;
              const player = { ...hero, ...over, tags: true as const, ...(slow ? { slowdown: slow } : {}) };
              const r = predict(player, enemy), fight = bout(player, enemy), what = JSON.stringify({ burn, stun, slow, fast, tagged, over });
              assert.equal(enemy.attack, burn ? 168 : 300, what);
              assert.equal(fight.strikes.filter((s) => s.by === "enemy").length, replies(r), what);
              if (r.hpAfter !== undefined) assert.equal(heroHpAfter(fight, player.hp), r.hpAfter, what);
              else assert.ok(Math.abs(heroHpAfter(fight, player.hp) - (player.hp - r.damage)) < 1e-3, what);
            }
});

// --- The Hunting Wolf ---

/** A one-tile board holding a tagged enemy. */
function one(over: Partial<Enemy> = {}) {
  let enemy: Enemy | undefined = foe(over);
  return {
    tile: (x: number, y: number): Tile => (enemy && x === 1 && y === 0 ? { kind: "enemy", enemy } : { kind: "floor" }),
    clear: () => void (enemy = undefined),
    wound: (_x: number, _y: number, damage: number) => void (enemy = { ...enemy!, hp: enemy!.hp - damage }),
    floorEnemies: () => (enemy ? [{ x: 1, y: 0 }] : []),
    markNecro: () => {}, markSpring: () => {},
  };
}
const striker = { x: 0, y: 0, attack: 100, defense: 0, hp: 100, maxHp: 100, tags: true } as Player;
/** What each way of striking with ATK does to an enemy, by name. */
const SOURCES: Record<string, (board: ReturnType<typeof one>) => number> = {
  fight: (b) => heroHit(striker, b.tile(1, 0).enemy!),
  arrow: (b) => arrowDamage(striker, b.tile(1, 0).enemy!),
  arcanum: (b) => {
    const shots: Shot[] = [], kills: VolleyKill[] = [];
    arcaneStrike(b, striker, { x: 1, y: 0 }, 1, { from: { x: 1, y: 0 }, tick: 1 }, shots, kills);
    return shots[0]!.damage;
  },
  ghostRush: (b) => ghostRush({ board: b, wrap: 0, hero: striker }, { x: 1, y: 0 }, 1, 1).shots[0]!.damage,
  necroticFrost: (b) => necroDecay({ board: b, wrap: 0, hero: striker, changes: {} }, 1, { radius: 300, offset: 0, slow: 25, overlap: 50, fields: [{ id: 1, x: 0, y: 0 }] }).shots[0]!.damage,
  lifespring: (b) => lifespringContact({ board: b, wrap: 0, hero: striker }, 100, 300, () => 1).shots[0]!.damage,
};

test("the tag multiplies everything struck with ATK, and Lifespring's field", () => {
  for (const [name, strike] of Object.entries(SOURCES)) assert.equal(strike(one({ tagged: 3.5 })), strike(one()) * 3.5, name);
});

test("the tag leaves what takes a share of the enemy's HP alone", () => {
  const plain = foe(), tagged = foe({ tagged: 3.5 });
  assert.equal(thornDamage({ ...striker, thorns: 5 }, tagged), thornDamage({ ...striker, thorns: 5 }, plain));
  const zone = { x: 1, y: 0, radius: 2, wrap: 0 };
  assert.equal(voidwellDamage({ board: one({ tagged: 3.5 }), wrap: 0 }, zone, 200).shots[0]!.damage, voidwellDamage({ board: one(), wrap: 0 }, zone, 200).shots[0]!.damage);
});

test("a planted Wolf tags what stands in its range, for the hero that strikes and no preview", () => {
  const g = game({ wolf: NONE });
  place(g, 8, 8);
  place(g, 8, 11);
  g.run.familiars!.wolf = { turns: 0, left: 5, at: { x: 8, y: 8 } };
  assert.equal(at(g, 8, 8)!.tagged, 3.5);
  assert.equal(at(g, 8, 11)!.tagged, undefined, "3 tiles out");
  assert.equal(heroHit(g.fighterAt({ x: 8, y: 8 }), at(g, 8, 8)!), 350);
  assert.equal(heroHit(g.fighterAt({ x: 8, y: 11 }), at(g, 8, 11)!), 100);
  assert.equal(heroHit(g.run.player, at(g, 8, 8)!), 100, "previews count the plain hero");
  assert.equal((g as any).bombStrike(8, 8, at(g, 8, 8)).damage, 350, "a Bomb");
  assert.equal(heroHit(g.striker, at(g, 8, 8)!), 350);
  assert.equal(raw(g, 8, 8).enemy!.tagged, undefined, "never saved");
});

test("the tag multiplies the Dragon and its burn", () => {
  const g = game({ dragon: NONE, wolf: NONE });
  place(g, 12, 8);
  g.run.familiars!.wolf = { turns: 0, left: 9, at: { x: 12, y: 8 } };
  due(g, "dragon");
  hold(g);
  assert.equal(at(g, 12, 8)!.hp, 100_000 - 1750);
  hold(g);
  assert.equal(at(g, 12, 8)!.hp, 100_000 - 3500);
});

test("the Wisp raises the Wolf's Bonus while the planted Wolf is in its range", () => {
  const g = game({ wolf: NONE, wisp: NONE });
  place(g, 8, 8);
  g.run.familiars = { wolf: { turns: 0, left: 5, at: { x: 8, y: 8 } }, wisp: { turns: 0, left: 5 } };
  assert.equal(at(g, 8, 8)!.tagged, 3.675);
  g.familiars.toggle("wisp");
  assert.equal(at(g, 8, 8)!.tagged, 3.5);
});

// --- The Golden Falcon ---

test("the Falcon multiplies a kill's Gold in its range, as the preview says, and nothing else", () => {
  const killed = (active: boolean, where: [number, number], wisp = false) => {
    const g = game({ falcon: [0, 0, 5, 20], ...(wisp ? { wisp: [0, 0, 0, 18] as FamiliarLevels } : {}) }), [x, y] = where;
    place(g, x, y, { hp: 1 });
    if (active) g.run.familiars!.falcon = { turns: 0, left: 5 };
    if (wisp) g.run.familiars!.wisp = { turns: 0, left: 5 };
    const factor = g.falconGold({ x, y }), shown = g.enemyGold(x, y), before = g.save.gold;
    g.finds.kill(at(g, x, y)!, { x, y }, 1, false);
    return { factor, shown, paid: g.save.gold - before, silver: g.run.silver };
  };
  const plain = killed(false, [8, 12]), boosted = killed(true, [8, 12]), far = killed(true, [8, 4]), both = killed(true, [8, 12], true);
  assert.equal(boosted.factor, 3);
  assert.ok(plain.paid > 0);
  assert.ok(Math.abs(boosted.paid - plain.paid * 3) < 1e-3);
  assert.ok(Math.abs(boosted.shown - boosted.paid) < 1e-3, "the preview is what is paid");
  assert.equal(boosted.silver, plain.silver);
  assert.equal(far.factor, 1, "out of range");
  assert.equal(both.factor, 3.15);
});

test("a burn's kill in the Falcon's range pays its Gold", () => {
  const gold = (falcon: boolean) => {
    const g = game({ dragon: NONE, falcon: [0, 0, 0, 20] });
    place(g, 12, 8, { hp: 900 });
    if (falcon) g.run.familiars!.falcon = { turns: 0, left: 9 };
    due(g, "dragon");
    hold(g);
    const before = g.save.gold;
    hold(g);
    return g.save.gold - before;
  };
  assert.ok(Math.abs(gold(true) - gold(false) * 2) < 1e-3);
});

// --- Where they don't work ---

test("a trial holds no familiar", () => {
  const base = game({ dragon: NONE, wolf: NONE });
  base.newRun({ outside: true, seed: 12 });
  const state = startTrial(base.run.player, "manual", [], 12, 1, "light-elemental", {});
  base.save.provingGrounds = state;
  assert.deepEqual(new TrialSession(base, state).game.save.familiars, {});
  assert.deepEqual(Object.keys(base.save.familiars), ["dragon", "wolf"], "the profile keeps them");
});
