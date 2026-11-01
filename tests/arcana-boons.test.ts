// Augment boons (docs/agents/arcana.md): one Shrine boon per arcanum, offered once a
// run while the run holds that arcanum, bought or lent, each strengthening it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANUM_IDS, valuesAt, type ArcanumId } from "../src/arcana/arcana.ts";
import { fieldsOn, frostArea } from "../src/arcana/necrotic-frost.ts";
import { ghostOffset, ghostsOut, loseGhost, OUTER_GHOSTS, OUTER_RADIUS, outerDirection, phantasmEffects, RING_RADIUS, stepPhantasm, validPhantasm } from "../src/arcana/phantasm.ts";
import { stepLifespring } from "../src/arcana/lifespring.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { random } from "../src/random.ts";
import { augmentOf, boon, BOON_IDS, boonEffects, pickedLines, rollOffer, validShrineRun, type BoonId, type ShrineRun } from "../src/shrines.ts";
import { ghostStrikes, type VolleyTurn } from "../src/volley.ts";
import type { TowerRun } from "../src/runs.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const AUGMENTS = BOON_IDS.filter((id) => boon(id).kind === "augment");

/** A Tower run inside holding each of `owned`, with `picked` boons. */
function runWith(owned: readonly ArcanumId[], picked: readonly BoonId[] = [], lent: readonly ArcanumId[] = []) {
  const save = defaults();
  for (const id of owned) save.arcana.owned[id] = [0, 0, 0];
  const g = new Game(save, random(5));
  g.newRun({ seed: 7 });
  (g.run as TowerRun).shrine = { picked: [...picked], rolls: 0, ...(lent.length ? { arcana: [...lent] } : {}) };
  return g;
}

/** Every boon `run` can be offered, over many offers. */
function offered(run: ShrineRun, owned: readonly ArcanumId[], seeds = 400) {
  const save = defaults();
  for (const id of owned) save.arcana.owned[id] = [0, 0, 0];
  const seen = new Set<BoonId>();
  for (let seed = 1; seed <= seeds; seed++) for (const id of rollOffer(seed, { ...run, rolls: 0 }, save)) seen.add(id);
  return seen;
}

test("every arcanum has one augment boon, once a run, without research's strength or a PNG", () => {
  assert.equal(AUGMENTS.length, ARCANUM_IDS.length);
  for (const id of ARCANUM_IDS) {
    const def = boon(augmentOf(id));
    assert.ok(def.kind === "augment" && def.arcanum === id);
    assert.equal(def.max, 1);
    assert.equal(def.label(5), def.name);
  }
  assert.deepEqual(boonEffects(AUGMENTS, { archives: defaults().archives }), boonEffects([], { archives: defaults().archives }));
});

test("an augment boon is offered only while the run holds its arcanum, bought or lent", () => {
  assert.ok(!AUGMENTS.some((id) => offered({ picked: [], rolls: 0 }, []).has(id)));
  const owned = offered({ picked: [], rolls: 0 }, ["thunderbolt"]);
  assert.deepEqual(AUGMENTS.filter((id) => owned.has(id)), ["augmentThunderbolt"]);
  const lent = offered({ picked: ["unlockArcanum"], rolls: 0, arcana: ["voidwell"] }, []);
  assert.deepEqual(AUGMENTS.filter((id) => lent.has(id)), ["augmentVoidwell"]);
});

test("an augment boon is offered once a run, and never while banned", () => {
  assert.ok(!offered({ picked: ["augmentThunderbolt"], rolls: 0 }, ["thunderbolt"]).has("augmentThunderbolt"));
  const save = defaults();
  save.archives.levels = { ...save.archives.levels, banBoons: 1 };
  save.arcana.owned.thunderbolt = [0, 0, 0];
  save.shrines.banned = ["augmentThunderbolt"];
  for (let seed = 1; seed <= 400; seed++) assert.ok(!rollOffer(seed, { picked: [], rolls: 0 }, save).includes("augmentThunderbolt"));
});

test("with no arcana the offers are what they were: same boons, same draws", () => {
  const save = defaults();
  const run: ShrineRun = { picked: [], rolls: 0 };
  const offer = rollOffer(11, run, save);
  assert.ok(offer.every((id) => boon(id).kind !== "augment"));
  assert.ok(run.rolls > 0);
});

