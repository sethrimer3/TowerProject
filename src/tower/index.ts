import { TOWER_SECTION, TOWER_START_X, UNGUARDED_LOOT_CHANCE } from "../config.ts";
import { point, type Tile } from "../entities.ts";
import { random } from "../random.ts";
import { reachable } from "../board.ts";
import { getTowerGateEnemy } from "../scaling.ts";
import type { XY } from "./grid.ts";
import { analyzeFloor, formatFloorSummary, type FloorAnalysis } from "./analyzer.ts";
import { embed, ENTRY, type Embedding } from "./embedder.ts";
import { GraphBuilder, generateStrategicGraph } from "./strategic-graph.ts";
import { keyedFloor, openFirstFloor } from "./patterns.ts";
import type { StrategicGraph } from "./types.ts";
import { ALL_KEY_COLORS, keyColorsOn, type KeyColors } from "../key-schedule.ts";

/** Tower floor generation pipeline:
 *
 *   strategic graph (what decisions exist)      strategic-graph.ts, patterns.ts
 *     → forks (parallel lanes of gates)          forks.ts
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

/** Whether floor `room` (0-based) is a section's last, the 10th, 20th, …
 * floor, whose stairs a boss guards. */
export const isBossFloor = (room: number) => room % TOWER_SECTION === TOWER_SECTION - 1;

/** The one interior tile beside stairs on the outer wall: the only way on
 * to them. */
function insideStairs([x, y]: XY): XY {
  if (x === 0) return [1, y];
  if (x === 16) return [15, y];
  return y === 0 ? [x, 1] : [x, 15];
}

/** Smallest possible floor: start hall → stairs. Always embeddable. It
 * keeps the first floors' rules: floor 1's stairs stand open, and floors 2
 * to 5 have a yellow door before them and its key in the start hall. */
function minimalGraph(depth: number, rng: () => number, tier: number): StrategicGraph {
  const b = new GraphBuilder(depth, rng);
  const keyed = keyedFloor(depth);
  b.add({ purpose: "start", patternId: "main", parent: null, gate: { kind: "open" }, route: "main", footprint: "hall",
    rewards: [{ kind: "potion" }, ...(keyed ? [{ kind: "key", color: "yellow" } as const] : [])] });
  b.add({ purpose: "stairs", patternId: "main", parent: 0, route: "main", footprint: "pocket",
    gate: openFirstFloor(depth) || keyed ? { kind: "open" } : { kind: "enemy", strength: "normal" },
    ...(keyed ? { stairsGuard: "door" as const } : {}) });
  return { archetype: "mixed", depth, ...(tier > 1 ? { tower: tier } : {}), nodes: b.nodes, shortcuts: [], notes: ["fallback minimal floor"] };
}

/** Floor `room` of a run seeded `seed`, in tower `tier`, which decides
 * the key colours it may use (`keyColorsOn`) and its enemy curve. */
export function generateTowerFloor(seed: number, room: number, tier = 1): TowerFloor {
  const colors = keyColorsOn(room, tier);
  const MAX_ATTEMPTS = 12;
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    const derived = (seed ^ Math.imul(room + 1, 2654435761) ^ Math.imul(attempt + 1, 40503)) >>> 0;
    const rng = random(derived ^ 0x9e3779b9);
    // Each failed embedding simplifies the next graph a little.
    const graph = attempt < MAX_ATTEMPTS
      ? generateStrategicGraph(derived, room, Math.floor(attempt / 3), tier)
      : minimalGraph(room, rng, tier);
    const embedding = embed(graph, rng);
    if (!embedding) continue;
    const cells = embedding.cells;
    // Room 0 opens onto the forest and each section's first room (10, 20, …)
    // is sealed below; every other room keeps a way back down.
    cells.set(point(TOWER_START_X, 0), room % TOWER_SECTION ? { kind: "stairsDown" } : { kind: "floor" });
    // A section's last floor puts its boss on the one tile beside the
    // stairs, in place of any guard there, so it must be beaten to climb.
    if (isBossFloor(room))
      cells.set(point(...insideStairs(embedding.stairs)), { kind: "enemy", enemy: getTowerGateEnemy(room, "boss", "balanced", tier) });
    // The rare unguarded find: only on floor reachable without a fight.
    const blockers = new Set([...cells].filter(([, t]) => t.kind === "enemy").map(([k]) => k));
    for (const k of reachable(cells, point(TOWER_START_X, 0), blockers))
      if (cells.get(k)?.kind === "floor" && k !== point(...ENTRY)) {
        const loot = rollUnguardedLoot(rng, colors);
        if (loot) cells.set(k, loot);
      }
    if (geometryProblems(cells).length) continue;
    return { cells, embedding };
  }
  throw new Error(`Tower room ${room} failed to generate a valid layout`);
}

/** Human-readable generation report for one floor (debugging/tuning). */
/** The rare loot on one unguarded floor tile, or null (most rolls). */
/** A key of a colour `colors` closes comes as a yellow key. */
export function rollUnguardedLoot(rng: () => number, colors: KeyColors = ALL_KEY_COLORS): Tile | null {
  if (rng() >= UNGUARDED_LOOT_CHANCE) return null;
  const choice = Math.floor(rng() * 6);
  if (choice < 3) {
    const color = (["yellow", "blue", "red"] as const)[choice];
    return { kind: "key", color: colors[color] ? color : "yellow" };
  }
  return { kind: (["attack", "defense", "treasure"] as const)[choice - 3] };
}

export function towerFloorReport(seed: number, room: number, tier = 1): { analysis: FloorAnalysis; text: string } {
  const floor = generateTowerFloor(seed, room, tier);
  const analysis = analyzeFloor(floor.embedding);
  return { analysis, text: formatFloorSummary(analysis, floor.cells) };
}

export { analyzeFloor, formatFloorSummary };
