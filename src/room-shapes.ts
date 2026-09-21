import { point, type Tile } from "./entities.ts";
export type RoomBounds = { x1: number; x2: number; y1: number; y2: number };
/** Erode connected chambers into stepped alcoves, wall fingers and pillars.
 * Doorway anchors are immutable; each edit is accepted only if every floor
 * cell still belongs to the same cardinally connected room. */
export function sculptRoom(
  cells: Map<string, Tile>,
  room: RoomBounds,
  base: number,
  rng: () => number,
  reserved: Set<string>,
) {
  const key = (x: number, y: number) => point(x, y + base);
  const floors = () => {
    const list: string[] = [];
    for (let y = room.y1; y <= room.y2; y++)
      for (let x = room.x1; x <= room.x2; x++)
        if (cells.get(key(x, y))?.kind === "floor") list.push(key(x, y));
    return list;
  };
  const inside = (x: number, y: number) =>
    x >= room.x1 && x <= room.x2 && y >= room.y1 && y <= room.y2;
  const target = Math.floor(floors().length * (0.2 + rng() * 0.2));
  let removed = 0;
  for (let attempt = 0; attempt < 80 && removed < target; attempt++) {
    const x = room.x1 + Math.floor(rng() * (room.x2 - room.x1 + 1));
    const y = room.y1 + Math.floor(rng() * (room.y2 - room.y1 + 1));
    if (reserved.has(point(x, y)) || cells.get(key(x, y))?.kind !== "floor")
      continue;
    // Prefer expanding the perimeter into irregular notches; occasional isolated
    // pillars create loops within a room, without making a bypass around its lock.
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const edge = neighbors.some(
      ([dx, dy]) =>
        !inside(x + dx, y + dy) ||
        cells.get(key(x + dx, y + dy))?.kind === "wall",
    );
    if (!edge && rng() < 0.75) continue;
    cells.set(key(x, y), { kind: "wall" });
    const remaining = floors();
    const free = remaining.filter((k) => {
      const [xx, yy] = k.split(",").map(Number);
      return !reserved.has(point(xx, yy - base));
    });
    const seen = new Set<string>(),
      queue = [remaining[0]];
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const [xx, yy] = k.split(",").map(Number);
      for (const [dx, dy] of neighbors) {
        const next = point(xx + dx, yy + dy);
        if (
          inside(xx + dx, yy + dy - base) &&
          cells.get(next)?.kind === "floor" &&
          !seen.has(next)
        )
          queue.push(next);
      }
    }
    if (free.length < 9 || seen.size !== remaining.length)
      cells.set(key(x, y), { kind: "floor" });
    else removed++;
  }
}
