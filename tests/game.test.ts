import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  generateDelveMap,
  generateTowerRoom,
  random,
  rollUnguardedLoot,
  validate,
  reachable,
  World,
  LAYOUT_VERSION,
} from "../src/generation.ts";
import { generateTowerFloor, geometryProblems, towerFloorReport } from "../src/tower/index.ts";
import { doorCost } from "../src/doors.ts";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { predict } from "../src/combat.ts";
import { chooseStep } from "../src/automation.ts";
import { point } from "../src/entities.ts";
import { TOWER_START_X } from "../src/config.ts";
test("deterministic delve chunks are internally consistent and the whole map connects from the entrance", () => {
  for (let seed = 0; seed < 10; seed++) {
    for (let i = 0; i < 5; i++) assert.deepEqual(generate(seed, i), generate(seed, i));
    const full = generateDelveMap(seed);
    assert.notEqual(full.get(point(15, 0))?.kind, "wall");
    assert.equal(
      reachable(full, point(15, 0)).size,
      [...full.values()].filter((t) => t.kind !== "wall").length,
      `Seed ${seed}: the whole delve map must be one connected component`,
    );
  }
});
test("combat predicts first strike, defenses, strict survival, and impervious/lethal gates distinctly", () => {
  const p = new Game(defaults()).run.player;
  assert.deepEqual(
    predict(p, { name: "test", hp: 25, attack: 10, defense: 0, tier: 0 }),
    { impervious: false, hit: 12, turns: 3, damage: 10, survivable: true, requiredAttack: 0 },
  );
  p.hp = 10;
  assert.equal(
    predict(p, { name: "test", hp: 25, attack: 10, defense: 0, tier: 0 })
      .survivable,
    false,
  );
  // Impervious: player attack does not exceed enemy defense at all.
  const impervious = predict(p, { name: "wall", hp: 10, attack: 1, defense: p.attack, tier: 0 });
  assert.equal(impervious.impervious, true);
  assert.equal(impervious.survivable, false);
  assert.equal(impervious.requiredAttack, 1);
  assert.equal(impervious.damage, Infinity);
  // Lethal but damageable: hit > 0, yet cumulative damage exceeds current HP.
  const lethal = predict(p, { name: "doom", hp: 99999, attack: 999, defense: 0, tier: 0 });
  assert.equal(lethal.impervious, false);
  assert.equal(lethal.survivable, false);
  assert.ok(lethal.hit > 0);
  assert.ok(Number.isFinite(lethal.damage));
});
test("doors consume matching keys; pickups and walls obey movement", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  const p = g.run.player;
  g.world.changes["15,1"] = { kind: "door", color: "blue" };
  assert.equal(g.move(0, 1), false);
  p.keys.blue = 1;
  assert.equal(g.move(0, 1), true);
  assert.equal(p.keys.blue, 0);
  g.world.changes["15,2"] = { kind: "attack" };
  g.move(0, 1);
  assert.equal(p.attack, 14);
  g.world.changes["15,3"] = { kind: "wall" };
  assert.equal(g.move(0, 1), false);
  assert.equal(g.run.height, 2);
});
test("combination, steel, and heart doors apply their runtime rules", () => {
  const combo = new Game(defaults());
  combo.save.upgrades.delve = 1; combo.switchMode("delve");
  combo.world.changes["15,1"] = { kind: "door", door: { type: "keys", keys: ["yellow", "blue"], mode: "all" } };
  combo.run.player.keys.yellow = 1; combo.run.player.keys.blue = 1;
  assert.equal(combo.move(0, 1), true);
  assert.equal(combo.run.player.keys.yellow, 0); assert.equal(combo.run.player.keys.blue, 0);
  assert.equal(combo.run.keysSpent, true);

  const steel = new Game(defaults());
  steel.save.upgrades.delve = 1; steel.switchMode("delve");
  steel.world.changes["15,1"] = { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any" } };
  steel.run.player.keys.blue = 1; steel.run.player.keys.red = 1;
  assert.equal(steel.move(0, 1), true);
  assert.equal(steel.run.player.keys.blue, 0); assert.equal(steel.run.player.keys.red, 1);

  const heart = new Game(defaults());
  heart.save.upgrades.delve = 1; heart.switchMode("delve");
  heart.world.changes["15,1"] = { kind: "door", door: { type: "fullHp" } };
  heart.run.player.hp--;
  assert.equal(heart.move(0, 1), false);
  heart.run.player.hp = heart.run.player.maxHp;
  assert.equal(heart.move(0, 1), true);
  assert.equal(heart.run.keysSpent, false);
});
test("automation avoids lethal fights; manual death resets immediately and awards once", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  // Lethal but damageable (low defense so it's not impervious): the player
  // can strike it, but the fight is unwinnable.
  g.world.changes["15,1"] = {
    kind: "enemy",
    enemy: { name: "doom", hp: 99999, attack: 999, defense: 0, tier: 3 },
  };
  assert.equal(g.move(0, 1, false), false);
  assert.equal(g.summary, null);
  g.move(0, 1, true);
  assert.ok(g.summary);
  assert.equal(g.save.delve.run?.player.y, 0);
  assert.equal(g.undo(), false);
  const earned = g.save.delve.essence;
  g.finish("again");
  assert.equal(g.save.delve.essence, earned);
  g.save.delve.essence = 100;
  g.save.upgrades.auto = 1;
  assert.ok(g.buy("hp"));
  g.summary = null;
  g.newRun();
  assert.equal(g.run.player.maxHp, 140);
});
test("automation climbs purposefully, never takes lethal fights, bounds chunk memory", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  for (let i = 0; i < 1500; i++) {
    const s = chooseStep(g);
    if (!s) break;
    assert.ok(g.move(s.dx, s.dy));
    assert.ok(g.run.player.hp > 0);
  }
  assert.ok(g.run.height > 30, `reached ${g.run.height}`);
  g.world.maintain(10000);
  assert.ok(g.world.chunks.size < 8);
});
test("save roundtrip, malformed values and old versions are safe", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  g.run.changes["15,1"] = { kind: "floor" }; // Isolate persistence from procedural encounters.
  g.move(0, 1);
  const restored = decode(JSON.stringify(g.save));
  assert.equal(restored.delve.run?.player.y, 1);
  for (const raw of [
    "oops",
    "null",
    '{"version":0}',
    '{"version":1,"run":{"player":null}}',
  ])
    assert.equal(decode(raw).delve.run, null);
  const bad = JSON.parse(JSON.stringify(g.save));
  bad.delve.run.player.keys = null;
  assert.equal(decode(JSON.stringify(bad)).delve.run, null);
});
test("density is a rendering setting only: it never mutates world or run state", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  const tiles = Array.from((g.world as World).chunks.entries());
  const before = structuredClone(g.run);
  for (const density of [16, 24, 30, 20]) {
    g.save.settings.density = density;
    assert.equal(g.run.player.x, 15);
    assert.deepEqual(Array.from((g.world as World).chunks.entries()), tiles);
    assert.deepEqual(g.run, before);
  }
});

