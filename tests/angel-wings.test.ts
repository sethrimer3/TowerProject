import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { point, type Enemy, type EnemyStrength, type Tile } from "../src/entities.ts";
import { bout, heroHpAfter, resume } from "../src/combat.ts";
import { smites, smittenText } from "../src/angel.ts";
import { RESEARCH } from "../src/progression/archives.ts";
import { deckCards, CARDS } from "../src/cards/cards.ts";
import { PASSIVE_CARDS } from "../src/cards/levels.ts";

// As in revive.test.ts: its fourth strike back fells a 100 HP hero, who at
// full HP again wins with its fifth.
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 0, strength: "normal" };
const hero = () => ({ hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } });
const foe = (strength: EnemyStrength): Enemy => ({ name: "Imp", hp: 5, attack: 1, defense: 0, tier: 0, strength });

test("Angel Wings raises the hero once a fight, only from a strike Revive doesn't save, and may smite the enemy", () => {
  const lost = bout(hero(), brute);
  assert.equal(heroHpAfter(lost, 100), 0);
  const winged = bout(hero(), brute, undefined, undefined, { smites: false });
  const rose = winged.strikes.find((s) => s.revived)!;
  assert.deepEqual([rose.winged, rose.hp, rose.smote], [true, 100, undefined]);
  assert.equal(heroHpAfter(winged, 100), 100, "the Brute falls to the next strike");
  assert.equal(winged.strikes.filter((s) => s.winged).length, 1);
  // Once only: an enemy that fells the hero twice wins.
  const tough = { ...brute, hp: 400 };
  assert.equal(heroHpAfter(bout(hero(), tough, undefined, undefined, { smites: false }), 100), 0);
  // Revive's own revival comes first and doesn't spend the wings.
  const revived = bout(hero(), brute, () => true, undefined, { smites: false });
  assert.ok(revived.strikes.some((s) => s.revived) && !revived.strikes.some((s) => s.winged));
  // Smiting ends the fight on the winged strike, the enemy at 0 HP.
  const smitten = bout(hero(), tough, undefined, undefined, { smites: true });
  const last = smitten.strikes.at(-1)!;
  assert.deepEqual([last.winged, last.smote, last.thornHp, last.hp], [true, true, 0, 100]);
  // Played on from after the raising (Training bought mid-fight), the wings stay spent.
  const from = smitten.strikes.findIndex((s) => s.winged) + 1;
  const again = resume(bout(hero(), tough, undefined, undefined, { smites: false }), from, { player: { ...hero() }, enemy: tough, wings: { smites: false } });
  assert.equal(again.strikes.filter((s) => s.winged).length, 1);
});

test("Avenging Angel's research: five levels on Buy Quantity's schedule at ten times the Gold, each smiting one more rank", () => {
  const r = RESEARCH.avengingAngel;
  assert.deepEqual(r.levels.map((l) => [l.gold, l.hours]), [[10_000, 4], [50_000, 12], [250_000, 24], [500_000, 36], [1_000_000, 48]]);
  assert.deepEqual(r.levels.map((l) => [l.gold / 10, l.hours]), RESEARCH.buyQuantity.levels.map((l) => [l.gold, l.hours]));
  assert.deepEqual([r.categories, r.requires], [["defense"], [{ upgrade: "avengingAngel" }]]);
  const ranks: EnemyStrength[] = ["weak", "normal", "strong", "elite", "boss"];
  for (let level = 0; level <= 5; level++)
    assert.deepEqual(ranks.map((s) => smites(level, { strength: s })), ranks.map((_, i) => i < level), `level ${level}`);
  assert.ok(smites(5, { strength: "greaterBoss" }) && !smites(4, { strength: "greaterBoss" }), "a Greater Boss is a boss");
  assert.deepEqual([smittenText(0), smittenText(2)], ["None", "Weak, Standard"]);
});

test("the ANGEL WINGS card comes with its skill and never activates", () => {
  const s = defaults();
  assert.ok(!deckCards(s.upgrades).includes("angelWings"));
  s.upgrades.angelWings = 1;
  assert.ok(deckCards(s.upgrades).includes("angelWings"));
  assert.ok(PASSIVE_CARDS.has("angelWings"));
  assert.equal(CARDS.angelWings.name, "Angel Wings");
});

/** A Delve run on `seed` with the hero two tiles above the Brute in a
 * walled corridor, ANGEL WINGS in the hand (unless `held` is false), and
 * `others` standing beside the corridor, which `floorEnemies` reports. */
