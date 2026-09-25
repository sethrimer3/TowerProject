import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { random } from "../src/generation.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { embed } from "../src/tower/embedder.ts";
import { generateStrategicGraph } from "../src/tower/strategic-graph.ts";

// Characterization hash of Tower floor layouts: whole floors (tiles and the
// embedding behind them) for a spread of seeds and depths, plus raw embed()
// calls on every retry's graph, including ones that fail. Saves store map
// edits against this output, so a change here needs a LAYOUT_VERSION bump.
// Regenerate (only when a layout change is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/tower-layout.golden.json", import.meta.url);

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const ROOMS = Array.from({ length: 16 }, (_, i) => i * 4);

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value, (_, v) => (v instanceof Map ? [...v] : v))).digest("hex").slice(0, 12);

function layouts() {
  const out: Record<string, string> = {};
  for (const seed of SEEDS) {
    const floors = ROOMS.map((room) => {
      const { cells, embedding } = generateTowerFloor(seed, room);
      return { cells, embedding: { ...embedding, cells: undefined } };
    });
    // The same derivation generateTowerFloor uses, for the first retries.
    const raw = ROOMS.slice(0, 6).flatMap((room) =>
      [0, 3, 6, 9].map((attempt) => {
        const derived = (seed ^ Math.imul(room + 1, 2654435761) ^ Math.imul(attempt + 1, 40503)) >>> 0;
        return embed(generateStrategicGraph(derived, room, Math.floor(attempt / 3)), random(derived ^ 0x9e3779b9)) ?? "failed";
      }),
    );
    out[`seed:${seed}`] = hash([floors, raw]);
  }
  return out;
}

test("Tower floor layouts match the recorded hashes", () => {
  const actual = layouts();
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  assert.deepEqual(actual, JSON.parse(readFileSync(GOLDEN, "utf8")));
});
