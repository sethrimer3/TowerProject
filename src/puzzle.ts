import { random } from "./generation.ts";
import { getTowerEnemy } from "./scaling.ts";
import type { Enemy, KeyColor } from "./entities.ts";

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

export function generatePuzzleGraph(seed: number, room: number): PuzzleNode[] {
  const rng = random(seed);
  const nodes: PuzzleNode[] = [];
  
  const entrance: PuzzleNode = { id: 0, type: "entrance", edges: [] };
  nodes.push(entrance);
  
  const budget = 4 + Math.floor(room / 10);
  
  // Create a linear path to the exit
  const pathLength = 3 + Math.floor(rng() * 2);
  let current = entrance;
  
  for (let i = 0; i < pathLength; i++) {
    const next: PuzzleNode = { id: nodes.length, type: "hub", edges: [] };
    nodes.push(next);
    
    // Add gate
    if (rng() < 0.7) {
      current.edges.push({ target: next.id, gate: "enemy", enemy: getTowerEnemy(room, rng) });
    } else {
      current.edges.push({ target: next.id, gate: "door", doorColor: "yellow" });
      // ensure key is obtainable
      const keyNode: PuzzleNode = { id: nodes.length, type: "reward", reward: "key", keyColor: "yellow", edges: [] };
      nodes.push(keyNode);
      // attach key to previous
      current.edges.push({ target: keyNode.id, gate: "enemy", enemy: getTowerEnemy(room, rng, "weak") });
    }
    current = next;
  }
  
  const exit: PuzzleNode = { id: nodes.length, type: "exit", edges: [] };
  nodes.push(exit);
  current.edges.push({ target: exit.id, gate: "enemy", enemy: getTowerEnemy(room, rng, "guardian") });
  
  // Add some optional rewards branching off hubs
  for (const n of nodes) {
    if (n.type === "hub" && rng() < 0.5) {
      const rewardNode: PuzzleNode = { 
        id: nodes.length, 
        type: "reward", 
        reward: rng() < 0.5 ? "attack" : "defense", 
        edges: [] 
      };
      nodes.push(rewardNode);
      n.edges.push({ target: rewardNode.id, gate: "enemy", enemy: getTowerEnemy(room, rng, "brute") });
    }
  }
  
  return nodes;
}