function arena(seed: number, { held = true, level = 0, others = [] as [number, number, Enemy][] } = {}) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1;
  g.save.upgrades.breakthrough = 1;
  g.save.settings.devMode = true;
  g.save.upgrades.angelWings = 1;
  g.save.archives.levels.avengingAngel = level;
  g.switchMode("delve");
  g.newRun({ seed });
  g.run.hand = held ? ["stairs", "angelWings"] : ["stairs"];
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 30; x++) g.run.changes[point(x, y)] = { kind: x === 15 && y < 10 ? "floor" : "wall" };
  Object.assign(g.run.player, { x: 15, y: 0, ...hero() });
  stand(g, others);
  g.move(0, 1);
  return g;
}
/** Stands the Brute and `others` on the live board until each falls. */
function stand(g: Game, others: [number, number, Enemy][]) {
  const tile = g.world.tile.bind(g.world), cleared = (x: number, y: number) => g.run.changes[point(x, y)]?.kind === "floor" && x !== 15;
  g.world.tile = (x, y): Tile => {
    if (x === 15 && y === 2 && g.run.kills === 0) return { kind: "enemy", enemy: brute };
    const other = others.find(([ox, oy]) => ox === x && oy === y);
    return other && !cleared(x, y) ? { kind: "enemy", enemy: other[2] } : tile(x, y);
  };
  g.world.floorEnemies = () => [{ x: 15, y: 2 }, ...others.map(([x, y]) => ({ x, y }))].filter(({ x, y }) => g.world.tile(x, y).kind === "enemy");
}

test("in play, Angel Wings held raises the hero once a run; undo gives the charge back", () => {
  const g = arena(1);
  assert.ok(g.wingsReady);
  g.move(0, 1);
  assert.ok(!g.fallen, "raised");
  assert.deepEqual([g.run.player.hp, g.run.kills, g.run.wingsSpent], [100, 1, true]);
  assert.ok(!g.wingsReady, "spent for the run");
  assert.equal(g.fights.wingedAt.length, 1, "the board shows its wings");
  assert.match(g.message, /^Angel Wings · Revived · Brute defeated/);
  assert.ok(g.undo());
  assert.ok(g.wingsReady, "the fight undone gives the charge back");
  assert.equal(g.fights.wingedAt.length, 0);
  // Without the card in hand, the hero falls.
  const bare = arena(1, { held: false });
  assert.ok(!bare.wingsReady);
  bare.move(0, 1);
  assert.ok(bare.fallen);
  // Spent, it doesn't raise the hero again.
  const spent = arena(1);
  spent.run.wingsSpent = true;
  spent.move(0, 1);
  assert.ok(spent.fallen);
});

test("Avenging Angel: Angel Wings' raising smites every enemy of the ranks researched left on the floor, paying each as a kill", () => {
  const others: [number, number, Enemy][] = [[14, 3, foe("weak")], [16, 3, foe("weak")], [14, 4, foe("strong")], [16, 4, foe("boss")]];
  const g = arena(2, { level: 1, others });
  const gold = g.save.gold;
  g.move(0, 1);
  assert.ok(!g.fallen);
  assert.equal(g.run.kills, 3, "the Brute and the two weak enemies");
  assert.deepEqual(others.map(([x, y]) => g.world.tile(x, y).kind), ["floor", "floor", "enemy", "enemy"]);
  assert.deepEqual(g.smitten.map((s) => [s.x, s.y]), [[14, 3], [16, 3]], "each slashed and gone in a poof");
  assert.match(g.message, /Avenging Angel · 2 enemies smitten/);
  assert.ok(g.save.gold >= gold);
  assert.ok(g.undo());
  assert.equal(g.smitten.length, 0);
  // The Brute itself is standard: at level 2 its fight ends as the wings raise the hero.
  const all = arena(2, { level: 5, others });
  all.move(0, 1);
  assert.ok(!all.fallen);
  assert.equal(all.run.kills, 5);
  assert.deepEqual(others.map(([x, y]) => all.world.tile(x, y).kind), ["floor", "floor", "floor", "floor"]);
  // Without the research, the wings raise the hero and smite nothing.
  const none = arena(2, { others });
  none.move(0, 1);
  assert.deepEqual([none.run.kills, none.smitten.length], [1, 0]);
});

test("a board's floor enemies: a Tower floor's every enemy, and the Delve's on the hero's equivalent floor of its area", () => {
  const tower = new Game(defaults());
  tower.newRun({ seed: 7 });
  const w = tower.world, found = w.floorEnemies!(0, 0).map(({ x, y }) => point(x, y)).sort(), scanned: string[] = [];
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const t = w.tile(x, y); if (t.kind === "enemy" || t.flyer) scanned.push(point(x, y)); }
  assert.ok(found.length > 0);
  assert.deepEqual(found, scanned.sort());
  const delve = new Game(defaults());
  delve.switchMode("delve");
  delve.newRun({ seed: 7 });
  const p = delve.run.player, near = delve.world.floorEnemies!(p.x, p.y);
  assert.ok(near.every(({ x, y }) => { const t = delve.world.tile(x, y); return t.kind === "enemy" || !!t.flyer; }));
});
