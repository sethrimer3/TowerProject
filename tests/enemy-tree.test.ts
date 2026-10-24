import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { MAX_CARD_XP } from "../src/cards/levels.ts";
import { CARD_TREES, type CardTreeLevels } from "../src/cards/trees.ts";
import { bout, heroHpAfter, predict } from "../src/combat.ts";
import { critRule } from "../src/loadout.ts";
import { weakened, NO_FOES } from "../src/shrines.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { BoardPopups } from "../src/board-popups.ts";
import type { Enemy, Player } from "../src/entities.ts";

const hero: Player = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
const foe = (hp: number, attack = 1): Enemy => ({ name: "rat", hp, attack, defense: 0, tier: 0, strength: "normal" });

/** A Tower run on seed 7 whose hand holds ENEMY with `levels` on its tree. */
function enemyRun(levels: Record<string, number>) {
  const s = defaults();
  s.cardXp.monster = MAX_CARD_XP;
  s.cardBuys.opened = { monster: Object.fromEntries(CARD_TREES.monster!.map((n) => [n.id, n.max - n.levels])) };
  s.cardTrees = { monster: levels };
  s.hand = [...s.hand.filter((c) => c !== "monster"), "monster"];
  const g = new Game(s);
  g.newRun({ seed: 7 });
  return g;
}

test("ENEMY's Crit Chance and Crit Factor raise Crit % and Crit x by their percents", () => {
  const s = defaults();
  s.upgrades.critical = 1;
  s.training.critChance = 20;
  s.training.critFactor = 8;
  assert.deepEqual(critRule(s), { chance: 20, factor: 2 });
  assert.deepEqual(critRule(s, { chance: 5, factor: 10 }), { chance: 21, factor: 2.2, cards: { chance: 5, factor: 10 } }, "the card percents ride along, for an enemy card's to add to");
  assert.equal(critRule(defaults(), { chance: 5, factor: 10 }), undefined, "no crits without Crit %");
  const g = enemyRun({ attack: 4, critChance: 5, critFactor: 5 });
  Object.assign(g.save.upgrades, { critical: 1 });
  Object.assign(g.save.training, { critChance: 20, critFactor: 8 });
  assert.deepEqual(g.crit, { chance: 21, factor: 2.2, cards: { chance: 5, factor: 10 } });
  assert.deepEqual(g.crit, critRule({ ...g.save, archives: g.save.archives }, { chance: 5, factor: 10 }));
});

test("ENEMY's Kill XP and Spoils raise every kill's XP and Silver", () => {
  const plain = enemyRun({}), raised = enemyRun({ attack: 4, critChance: 1, critFactor: 1, killXp: 5, gold: 3, silver: 5 });
  const xp = (g: Game) => {
    const before = g.save.xp;
    g.gainXp(foe(10), 20);
    return g.save.xp - before;
  };
  assert.equal(xp(raised), Math.round(xp(plain) * 1.1));
  assert.equal(raised.purse.killSilver(foe(10), 20), Math.round(plain.purse.killSilver(foe(10), 20) * 1.05 * 1e6) / 1e6);
});

test("ENEMY's Weaken cuts every enemy's ATK on the board, in the Tower and the Delve, beside the boons", () => {
  const cut = weakened(undefined, 5)!;
  assert.equal(cut.attack, 0.95);
  assert.equal(weakened(undefined, 0), undefined);
  assert.equal(weakened({ ...NO_FOES, attack: 0.5 }, 10)!.attack, 0.45, "its own factor on the boons'");
  const plain = enemyRun({}), weak = enemyRun({ defense: 3, shroud: 1, weaken: 5 });
  const w = plain.world as RoomWorld, enemies = [...w.cells].filter(([, t]) => t.kind === "enemy").map(([k]) => k.split(",").map(Number) as [number, number]);
  assert.ok(enemies.length > 0);
  for (const [x, y] of enemies) assert.equal(weak.world.tile(x, y).enemy!.attack, Math.round(plain.world.tile(x, y).enemy!.attack * 0.95 * 1e6) / 1e6);
  // The Delve's labyrinth reads its enemies through it too.
  const s = defaults();
  s.upgrades.delve = 1;
  const g = new Game(s);
  g.switchMode("delve");
  g.newRun({ seed: 5 });
  const run = g.delveRun, raw = new World(run), cutWorld = new World(run, undefined, cut);
  let seen = 0;
  for (let y = 0; y < 60; y++) for (let x = 0; x < raw.width; x++) {
    const t = raw.tile(x, y);
    if (t.kind !== "enemy") continue;
    seen++;
    assert.equal(cutWorld.tile(x, y).enemy!.attack, Math.round(t.enemy!.attack * 0.95 * 1e6) / 1e6);
  }
  assert.ok(seen > 0);
});

