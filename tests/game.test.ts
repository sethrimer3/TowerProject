import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  random,
  rollUnguardedLoot,
  validate,
  reachable,
  World,
  LAYOUT_VERSION,
} from "../src/generation.ts";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { predict } from "../src/combat.ts";
import { chooseStep } from "../src/automation.ts";
import { point } from "../src/entities.ts";
test("500 deterministic chunks connect from entrance to exit", () => {
  for (let seed = 0; seed < 10; seed++)
    for (let i = 0; i < 50; i++) {
      const a = generate(seed, i);
      assert.ok(validate(a, i * 20));
      assert.deepEqual(a, generate(seed, i));
      assert.notEqual(a.get(point(15, i * 20))?.kind, "wall");
    }
});
test("combat uses first strike, defenses, and strict survival", () => {
  const p = new Game(defaults()).run.player;
  assert.deepEqual(
    predict(p, { name: "test", hp: 25, attack: 10, defense: 0, tier: 0 }),
    { hit: 12, turns: 3, damage: 10, survivable: true },
  );
  p.hp = 10;
  assert.equal(
    predict(p, { name: "test", hp: 25, attack: 10, defense: 0, tier: 0 })
      .survivable,
    false,
  );
});
test("doors consume matching keys; pickups and walls obey movement", () => {
  const g = new Game(defaults()),
    p = g.run.player;
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
test("lethal combat blocked unless deliberate, death awards once and upgrades persist", () => {
  const g = new Game(defaults());
  g.world.changes["15,1"] = {
    kind: "enemy",
    enemy: { name: "doom", hp: 999, attack: 999, defense: 999, tier: 3 },
  };
  assert.equal(g.move(0, 1), false);
  assert.equal(g.summary, null);
  g.move(0, 1, true);
  assert.ok(g.summary);
  assert.equal(g.save.run, null);
  const earned = g.save.essence;
  g.finish("again");
  assert.equal(g.save.essence, earned);
  g.save.essence = 100;
  assert.ok(g.buy("hp"));
  g.summary = null;
  g.newRun();
  assert.equal(g.run.player.maxHp, 140);
});
test("automation climbs purposefully, never takes lethal fights, bounds chunk memory", () => {
  const g = new Game(defaults());
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
  g.move(0, 1);
  const restored = decode(JSON.stringify(g.save));
  assert.equal(restored.run?.player.y, 1);
  for (const raw of [
    "oops",
    "null",
    '{"version":0}',
    '{"version":1,"run":{"player":null}}',
  ])
    assert.equal(decode(raw).run, null);
  const bad = JSON.parse(JSON.stringify(g.save));
  bad.run.player.keys = null;
  assert.equal(decode(JSON.stringify(bad)).run, null);
});
test("density does not alter world or run; chunk boundaries stay traversable", () => {
  const g = new Game(defaults());
  const tiles = Array.from(g.world.chunks.entries());
  for (const density of [16, 24, 30, 20]) {
    g.save.settings.density = density;
    assert.equal(g.run.player.x, 15);
    assert.deepEqual(Array.from(g.world.chunks.entries()), tiles);
  }
  const w = new World(42, {});
  for (let y = 0; y < 400; y += 20) {
    assert.equal(w.tile(15, y).kind, "stairs");
    assert.equal(w.tile(15, y + 19).kind, "stairs");
  }
});

test("each door is a separating choke point, and keys solve every room without starting inventory", () => {
  for (let seed = 0; seed < 60; seed++) {
    const cells = generate(seed, seed % 7),
      base = (seed % 7) * 20,
      start = point(15, base);
    const doors = [...cells].filter(([, t]) => t.kind === "door");
    assert.ok(doors.length >= 1);
    const all = reachable(cells, start);
    for (const [k] of doors) {
      const [x, y] = k.split(",").map(Number);
      const neighbors = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx, dy]) => {
        const t = cells.get(point(x + dx, y + dy));
        return t && t.kind !== "wall";
      });
      assert.equal(neighbors.length, 2, "Door must fit a one-tile passage");
      assert.ok(
        reachable(cells, start, new Set([k])).size < all.size - 1,
        "Door has a bypass",
      );
    }
    // Open available doors in reverse order, independent of generator validation order.
    const closed = new Set(doors.map(([k]) => k)),
      collected = new Set<string>(),
      keys = { yellow: 0, blue: 0, red: 0 };
    while (closed.size) {
      const area = reachable(cells, start, closed);
      for (const k of area) {
        const t = cells.get(k)!;
        if (t.kind === "key" && !collected.has(k)) {
          keys[t.color!]++;
          collected.add(k);
        }
      }
      const next = [...doors].reverse().find(([k, t]) => {
        const [x, y] = k.split(",").map(Number);
        return (
          closed.has(k) &&
          keys[t.color!] > 0 &&
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => area.has(point(x + dx, y + dy)))
        );
      });
      assert.ok(next, "Keys cannot be trapped behind their own doors");
      keys[next[1].color!]--;
      closed.delete(next[0]);
    }
    assert.equal(reachable(cells, start, closed).size, all.size);
  }
});
test("old runs safely migrate topology while retaining earned stats and permanent progress", () => {
  const save = defaults(),
    g = new Game(save);
  g.run.layoutVersion = undefined;
  g.run.player.y = 27;
  g.run.height = 29;
  g.run.player.attack = 40;
  g.run.changes["15,25"] = { kind: "floor" };
  save.essence = 19;
  save.upgrades.hp = 2;
  const migrated = new Game(decode(JSON.stringify(save)));
  assert.equal(migrated.run.layoutVersion, LAYOUT_VERSION);
  assert.equal(migrated.run.player.y, 20);
  assert.equal(migrated.run.player.attack, 40);
  assert.equal(migrated.run.height, 29);
  assert.equal(migrated.save.essence, 19);
  assert.equal(migrated.save.upgrades.hp, 2);
  assert.deepEqual(migrated.run.changes, {});
  assert.equal(migrated.world.tile(15, 20).kind, "stairs");
});
test("automation can backtrack through chamber layouts across fixed seeds", () => {
  for (let seed = 0; seed < 12; seed++) {
    const g = new Game(defaults());
    g.run.seed = seed;
    g.world = new World(seed, g.run.changes);
    for (let i = 0; i < 1400 && g.run.height < 40; i++) {
      const step = chooseStep(g);
      if (!step) break;
      assert.ok(g.move(step.dx, step.dy));
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

test("manual player reaches successive exits with zero starting keys and guarded progression", () => {
  for (let seed = 0; seed < 50; seed++) {
    const g = new Game(defaults());
    g.run.seed = seed;
    g.world = new World(seed, g.run.changes);
    // Exercise the real movement / pickup / lock code, not a flood fill that
    // assumes doors or enemies are passable. Four complete sections per seed.
    for (let y = 1; y <= 80; y++)
      assert.ok(
        g.move(0, 1),
        `Seed ${seed} blocks the ascent before height ${y}`,
      );
    assert.equal(g.run.height, 80);
    assert.ok(g.run.player.hp > 0);
    assert.equal(g.run.kills, 4);
  }
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
test("unguarded spaces never contain routine keys or equipment; room floors remain connected", () => {
  let eligible = 0,
    drops = 0;
  for (let seed = 0; seed < 300; seed++) {
    const cells = generate(seed, 0),
      blocked = new Set(
        [...cells]
          .filter(([, t]) => t.kind === "door" || t.kind === "enemy")
          .map(([k]) => k),
      );
    const area = reachable(cells, "15,0", blocked);
    assert.ok(!area.has("15,3"), "Essential key must be guarded");
    assert.ok(!area.has("15,19"), "Exit must remain gated");
    for (const k of area) {
      const t = cells.get(k)!;
      if (t.kind === "stairs") continue;
      eligible++;
      if (["key", "attack", "defense", "treasure"].includes(t.kind)) drops++;
      else assert.equal(t.kind, "floor");
    }
    const all = reachable(cells, "15,0");
    assert.equal(
      all.size,
      [...cells.values()].filter((t) => t.kind !== "wall").length,
    );
  }
  assert.ok(eligible > 1000);
  assert.ok(drops < 10, `${drops} free drops among ${eligible} spaces`);
});
