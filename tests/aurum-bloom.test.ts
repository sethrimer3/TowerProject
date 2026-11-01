// Aurum Bloom (docs/agents/arcana.md) and the floor environments it raises
// (docs/agents/environments.md): the Golden Floor's and Stellar Floor's pay on
// Gold and Silver alike, the chances it adds, and the Stellar Floor's stars.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANA, decodeArcana, valuesAt } from "../src/arcana/arcana.ts";
import { environmentOn, hasEnvironment, withBloom, type FloorBloom } from "../src/environments.ts";
import { goldMultipliers } from "../src/economy/gold-multipliers.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { MAX_LIFE_MS, MIN_LIFE_MS, starAt, starHue } from "../src/render/stellar-stars.ts";
import { Game } from "../src/state.ts";
import { snap } from "../src/exact.ts";
import { defaults } from "../src/save/save.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy } from "../src/entities.ts";

const FLOORS = Array.from({ length: 2000 }, (_, i) => i + 1);
const foe = { strength: "normal", hp: 1, attack: 1, defense: 0 } as Enemy;

const inside = (seed = 7, mode: "tower" | "delve" = "tower") => {
  const save = defaults();
  save.themes = [];
  const g = new Game(save);
  if (mode === "delve") g.switchMode("delve");
  g.newRun({ seed });
  return g;
};

test("Aurum Bloom's tables hold the spec's ends and sizes, each cost rising", () => {
  const [bonus, chance, stellar] = ARCANA.aurumBloom.attributes;
  assert.deepEqual([bonus.steps.length, bonus.steps[0], bonus.steps[1], bonus.steps[20]], [21, [5, 0], [5.8, 5], [21, 2000]]);
  assert.deepEqual([chance.steps.length, chance.steps[0], chance.steps[1], chance.steps[38]], [39, [5, 0], [5.5, 5], [24, 1748]]);
  assert.deepEqual([stellar.steps.length, stellar.steps[0], stellar.steps[1], stellar.steps[19]], [20, [0.5, 0], [1, 10], [10, 644]]);
  for (const a of ARCANA.aurumBloom.attributes) for (let i = 1; i < a.steps.length; i++) assert.ok(a.steps[i]![1] > a.steps[i - 1]![1] && a.steps[i]![0] > a.steps[i - 1]![0], `${a.name} ${i}`);
  assert.deepEqual([bonus.name, chance.name, stellar.name], ["Bonus", "Golden Chance", "Stellar Chance"]);
  assert.deepEqual([bonus.shown(5), chance.shown(5.5), stellar.shown(0.5)], ["5.0×", "5.5%", "0.5%"]);
});

test("a save keeps Aurum Bloom's levels up to its highest", () => {
  assert.deepEqual(decodeArcana({ owned: { aurumBloom: [20, 38, 19] } }).owned.aurumBloom, [20, 38, 19]);
  assert.equal(decodeArcana({ owned: { aurumBloom: [21, 0, 0] } }).owned.aurumBloom, undefined);
});

test("all Silver found on a Golden Floor is multiplied by its bonus, and a plain floor's isn't", () => {
  const g = inside();
  g.save.upgrades.goldenFloors = 1;
  g.run.goldenFloor = 50;
  const golden = FLOORS.find((f) => hasEnvironment(g.run, "golden", f))!, plain = FLOORS.find((f) => !hasEnvironment(g.run, "golden", f))!;
  const purse = (floor?: number) => new RunPurse(g.save, "tower", g.run, () => 0.5, 0, () => 0.5, floor === undefined ? undefined : () => floor);
  const base = purse().silver(10);
  assert.equal(purse(golden).silverAt(10, 0, 0), base * 2);
  assert.equal(purse(golden).silverHere(10), base * 2);
  assert.equal(purse(plain).silverAt(10, 0, 0), base);
  assert.equal(purse(golden).killSilver(foe, 1, 1, { x: 0, y: 0 }), purse().killSilver(foe, 1) * 2);
  assert.equal(purse(plain).killSilver(foe, 1, 1, { x: 0, y: 0 }), purse().killSilver(foe, 1));
});

