import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { bout, heroHpDuring, predict, raisedAttack, REVIVE_MS, summarize } from "../src/combat.ts";
import { BoardPopups, enemyBar, lunges } from "../src/board-popups.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

/** The damage and heal numbers rising off the board. */
const numbers = (popups: BoardPopups) =>
  (popups as unknown as { numbers: { x: number; y: number; text: string; color: string }[] }).numbers;
const hero = (over: Partial<Player> = {}): Player =>
  ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 2, keys: { yellow: 0, blue: 0, red: 0 }, ...over });
const foe = (over: Partial<Enemy> = {}): Enemy => ({ name: "Slime", hp: 30, attack: 7, defense: 4, tier: 0, ...over });

/** A Tower floor of open tiles, the hero at (0, 0), `east` beside it, the
 * stairs in the far corner and an enemy that keeps the floor from clearing. */
function arena(east: Tile, animate = true) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1; // undo needs Rehearsed steps
  g.playsFights = true;
  g.save.settings.fightAnimation = animate;
  // Only Instant Combat lets fights settle at once.
  if (!animate) g.save.upgrades.instantCombat = 1;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("1,0", east);
  w.cells.set("2,2", { kind: "stairs" });
  w.cells.set("0,2", { kind: "enemy", enemy: foe() });
  g.run.player.x = 0;
  g.run.player.y = 0;
  return g;
}

test("a bout plays the prediction's rounds out: the hero strikes first, each round quicker", () => {
  const p = hero(), e = foe({ hp: 36 }); // 6 hits of 6; the enemy strikes 5 times, from 5 up.
  const fight = bout(p, e), odds = predict(p, e);
  assert.deepEqual(fight.strikes.map((s) => s.by), ["hero", "enemy", "hero", "enemy", "hero", "enemy", "hero", "enemy", "hero", "enemy", "hero"]);
  assert.deepEqual(fight.strikes.map((s) => s.damage), [6, 5, 6, 6, 6, 7, 6, 8, 6, 9, 6]);
  const ms = fight.strikes.map((s) => s.end - s.start);
  assert.deepEqual(ms.slice(0, 4).map((d) => Math.round(d * 10) / 10), [250, 250, 225, 225]);
  assert.equal(fight.strikes.at(-1)!.hp, 0, "the enemy falls");
  assert.equal(heroHpDuring(fight, p.hp, fight.duration), p.hp - odds.damage);
  assert.equal(heroHpDuring(fight, p.hp, fight.strikes[1].at - 1), p.hp, "HP drops only as a strike lands");
  assert.equal(heroHpDuring(fight, p.hp, fight.strikes[1].at), p.hp - 5);
});

test("the enemy's ATK rises after every round by 1% (at least 1), so no DEF holds it off forever", () => {
  assert.deepEqual([7, 99, 100, 250, 1000].map(raisedAttack), [8, 100, 101, 252, 1010]);
  // DEF 50 over ATK 20: nothing gets through for 31 rounds, then more each round.
  const p = hero({ attack: 11, defense: 50, hp: 1000 }), e = foe({ hp: 40, attack: 20, defense: 10 });
  const fight = bout(p, e), odds = predict(p, e);
  const struck = fight.strikes.filter((s) => s.by === "enemy").map((s) => s.damage);
  assert.equal(struck.length, 39);
  assert.deepEqual(struck.slice(29, 34), [0, 0, 1, 2, 3]);
  assert.equal(odds.damage, struck.reduce((a, b) => a + b, 0));
  assert.equal(heroHpDuring(fight, p.hp, fight.duration), p.hp - odds.damage);
  // A fight a million rounds long is lethal, not free, and sums quickly.
  const endless = predict(hero({ attack: 11, defense: 10_000 }), foe({ hp: 1_000_000, attack: 1, defense: 10 }));
  assert.equal(endless.survivable, false);
  assert.equal(endless.damage, Infinity);
});