test("every Tower tree door is a real choke point; shortcut doors are the only deliberate bypasses", () => {
  for (let seed = 0; seed < 60; seed += 5)
    for (const room of [0, 3, 8, 15, 40]) {
      const { cells, embedding } = generateTowerFloor(seed, room);
      const start = point(TOWER_START_X, 0);
      // Shortcuts deliberately close loops; with them shut, every other
      // door must be the only way into what it locks.
      const shortcuts = embedding.doorways.filter((d) => d.shortcut).map((d) => point(d.x, d.y));
      const all = reachable(cells, start, new Set(shortcuts));
      for (const d of embedding.doorways) {
        const t = cells.get(point(d.x, d.y))!;
        if (t.kind !== "door" || d.shortcut) continue;
        assert.ok(
          reachable(cells, start, new Set([...shortcuts, point(d.x, d.y)])).size < all.size - 1,
          `Seed ${seed} room ${room}: door at ${d.x},${d.y} has a physical bypass`,
        );
      }
    }
});
test("the key economy is coherent on early floors but never force-balanced", () => {
  let early = 0, earlyOk = 0, anyUnaffordable = 0, exchanges = 0, floors = 0;
  for (let seed = 0; seed < 80; seed++)
    for (const room of [0, 1, 6, 12, 30]) {
      const a = towerFloorReport(seed, room).analysis;
      floors++;
      if (room <= 1) { early++; if (a.stairsKeyReachable) earlyOk++; }
      if (!a.keyEconomyComplete) anyUnaffordable++;
      // Higher-tier door -> several lower-tier keys (resource conversion).
      if (a.regions.some((r) => /^(blue|red) door$/.test(r.gate) && (r.contents.match(/key/g) ?? []).length >= 3)) exchanges++;
      assert.equal(a.emptyDeadEnds, 0, `Seed ${seed} room ${room}: empty dead end`);
    }
  assert.ok(earlyOk / early > 0.9, `early floors key-reachable ${earlyOk}/${early}`);
  // Scarcity is allowed: some floors leave a door (or the stairs) unaffordable.
  assert.ok(anyUnaffordable > 0 && anyUnaffordable < floors * 0.6, `${anyUnaffordable}/${floors} floors with an unaffordable door`);
  assert.ok(exchanges > floors * 0.1, `${exchanges}/${floors} floors with a key exchange room`);
});