test("the Gold and Silver of climbing onto a floor, Interest with them, count that floor's multipliers", () => {
  const g = inside();
  g.save.upgrades.goldenFloors = 1;
  g.run.goldenFloor = 50;
  g.save.upgrades.wishingWell = 1;
  g.save.training.floorSilver = 1;
  const golden = FLOORS.find((f) => hasEnvironment(g.run, "golden", f))!, plain = FLOORS.find((f) => !hasEnvironment(g.run, "golden", f))!;
  const purse = new RunPurse(g.save, "tower", g.run, () => 0.5, 0);
  const well = purse.floorSilver(plain);
  assert.ok(well > 0, "Wishing Well pays");
  assert.equal(purse.floorSilver(golden), well * 2);
  g.save.archives.levels.interest = 10;
  for (const [floor, times] of [[plain, 1], [golden, 2]] as const) {
    g.run.silver = 1000;
    const cap = purse.interestCap, paid = purse.interest(floor);
    assert.ok(paid > 0, "Interest pays");
    assert.equal(purse.maxInterest(floor), snap(cap * times));
    g.run.silver = 1000;
    g.run.goldenFloor = 0;
    const flat = purse.interest(floor);
    g.run.goldenFloor = 50;
    assert.equal(paid, snap(flat * times), `Interest ×${times}`);
  }
});

test("a Stellar Floor pays ten times over, and a Golden Stellar Floor both bonuses multiplied", () => {
  const g = inside(), bloom: FloorBloom = { bonus: 5, chance: 30, stellar: 30 };
  const env = withBloom(g.run, bloom);
  const has = (id: "golden" | "stellar", f: number) => hasEnvironment(env, id, f);
  const stellar = FLOORS.find((f) => has("stellar", f) && !has("golden", f))!, both = FLOORS.find((f) => has("stellar", f) && has("golden", f))!, gold = FLOORS.find((f) => has("golden", f) && !has("stellar", f))!;
  const purse = (floor: number) => new RunPurse(g.save, "tower", g.run, () => 0.5, 0, () => 0.5, () => floor, bloom);
  const plain = new RunPurse(g.save, "tower", g.run, () => 0.5, 0);
  const pays = (p: RunPurse, x: number) => [p.silverAt(10, x, 0), p.badgeGold(`badge:${x}`, 10), p.pickupGold(x, 3, 4)];
  const base = pays(plain, 0);
  assert.deepEqual(pays(purse(stellar), 1), base.map((n) => n * 10), "×10");
  assert.deepEqual(pays(purse(gold), 2), base.map((n) => n * 5), "Aurum Bloom alone: ×5");
  assert.deepEqual(pays(purse(both), 3), base.map((n) => n * 50), "×5 × ×10");
  g.save.upgrades.goldenFloors = 1;
  assert.deepEqual(pays(purse(gold), 4), base.map((n) => n * 6), "with Golden Floors: ×6");
  assert.deepEqual(pays(purse(both), 5), base.map((n) => n * 60), "×6 × ×10");
});

test("Aurum Bloom's Bonus and Golden Chance add to the skill's and its research's", () => {
  const g = inside(), bloom: FloorBloom = { bonus: 5.8, chance: 5, stellar: 0.5 };
  g.run.goldenFloor = 3.5;
  g.save.archives.levels.goldenFloorMultiplier = 1;
  assert.deepEqual(withBloom(g.run, bloom).goldenFloor, 8.5);
  assert.deepEqual(withBloom(g.run, bloom).stellarFloor, 0.5);
  assert.equal(withBloom(g.run, undefined), g.run, "without it, the run's own");
  const floor = FLOORS.find((f) => environmentOn("golden", g.run.seed, f, 3.5))!;
  const golden = (with_?: FloorBloom) => new RunPurse(g.save, "tower", g.run, () => 0.5, 0, () => 0.5, () => floor, with_).golden(floor);
  assert.equal(golden(bloom), 5.8, "without the skill, its Bonus alone, whatever the research");
  g.save.upgrades.goldenFloors = 1;
  assert.equal(golden(), 2.1, "the skill and its research alone");
  assert.equal(golden(bloom), 6.9, "×2.1 + 4.8 more, on the grid");
});

for (const mode of ["tower", "delve"] as const)
  test(`a ${mode} run holding Aurum Bloom has its floors, until it is toggled off; a level counts at once`, () => {
    const g = inside(7, mode);
    assert.equal(g.environments.stellarFloor, undefined, "none unowned");
    g.save.arcana.owned.aurumBloom = [0, 0, 0];
    assert.deepEqual([g.environments.goldenFloor, g.environments.stellarFloor], [5, 0.5]);
    g.save.arcana.owned.aurumBloom = [2, 38, 19];
    assert.deepEqual([g.environments.goldenFloor, g.environments.stellarFloor], [24, 10]);
    assert.deepEqual(g.floorEnvironments.map((e) => [e.name, e.chance]), [["Golden Floor", 24], ["Stellar Floor", 10]]);
    assert.ok(g.arcana.toggle("aurumBloom"));
    assert.equal(g.environments.stellarFloor, undefined, "off: none");
    assert.deepEqual(g.floorEnvironments, []);
    assert.equal(g.purse.stellar(1), 1);
    assert.ok(g.arcana.toggle("aurumBloom"));
    assert.deepEqual(g.environments.stellarFloor, 10);
  });

