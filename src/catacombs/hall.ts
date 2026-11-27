// A Catacomb hall (docs/CATACOMBS.md): a 17 × 17 board of walls with a
// three-tile corridor across its middle rows, six enemy slots pinching it,
// a Lore tile at its centre, stairs down at its right end, and on every 5th,
// 10th, 15th and 20th hall a treasure room holding an Ingot.
import { fixedHall, hallStrength, INGOT_EVERY, INGOTS, loreOnTile, spawnOdds, undeadStats, type CatacombStrength, type DropId, type IngotId, type UndeadId } from "./catalog.ts";

export const HALL_SIZE = 17;
/** The corridor's middle row, which the hero walks. */
export const CORRIDOR_ROW = 8;
/** The corridor's rows: the middle one and one either side. */
export const CORRIDOR_ROWS = [7, 8, 9] as const;
export const ENTRANCE_X = 0;
export const STAIRS_X = 16;
export const LORE_X = 8;
/** The six enemy slots' columns, E1 to E6. */
export const SLOT_XS = [2, 4, 6, 10, 12, 14] as const;

/** A crosshair on an undead: tapped, it takes a free hit (a gold one ×3). */
export type Mark = "crosshair" | "gold";
/** An enemy standing on a slot, the MHP it has left, the drops it rolled
 * (each amount: MXP and Spirit factors, attacks, MHP) and its crosshair. */
export type Slot = { id: UndeadId; strength: CatacombStrength; mhp: number; drops?: Partial<Record<DropId, number>>; mark?: Mark };

type Rect = { x: number; y: number; w: number; h: number };
/** Each Ingot's treasure room: its 3 × 3 tiles, the tiles that open it to
 * the corridor or the room it opens off, its Ingot's tile and its torch. */
export const ROOMS: Record<IngotId, { room: Rect; opening: readonly (readonly [number, number])[]; ingot: readonly [number, number]; torch: readonly [number, number] }> = {
  brass: { room: { x: 7, y: 3, w: 3, h: 3 }, opening: [[8, 6]], ingot: [8, 4], torch: [8, 2] },
  iron: { room: { x: 7, y: 11, w: 3, h: 3 }, opening: [[8, 10]], ingot: [8, 12], torch: [8, 14] },
  steel: { room: { x: 2, y: 3, w: 3, h: 3 }, opening: [[5, 4], [6, 4]], ingot: [3, 4], torch: [1, 4] },
  nickel: { room: { x: 2, y: 11, w: 3, h: 3 }, opening: [[5, 12], [6, 12]], ingot: [3, 12], torch: [1, 12] },
};
/** The corridor's side tiles, off the hero's path (rows 7 and 9, the slots'
 * walls and the way to the treasure rooms left out): where potions lie. */
export const SIDE_TILES: readonly (readonly [number, number])[] = [CORRIDOR_ROW - 1, CORRIDOR_ROW + 1].flatMap((y) =>
  Array.from({ length: HALL_SIZE }, (_, x) => x).filter((x) => x !== LORE_X && !(SLOT_XS as readonly number[]).includes(x)).map((x) => [x, y] as const));

/** The Ingots whose rooms hall `hall` has. */
export const hallIngots = (hall: number) => INGOTS.filter((i) => hall % INGOT_EVERY[i] === 0);
/** How many of Ingot `ingot` its tile on hall `hall` holds: its nth room in
 * the run (hall / every) times the number. */
export const ingotAmount = (ingot: IngotId, hall: number, number: number) => (hall / INGOT_EVERY[ingot]) * number;

/** What a hall tile is, as it stands before anyone acts. */
export type HallCell = "wall" | "floor" | "entrance" | "stairs" | "slot" | "lore" | "torch" | IngotId;

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const at = (p: readonly [number, number], x: number, y: number) => p[0] === x && p[1] === y;

/** Tile (x, y) of hall `hall`. Every slot's column is wall above and below
 * it, pinching the corridor, whether or not an enemy stands there. */
