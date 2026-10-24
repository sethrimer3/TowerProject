import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { greaterBossSpot } from "../src/tower/greater-boss.ts";
import { GREATER_BOSS_OVER_BOSS, enemyTitle, getTowerGateEnemy } from "../src/enemies/scaling.ts";
import { ENEMY_GOLD, SILVER_MULTIPLIER, XP_MULTIPLIER } from "../src/config.ts";
import type { Tile } from "../src/entities.ts";
import type { RunPurse } from "../src/game/run-purse.ts";
import { tileInfo } from "../src/ui/tile-info.ts";

/** A game inside the Tower with Dev mode's manual steps, the hero standing
 * beside the floor's last lit torch, every other one put out. Returns the
 * step that puts it out. */
function besideLastTorch(seed = 3, undos = false) {
  const g = new Game(defaults());
  g.save.settings.devMode = true;
  if (undos) g.save.upgrades.inspirationUndos = 1;
  g.newRun({ outside: true, seed });
  assert.ok(g.enterRun());
  const world = g.world as RoomWorld;
  assert.ok(world instanceof RoomWorld && world.torches.length > 0);
  const [last, ...rest] = world.torches;
  for (const t of rest) world.breakTorchAt(t.x, t.y);
  const [dx, dy] = ([[0, 1], [1, 0], [0, -1], [-1, 0]] as const).find(([dx, dy]) => world.tile(last.x - dx, last.y - dy).kind !== "wall")!;
  g.run.changes[`${last.x - dx},${last.y - dy}`] = { kind: "floor" };
  Object.assign(g.run.player, { x: last.x - dx, y: last.y - dy });
  return { g, world, dx, dy };
}
const greaterBosses = (changes: Record<string, Tile>) => Object.entries(changes).filter(([, t]) => t.enemy?.strength === "greaterBoss");

test("a Greater Boss has twice a boss's HP, ATK and DEF, and twice its rewards", () => {
  for (const room of [0, 9, 49]) {
    const boss = getTowerGateEnemy(room, "boss", "balanced"), greater = getTowerGateEnemy(room, "greaterBoss", "balanced");
    assert.equal(greater.hp, boss.hp * GREATER_BOSS_OVER_BOSS);
    assert.equal(greater.attack, boss.attack * GREATER_BOSS_OVER_BOSS);
    assert.equal(greater.defense, boss.defense * GREATER_BOSS_OVER_BOSS);
    assert.equal(enemyTitle(greater), `Greater Boss ${boss.name}`);
  }
  assert.equal(GREATER_BOSS_OVER_BOSS, 2);
  assert.equal(ENEMY_GOLD.greaterBoss, 2 * ENEMY_GOLD.boss);
  assert.equal(SILVER_MULTIPLIER.greaterBoss, 2 * SILVER_MULTIPLIER.boss);
  assert.equal(XP_MULTIPLIER.greaterBoss, 2 * XP_MULTIPLIER.boss);
});

test("putting out a floor's last torch calls a Greater Boss in front of the stairs, once", () => {
  const { g, world, dx, dy } = besideLastTorch();
  const spot = greaterBossSpot(world, [g.run.player, { x: g.run.player.x + dx, y: g.run.player.y + dy }])!;
  assert.ok(g.stepManually(dx, dy));
  assert.ok(world.torches.every((t) => !t.active));
  const found = greaterBosses(g.run.changes);
  assert.equal(found.length, 1);
  assert.equal(found[0]![0], `${spot.x},${spot.y}`);
  assert.equal(world.tile(spot.x, spot.y).kind, "enemy");
  assert.deepEqual(g.towerRun.summoned, [0]);
  assert.ok(g.summoned && g.summoned.x === spot.x && g.summoned.y === spot.y, "the board poofs it in");

  // Walking on doesn't call another, and a reload keeps the one called.
  g.stepManually(-dx, -dy);
  assert.equal(greaterBosses(g.run.changes).length, 1);
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.deepEqual(loaded.towerRun.summoned, [0]);
  assert.equal(greaterBosses(loaded.run.changes).length, 1);
});

test("undo takes the Greater Boss back, and the next step calls it again", () => {
  const { g, dx, dy } = besideLastTorch(4, true);
  g.stepManually(dx, dy);
  assert.equal(greaterBosses(g.run.changes).length, 1);
  assert.ok(g.undo());
  assert.equal(greaterBosses(g.run.changes).length, 0);
  assert.equal(g.summoned, null);
  g.stepManually(dx, dy);
  assert.equal(greaterBosses(g.run.changes).length, 1, "undo relights just the last torch, so putting it out calls it again");
});

