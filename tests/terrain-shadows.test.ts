import assert from "node:assert/strict";
import { test } from "node:test";
import type { Tile, Torch } from "../src/entities.ts";
import { TerrainShadows, terrainShadowField } from "../src/render/terrain-shadows.ts";
import { insidePolygon, torchReaches } from "../src/render/floor-relief.ts";
import { EntityLighting, torchShadowCaster, type ShadowCaster } from "../src/render/entity-lighting.ts";
import { DecorLayer } from "../src/render/decor/decor-render.ts";
import type { FrameContext } from "../src/render/render-frame.ts";

function room() {
  const tiles = new Map<string, Tile>();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++)
    tiles.set(`${x},${y}`, { kind: x === 4 && y !== 4 ? "wall" : "floor" });
  tiles.set("4,4", { kind: "door", color: "yellow" });
  const world = { tile: (x: number, y: number): Tile => tiles.get(`${x},${y}`) ?? { kind: "wall" } };
  const torch: Torch = { x: 2, y: 4, lightRadius: 6, baseIntensity: 0.7, active: true };
  const terrain = new TerrainShadows();
  return { tiles, world, torch, terrain, prepare: (list = [torch]) => terrain.torches({ world, torches: list }) };
}

const sample = (field: ReturnType<typeof terrainShadowField>, x: number, y: number) =>
  field.values[Math.floor((9 - y) * 12) * field.size + Math.floor(x * 12)];

test("walls and closed doors cast shadows only on open ground within the torch radius", () => {
  const { world, prepare } = room();
  const field = terrainShadowField(prepare(), world, 0, 0, 9);
  assert.equal(sample(field, 3.5, 4.5), 0, "the torch side is lit");
  assert.ok(sample(field, 5.5, 4.5) > 0.1, "a door shadows the floor behind it");
  assert.ok(sample(field, 5.5, 2.5) > 0.1, "a wall shadows the floor behind it");
  assert.equal(sample(field, 4.5, 4.5), 0, "the door itself is masked out");
  assert.equal(sample(field, 4.5, 2.5), 0, "the wall top is masked out");
  assert.equal(sample(field, 8.8, 0.2), 0, "no cast shadow beyond the light's reach");
});

test("opening and restoring a door updates the shared visibility and keeps unchanged bakes warm", () => {
  const { world, tiles, prepare } = room();
  const [closed] = prepare();
  assert.equal(torchReaches(closed, 5, 4), false);
  assert.equal(prepare()[0], closed);
  tiles.set("3,3", { kind: "potion" });
  assert.equal(prepare()[0], closed, "pickups do not invalidate geometry");
  tiles.set("4,4", { kind: "floor" });
  const [open] = prepare();
  assert.notEqual(open, closed);
  assert.equal(torchReaches(open, 5, 4), true);
  assert.equal(sample(terrainShadowField([open], world, 0, 0, 9), 5.5, 4.5), 0);
  tiles.set("4,4", { kind: "door", door: { type: "fullHp" } });
  const [restored] = prepare();
  assert.notEqual(restored, open);
  assert.equal(torchReaches(restored, 5, 4), false);
});

test("a second visible torch fills a terrain shadow and an extinguished one does not", () => {
  const { world, torch, prepare } = room();
  const other: Torch = { x: 6, y: 4, lightRadius: 6, baseIntensity: 0.7, active: true };
  const single = sample(terrainShadowField(prepare(), world, 0, 0, 9), 5.5, 4.5);
  const lit = sample(terrainShadowField(prepare([torch, other]), world, 0, 0, 9), 5.5, 4.5);
  assert.ok(single > 0);
  assert.equal(lit, 0);
  other.active = false;
  const field = terrainShadowField(prepare([torch, other]), world, 0, 0, 9);
  assert.equal(sample(field, 5.5, 4.5), single);
});

test("torch hardware casts only from another visible torch and excludes its flame", () => {
  const { torch, prepare } = room(), [light] = prepare();
  const lighting = new EntityLighting(), f = { now: 0, darkness: 0, look: { reduceMotion: true } } as FrameContext;
  const on = (caster: ShadowCaster) => lighting["lightCaster"](f, caster, light, { e: 0, w: 0, n: 0, s: 0 });
  assert.equal(on(torchShadowCaster(torch)), null, "no self-shadow");
  assert.ok(on(torchShadowCaster({ ...torch, x: 3 })), "a stand can cast from another flame");
  assert.equal(on(torchShadowCaster({ ...torch, x: 5 })), null, "no shadow from a hidden stand");
  const cleared: number[][] = [];
  const ctx = { drawImage() {}, clearRect: (...args: number[]) => cleared.push(args) } as unknown as CanvasRenderingContext2D;
  torchShadowCaster(torch).draw(ctx);
  assert.deepEqual(cleared, [[0, 0, 24, 11]]);
});

test("items, props and a moving hero behind geometry receive no cast shadow or directional torchlight", () => {
  const { prepare } = room(), [torch] = prepare();
  const lighting = new EntityLighting();
  // Test the light decision before any canvas or silhouette work is done.
  const on = (caster: ShadowCaster) => lighting["lightCaster"]({ now: 0, darkness: 0, look: { reduceMotion: true } } as FrameContext,
    caster, torch, { e: 0, w: 0, n: 0, s: 0 });
  const caster = { x: 5, y: 4, key: "item", draw() {} };
  assert.equal(on(caster), null);
  assert.ok(on({ ...caster, x: 3 }));
  assert.equal(on({ ...caster, x: 4.51, hero: true }), null);
  assert.equal(on({ ...caster, x: 3, sampleX: 5.5, sampleY: 4.5, prop: true }), null);
  assert.equal(insidePolygon(5.5, 4.5, torch.visibilityPolygon!), false);
});

test("crates, barrels and mushrooms have profiles matching their feet, and broken crates disappear", () => {
  const decor = new DecorLayer();
  decor.src = { key: "shadow-fixture", seed: 1, kind: () => "floor", torch: () => false, lush: () => 0, damp: () => 0, clutter: () => 0 };
  const plan = { crates: [
    { x: 3, y: 9, w: 8, h: 10, lift: 0, kind: "crate", tone: 0 },
    { x: 13, y: 10, w: 7, h: 9, lift: 0, kind: "barrel", tone: 1 },
  ], plants: [{ kind: "mushrooms", i: 12, j: 17, variant: 0, glow: true }] };
  decor["visibleTiles"] = () => [[2, 3, plan as never]];
  const f = { view: { left: 0, bottom: 0, n: 9, s: 24 }, now: 0, tileAt: () => ({ kind: "floor" as const }), reduceMotion: true, styledSprites: true };
  const profiles = decor.shadowCasters(f);
  assert.equal(profiles.length, 3);
  assert.deepEqual(profiles.map(p => p.base), [19, 19, 19]);
  assert.ok(profiles.every(p => p.prop));
  assert.equal(profiles[0].sampleX, 2 + 7 / 24);
  decor["effects"].isBroken = () => true;
  assert.equal(decor.shadowCasters(f).length, 1, "only the mushrooms remain");
});