export function hallCell(hall: number, x: number, y: number): HallCell {
  if (x < 0 || y < 0 || x >= HALL_SIZE || y >= HALL_SIZE) return "wall";
  if (y === CORRIDOR_ROW) {
    if (x === ENTRANCE_X) return "entrance";
    if (x === STAIRS_X) return "stairs";
    if (x === LORE_X) return "lore";
    if ((SLOT_XS as readonly number[]).includes(x)) return "slot";
    return "floor";
  }
  if (y === CORRIDOR_ROW - 1 || y === CORRIDOR_ROW + 1) return (SLOT_XS as readonly number[]).includes(x) ? "wall" : "floor";
  for (const ingot of hallIngots(hall)) {
    const r = ROOMS[ingot];
    if (at(r.ingot, x, y)) return ingot;
    if (at(r.torch, x, y)) return "torch";
    if (inRect(r.room, x, y) || r.opening.some((p) => at(p, x, y))) return "floor";
  }
  return "wall";
}

/** One of a hall's targets, in the order the hero takes them. */
export type Target =
  | { kind: "enemy"; slot: number; x: number; y: number }
  | { kind: "lore"; x: number; y: number; amount: number }
  | { kind: "ingot"; ingot: IngotId; x: number; y: number; amount: number }
  | { kind: "stairs"; x: number; y: number };
/** The order the Ingot rooms are visited from the corridor's middle: up, up
 * left, down, down left. */
const ROOM_ORDER: readonly IngotId[] = ["brass", "steel", "iron", "nickel"];

/** Hall `hall`'s targets: E1 to E3, the Lore, the Ingots, E4 to E6, the
 * stairs, the empty slots left out. */
export function hallTargets(hall: number, number: number, slots: readonly (Slot | null)[]): Target[] {
  const enemy = (i: number): Target[] => (slots[i] ? [{ kind: "enemy", slot: i, x: SLOT_XS[i]!, y: CORRIDOR_ROW }] : []);
  const ingots = ROOM_ORDER.filter((i) => hall % INGOT_EVERY[i] === 0).map((ingot): Target =>
    ({ kind: "ingot", ingot, x: ROOMS[ingot].ingot[0], y: ROOMS[ingot].ingot[1], amount: ingotAmount(ingot, hall, number) }));
  return [
    ...enemy(0), ...enemy(1), ...enemy(2),
    { kind: "lore", x: LORE_X, y: CORRIDOR_ROW, amount: loreOnTile(number) },
    ...ingots,
    ...enemy(3), ...enemy(4), ...enemy(5),
    { kind: "stairs", x: STAIRS_X, y: CORRIDOR_ROW },
  ];
}

/** Rolls hall `hall`'s six slots from `rng`, one draw a slot (two for a
 * Strong, Elite or Boss hall's final slot, which is never empty: one picks
 * among the types open there by their odds). A hall that rolls no enemy
 * gets one Wisp on its last slot. A fixed hall (`FIXED_HALLS`) draws
 * nothing: its six stand as set, the last at the hall's strength. */
export function rollSlots(hall: number, number: number, rng: () => number): (Slot | null)[] {
  const odds = spawnOdds(hall), ranked = hallStrength(hall);
  const make = (id: UndeadId, strength: CatacombStrength): Slot => ({ id, strength, mhp: undeadStats(id, strength, hall, number).mhp });
  const fixed = fixedHall(hall);
  if (fixed) return fixed.map((id, i) => make(id, i === fixed.length - 1 && ranked ? ranked : "normal"));
  const slots: (Slot | null)[] = SLOT_XS.map((_, i): Slot | null => {
    if (i === SLOT_XS.length - 1 && ranked) return null;
    let roll = rng() * 100;
    for (const o of odds) if ((roll -= o.percent) < 0) return make(o.id, "normal");
    return null;
  });
  if (ranked) {
    const total = odds.reduce((s, o) => s + o.percent, 0);
    let roll = rng() * total, id: UndeadId = odds[odds.length - 1]?.id ?? "wisp";
    for (const o of odds) if ((roll -= o.percent) < 0) { id = o.id; break; }
    slots[SLOT_XS.length - 1] = make(id, ranked);
  }
  if (!slots.some((s) => s !== null)) slots[SLOT_XS.length - 1] = make("wisp", "normal");
  return slots;
}
