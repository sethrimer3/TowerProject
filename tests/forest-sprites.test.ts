import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ForestFoliage, planForest } from "../src/render/decor/forest-foliage.ts";
import { OutsideWorld, ENTRANCE_Y, drawEntrance, onPath, roadsOf } from "../src/outside.ts";
import { FOREST_CANOPIES, FOREST_GROUND, FOREST_LANDMARKS, FOREST_SPRITES, drawForestLandmark } from "../src/sprites/forest.ts";

test("forest art has native multi-tile crowns and huge cropped entrance bases", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/assets/style/manifest.json", import.meta.url), "utf8"));
  for (const [id, [width, height]] of Object.entries({ ...FOREST_SPRITES, ...FOREST_LANDMARKS })) {
    const bytes = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [width, height], id);
    assert.equal(!!manifest.assets[id].tile, (FOREST_GROUND as readonly string[]).includes(id));
  }
  assert.ok(FOREST_CANOPIES.every(id => FOREST_SPRITES[id][0] >= 48 && FOREST_SPRITES[id][1] >= 72));
  assert.equal(FOREST_LANDMARKS["forest-tower-base"][0] / 24, 9);
  assert.equal(FOREST_LANDMARKS["forest-mountain-base"][0] / 24, 15);
});

test("seeded forest layers keep roads, signs, entrances and building yards clear without changing tiles", () => {
  const seen = new Set<string>();
  for (const mode of ["tower", "delve"] as const) for (let flags = 0; flags < 16; flags++) for (const seed of [1, 503, 507]) {
    const world = new OutsideWorld(seed, mode, !!(flags & 1), !!(flags & 2), !!(flags & 4), !!(flags & 8));
    const tiles = () => Array.from({ length: 400 }, (_, i) => world.tile(i % 20, Math.floor(i / 20)));
    const before = tiles(), objects = planForest(world);
    assert.deepEqual(tiles(), before, "art planning cannot change the walkable map");
    assert.deepEqual(planForest(world), objects, "placement is repeatable");
    let canopy = false;
    for (const p of objects) {
      seen.add(p.id);
      if (p.layer === "canopy") canopy = true;
      else assert.equal(canopy, false, "all small foliage is below large crowns");
      assert.deepEqual([p.width, p.height], FOREST_SPRITES[p.id]);
      for (let y = Math.ceil(-(p.y + p.height - 1) / 24); y <= Math.ceil(-p.y / 24); y++)
        for (let x = Math.floor(p.x / 24); x <= Math.floor((p.x + p.width - 1) / 24); x++) {
          assert.equal(onPath({ x, y, center: world.entranceX, seed, roads: roadsOf(world) }), false, "full canopy clears every road");
          assert.equal(world.isBlacksmith(x, y) || world.isTournamentHall(x, y), false, "buildings retain visible hitboxes");
          assert.equal(world.atExit(x, y), false, "mode-swap sign remains clear");
          assert.equal(world.isProvingGrounds(x, y), false, "trial square remains visible");
          assert.ok(x !== world.entranceX || y !== ENTRANCE_Y, "entrance remains clear");
        }
    }
    assert.ok(objects.filter(p => p.layer === "canopy").length >= 5, "the forest has mature trees even with all roads open");
  }
  assert.equal(seen.size, Object.keys(FOREST_SPRITES).length - FOREST_GROUND.length, "all seventeen nature silhouettes are used");
  assert.notDeepEqual(planForest(new OutsideWorld(1, "tower")), planForest(new OutsideWorld(2, "tower")));
});

test("forest PNG draws use native pixels and preserve entrance anchors and decor opt-out", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ReadyImage { src = ""; complete = true; naturalWidth = 24; }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  const draws: unknown[][] = [];
  const c = { save() {}, restore() {}, translate() {}, scale() {}, drawImage(image: ReadyImage, ...args: number[]) {
    draws.push([image.src.split("/").at(-1), ...args]);
  } } as unknown as CanvasRenderingContext2D;
  try {
    for (const [tower, width, height] of [[true, 216, 216], [false, 360, 240]] as const) {
      assert.equal(drawForestLandmark(c, tower, 204, 192), true);
      assert.deepEqual(draws.at(-1)?.slice(1), [204 - width / 2, 192 - height, width, height]);
      drawEntrance(c, tower ? "tower" : "delve", 8, "", undefined, true);
      assert.deepEqual(draws.at(-1)?.slice(1), [204 - width / 2, 192 - height, width, height]);
    }
    const world = new OutsideWorld(503, "tower", true, true), layer = new ForestFoliage();
    const view = { left: 0, bottom: 0, s: 24, n: 20 };
    draws.length = 0; layer.draw(c, view, world, true); const decorated = draws.length;
    for (const [file, , , width, height] of draws) assert.deepEqual([width, height], FOREST_SPRITES[String(file).replace(".png", "") as keyof typeof FOREST_SPRITES]);
    draws.length = 0; layer.draw(c, view, world, false);
    assert.ok(draws.length < decorated, "optional floor dressing follows the decoration setting");
    assert.ok(draws.some(([file]) => FOREST_CANOPIES.some(id => `${id}.png` === file)), "wall foliage remains with decoration off");
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original); else Reflect.deleteProperty(globalThis, "Image");
  }
});
