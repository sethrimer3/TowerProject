import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { random } from "../src/generation.ts";
import {
  cloneLayout,
  defaultLayout,
  fitLayout,
  moveCityTile,
  moveKeep,
  moveStructure,
  placeCityTile,
  placeStructure,
  removeCityTile,
  removeStructure,
  type Layout,
  type PlacedKind,
} from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { TILES_H, TILES_W } from "../src/defend/grid.ts";

// Characterization hash of Defend city building: seeded random walks of
// layout edits (every edit's verdict and every legal layout's fitted
// structures), raw fitLayout() on unchecked layouts for its failure reasons,
// and generateCity() at checkpoints along each walk. Any change to where
// structures are fitted or how streets, parks, houses and ponds are laid out
// shows up here. Regenerate (only when a change is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/defend-city.golden.json", import.meta.url);

const WALKS = 32;
const EDITS = 70;
const KINDS: PlacedKind[] = ["barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower"];

const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value, (_, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v)))
    .digest("hex")
    .slice(0, 12);

/** One random edit of `l`: its name and the result (null when refused). */
function edit(l: Layout, rnd: () => number): [string, Layout | null] {
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const tx = Math.floor(rnd() * TILES_W),
    ty = Math.floor(rnd() * TILES_H);
  // Mostly near the keep, so the city grows instead of every edit failing.
  const nx = Math.max(0, Math.min(TILES_W - 1, l.keep.tx + Math.floor(rnd() * 9) - 4)),
    ny = Math.max(0, Math.min(TILES_H - 1, l.keep.ty + Math.floor(rnd() * 9) - 6));
  // Structures mostly go on city tiles, which is where crowding happens.
  const [sx, sy] = l.cityTiles.length && rnd() < 0.7 ? pick(l.cityTiles).split(",").map(Number) : [nx, ny];
  const r = rnd();
  if (r < 0.5) {
    // Grow from a random city tile in a random direction.
    const [bx, by] = l.cityTiles.length && rnd() < 0.8 ? pick(l.cityTiles).split(",").map(Number) : [l.keep.tx, l.keep.ty];
    const [dx, dy] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    return [`tile ${bx + dx},${by + dy}`, placeCityTile(l, bx + dx, by + dy)];
  }
  if (r < 0.75) {
    const kind = pick(KINDS);
    return [`${kind} ${sx},${sy}`, placeStructure(l, kind, sx, sy)];
  }
  if (r < 0.8 && l.structures.length) {
    const s = pick(l.structures);
    return [`move ${s.uid} ${sx},${sy}`, moveStructure(l, s.uid, sx, sy)];
  }
  if (r < 0.84 && l.structures.length) {
    const s = pick(l.structures);
    return [`remove ${s.uid}`, removeStructure(l, s.uid)];
  }
  if (r < 0.87 && l.cityTiles.length) {
    const k = pick(l.cityTiles);
    const [x, y] = k.split(",").map(Number);
    return [`lift ${k}`, removeCityTile(l, x, y)?.layout ?? null];
  }
  if (r < 0.92 && l.cityTiles.length) {
    const [x, y] = pick(l.cityTiles).split(",").map(Number);
    return [`shift ${x},${y}>${nx},${ny}`, moveCityTile(l, { tx: x, ty: y }, { tx: nx, ty: ny })];
  }
  if (l.cityTiles.length) {
    const [x, y] = pick(l.cityTiles).split(",").map(Number);
    return [`keep ${x},${y}`, moveKeep(l, x, y)];
  }
  return [`far tile ${tx},${ty}`, placeCityTile(l, tx, ty)];
}

/** fitLayout() on a layout with a structure forced onto any tile, legal or not. */
function forced(l: Layout, rnd: () => number) {
  const next = cloneLayout(l);
  const kind = KINDS[Math.floor(rnd() * KINDS.length)];
  let [tx, ty] = [Math.floor(rnd() * TILES_W), Math.floor(rnd() * TILES_H)];
  if (l.cityTiles.length && rnd() < 0.6) [tx, ty] = l.cityTiles[Math.floor(rnd() * l.cityTiles.length)].split(",").map(Number);
  next.structures.push({ uid: next.nextUid, kind, tx, ty });
  const fit = fitLayout(next);
  return fit.ok ? fit.structures.at(-1)!.rect : fit.reason;
}

function city(l: Layout, seed: number) {
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  const m = generateCity(fit, seed);
  return [m.type, m.owner, m.buildings];
}

function walks() {
  const out: Record<string, string> = {};
  for (let w = 1; w <= WALKS; w++) {
    const rnd = random(w * 7919);
    let l = defaultLayout();
    const steps: unknown[] = [];
    const cities: string[] = [];
    for (let e = 0; e < EDITS; e++) {
      const [name, next] = edit(l, rnd);
      if (next) {
        l = next;
        const fit = fitLayout(l);
        steps.push([name, fit.ok ? fit.structures : fit.reason]);
      } else steps.push([name, null]);
      steps.push(forced(l, rnd));
      if (e % 10 === 9) cities.push(digest(city(l, w * 31 + e)));
    }
    cities.push(digest(city(l, 1)), digest(city(l, 0x9e3779b9)));
    out[`walk:${w}`] = `${digest(steps)} ${cities.join(" ")}`;
  }
  return out;
}

test("Defend layouts and generated cities match the recorded hashes", () => {
  const actual = walks();
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  assert.deepEqual(actual, JSON.parse(readFileSync(GOLDEN, "utf8")));
});
