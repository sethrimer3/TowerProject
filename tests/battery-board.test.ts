import { test } from "node:test";
import assert from "node:assert/strict";
import { BATTERY_ART, BATTERY_BLACK, BATTERY_BOARD, BATTERY_DIM, BATTERY_FOREST, BATTERY_GRID, BATTERY_INK, drawBatteryCardIcon, hasBatteryCardIcon } from "../src/render/boards/battery-board.ts";
import { CARD_IDS } from "../src/cards/cards.ts";
import type { EnemyStrength, Tile } from "../src/entities.ts";
import type { FrameContext } from "../src/render/render-frame.ts";
import { defaults } from "../src/save/save.ts";

/** A 2D context that records its fills: the colour and rectangle of each. */
function recorder() {
  const fills: string[] = [];
  const state: Record<string, unknown> = { fillStyle: "", imageSmoothingEnabled: true };
  const ctx = new Proxy(state, {
    get: (_, key: string) => {
      if (key in state) return state[key];
      if (key === "fillRect") return (...a: number[]) => fills.push(`${state.fillStyle}:${a.map((v) => v.toFixed(2)).join(",")}`);
      return () => {};
    },
    set: (_, key: string, value) => ((state[key] = value), true),
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, fills };
}

const enemy = (strength: EnemyStrength, extra: object = {}): Tile => ({ kind: "enemy", enemy: { name: "", hp: 1, attack: 1, defense: 1, tier: 1, strength, ...extra } });
const TILES: Record<string, Tile> = {
  ...Object.fromEntries((["weak", "normal", "strong", "elite", "boss", "greaterBoss"] as const).map((s) => [s, enemy(s)])),
  rangedFast: enemy("normal", { ranged: true, fast: true }),
  armoredAggro: enemy("strong", { armored: true, aggro: true }),
  yellowKey: { kind: "key", color: "yellow" },
  blueKey: { kind: "key", color: "blue" },
  redKey: { kind: "key", color: "red" },
  yellowDoor: { kind: "door", door: { type: "keys", keys: ["yellow"], mode: "all" } },
  blueDoor: { kind: "door", door: { type: "keys", keys: ["blue"], mode: "all" } },
  redDoor: { kind: "door", door: { type: "keys", keys: ["red"], mode: "all" } },
  triuneDoor: { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "all", heart: true } },
  steelDoor: { kind: "door", door: { type: "keys", keys: ["yellow"], mode: "any" } },
  heartDoor: { kind: "door", door: { type: "fullHp" } },
  woodenDoor: { kind: "door", door: { type: "wood", durability: 3 } },
  potion: { kind: "potion" },
  percentPotion: { kind: "potion", color: "red" },
  attack: { kind: "attack" },
  defense: { kind: "defense" },
  reward: { kind: "reward", tier: "gold" },
  treasure: { kind: "treasure" },
  supply: { kind: "treasure", chest: "supply" },
  equipment: { kind: "treasure", chest: "equipment" },
  openedChest: { kind: "openedChest" },
  stairs: { kind: "stairs" },
  oneway: { kind: "oneway" },
};
const ALLOWED = new Set([BATTERY_INK, BATTERY_DIM, BATTERY_BLACK, "#ffffff", "#000000"]);
const paints = (tile: Tile) => {
  const r = recorder();
  BATTERY_BOARD.contents(r.ctx, tile);
  return r.fills;
};

test("battery saver is off by default", () => {
  assert.equal(defaults().settings.batterySaver, false);
});

test("every battery sprite is a whole 12-pixel tile of known pixels", () => {
  for (const [name, art] of Object.entries(BATTERY_ART)) {
    assert.equal(art.rows.length, BATTERY_GRID, name);
    for (const row of art.rows) assert.match(row, /^[.#+o]{12}$/, name);
  }
});

test("every tile's contents draw something, only in white, grey and black", () => {
  for (const [name, tile] of Object.entries(TILES)) {
    const fills = paints(tile);
    assert.ok(fills.length > 0, `${name} draws`);
    for (const fill of fills) assert.ok(ALLOWED.has(fill.split(":")[0]), `${name}: ${fill}`);
  }
});

test("keys and their doors tell their colours apart by shape", () => {
  const keys = ["yellowKey", "blueKey", "redKey"].map((k) => paints(TILES[k]).join("|"));
  const doors = ["yellowDoor", "blueDoor", "redDoor"].map((k) => paints(TILES[k]).join("|"));
  assert.equal(new Set(keys).size, 3);
  assert.equal(new Set(doors).size, 3);
});

test("each enemy strength looks different, and its traits add marks", () => {
  const looks = (["weak", "normal", "strong", "elite", "boss", "greaterBoss"] as const).map((s) => paints(TILES[s]).join("|"));
  assert.equal(new Set(looks).size, looks.length);
  assert.ok(paints(TILES.rangedFast).length > paints(TILES.normal).length);
});

test("every card has a battery saver icon of its own", () => {
  const drawn = new Set<string>();
  for (const id of CARD_IDS) {
    assert.ok(hasBatteryCardIcon(id), id);
    const r = recorder();
    drawBatteryCardIcon(r.ctx, id);
    assert.ok(r.fills.length > 0, id);
    drawn.add(r.fills.join("|"));
  }
  assert.equal(drawn.size, CARD_IDS.length, "no two cards share an icon");
});

test("the ground outlines walls only where they meet open ground", () => {
  const open = new Set(["1,1", "2,1"]);
  const world = { tile: (x: number, y: number): Tile => ({ kind: open.has(`${x},${y}`) ? "floor" : "wall" }) };
  for (const board of [BATTERY_BOARD, BATTERY_FOREST]) {
    const r = recorder();
    const f = { c: r.ctx, width: 96, n: 4, left: 0, bottom: 0, s: 24, world } as unknown as FrameContext;
    board.ground(f);
    const lit = r.fills.filter((fill) => fill.startsWith(BATTERY_INK));
    const dots = r.fills.filter((fill) => fill.startsWith(BATTERY_DIM));
    assert.equal(dots.length, 2, "a dot on each open tile");
    assert.ok(lit.length > 0, "the walls round them show");
  }
});
