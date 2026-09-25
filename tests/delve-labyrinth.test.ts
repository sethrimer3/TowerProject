import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { region } from "../src/delve/labyrinth.ts";

// Characterization hash of the Delve labyrinth: every region's nodes (links,
// depths, theme influence, patterns), edges and their corridor paths, carved
// tiles and their metadata in insertion order, and its gate and entry, over a
// spread of seeds and areas. A change here changes saved maps, so it also needs
// a LAYOUT_VERSION bump; regenerate with UPDATE_GOLDEN=1 only when intended.
const GOLDEN = new URL("./fixtures/delve-labyrinth.golden.json", import.meta.url);
const SEEDS = [0, 1, 7, 42, 1234, 90210, 0x7fffffff, 555555];
const AREAS = 12;

function fingerprint(seed: number, area: number): string {
  const r = region(seed, area);
  const h = createHash("sha256");
  h.update(JSON.stringify({ area: r.area, gate: r.gate, entry: r.entry, exit: r.exit, start: r.start, minY: r.minY, maxY: r.maxY }));
  for (const n of r.nodes) {
    h.update(JSON.stringify(n));
    if (r.nodeAt(n.col, n.row) !== n) h.update(`nodeAt ${n.id} lost`);
  }
  for (const e of r.edges) h.update(JSON.stringify(e));
  for (const [k, tile] of r.cells) h.update(`${k}=${JSON.stringify(tile)};`);
  for (const [k, meta] of r.metadata) h.update(`${k}:${meta.depth},${meta.area};`);
  return h.digest("hex").slice(0, 16);
}

function record() {
  const out: Record<string, string> = {};
  for (const seed of SEEDS) for (let area = 0; area < AREAS; area++) out[`${seed}:${area}`] = fingerprint(seed, area);
  return out;
}

test("labyrinth regions match the recorded golden", () => {
  const actual = record();
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  assert.deepStrictEqual(actual, JSON.parse(readFileSync(GOLDEN, "utf8")));
});
