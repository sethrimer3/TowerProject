import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { drawTerrain, tileRandom, type TileNeighbors } from "../src/themes.ts";
import type { Mode } from "../src/entities.ts";

// Characterization hash of the procedural terrain (the fallback ground art
// drawn when sprites are off or still loading). A recording canvas logs every
// call and property write drawTerrain makes, over every Tower theme and a
// stretch of Delve, walls and floors, and every wall-neighbour combination.
// Regenerate (only when a change to the art is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/terrain-paint.golden.json", import.meta.url);

/** A stand-in 2D context that feeds every call and property write to `h`. */
function recorder(h: Hash): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get: (_, key: string) =>
      key in state ? state[key] : (...args: unknown[]) => h.update(`${key}(${args.join(",")})\n`),
    set: (_, key: string, value) => {
      state[key] = value;
      h.update(`${key}=${value}\n`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function neighboursAt(x: number, y: number, seed: number): TileNeighbors | undefined {
  const roll = tileRandom(x, y, seed ^ 0x5eed);
  if (roll < 0.1) return undefined;
  const mask = Math.floor(roll * 160) % 16;
  return { northWall: !!(mask & 1), southWall: !!(mask & 2), westWall: !!(mask & 4), eastWall: !!(mask & 8) };
}

function paintArea(mode: Mode, height: number, seed: number, y0 = 0): string {
  const h = createHash("sha256");
  const c = recorder(h);
  for (let y = y0 - 2; y < y0 + 40; y++)
    for (let x = -2; x < 30; x++) {
      const neighbors = neighboursAt(x, y, seed);
      for (const [wall, empty] of [[true, false], [false, true], [false, false]]) {
        h.update(`# ${x},${y} ${wall} ${empty}\n`);
        drawTerrain(c, { mode, height, seed, x, y, wall, empty, neighbors });
      }
    }
  return h.digest("hex").slice(0, 16);
}

function record() {
  const out: Record<string, string> = {};
  for (const seed of [1, 42, 90210]) {
    for (let height = 0; height < 100; height += 10) out[`tower ${height} ${seed}`] = paintArea("tower", height, seed);
    // Delve themes follow position, not height: sample several areas up the labyrinth.
    for (const y0 of [0, 150, 400, 900]) out[`delve ${y0} ${seed}`] = paintArea("delve", 0, seed, y0);
  }
  return out;
}

test("procedural terrain paints the same as the recorded golden", () => {
  const actual = record();
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  assert.deepStrictEqual(actual, JSON.parse(readFileSync(GOLDEN, "utf8")));
});
