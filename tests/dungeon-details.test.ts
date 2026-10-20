import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dungeonDetail, dungeonDetailId, dungeonDetailVariants } from "../src/dungeon-details.ts";
import { DUNGEON_ATLASES } from "../src/sprite-dungeon.ts";
import type { Tile } from "../src/entities.ts";

test("contextual detail PNGs share native two-tile motifs, two shades and all existing biome ramps", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/assets/style/manifest.json", import.meta.url), "utf8"));
  for (const base of DUNGEON_ATLASES) {
    const id = base.replace("dungeon-", "dungeon-details-");
    const png = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    const width = base.startsWith("dungeon-masonry-") ? 336 : 192;
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [width, 48], id);
    assert.deepEqual(manifest.assets[id], { file: `${id}.png`, width, height: 48, tile: true });
  }
  assert.equal(dungeonDetailId("earth", 9), "dungeon-details-earth");
});

test("Tower repair, spall and chisel motifs follow broad, thin and sheltered wall masks", () => {
  assert.equal(dungeonDetailVariants("masonry"), 7);
  assert.equal(dungeonDetailVariants("stone"), 4);
  for (const [kind, expected] of [["broad", [0, 1, 2, 4]], ["thin", [3, 5]], ["sheltered", [1, 6]]] as const) {
    const world = { tile: (x: number, y: number) => ({ kind: (kind === "broad" ? y <= 0 : kind === "thin" ? y === 0 : (x % 3 + 3) % 3 !== 2) ? "wall" as const : "floor" as const }) };
    const variants = new Set<number>();
    for (let y = -4; y <= 4; y++) for (let x = -300; x < 300; x++) {
      if (world.tile(x, y).kind !== "wall") continue;
      const detail = dungeonDetail(world, x, y, 1107, () => "masonry");
      if (!detail) continue;
      variants.add(detail.variant);
      const left = x - detail.half;
      assert.deepEqual(dungeonDetail(world, left, y, 1107, () => "masonry"), { variant: detail.variant, half: 0 });
      assert.deepEqual(dungeonDetail(world, left + 1, y, 1107, () => "masonry"), { variant: detail.variant, half: 1 });
    }
    assert.deepEqual(variants, new Set(expected), kind);
  }
});

test("paired wall motifs match across negative coordinates, stay sparse and use specific edge contexts", () => {
  const stone = () => "stone";
  const thin = { tile: (_x: number, y: number) => ({ kind: y === 0 ? "wall" as const : "floor" as const }) };
  for (const seed of [1, 1107, 8903]) {
    let marked = 0; const positions: number[] = [];
    for (let x = -300; x < 300; x++) {
      const detail = dungeonDetail(thin, x, 0, seed, stone);
      if (!detail) continue;
      marked++;
      assert.equal(detail.variant, 3, "small chips take precedence on a one-tile-thick strip");
      const left = x - detail.half;
      assert.deepEqual(dungeonDetail(thin, left, 0, seed, stone), { variant: 3, half: 0 });
      assert.deepEqual(dungeonDetail(thin, left + 1, 0, seed, stone), { variant: 3, half: 1 });
      assert.equal(dungeonDetail(thin, left + 2, 0, seed, stone), undefined, "a clear tile separates motifs");
      assert.deepEqual(detail, dungeonDetail(thin, x, 0, seed, stone));
      if (!detail.half) positions.push(left);
    }
    assert.ok(marked > 20 && marked < 180, "most wall tiles retain quiet base material");
    for (let i = 1; i < positions.length; i++) assert.ok(positions[i] - positions[i - 1] >= 3);
  }
});

test("detail masks reject missing cells, incompatible corners, material seams and deep wall interiors", () => {
  const stone = () => "stone", seed = 1107;
  const wall = { kind: "wall" as const }, floor = { kind: "floor" as const };
  const thin = { tile: (_x: number, y: number) => y === 0 ? wall : floor };
  const left = Array.from({ length: 400 }, (_, i) => i - 200).find(x => dungeonDetail(thin, x, 0, seed, stone)?.half === 0);
  assert.ok(left !== undefined);
  const no = (tile: (x: number, y: number) => Tile | undefined, materials = stone) => {
    const world = { tile };
    assert.equal(dungeonDetail(world, left, 0, seed, materials), undefined);
    assert.equal(dungeonDetail(world, left + 1, 0, seed, materials), undefined);
  };
  no(() => wall);
  no(() => undefined);
  no((x, y) => x === left + 1 && y === 0 ? undefined : thin.tile(x, y));
  no(thin.tile, x => x === left ? "stone" : "earth");
  no((x, y) => x === left && y === 1 ? wall : thin.tile(x, y));
  const broad = { tile: (_x: number, y: number) => y <= 0 ? wall : floor };
  const variants = new Set<number>();
  for (let x = -500; x < 500; x++) {
    const d = dungeonDetail(broad, x, 0, seed, stone); if (d) variants.add(d.variant);
  }
  assert.deepEqual(variants, new Set([0, 1, 2]), "general exposed edges vary without using thin-strip chips");
});
