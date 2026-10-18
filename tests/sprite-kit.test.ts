import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHash } from "node:crypto";
import { BOON_IDS } from "../src/shrines.ts";
import { BOON_SPRITES, SHRINE_CONTROL_SPRITES } from "../src/sprite-boons.ts";
import { BADGE_IDS } from "../src/badges.ts";
import { CARD_SPRITE_LAYERS } from "../src/sprite-cards.ts";
import { ICON_SPRITES, WORLD_SPRITES, CONTROL_SPRITES, DETAIL_SPRITES, CITY_SPRITES, DEFEND_STRUCTURE_SPRITES, NAMED_ENEMY_SPRITES, drawKit, kitEnemy, spriteRevision } from "../src/sprite-kit.ts";
import { GOAL_SPRITES, UI_DETAIL_SPRITES, UI_ORNAMENT_SPRITES } from "../src/sprite-ui-details.ts";
import { CARDS } from "../src/cards.ts";
import { ICON_ROWS } from "../src/ui/equipment-icons.ts";
import { THEMED_TILESET_URLS } from "../src/themed-tilesets.ts";
import { SPRITE_TERRAIN } from "../src/sprite-terrain-index.ts";
import { paintContents, paintHero } from "../src/tile-painters.ts";

test("every world, UI, Equipment and card sprite ships as a real native-sized PNG", () => {
  const base = new URL("../public/assets/style/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", base), "utf8"));
  for (const id of [...Object.values(BOON_SPRITES), ...SHRINE_CONTROL_SPRITES, "shrine-fill", ...UI_DETAIL_SPRITES, ...UI_ORNAMENT_SPRITES, ...ICON_SPRITES, ...WORLD_SPRITES, ...CONTROL_SPRITES, ...DETAIL_SPRITES, ...CITY_SPRITES, ...DEFEND_STRUCTURE_SPRITES, ...NAMED_ENEMY_SPRITES.map(id => `enemy-${id}`), ...Object.keys(ICON_ROWS).map(id => `equip-${id}`), ...Object.keys(CARDS).map(id => `card-${id}`), ...BADGE_IDS.map(id => `badge-${id}`), "badge-star", "card-exchange", ...["common", "rare", "epic"].map(rarity => `badge-frame-${rarity}`)]) {
    const asset = manifest.assets[id];
    assert.ok(asset, id);
    const png = readFileSync(new URL(asset.file, base));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", id);
    assert.equal(png.readUInt32BE(16), asset.width, id);
    assert.equal(png.readUInt32BE(20), asset.height, id);
  }
  for (const set of THEMED_TILESET_URLS) for (const url of [...set.floors, ...set.walls]) {
    const frame = SPRITE_TERRAIN[url.split("assets/")[1]];
    assert.ok(frame, url);
    assert.equal(frame.x % 24, 0);
    assert.equal(frame.y % 24, 0);
  }
});

test("world sprites preserve facing and all colored-key door requirements", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ReadyImage { src = ""; complete = true; naturalWidth = 24; }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  const paths: string[] = [];
  const c = { save() {}, restore() {}, drawImage(image: ReadyImage) { paths.push(image.src); } } as unknown as CanvasRenderingContext2D;
  try {
    for (const [dx, dy, direction] of [[1, 0, "right"], [-1, 0, "left"], [0, 1, "up"], [0, -1, "down"]] as const) {
      paintHero(c, false, true, { dx, dy });
      assert.ok(paths.at(-1)?.endsWith(`/hero-${direction}.png`));
    }
    paintContents(c, { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "all", heart: true } }, {
      x: 0, y: 0, time: 0, spritesOff: false, reduceMotion: false, area1: false, styledSprites: true,
    });
    for (const id of ["door-wood", "heart", "key-yellow", "key-blue", "key-red"])
      assert.ok(paths.some(path => path.endsWith(`/${id}.png`)), id);
  } finally {
    if (previous) Object.defineProperty(globalThis, "Image", previous);
    else Reflect.deleteProperty(globalThis, "Image");
  }
});

test("a missing or loading PNG falls back, then draws without smoothing when ready", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const made: FakeImage[] = [];
  class FakeImage {
    src = ""; complete = false; naturalWidth = 0; onload?: () => void;
    constructor() { made.push(this); }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: FakeImage });
  const calls: unknown[][] = [];
  const c = { imageSmoothingEnabled: true, save() {}, restore() {}, drawImage(...args: unknown[]) { calls.push(args); } } as unknown as CanvasRenderingContext2D;
  try {
    assert.equal(drawKit(c, "gold"), false);
    assert.equal(calls.length, 0);
    assert.equal(made.length, 1);
    const before = spriteRevision();
    made[0].complete = true; made[0].naturalWidth = 24; made[0].onload?.();
    assert.ok(spriteRevision() > before);
    assert.equal(drawKit(c, "gold"), true);
    assert.equal(c.imageSmoothingEnabled, false);
    assert.deepEqual(calls[0].slice(1), [0, 0, 24, 24]);
    assert.equal(made.length, 1, "the image is cached");
    made[0].naturalWidth = 0;
    assert.equal(drawKit(c, "gold"), false);
    assert.equal(kitEnemy("Temple Wraith"), "enemy-temple-wraith");
  } finally {
    if (previous) Object.defineProperty(globalThis, "Image", previous);
    else Reflect.deleteProperty(globalThis, "Image");
  }
});


test("every badge and card has a distinct PNG, with card subjects clear of live names", () => {
  const base = new URL("../public/assets/style/", import.meta.url);
  for (const ids of [BADGE_IDS.map(id => `badge-${id}`), Object.keys(CARDS).map(id => `card-${id}`)]) {
    const hashes = ids.map(id => createHash("sha256").update(readFileSync(new URL(`${id}.png`, base))).digest("hex"));
    assert.equal(new Set(hashes).size, ids.length, "no badge or card silently reuses another face");
  }
  assert.deepEqual(Object.keys(CARD_SPRITE_LAYERS).sort(), Object.keys(CARDS).sort());
  for (const layers of Object.values(CARD_SPRITE_LAYERS)) for (const layer of layers) {
    assert.ok(layer.x >= 6 && layer.y >= 8 && layer.x + layer.size <= 42 && layer.y + layer.size <= 44, "leave frame and name band clear");
    assert.ok(readFileSync(new URL(`${layer.sprite}.png`, base)).length > 100);
  }
});


test("all Goal unlocks have deployed matching art and new utility symbols are distinct", () => {
  const base = new URL("../public/assets/style/", import.meta.url);
  for (const [unlock, id] of Object.entries(GOAL_SPRITES)) {
    const png = readFileSync(new URL(`${id}.png`, base));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", unlock);
  }
  const ids = [...UI_DETAIL_SPRITES, ...UI_ORNAMENT_SPRITES];
  const hashes = ids.map(id => createHash("sha256").update(readFileSync(new URL(`${id}.png`, base))).digest("hex"));
  assert.equal(new Set(hashes).size, ids.length, "range, charge, rapid fire and attack speed must remain distinguishable");
});


test("every Shrine boon has distinct native PNG art and both kinds keep complete coverage", () => {
  assert.deepEqual(Object.keys(BOON_SPRITES).sort(), [...BOON_IDS].sort());
  const ids = [...Object.values(BOON_SPRITES), ...SHRINE_CONTROL_SPRITES];
  const hashes = ids.map(id => {
    const png = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 24, id);
    assert.equal(png.readUInt32BE(20), 24, id);
    return createHash("sha256").update(png).digest("hex");
  });
  assert.equal(new Set(hashes).size, ids.length, "standard and trade-off boons keep distinct subjects");
});
