import { TOWER_START_X } from "../config.ts";
import { point, type Tile } from "../entities.ts";
import { random, reachable, rollUnguardedLoot } from "../generation.ts";
import { analyzeFloor, formatFloorSummary, type FloorAnalysis } from "./analyzer.ts";
import { embed, ENTRY, type Embedding } from "./embedder.ts";
import { GraphBuilder, generateStrategicGraph } from "./strategic-graph.ts";
import type { StrategicGraph } from "./types.ts";

/** Tower floor generation pipeline:
 *
 *   strategic graph (what decisions exist)      strategic-graph.ts, patterns.ts
 *     → resource planning (key/door economy)     resource-planner.ts
 *     → spatial embedding (chambers + doorways)  embedder.ts
 *     → geometry checks (never economy checks)   below
 *     → analysis for tuning/debugging            analyzer.ts
 *
 * Geometry must always be valid; the resource economy is allowed to be
 * harsh or even unwinnable. */

export type TowerFloor = { cells: Map<string, Tile>; embedding: Embedding };

/** Structural validity only: one connected walkable component containing
 * the entrance, the first tile inside and exactly one staircase. Doors and
 * enemies are passable here — whether the player can *afford* them is a
 * gameplay question, not a geometry one. */
export function geometryProblems(cells: Map<string, Tile>): string[] {
  const problems: string[] = [];
  const entrance = point(TOWER_START_X, 0);
  const all = reachable(cells, entrance);
  const walkable = [...cells].filter(([, t]) => t.kind !== "wall");
  if (walkable.some(([k]) => !all.has(k))) problems.push("disconnected walkable tiles");
  if (!all.has(point(...ENTRY))) problems.push("tile below entrance blocked");
  const stairs = walkable.filter(([, t]) => t.kind === "stairs");
  if (stairs.length !== 1) problems.push(`${stairs.length} staircases`);
  else {
    const [x, y] = stairs[0][0].split(",").map(Number);
    if (x !== 0 && y !== 0 && x !== 16 && y !== 16) problems.push("stairs not on the outer wall");
  }
  return problems;
}

/** Smallest possible floor: start hall → stairs. Always embeddable. */
function minimalGraph(depth: number, rng: () => number): StrategicGraph {
  const b = new GraphBuilder(depth, rng);
  b.add({ purpose: "start", patternId: "main", parent: null, gate: { kind: "open" }, route: "main", footprint: "hall", rewards: [{ kind: "potion" }] });
  b.add({ purpose: "stairs", patternId: "main", parent: 0, gate: { kind: "enemy", strength: "normal" }, route: "main", footprint: "pocket" });
  return { archetype: "mixed", depth, nodes: b.nodes, shortcuts: [], notes: ["fallback minimal floor"] };
}

export function generateTowerFloor(seed: number, room: number): TowerFloor {
  const MAX_ATTEMPTS = 12;
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    const derived = (seed ^ Math.imul(room + 1, 2654435761) ^ Math.imul(attempt + 1, 40503)) >>> 0;
    const rng = random(derived ^ 0x9e3779b9);
    // Each failed embedding simplifies the next graph a little.
    const graph = attempt < MAX_ATTEMPTS
      ? generateStrategicGraph(derived, room, Math.floor(attempt / 3))
      : minimalGraph(room, rng);
    const embedding = embed(graph, rng);
    if (!embedding) continue;
    const cells = embedding.cells;
    // Room 0 opens onto the forest; every later room keeps a way back down.
    cells.set(point(TOWER_START_X, 0), room > 0 ? { kind: "stairsDown" } : { kind: "floor" });
    // The rare unguarded find: only on floor reachable without a fight.
    const blockers = new Set([...cells].filter(([, t]) => t.kind === "enemy").map(([k]) => k));
    for (const k of reachable(cells, point(TOWER_START_X, 0), blockers))
      if (cells.get(k)?.kind === "floor" && k !== point(...ENTRY)) {
        const loot = rollUnguardedLoot(rng);
        if (loot) cells.set(k, loot);
      }
    if (geometryProblems(cells).length) continue;
    return { cells, embedding };
  }
  throw new Error(`Tower room ${room} failed to generate a valid layout`);
}

/** Human-readable generation report for one floor (debugging/tuning). */
export function towerFloorReport(seed: number, room: number): { analysis: FloorAnalysis; text: string } {
  const floor = generateTowerFloor(seed, room);
  const analysis = analyzeFloor(floor.embedding);
  return { analysis, text: formatFloorSummary(analysis, floor.cells) };
}

export { analyzeFloor, formatFloorSummary };