test("the shroud takes the enemy's first damage, then the hero's HP takes the rest", () => {
  const p = hero({ shroud: 8 }), e = foe({ hp: 36 }); // The enemy strikes 5, 6, 7, 8, 9.
  const fight = bout(p, e), odds = predict(p, e);
  const struck = fight.strikes.filter((s) => s.by === "enemy");
  assert.deepEqual(struck.map((s) => [s.shrouded ?? 0, s.damage]), [[5, 0], [3, 3], [0, 7], [0, 8], [0, 9]]);
  assert.equal(odds.damage, 35 - 8);
  assert.equal(heroHpDuring(fight, p.hp, fight.duration), p.hp - odds.damage);
  assert.equal(predict(hero({ shroud: 50 }), e).damage, 0, "a shroud bigger than the fight blocks all of it");

  const popups = new BoardPopups(), game = { run: { seed: 1 }, gains: [], fight: null, lastHeal: null };
  const shown = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, bout: fight, start: 0, hp: 36, summary: false };
  popups.update({ ...game, fight: shown }, fight.strikes[3].at);
  assert.deepEqual(numbers(popups).filter((d) => d.x < 1).map((d) => `${d.x}:${d.text}:${d.color}`),
    ["0:5:#c9d3e0", "-0.22:3:#c9d3e0", "0.22:3:#b3121f"], "what the shroud blocks rises in silver, beside what got through");
});

test("the shroud is whole again for every fight", () => {
  const g = arena({ kind: "enemy", enemy: foe() }, false);
  g.world.cells.set("0,1", { kind: "enemy", enemy: foe() });
  g.run.player.shroud = 4;
  const full = predict({ ...g.run.player, shroud: 0 }, foe()).damage;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.hp, 100 - (full - 4));
  assert.ok(g.move(-1, 0) && g.move(0, 1));
  assert.equal(g.run.player.hp, 100 - 2 * (full - 4), "the second fight is shrouded too");
  assert.equal(g.run.player.shroud, 4);
});

test("strikes speed up by a tenth a round down to 50 ms, then hold", () => {
  const fight = bout(hero({ attack: 5, hp: 10_000 }), foe({ hp: 40, defense: 4, attack: 3 }));
  const rounds = fight.strikes.filter((s) => s.by === "hero").map((s) => s.end - s.start);
  assert.equal(rounds.length, 40);
  for (let r = 1; r < rounds.length; r++) assert.ok(Math.abs(rounds[r] - Math.max(50, rounds[r - 1] * 0.9)) < 1e-9);
  assert.equal(rounds.at(-1), 50);
});

test("a lost bout ends on the strike that fells the hero", () => {
  const fight = bout(hero({ hp: 12 }), foe({ hp: 60 }));
  const last = fight.strikes.at(-1)!;
  assert.equal(last.by, "enemy");
  assert.equal(last.hp, 0);
  assert.equal(fight.strikes.filter((s) => s.by === "enemy").length, 3);
});

test("a fight played out waits beside the enemy, then counts exactly like one settled at once", () => {
  const enemy: Tile = { kind: "enemy", enemy: foe() };
  const played = arena(structuredClone(enemy)), instant = arena(structuredClone(enemy), false);
  played.run.seed = instant.run.seed;
  const hp = played.run.player.hp;
  assert.ok(played.move(1, 0));
  assert.ok(played.encounter, "the fight is playing out");
  assert.deepEqual([played.run.player.x, played.run.player.hp], [0, hp], "nothing counts yet");
  assert.equal(played.world.tile(1, 0).kind, "enemy");
  assert.ok(!played.stepManually(0, 1) && !played.move(0, 1), "steps wait for the fight");
  played.walkTo(2, 2);
  assert.equal(played.route.length, 0);
  assert.ok(played.shownHp(played.encounter.start + played.encounter.bout.duration) < hp);

  assert.ok(played.finishEncounter());
  assert.ok(instant.move(1, 0));
  assert.equal(played.encounter, null);
  assert.deepEqual(played.run, instant.run);
  assert.equal(played.message, instant.message);
  assert.deepEqual([played.run.player.x, played.world.tile(1, 0).kind], [1, "floor"]);
});