test("a torch put out stays out through a reload, and undo lights it again", () => {
  const { g, dx, dy } = besideLastTorch(6, true);
  const at = { x: g.run.player.x + dx, y: g.run.player.y + dy };
  const lit = (game: Game) => (game.world.torches ?? []).filter((t) => t.active).map((t) => `${t.x},${t.y}`);
  assert.deepEqual(lit(g), [`${at.x},${at.y}`]);
  g.stepManually(dx, dy);
  assert.deepEqual(lit(g), []);
  assert.deepEqual(lit(new Game(decode(JSON.stringify(g.save)))), [], "the save keeps every torch put out");
  assert.ok(g.undo());
  assert.deepEqual(lit(g), [`${at.x},${at.y}`], "undo brings back only the torch the step put out");
  assert.deepEqual(lit(new Game(decode(JSON.stringify(g.save)))), [`${at.x},${at.y}`]);
});

test("a floor with a torch still lit calls none", () => {
  const { g, world, dx, dy } = besideLastTorch(5);
  world.torches[world.torches.length - 1]!.active = true;
  if (world.torches.length > 1) {
    g.stepManually(dx, dy);
    assert.equal(greaterBosses(g.run.changes).length, 0);
  }
});

test("a Greater Boss called where the stairs' guard fell still shows and pays its Gold, once", () => {
  const { g, world, dx, dy } = besideLastTorch();
  g.stepManually(dx, dy);
  const [key] = greaterBosses(g.run.changes)[0]!, [x, y] = key.split(",").map(Number) as [number, number];
  // The guard killed on that tile already paid it.
  g.save.tower.lootedTiles[`${g.run.seed}:${g.run.height}:${x},${y}`] = true;
  const gold = g.enemyGold(x, y);
  assert.ok(gold > 0, "the Greater Boss's Gold is its own");
  assert.match(tileInfo(g, x, y).body, /alt="Gold"/, "its pop-up shows it");
  const enemy = world.tile(x, y).enemy!;
  const purse = (g as unknown as { purse: RunPurse }).purse, paid = purse.enemyLoot(enemy, x, y);
  assert.ok(paid.gold > 0 && paid.cells > 0, "killing it pays its Gold and Cells");
  // A reload keeps it paid, so undo can't pay it twice.
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(loaded.enemyGold(x, y), 0);
});

test("every enemy spawned mid-run pays its own loot, once, even on a tile already paid", () => {
  const { g, world } = besideLastTorch();
  const game = g as unknown as { purse: RunPurse; spawnEnemy(at: { x: number; y: number }, tile: Tile): void };
  const { x, y } = greaterBossSpot(world, [g.run.player])!;
  g.save.tower.lootedTiles[`${g.run.seed}:${g.run.height}:${x},${y}`] = true;
  const enemy = getTowerGateEnemy(world.room, "normal", "balanced");
  for (const spawn of [0, 1]) {
    game.spawnEnemy({ x, y }, { kind: "enemy", enemy });
    assert.equal(world.tile(x, y).enemy!.spawn, spawn, "numbered in turn");
    assert.ok(g.enemyGold(x, y) > 0, `spawn ${spawn} shows its Gold`);
    assert.ok(game.purse.enemyLoot(world.tile(x, y).enemy!, x, y).gold > 0, `spawn ${spawn} pays it`);
    assert.equal(g.enemyGold(x, y), 0, "and only once");
    // A reload keeps the spawn, its number and the Gold paid.
    const loaded = new Game(decode(JSON.stringify(g.save)));
    assert.equal(loaded.world.tile(x, y).enemy?.spawn, spawn);
    assert.equal(loaded.run.spawns, spawn + 1);
    assert.equal(loaded.enemyGold(x, y), 0);
    world.clear(x, y);
  }
});

test("a spawn undone and made again keeps its number, so it can't pay twice", () => {
  const { g, dx, dy } = besideLastTorch(4, true);
  g.stepManually(dx, dy);
  const [[, first]] = greaterBosses(g.run.changes) as [[string, Tile]];
  assert.equal(first.enemy!.spawn, 0);
  assert.ok(g.undo());
  assert.equal(g.run.spawns, undefined);
  g.stepManually(dx, dy);
  const [[, again]] = greaterBosses(g.run.changes) as [[string, Tile]];
  assert.equal(again.enemy!.spawn, 0);
  assert.equal(g.run.spawns, 1);
});