test("owning every arcanum still leaves the arcana's slot, for the augment boons", () => {
  const seen = offered({ picked: [], rolls: 0 }, ARCANUM_IDS);
  assert.ok(!seen.has("unlockArcanum"));
  assert.ok(AUGMENTS.every((id) => seen.has(id)));
});

test("a saved run keeps its augment boons, and the taken list reads them", () => {
  const run: ShrineRun = { picked: ["augmentOverseer"], rolls: 2 };
  assert.ok(validShrineRun(run));
  assert.deepEqual(pickedLines(run.picked, { archives: defaults().archives }), [{ id: "augmentOverseer", count: 1, text: "Overseer: ×1.5 ATK" }]);
});

test("Ricochet Shot ×2 multiplies its ATK Mult", () => {
  const plain = runWith(["ricochetShot"]).arcana.ricochet()!, up = runWith(["ricochetShot"], ["augmentRicochetShot"]).arcana.ricochet()!;
  assert.equal(up.boost, plain.boost * 2);
  assert.equal(up.rebounds, plain.rebounds);
  assert.equal(up.chance, plain.chance);
});

test("Overseer ×1.5 multiplies its Bonus", () => {
  const g = runWith(["overseer"], ["augmentOverseer"]);
  g.save.arcana.owned.overseer = [1, 0, 0];
  assert.equal(g.arcana.beams!.bonus, valuesAt("overseer", [1, 0, 0])[0] * 1.5);
  assert.equal(g.arcana.beams!.width, 30);
});

test("Thunderbolt's +4 bolts come with every activation", () => {
  const g = runWith(["thunderbolt"], ["augmentThunderbolt"]);
  assert.equal(g.arcana.thunderbolt()!.bolts, 9);
  assert.equal(g.arcana.chargeBolts(["thunderbolt"])!.bolts, 9);
  assert.equal(runWith(["thunderbolt"]).arcana.thunderbolt()!.bolts, 5);
});

test("Lifespring's +1 Effect Wave comes with every activation", () => {
  const rule = runWith(["lifespring"], ["augmentLifespring"]).arcana.lifespringRule()!;
  assert.equal(rule.waves, 2);
  const firing: { timer: number } = { timer: 1 };
  const out = [1, 2, 3, 4, 5].map(() => stepLifespring(firing, { waves: rule.waves, turns: 1000, amount: 1 }).wave ?? false);
  assert.deepEqual(out, [true, false, false, false, true]);
});

test("Time Dilation's and Voidwell's durations grow, their cooldowns don't", () => {
  const dilation = runWith(["timeDilation"], ["augmentTimeDilation"]).arcana.timeDilationRule()!;
  assert.deepEqual([dilation.duration, dilation.turns], [10, 180]);
  const well = runWith(["voidwell"], ["augmentVoidwell"]).arcana.voidwellRule()!;
  assert.deepEqual([well.duration, well.turns, well.radius], [27, 200, 3]);
});

test("the run's cards and information read the augmented values", () => {
  const g = runWith(["timeDilation", "thunderbolt"], ["augmentTimeDilation"]);
  const held = g.arcana.held.find((h) => h.id === "timeDilation")!;
  assert.equal(g.arcana.cardValue(held).text, "20% · 10 turns");
  assert.deepEqual(g.arcana.valuesOf(held), [10, 20, 180]);
  assert.equal(g.arcana.cooldown(held)!.turns, 180);
  assert.equal(g.arcana.augmented("thunderbolt"), false);
});

test("Necrotic Frost ×1.5 widens each field's reach", () => {
  const plain = runWith(["necroticFrost"]).arcana.frostRule()!, up = runWith(["necroticFrost"], ["augmentNecroticFrost"]).arcana.frostRule()!;
  assert.equal(up.effects.radius, plain.effects.radius * 1.5);
  assert.equal(up.effects.offset, plain.effects.offset);
  const fields = [{ id: 1, angle: 0, left: 5 }];
  // The field's center lies a tile up the board: 4 tiles above that is out of 3's reach and in 4.5's.
  assert.deepEqual(fieldsOn(frostArea(fields, plain.effects), 0, 5), []);
  assert.deepEqual(fieldsOn(frostArea(fields, up.effects), 0, 5), [1]);
});