test("undo during a fight takes the whole fight back", () => {
  const g = arena({ kind: "enemy", enemy: foe() }), hp = g.run.player.hp;
  g.move(1, 0);
  assert.ok(g.undo());
  assert.equal(g.encounter, null);
  assert.deepEqual([g.run.player.x, g.run.player.hp, g.run.kills], [0, hp, 0]);
});

test("a fight the hero loses leaves it fallen only once it has played out", () => {
  const g = arena({ kind: "enemy", enemy: foe({ hp: 600, attack: 30 }) });
  assert.ok(g.move(1, 0, true));
  assert.equal(g.fallen, false);
  g.finishEncounter();
  assert.ok(g.fallen);
});

test("pickups and treasure queue their rewards to rise from their tiles", () => {
  const key = arena({ kind: "key", color: "blue" });
  key.move(1, 0);
  assert.deepEqual(key.gains, [{ x: 1, y: 0, text: "+1 blue key", art: { tile: { kind: "key", color: "blue" } } }]);
  assert.equal(key.message, "+1 blue key");
  assert.equal(key.effect.until, 0, "no text flashes over the board");

  const chest = arena({ kind: "treasure" });
  chest.move(1, 0);
  assert.match(chest.gains[0].text, /^\+\d+ Gold$/);
  assert.deepEqual(chest.gains[0].art, { coin: "gold" }, "Gold rises as its coin");
  for (const g of chest.gains.slice(1)) assert.ok(g.art && "material" in g.art);
  assert.ok(chest.gains.every((g) => g.x === 1 && g.y === 0));
});

test("every victory, a weak enemy's too, raises both its Gold and its Silver as their coins", () => {
  const g = arena({ kind: "enemy", enemy: foe({ hp: 1, attack: 0, strength: "weak" }) }, false);
  assert.ok(g.move(1, 0));
  assert.deepEqual(g.gains.slice(0, 2).map((gain) => gain.art), [{ coin: "gold" }, { coin: "silver" }]);
  assert.match(g.gains[0].text, /^\+\d+ Gold$/);
  assert.match(g.gains[1].text, /^\+\d+ Silver$/);
  assert.ok(g.save.gold > 0 && g.silver > 0);
});

test("the board shows rewards that came together one after another, and each strike's damage as it lands", () => {
  const popups = new BoardPopups(), gain = (text: string) => ({ x: 1, y: 0, text, art: null });
  const game = { run: { seed: 1 }, gains: [gain("+5 Gold"), gain("+1 Slime Gel")], fight: null, lastHeal: null };
  popups.update(game, 1000);
  assert.deepEqual(game.gains, [], "the board takes the rewards");
  const shown = (popups as unknown as { rewards: { start: number }[] }).rewards.map((p) => p.start);
  assert.deepEqual(shown, [1000, 2000]);
  game.gains.push(gain("+3 Inspiration"));
  popups.update(game, 1500);
  assert.equal((popups as unknown as { rewards: { start: number }[] }).rewards.at(-1)!.start, 1500, "a later reward starts at once, over the others");
  popups.update(game, 4000);
  assert.ok(popups.idle(4000));

  const fight = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, bout: bout(hero(), foe()), start: 5000, hp: 30, summary: false, settle() {} };
  const damage = () => numbers(popups).map((d) => `${d.x}:${d.text}:${d.color}`);
  popups.update({ ...game, fight }, 5000 + fight.bout.strikes[0].at);
  assert.deepEqual(damage(), ["1:6:#ff4040"], "the hero's strike rises off the enemy");
  popups.update({ ...game, fight }, 5000 + fight.bout.strikes[1].at);
  assert.deepEqual(damage(), ["1:6:#ff4040", "0:5:#b3121f"], "the enemy's rises off the hero, a darker red");

  const mid = 5000 + fight.bout.strikes[0].at;
  assert.ok(lunges(fight, mid, false).hero.dx > 0.29, "the hero leans into its strike");
  assert.deepEqual(lunges(fight, mid, true).hero, { dx: 0, dy: 0 }, "not with motion reduced");
  assert.ok(lunges(fight, 5000 + fight.bout.strikes[1].at, false).enemy.dx < -0.29);
});

