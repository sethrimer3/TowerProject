import { TOWER_START_X } from "../config.ts";
import { point, type Tile } from "../entities.ts";
import { reachable } from "../board.ts";
import { ENTRY, type Embedding } from "./embedder.ts";
import { gateTile } from "./furnisher.ts";

/** The first tower's first two floors, as the first lessons need them,
 * fixed on the finished floor (after the enemy stage, before the unguarded
 * loot), since gates, guards and the enemy stage can all put an enemy in
 * the way. Floor 1 (`room` 0): a key the hero reaches without a fight or a
 * door, and a door it can open with it (the Door & Key lesson is dismissed
 * by playing one of them). Floor 2: a way to the stairs without a fight,
 * each enemy on it a Wooden Door instead. */
export function fixIntroFloor(cells: Map<string, Tile>, embedding: Embedding, room: number, tier: number, rng: () => number) {
  if (tier !== 1) return;
  if (room === 0) teachDoorAndKey(cells, embedding, rng);
  if (room === 1) openWayWithoutFights(cells, room);
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const start = () => point(TOWER_START_X, 0);
const xy = (k: string) => k.split(",").map(Number) as [number, number];
const neighbours = (k: string) => {
  const [x, y] = xy(k);
  return STEPS.map(([dx, dy]) => point(x + dx, y + dy));
};
/** A door one gold key opens: a gold door or a Wooden Door. */
const goldKeyOpens = (t: Tile) =>
  t.kind === "door" && (t.door?.type === "wood" || (t.door?.type === "keys" && t.door.keys.every((c) => c === "yellow")));
/** Where the hero walks without a fight or opening a door. */
const walkable = (cells: Map<string, Tile>) =>
  reachable(cells, start(), new Set([...cells].filter(([, t]) => t.kind === "enemy" || t.kind === "door").map(([k]) => k)));
/** The plain floor in `area` an item may take: never the way in or the tile just inside. */
const freeFloor = (cells: Map<string, Tile>, area: Set<string>) =>
  [...area].filter((k) => cells.get(k)?.kind === "floor" && k !== start() && k !== point(...ENTRY));

/** Floor 1: a door on the edge of where the hero walks freely, and then a
 * gold key within it. A missing door is an enemy there (not in a fork's
 * lane) made a gold door, else a doorway there (an optional room's first,
 * then any) closed with one; a missing key lies on a plain floor tile
 * there. */
function teachDoorAndKey(cells: Map<string, Tile>, embedding: Embedding, rng: () => number) {
  const area = walkable(cells);
  const edge = (k: string) => !area.has(k) && neighbours(k).some((n) => area.has(n));
  if (![...cells].some(([k, t]) => goldKeyOpens(t) && edge(k))) {
    const door = gateTile({ kind: "door", color: "yellow" }, 0, rng);
    // A fork's lanes keep their planned steps.
    const lanes = new Set(embedding.doorways.filter((d) => d.lane !== undefined).map((d) => point(d.x, d.y)));
    const guard = [...cells].find(([k, t]) => t.kind === "enemy" && t.enemy?.strength !== "boss" && !lanes.has(k) && edge(k));
    const optional = (child: number) => embedding.graph.nodes[child]?.route === "optional";
    const doorways = embedding.doorways
      .filter((d) => d.lane === undefined && area.has(point(d.x, d.y)) && cells.get(point(d.x, d.y))?.kind === "floor" && point(d.x, d.y) !== point(...ENTRY))
      .sort((a, b) => Number(optional(b.child)) - Number(optional(a.child)));
    const at = guard?.[0] ?? (doorways.length ? point(doorways[0].x, doorways[0].y) : undefined);
    if (at) cells.set(at, door);
  }
  // Placing the door can close off part of the area: the key must lie on its near side.
  const near = walkable(cells);
  if ([...near].some((k) => cells.get(k)?.kind === "key")) return;
  const open = freeFloor(cells, near);
  if (open.length) cells.set(open[Math.floor(rng() * open.length)], { kind: "key", color: "yellow" });
}

/** Floor 2: the way to the stairs crossing the fewest enemies (walls
 * block; doors and items don't), each enemy on it a Wooden Door with a gold
 * key on the way's next plain floor beyond it, so the start hall's key is
 * still there for the stairs' gold door (as on floors 2 to 5, a key lies
 * behind every door). */
function openWayWithoutFights(cells: Map<string, Tile>, room: number) {
  const way = fewestFights(cells);
  if (!way) return;
  way.forEach((k, i) => {
    if (cells.get(k)?.kind !== "enemy") return;
    cells.set(k, gateTile({ kind: "wood" }, room, () => 0));
    const behind = way.slice(i + 1).find((n) => cells.get(n)?.kind === "floor");
    if (behind) cells.set(behind, { kind: "key", color: "yellow" });
  });
}

/** The tiles from the way in to the stairs, crossing the fewest enemies
 * (a 0-1 breadth-first search: an enemy costs 1, anything else not a wall
 * 0), or undefined with no way. */
function fewestFights(cells: Map<string, Tile>): string[] | undefined {
  const from = start(), cost = new Map([[from, 0]]), back = new Map<string, string>();
  const deque = [from];
  while (deque.length) {
    const k = deque.shift()!, c = cost.get(k)!;
    if (cells.get(k)?.kind === "stairs") {
      const way = [k];
      for (let at = k; back.has(at); ) way.unshift((at = back.get(at)!));
      return way;
    }
    for (const n of neighbours(k)) {
      const t = cells.get(n);
      if (!t || t.kind === "wall") continue;
      const step = t.kind === "enemy" ? 1 : 0;
      if (cost.has(n) && cost.get(n)! <= c + step) continue;
      cost.set(n, c + step);
      back.set(n, k);
      if (step) deque.push(n);
      else deque.unshift(n);
    }
  }
  return undefined;
}