test("Aurum Bloom ×1.5 multiplies the Golden Floor's whole factor, its other sources included", () => {
  const g = runWith(["aurumBloom"], ["augmentAurumBloom"]), plain = runWith(["aurumBloom"]);
  g.save.upgrades.goldenFloors = 1;
  plain.save.upgrades.goldenFloors = 1;
  const purse = (game: Game) => new RunPurse(game.save, game.mode, game.run, () => 0, 0, undefined, () => 1, game.arcana.aurumBloom());
  const floor = Array.from({ length: 2000 }, (_, i) => i + 1).find((f) => plain.purse.golden(f) > 1)!;
  const before = purse(plain).golden(floor), after = purse(g).golden(floor);
  assert.ok(before > 1);
  assert.equal(after, before * 1.5);
  assert.equal(g.arcana.aurumBloom()!.chance, plain.arcana.aurumBloom()!.chance);
});

test("Phantasm's augment fills an outer ring of five with every activation, the inner ring as it was", () => {
  const rule = runWith(["phantasm"], ["augmentPhantasm"]).arcana.phantasmRule()!;
  assert.equal(rule.outer, OUTER_GHOSTS);
  assert.equal(runWith(["phantasm"]).arcana.phantasmRule()!.outer, undefined);
  const s = { timer: 1 } as Parameters<typeof stepPhantasm>[0];
  assert.equal(stepPhantasm(s, rule), true);
  assert.deepEqual(s.ghosts, [0, 1, 2]);
  assert.deepEqual(s.outer, [0, 1, 2, 3, 4]);
  assert.ok(validPhantasm(s));
  assert.ok(!validPhantasm({ ...s, outer: [5] }));
  assert.ok(!validPhantasm({ ...s, outer: [1, 1] }));
  loseGhost(s, 2, true);
  assert.deepEqual([s.ghosts, s.outer], [[0, 1, 2], [0, 1, 3, 4]]);
  assert.equal(ghostsOut(s).length, 7);
  // Every gap fills again.
  s.timer = 1;
  stepPhantasm(s, rule);
  assert.deepEqual(s.outer, [0, 1, 2, 3, 4]);
});

test("the outer ring turns the other way, a tile farther out, evenly spaced", () => {
  const spin = phantasmEffects(null).spin;
  assert.equal(outerDirection(0, 0, spin), 0);
  assert.equal(outerDirection(1, 0, spin), 36_000 - spin);
  assert.equal(outerDirection(0, 1, spin), 7200);
  assert.equal(outerDirection(36_000, 0, spin), 0);
  for (const turns of [0, 1, 359, 361, 100_000]) for (let slot = 0; slot < OUTER_GHOSTS; slot++) {
    const d = outerDirection(turns, slot, spin, 50);
    assert.ok(d >= 0 && d < 36_000, `${turns}:${slot}: ${d}`);
  }
  const off = ghostOffset(0, OUTER_RADIUS);
  assert.ok(Math.abs(off.y - OUTER_RADIUS) < 1e-9 && OUTER_RADIUS === RING_RADIUS + 1);
});

const brute: Enemy = { name: "Brute", hp: 1_000_000, attack: 0, defense: 0, tier: 1, strength: "weak" };
function board(spots: readonly (readonly [number, number])[]) {
  const cells = new Map<string, Tile>(spots.map(([x, y]) => [`${x},${y}`, { kind: "enemy", enemy: { ...brute } }]));
  return {
    tile: (x: number, y: number): Tile => cells.get(`${x},${y}`) ?? { kind: "floor" },
    clear: (x: number, y: number) => void cells.delete(`${x},${y}`),
    wound: (x: number, y: number, damage: number) => {
      const t = cells.get(`${x},${y}`)!;
      t.enemy = { ...t.enemy!, hp: t.enemy!.hp - damage };
    },
    floorEnemies: () => [],
  } as unknown as VolleyTurn["board"];
}
const hero = { x: 4, y: 4, attack: 100, defense: 0, hp: 100, maxHp: 100 } as Player;
const rule = { boost: 10, blast: phantasmEffects(null).blast, spin: phantasmEffects(null).spin };