test("a potion records the HP it healed from and to, for the HP bar to fill up", () => {
  const g = arena({ kind: "potion", amount: 30 });
  g.run.player.hp = 50;
  g.move(1, 0);
  assert.deepEqual(g.lastHeal, { from: 50, to: 80, x: 1, y: 0, id: 1 });
  const full = arena({ kind: "potion", amount: 30 });
  full.move(1, 0);
  assert.equal(full.lastHeal, null, "a potion at full HP heals nothing to show");
});

test("a crafted potion records its heal just as a picked-up one does", () => {
  const g = arena({ kind: "floor" });
  g.run.outside = false;
  g.run.player.hp = g.run.player.maxHp - 10;
  g.save.consumables.cinderTonic = 1;
  assert.ok(g.useConsumable("cinderTonic"));
  const hp = g.run.player.hp;
  assert.deepEqual(g.lastHeal, { from: hp - 10, to: hp, x: 0, y: 0, id: 1 }, "it heals only the HP missing");
  assert.match(g.message, /\+10 HP$/);
  assert.equal(g.effect.until, 0, "the green number shows it, not text over the board");
});

test("each heal raises its HP healed in green over the hero, once", () => {
  const popups = new BoardPopups();
  const game = { run: { seed: 1 }, gains: [], fight: null, lastHeal: { from: 40, to: 75, x: 3, y: 2, id: 1 } };
  popups.update(game, 1000);
  popups.update(game, 1100);
  assert.deepEqual(numbers(popups).map((n) => [n.x, n.text, n.color]), [[3, "+35", "#5fdc6a"]]);
  popups.update(game, 2000);
  assert.ok(popups.idle(2000));
});

test("a door raises each key it took, with a minus sign, and a Heart Door a checked heart", () => {
  const keys = arena({ kind: "door", door: { type: "keys", keys: ["yellow", "blue"], mode: "all" } });
  Object.assign(keys.run.player.keys, { yellow: 1, blue: 1 });
  assert.ok(keys.move(1, 0));
  assert.deepEqual(keys.gains.map((g) => [g.text, g.art]), [
    ["−1 yellow key", { tile: { kind: "key", color: "yellow" }, spent: true }],
    ["−1 blue key", { tile: { kind: "key", color: "blue" }, spent: true }],
  ]);
  assert.match(keys.message, /opened · 2 keys spent$/);
  assert.equal(keys.effect.until, 0, "no text flashes over the board");

  const heart = arena({ kind: "door", door: { type: "fullHp" } });
  assert.ok(heart.move(1, 0));
  assert.deepEqual(heart.gains.map((g) => [g.x, g.y, g.art]), [[1, 0, { heart: true }]]);
});

test("the enemy's HP bar shows from the hero's first strike, drains with each, and fades once the enemy falls", () => {
  const fight = bout(hero(), foe()), hits = fight.strikes.filter((s) => s.by === "hero");
  const shown = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, bout: fight, start: 0, hp: 30, summary: false };
  assert.equal(enemyBar(shown, hits[0].at - 1), null, "hidden until the first strike lands");
  assert.deepEqual(enemyBar(shown, hits[0].at), { hp: 30, alpha: 1 }, "full as the strike lands");
  const mid = enemyBar(shown, hits[0].at + 100)!.hp;
  assert.ok(mid < 30 && mid > hits[0].hp, "then drains steadily");
  assert.equal(enemyBar(shown, hits[1].at)!.hp, hits[0].hp, "down to what the strike left");
  const last = hits.at(-1)!.at;
  assert.ok(enemyBar(shown, last + 250)!.alpha < 1, "the felled enemy's bar fades");
  assert.equal(enemyBar(shown, last + 1000), null, "and is gone");

  const lost = bout(hero({ hp: 12 }), foe({ hp: 60 }));
  const standing = { ...shown, bout: lost, hp: 60 };
  assert.deepEqual(enemyBar(standing, 60_000), { hp: 42, alpha: 1 }, "an enemy that wins keeps showing what HP it has left");
});