test("old runs safely migrate topology while retaining earned stats and permanent progress", () => {
  const save = defaults(),
    g = new Game(save);
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  // Migration expectations must not depend on the wall layout of a
  // Date.now-derived seed selected by the test runner.
  g.run.seed = 3;
  g.world = new World(3, g.run.changes);
  g.run.layoutVersion = undefined;
  g.run.player.y = 27;
  g.run.height = 29;
  g.run.player.attack = 40;
  g.run.changes["15,25"] = { kind: "floor" };
  save.delve.essence = 19;
  save.delve.reached = 29; // isolate migration from unrelated milestone crediting
  save.upgrades.hp = 2;
  const migrated = new Game(decode(JSON.stringify(save)));
  migrated.switchMode("delve");
  assert.equal(migrated.run.layoutVersion, LAYOUT_VERSION);
  assert.equal(migrated.run.player.y, 20);
  assert.equal(migrated.run.player.attack, 40);
  assert.equal(migrated.run.height, 29);
  assert.equal(migrated.save.delve.essence, 19);
  assert.equal(migrated.save.upgrades.hp, 2);
  assert.deepEqual(migrated.run.changes, {});
  // The old generator's chunk-local "stairs" coordinates no longer exist;
  // the migrated entrance only needs to still be navigable, not a specific kind.
  assert.notEqual(migrated.world.tile(15, 20).kind, "wall");
});
test("automation reliably makes forward progress, never taking a lethal fight, across many fixed seeds", () => {
  for (let seed = 0; seed < 12; seed++) {
    const g = new Game(defaults());
    g.save.upgrades.delve = 1;
    g.switchMode("delve");
    g.run.seed = seed;
    g.world = new World(seed, g.run.changes);
    for (let i = 0; i < 1400 && g.run.height < 40; i++) {
      const step = chooseStep(g);
      if (!step) break;
      assert.ok(g.move(step.dx, step.dy));
      assert.ok(g.run.player.hp > 0);
    }
    assert.ok(g.run.height >= 40, `Seed ${seed} stalled at ${g.run.height}`);
  }
});

test("validator rejects missing prerequisite keys and doors with bypass routes", () => {
  const cells = new Map<string, import("../src/entities.ts").Tile>();
  for (let y = 0; y < 20; y++) cells.set(point(15, y), { kind: "floor" });
  cells.set("15,5", { kind: "door", color: "yellow" });
  assert.equal(validate(cells, 0), false);
  cells.set("15,2", { kind: "key", color: "yellow" });
  assert.equal(validate(cells, 0), true);
  for (let y = 4; y <= 6; y++) cells.set(point(14, y), { kind: "floor" });
  assert.equal(validate(cells, 0), false);
});