test("an outer ghost strikes what it touches two tiles out, and only it is lost", () => {
  // Straight up the board two tiles: under the outer ring's first ghost, out of the inner ring's reach.
  const s = { turns: 1, ring: 1, ghosts: [0], outer: [0, 1, 2, 3, 4] };
  const out = ghostStrikes({ board: board([[4, 6]]), wrap: 0, hero }, rule, s, 100);
  assert.equal(out.shots.length, 1);
  assert.deepEqual(s.ghosts, [0]);
  assert.deepEqual(s.outer, [1, 2, 3, 4]);
  assert.equal(out.struck[0]!.radius, OUTER_RADIUS);
});

test("with only outer ghosts left, they go on striking; without any, nothing does", () => {
  const s: Parameters<typeof ghostStrikes>[2] = { turns: 1, outer: [0] };
  assert.equal(ghostStrikes({ board: board([[4, 6]]), wrap: 0, hero }, rule, s, 100).shots.length, 1);
  assert.equal(s.outer, undefined);
  assert.equal(ghostStrikes({ board: board([[4, 6]]), wrap: 0, hero }, rule, s, 100).shots.length, 0);
});

test("without an outer ring a ghost's reach is what it was: an enemy two tiles out is safe", () => {
  const s = { turns: 1, ring: 1, ghosts: [0] };
  assert.equal(ghostStrikes({ board: board([[4, 6]]), wrap: 0, hero }, rule, s, 100).shots.length, 0);
  assert.deepEqual(s.ghosts, [0]);
});

test("switching Phantasm off loses both rings; the game shows both while on", () => {
  const g = runWith(["phantasm"], ["augmentPhantasm"]);
  g.run.phantasm = { turns: 3, timer: 5, ring: 3, ghosts: [0], outer: [1, 4] };
  assert.deepEqual(g.phantasms, { ghosts: [0], ring: 3, turns: 3, spin: rule.spin, outer: [1, 4] });
  g.run.phantasm = { turns: 3, timer: 5, outer: [1] };
  assert.deepEqual(g.phantasms, { ghosts: [], ring: 1, turns: 3, spin: rule.spin, outer: [1] });
  g.arcana.toggle("phantasm");
  assert.equal(g.run.phantasm.outer, undefined);
  assert.equal(g.phantasms, undefined);
});

test("a saved run's outer ghosts survive a reload", () => {
  const g = runWith(["phantasm"], ["augmentPhantasm"]);
  g.run.phantasm = { turns: 3, timer: 5, ring: 3, ghosts: [0], outer: [1, 4] };
  const back = decode(JSON.stringify(g.save));
  assert.deepEqual(back.tower.run!.phantasm!.outer, [1, 4]);
  assert.deepEqual((back.tower.run as TowerRun).shrine!.picked, ["augmentPhantasm"]);
});

test("a lent arcanum's boon works at its first levels", () => {
  const g = runWith([], ["unlockArcanum", "augmentThunderbolt"], ["thunderbolt"]);
  assert.equal(g.arcana.thunderbolt()!.bolts, 9);
  assert.equal(g.arcana.held[0]!.lent, true);
});

test("an arcanum in a run with no shrine (a Delve run) is never augmented", () => {
  const save = defaults();
  save.arcana.owned.thunderbolt = [0, 0, 0];
  const g = new Game(save, random(5));
  g.switchMode("delve");
  g.newRun({ seed: 7 });
  assert.equal(g.arcana.augmented("thunderbolt"), false);
  assert.equal(g.arcana.thunderbolt()!.bolts, 5);
});

test("undo takes back a step, never an augment boon", () => {
  const save = defaults();
  save.archives.levels = { ...save.archives.levels, unlockShrines: 1 };
  save.upgrades.inspirationUndos = 1;
  save.arcana.owned.thunderbolt = [0, 0, 0];
  const g = new Game(save, random(5));
  g.newRun({ seed: 7 });
  const run = g.run as TowerRun;
  run.maxHeight = 200;
  run.shrine = { picked: [], rolls: 0, offer: ["augmentThunderbolt", "attack"] };
  const p = run.player, w = g.world as RoomWorld;
  w.cells.set(`${p.x + 1},${p.y}`, { kind: "floor" });
  g.move(1, 0);
  assert.ok(g.shrine.pick("augmentThunderbolt"));
  assert.equal(g.arcana.thunderbolt()!.bolts, 9);
  assert.ok(g.undo());
  assert.deepEqual((g.run as TowerRun).shrine!.picked, ["augmentThunderbolt"]);
  assert.equal(g.arcana.thunderbolt()!.bolts, 9);
});
