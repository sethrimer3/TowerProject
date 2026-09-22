import { random } from "./generation.ts";
import { getTowerEnemy } from "./scaling.ts";
import type { Enemy } from "./entities.ts";
import type { KeyColor } from "./config.ts";

export type PuzzleNode = {
  id: number;
  type: "entrance" | "exit" | "hub" | "reward" | "treasure";
  reward?: "attack" | "defense" | "potion" | "key" | "treasure";
  keyColor?: KeyColor;
  edges: PuzzleEdge[];
};

export type PuzzleEdge = {
  target: number;
  gate?: "enemy" | "door";
  enemy?: Enemy;
  doorColor?: KeyColor;
};

/** entrance -> exit is `mainPath`, the mandatory route: each edge gates the
 * next hub with either an enemy or a locked door, and any door's key is
 * always granted by an earlier, reachable branch off that same path (see
 * the keyNode below) so a rational player can always reach the exit.
 * `nodes` additionally holds optional reward branches — side rooms that
 * compete for keys/turns but are never required to finish the room. */
export type PuzzleGraph = { nodes: PuzzleNode[]; mainPath: PuzzleEdge[] };

export function generatePuzzleGraph(seed: number, room: number): PuzzleGraph {
  const rng = random(seed);
  const nodes: PuzzleNode[] = [];
  const mainPath: PuzzleEdge[] = [];

  const entrance: PuzzleNode = { id: 0, type: "entrance", edges: [] };
  nodes.push(entrance);

  // Caps total node count so the graph scales gradually with floor number
  // instead of growing without bound.
  const budget = 4 + Math.floor(room / 10);

  // Create a linear path to the exit
  const pathLength = 3 + Math.floor(rng() * 2);
  let current = entrance;

  for (let i = 0; i < pathLength; i++) {
    const next: PuzzleNode = { id: nodes.length, type: "hub", edges: [] };
    nodes.push(next);

    // Add gate
    if (rng() < 0.7) {
      const edge = { target: next.id, gate: "enemy" as const, enemy: getTowerEnemy(room, rng) };
      current.edges.push(edge);
      mainPath.push(edge);
    } else {
      const doorColor: KeyColor = "yellow";
      const edge = { target: next.id, gate: "door" as const, doorColor };
      current.edges.push(edge);
      mainPath.push(edge);
      // ensure key is obtainable from a branch off the current (already
      // reached) node, guarded lightly so it never blocks the mandatory route
      const keyNode: PuzzleNode = { id: nodes.length, type: "reward", reward: "key", keyColor: doorColor, edges: [] };
      nodes.push(keyNode);
      current.edges.push({ target: keyNode.id, gate: "enemy", enemy: getTowerEnemy(room, rng, "weak") });
    }
    current = next;
  }

  const exit: PuzzleNode = { id: nodes.length, type: "exit", edges: [] };
  nodes.push(exit);
  const exitEdge = { target: exit.id, gate: "enemy" as const, enemy: getTowerEnemy(room, rng, "guardian") };
  current.edges.push(exitEdge);
  mainPath.push(exitEdge);

  // Add some optional rewards branching off hubs, within the node budget.
  for (const n of nodes) {
    if (nodes.length >= budget) break;
    if (n.type === "hub" && rng() < 0.5) {
      const rewardNode: PuzzleNode = {
        id: nodes.length,
        type: "reward",
        reward: rng() < 0.5 ? "attack" : "defense",
        edges: [],
      };
      nodes.push(rewardNode);
      n.edges.push({ target: rewardNode.id, gate: "enemy", enemy: getTowerEnemy(room, rng, "brute") });
    }
  }

  return { nodes, mainPath };
}