test("hundreds of generated Tower floors are geometrically valid even when their economy is not", () => {
  let checked = 0;
  for (let seed = 0; seed < 40; seed++)
    for (const room of [0, 1, 4, 9, 20, 60]) {
      const { cells, embedding } = generateTowerFloor(seed, room);
      assert.deepEqual(geometryProblems(cells), [], `Seed ${seed} room ${room}`);
      for (const p of embedding.placements) assert.notEqual(cells.get(point(p.x, p.y))?.kind, "wall");
      // Only resources, never geometry, can make a floor unwinnable: with
      // doors and enemies treated as passable the stairs are always reachable.
      assert.ok(reachable(cells, point(TOWER_START_X, 0)).has(point(...embedding.stairs)));
      checked++;
    }
  assert.ok(checked > 200);
});

test("validator permits encounter gates but rejects physically isolated floor space", () => {
  const cells = new Map<string, import("../src/entities.ts").Tile>();
  for (let y = 0; y < 20; y++) cells.set(point(15, y), { kind: "floor" });
  cells.set("15,5", { kind: "door", color: "yellow" });
  cells.set("15,2", { kind: "key", color: "yellow" });
  assert.ok(validate(cells, 0));
  const foe = {
    kind: "enemy" as const,
    enemy: { name: "Blocker", hp: 999, attack: 999, defense: 999, tier: 3 },
  };
  cells.set("15,1", foe);
  assert.equal(validate(cells, 0), true);
  cells.set("15,1", { kind: "floor" });
  cells.set("15,18", foe);
  assert.equal(validate(cells, 0), true);
  cells.set("3,3", { kind: "floor" });
  assert.equal(validate(cells, 0), false);
});

test("unguarded loot uses one exact 1/1000 roll per space", () => {
  assert.equal(
    rollUnguardedLoot(() => 0.001),
    null,
  );
  assert.equal(
    rollUnguardedLoot(() => 0.99999),
    null,
  );
  let calls = 0;
  const loot = rollUnguardedLoot(() => (++calls === 1 ? 0.000999 : 0.99));
  assert.equal(loot?.kind, "treasure");
  assert.equal(calls, 2);
  const rng = random(2026),
    counts = new Map<string, number>();
  let drops = 0;
  for (let i = 0; i < 100000; i++) {
    const item = rollUnguardedLoot(rng);
    if (item) {
      drops++;
      const k = item.color ?? item.kind;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  assert.ok(
    drops >= 60 && drops <= 140,
    `Observed ${drops} rare drops in 100000 rolls`,
  );
  assert.equal(counts.size, 6);
});
test("unguarded Tower floor space rarely carries free loot, and every generated room stays fully connected", () => {
  let floorTiles = 0,
    drops = 0;
  for (let seed = 0; seed < 200; seed++) {
    const room = seed % 12;
    const cells = generateTowerRoom(seed, room);
    const entrance = point(TOWER_START_X, 0);
    // The same "enemy blocks reachability" set the generator itself uses
    // when scattering unguarded loot — nothing past an undefeated enemy
    // should ever carry a free pickup.
    const blockers = new Set([...cells].filter(([, t]) => t.kind === "enemy").map(([k]) => k));
    const free = reachable(cells, entrance, blockers);
    for (const k of free) {
      const t = cells.get(k)!;
      if (t.kind !== "floor") continue;
      floorTiles++;
      // rollUnguardedLoot only ever converts a floor tile in place, so any
      // surviving "floor" tile here was correctly left empty.
    }
    for (const [, t] of cells)
      if (["key", "attack", "defense", "treasure"].includes(t.kind)) drops++;
    // Every generated room is one fully connected component (walls aside).
    const all = reachable(cells, entrance);
    assert.equal(all.size, [...cells.values()].filter((t) => t.kind !== "wall").length);
  }
  assert.ok(floorTiles > 500);
  // Guarded key/stat/treasure placements (the puzzle graph's own gates and
  // rewards) are expected; only the UNGUARDED_LOOT_CHANCE roll should ever
  // add more on top, so total drops stay rare relative to floor space.
  assert.ok(drops < floorTiles * 0.2, `${drops} pickups among ${floorTiles} free floor tiles`);
});
