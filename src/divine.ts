// The Divine Portal and the Divine Relics (docs/gameplay/first-steps.md,
// docs/agents/divine.md): on floor 2 of the very first climb, a portal
// leads to the builders' room on floor 999999, where the Chrono Anchor
// waits in a chest. Until the hero holds it and stands on floor 2 again, the
// first climb can't be ended.
import { TOWER_START_X } from "./config.ts";
import { point, type Tile } from "./entities.ts";
import type { Save } from "./save/shape.ts";

/** The floor the builders' room says it is: not a real floor, a narrative one. */
export const DIVINE_FLOOR = 999_999;
/** The Tower I floor (`run.height`, so floor 2) the first climb's portal opens on. */
export const PORTAL_HEIGHT = 1;
/** How long the floor takes to fade out as the hero steps into a Divine
 * Portal, and to fade in where it arrives, in ms. */
export const PORTAL_FADE_MS = 700;
/** How far from the entrance, in steps, the portal stands at best, and the
 * nearest and farthest it may. */
const PORTAL_STEPS = 4;
const PORTAL_MIN = 2, PORTAL_MAX = 8;

/** The Divine Relics: each unique, granted by the builders themselves, and
 * shown in the Relics page's Divine category, after the rarities. They give
 * no bonus; each changes what the hero can do. */
export const DIVINE_RELICS = {
  chronoAnchor: {
    name: "Chrono Anchor",
    text: "A unique, one-in-a-trillion artifact, enabling you to loop through time.",
    icon: "relic-divine-chrono-anchor",
  },
} as const satisfies Record<string, { name: string; text: string; icon: string }>;
export type DivineRelicId = keyof typeof DIVINE_RELICS;
export const DIVINE_RELIC_IDS = Object.keys(DIVINE_RELICS) as DivineRelicId[];

/** The saved Divine Relics: known ids, each once, in catalog order. */
export const decodeDivineRelics = (raw: unknown): DivineRelicId[] =>
  Array.isArray(raw) ? DIVINE_RELIC_IDS.filter((id) => raw.includes(id)) : [];

/** Whether the hero holds the Chrono Anchor. */
export const hasAnchor = (save: Pick<Save, "divineRelics">) => save.divineRelics.includes("chronoAnchor");

/** Whether the Divine Portal can still open: the Chrono Anchor not yet held,
 * in the first climb (no Tower climb ended yet, `tutorials.chamber`). */
export const portalOpen = (save: Pick<Save, "divineRelics" | "tutorials">) => !hasAnchor(save) && !save.tutorials.chamber;

/** Whether the first climb can't be ended yet: until the Chrono Anchor is
 * held and the hero is back from the builders' room (`inRoom`). */
export const endLocked = (save: Pick<Save, "divineRelics" | "tutorials">, inRoom: boolean) =>
  !save.tutorials.chamber && (!hasAnchor(save) || inRoom);

/** Where the Divine Portal stands on floor 2: the plain floor tile `PORTAL_STEPS`
 * steps from the entrance (or as near that as the hero can walk, from
 * `PORTAL_MIN` to `PORTAL_MAX`), walking only over open floor, never on the way
 * in, the tile just inside or a torch's tile (`avoid`). Fixed by the floor
 * alone: of the best, the lowest row's leftmost. Null when there is none. */
export function portalSpot(tile: (x: number, y: number) => Tile, avoid: ReadonlySet<string>): { x: number; y: number } | null {
  const start = { x: TOWER_START_X, y: 0 }, steps = new Map<string, number>([[point(start.x, start.y), 0]]);
  const queue = [start];
  let best: { x: number; y: number; off: number } | null = null;
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i]!, d = steps.get(point(at.x, at.y))!;
    if (d >= PORTAL_MIN && !avoid.has(point(at.x, at.y))) {
      const off = Math.abs(d - PORTAL_STEPS);
      if (!best || off < best.off || (off === best.off && (at.y < best.y || (at.y === best.y && at.x < best.x)))) best = { ...at, off };
    }
    if (d >= PORTAL_MAX) continue;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
      const next = { x: at.x + dx, y: at.y + dy }, k = point(next.x, next.y);
      if (steps.has(k) || tile(next.x, next.y).kind !== "floor") continue;
      steps.set(k, d + 1);
      queue.push(next);
    }
  }
  return best && { x: best.x, y: best.y };
}