test("ENEMY's Lifesteal Overheal lets Lifesteal heal above max HP, up to its ceiling, as fights predict and play", () => {
  const thief = { ...hero, lifesteal: 100 }, over = { ...thief, stealOverheal: 25 };
  // Five strikes of 10, each healing 10; the rat's 1, 2, 3 and 4 between them.
  const plain = bout(thief, foe(50)), raised = bout(over, foe(50));
  assert.equal(heroHpAfter(plain, 100), 100, "up to max HP");
  assert.equal(heroHpAfter(raised, 100), 125, "up to 25% above it");
  assert.deepEqual(raised.strikes.filter((s) => s.by === "hero").map((s) => s.heroHp), [110, 119, 125, 125, 125]);
  assert.equal(predict(over, foe(50)).hpAfter, 125);
  assert.equal(predict(thief, foe(50)).hpAfter, 100);
  assert.ok(raised.strikes.every((s) => s.by === "enemy" || (s.heroHp ?? 0) <= 125));
  const g = enemyRun({ defense: 3, shroud: 1, weaken: 1, stealOverheal: 3 });
  assert.equal(g.run.player.stealOverheal, 15);
});

test("ENEMY's Surprise Attack doubles the first strike's ATK of a fight right after a Dash", () => {
  const first = bout(hero, foe(100), undefined, { factor: 1, applications: () => 0, first: 2 }).strikes.filter((s) => s.by === "hero").map((s) => s.damage);
  assert.deepEqual(first.slice(0, 3), [20, 10, 10]);
  const marked = bout(hero, foe(100), undefined, { factor: 1, applications: () => 0, first: 2 }).strikes.filter((s) => s.by === "hero").map((s) => !!s.pronounced);
  assert.deepEqual(marked.slice(0, 2), [true, false], "only the first strike wears the gold ring");
  const surprised = bout(hero, foe(100), undefined, { factor: 1, applications: () => 0, first: 2 }), popups = new BoardPopups();
  popups.update({ run: { seed: 1 }, gains: [], fight: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, bout: surprised, start: 0, hp: 100, summary: false }, lastHeal: null }, surprised.strikes[2].at);
  const rings = (popups as unknown as { numbers: { x: number; text: string; ring?: { color: string } }[] }).numbers.filter((n) => n.x >= 1).map((n) => `${n.text}:${n.ring?.color ?? ""}`);
  assert.deepEqual(rings, ["20:#ffd34d", "10:"], "its number rises in a Charged Shot's gold outline");
  /** A corridor: the hero at its west end, a rat of 20 HP on x = 5 that
   * ENEMY targets (Fast when `fast`), Dash owned with `trees` on the run. */
  const corridor = (trees: CardTreeLevels, fast = false) => {
    const g = new Game(defaults());
    g.save.upgrades.dash = 1;
    g.save.archives.levels.dash = 10;
    const w = g.world as RoomWorld;
    w.cells = new Map();
    for (let x = 0; x < 8; x++) w.cells.set(`${x},0`, { kind: "floor" });
    w.cells.set("5,0", { kind: "enemy", enemy: { ...foe(20), ...(fast ? { fast: true as const } : {}) } });
    w.torches = [];
    Object.assign(g.run.player, { x: 0, y: 0, attack: 12 });
    g.run.hand = ["monster"];
    g.run.cardTrees = trees;
    return g;
  };
  const g = corridor({ monster: { surpriseAttack: 100 } });
  g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [4, 0], "the dash stops before the rat");
  g.autoTurn();
  assert.equal(g.world.tile(5, 0).kind, "floor");
  assert.match(g.message, /^Surprise Attack · /);
  assert.equal(g.run.player.hp, g.run.player.maxHp, "felled by the first strike, before it struck back");
  const plain = corridor({});
  plain.autoTurn();
  plain.autoTurn();
  assert.doesNotMatch(plain.message, /Surprise/);
  assert.ok(plain.run.player.hp < plain.run.player.maxHp, "two strikes, and one back");
  // A Fast rat loses its first strike to a Surprise Attack.
  const quick = corridor({ monster: { surpriseAttack: 100 } }, true);
  quick.autoTurn();
  quick.autoTurn();
  assert.match(quick.message, /^Surprise Attack · /);
  assert.equal(quick.run.player.hp, quick.run.player.maxHp, "the hero struck first, and the rat fell");
  const quickPlain = corridor({}, true);
  quickPlain.autoTurn();
  quickPlain.autoTurn();
  assert.ok(quickPlain.run.player.hp < plain.run.player.hp, "without it the Fast rat strikes first, then back");
  // A fight not right after a dash is no surprise.
  const walked = corridor({ monster: { surpriseAttack: 100 } });
  Object.assign(walked.run.player, { x: 4 });
  assert.ok(walked.move(1, 0));
  assert.doesNotMatch(walked.message, /Surprise/);
});