test("undo leaves Aurum Bloom's floors as they stand, and its switch", () => {
  const g = inside();
  g.save.upgrades.inspirationUndos = 1;
  g.newRun({ seed: 7 });
  g.save.arcana.owned.aurumBloom = [0, 38, 19];
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  Object.assign(g.run.player, { x: 0, y: 0, hp: 100, maxHp: 100 });
  assert.ok(g.move(1, 0));
  assert.ok(g.arcana.toggle("aurumBloom"));
  assert.ok(g.undo());
  assert.equal(g.environments.stellarFloor, undefined, "still off");
  assert.ok(g.arcana.toggle("aurumBloom"));
  assert.deepEqual([g.environments.goldenFloor, g.environments.stellarFloor], [24, 10]);
});

test("a Stellar Floor shows in the All Gold Bonuses box with Aurum Bloom, and a lent one counts at its first levels", () => {
  const g = inside();
  const lines = () => goldMultipliers(g.goldContext).filter((m) => m.id === "golden" || m.id === "stellar");
  assert.deepEqual(lines(), []);
  g.save.arcana.owned.aurumBloom = [0, 0, 19];
  assert.deepEqual(lines().map((m) => m.id), ["golden", "stellar"]);
  g.arcana.aurumBloom = () => ({ bonus: 5, chance: 100, stellar: 100 });
  assert.deepEqual(lines().map((m) => m.factor), [5, 10]);
  const lent = inside();
  lent.towerRun.shrine = { arcana: ["aurumBloom"] } as never;
  assert.deepEqual(lent.arcana.aurumBloom(), { bonus: 5, chance: 5, stellar: 0.5 });
  assert.deepEqual(valuesAt("aurumBloom", [0, 0, 0]), [5, 5, 0.5]);
});

test("the board shows a Stellar Floor where the hero's own pay reads one", () => {
  const g = inside();
  assert.equal(g.stellarAt(0, 0), false, "none without the chance");
  g.arcana.aurumBloom = () => ({ bonus: 0, chance: 0, stellar: 100 });
  assert.equal(g.stellarAt(0, 0), true);
  assert.equal(g.goldenAt(0, 0), false, "Stellar alone isn't golden");
  const delve = inside(7, "delve");
  delve.arcana.aurumBloom = () => ({ bonus: 0, chance: 0, stellar: 50 });
  const world = delve.world, seen = new Set<boolean>();
  for (let y = 0; y < 200; y++) for (let x = 0; x < world.width; x++) if (world.tile(x, y).kind !== "wall") seen.add(delve.stellarAt(x, y));
  assert.deepEqual([...seen].sort(), [false, true], "Delve floors roll apart");
});

test("a star grows from a point and shrinks to one over one to two seconds, in one spot, turning slowly", () => {
  // Every star over a stretch of a tile's clock, followed from birth to death.
  let stars = 0;
  for (let x = 0; x < 40; x++) {
    let last: ReturnType<typeof starAt> = null, born = 0;
    for (let now = 0; now < 40_000; now += 10) {
      const star = starAt(x, 3, now);
      if (star && !last) born = now;
      if (star && last) {
        assert.equal(star.px, last.px, "it stays where it appeared");
        assert.equal(star.py, last.py);
        const turned = star.turn - last.turn;
        assert.ok(turned > 0 && turned < 0.01, `slow turn: ${turned}`);
      }
      if (!star && last && born) {
        const lived = now - born;
        assert.ok(lived >= MIN_LIFE_MS - 20 && lived <= MAX_LIFE_MS + 20, `lived ${lived}`);
        assert.ok(last.reach < 0.05, "shrinks to a point");
        stars++;
      }
      if (star && !last && born) assert.ok(star.reach < 0.05 || now === 0, "grows from a point");
      last = star;
    }
  }
  assert.ok(stars > 40, `saw ${stars}`);
});

test("about one tile in ten shows a star at any moment, each wherever it fell, all one hue", () => {
  let showing = 0, tiles = 0;
  const spots = new Set<string>();
  for (let x = 0; x < 30; x++)
    for (let y = 0; y < 30; y++) {
      tiles++;
      const star = starAt(x, y, 12_345);
      if (star) {
        showing++;
        spots.add(`${star.px},${star.py}`);
      }
    }
  assert.ok(showing / tiles > 0.05 && showing / tiles < 0.15, `${showing} of ${tiles}`);
  assert.equal(spots.size, showing);
  assert.ok(starHue(1000) !== starHue(0));
  assert.ok(starHue(3000) < 1e-9, "the hue comes round");
});