test("summary rounds sum a fight's strikes, a revival starting the next once its fire is out", () => {
  // Hits of 6 against 60 HP; the enemy strikes 5, 6, 7… and every strike
  // that would fell the hero (12, then 30 HP) revives it.
  const fight = bout(hero({ hp: 12, maxHp: 30 }), foe({ hp: 60 }), () => true), sum = summarize(fight, REVIVE_MS);
  const rounds: number[] = [];
  let at = 0;
  // Each strike's round: a revival closes the round it lands in.
  for (const s of fight.strikes) {
    rounds.push(at);
    if (s.revived) at++;
  }
  for (let r = 0; r <= at; r++) {
    const own = fight.strikes.filter((_, i) => rounds[i] === r);
    for (const by of ["hero", "enemy"] as const) {
      const total = own.filter((s) => s.by === by).reduce((a, s) => a + s.damage, 0), shown = sum.strikes.find((s) => s.by === by && s.at === r * REVIVE_MS);
      if (total || shown) assert.equal(shown?.damage, total, `round ${r}, ${by}`);
    }
  }
  assert.equal(at, 2, "the hero revives twice");
  assert.deepEqual(sum.strikes.filter((s) => s.revived).map((s) => s.at), [0, REVIVE_MS], "each round begins once the last revival's fire is out");
  assert.equal(sum.duration, 2 * REVIVE_MS);
  assert.equal(sum.strikes.at(-2)!.hp, 0, "the last round fells the enemy");
  assert.deepEqual(summarize(bout(hero(), foe()), REVIVE_MS).strikes.map((s) => [s.by, s.damage, s.hp, s.at]),
    [["hero", 30, 0, 0], ["enemy", 5 + 6 + 7 + 8, 100 - 26, 0]], "one round without a revival");
});

test("Animate fights stays on until Instant Combat opens the setting", () => {
  const g = arena({ kind: "enemy", enemy: foe() });
  g.save.settings.fightAnimation = false;
  assert.ok(g.animatesFights, "the setting is hidden, so fights still play out");
  g.move(1, 0);
  assert.ok(g.encounter);
  g.save.upgrades.instantCombat = 1;
  assert.equal(g.animatesFights, false);
});

test("a fight won at once raises only what the hero took, over the hero, and no bar", () => {
  const g = arena({ kind: "enemy", enemy: foe() }, false);
  assert.ok(g.move(1, 0));
  assert.equal(g.encounter, null, "it counts at once");
  assert.deepEqual([g.run.player.x, g.fight!.summary], [1, true]);
  const popups = new BoardPopups(), now = g.fight!.start, taken = g.fight!.bout.strikes[1].damage;
  popups.update({ ...g, gains: [] }, now);
  assert.equal(taken, 100 - g.run.player.hp);
  assert.deepEqual(numbers(popups).map((d) => `${d.x}:${d.text}`), [`1:${taken}`], "no number over the felled enemy");
  assert.equal(enemyBar(g.fight!, now + 1000), null);
});

test("a fight lost at once raises a summary over both, and the enemy's bar shows its HP left", () => {
  const g = arena({ kind: "enemy", enemy: foe({ hp: 600, attack: 30 }) }, false);
  assert.ok(!g.move(1, 0, true));
  assert.ok(g.fallen && !g.encounter);
  const popups = new BoardPopups(), now = g.fight!.start;
  popups.update({ ...g, gains: [] }, now);
  const [dealt, taken] = g.fight!.bout.strikes.map((s) => s.damage);
  assert.ok(taken >= 100, "every strike it took, the last one in full");
  assert.deepEqual(numbers(popups).map((d) => `${d.x}:${d.text}`), [`1:${dealt}`, `0:${taken}`]);
  assert.deepEqual(enemyBar(g.fight!, now + 60_000), { hp: 600 - dealt, alpha: 1 });
  assert.ok(g.undo());
  assert.equal(g.fight, null, "undo takes the bar away");
});
