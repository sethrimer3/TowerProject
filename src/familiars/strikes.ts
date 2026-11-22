import type { Board } from "../board.ts";
import { SLOWDOWN_CAP } from "../arcana/time-dilation.ts";
import { beamFactor, type Beams } from "../arcana/overseer.ts";
import { isBoss } from "../combat.ts";
import { foeOn, TURN_TICKS } from "../enemies/ranged.ts";
import { point, type Player, type Point, type Tile } from "../entities.ts";
import { snap } from "../exact.ts";
import { arcaneStrike, shortWay, type Shot, type VolleyKill } from "../volley.ts";
import { LINGER_TURNS } from "./catalog.ts";
import { inArea, type Area, type Burst } from "./rules.ts";

// What the Dragon and the Slime do to enemies (docs/agents/familiars.md).
// They edit only the board they are given.

/** Every enemy, a Flying one too, on a tile whose center lies in `area`, by
 * row and column. Only the area's own tiles are read, so a Delve builds no
 * more of itself than that. */
export function foesIn(board: Pick<Board, "tile">, area: Area): Point[] {
  const found: Point[] = [], seen = new Set<string>(), reach = Math.ceil(area.reach / 100), { wrap } = area;
  for (let y = Math.floor(area.y) - reach; y <= Math.ceil(area.y) + reach; y++)
    for (let column = Math.floor(area.x) - reach; column <= Math.ceil(area.x) + reach; column++) {
      if (!inArea(area, column, y)) continue;
      const x = wrap ? ((column % wrap) + wrap) % wrap : column, key = point(x, y);
      if (seen.has(key)) continue;
      seen.add(key);
      if (foeOn(board.tile(x, y))) found.push({ x, y });
    }
  return found;
}

/** The Slime's burst: each enemy in it stunned for `duration` (a longer stun
 * kept) and left to linger at `linger` percent times the Wisp's boost. A
 * boss or Greater Boss takes half of both, rounded down. */
export function slimeStrike(board: Pick<Board, "tile" | "markStun" | "markLinger">, { area, boost }: Burst, rule: { duration: number; linger: number }) {
  for (const { x, y } of foesIn(board, area)) {
    const tile = board.tile(x, y), half = isBoss(foeOn(tile)!) ? 2 : 1;
    const stun = Math.floor(rule.duration / half), slow = Math.min(SLOWDOWN_CAP, Math.floor((rule.linger * boost) / (100 * half)));
    if (stun > (tile.stun ?? 0)) board.markStun?.(x, y, stun);
    if (slow) board.markLinger?.(x, y, LINGER_TURNS, slow);
  }
}

type Striker = { board: Pick<Board, "tile" | "clear" | "wound" | "markBurn">; wrap: number; hero: Player; beams?: Beams };

/** The Dragon's burst: each enemy in it takes `damage` (Arcanum Damage's
 * boost on the hero's ATK) times the Wisp's at once, through DEF, Overseer's
 * beams as the turn began (the hero at `from`), and what stands burns.
 * Returns the shots, the kills and the tiles set alight, which first tick
 * the turn after. */
export function dragonStrike({ board, wrap, hero, beams }: Striker, { area, boost }: Burst, damage: number, from: Point) {
  const shots: Shot[] = [], kills: VolleyKill[] = [], lit = new Set<string>();
  for (const to of foesIn(board, area)) {
    const beam = beamFactor(beams, 0, shortWay(to.x - from.x, wrap), to.y - from.y);
    arcaneStrike(board, hero, to, snap((damage * boost * beam) / 100), { from: to, tick: 1, familiar: true }, shots, kills);
    if (!foeOn(board.tile(to.x, to.y))) continue;
    board.markBurn?.(to.x, to.y, boost);
    lit.add(point(to.x, to.y));
  }
  return { shots, kills, lit };
}

/** A turn's burns, as it ends: each burned enemy, wherever it stands now,
 * takes `damage` again times the Wisp's boost it was lit with, but for those
 * lit this turn (`lit`). */
export function burnTicks({ board, wrap, hero, beams }: Striker, changes: Readonly<Record<string, Tile>>, damage: number, lit: ReadonlySet<string>) {
  const shots: Shot[] = [], kills: VolleyKill[] = [];
  for (const key of Object.keys(changes)) {
    const boost = changes[key]!.burn;
    if (!boost || lit.has(key)) continue;
    const [x, y] = key.split(",").map(Number) as [number, number];
    const beam = beamFactor(beams, TURN_TICKS, shortWay(x - hero.x, wrap), y - hero.y);
    arcaneStrike(board, hero, { x, y }, snap((damage * boost * beam) / 100), { from: { x, y }, tick: TURN_TICKS, familiar: true }, shots, kills);
  }
  // A tick that can't get past DEF raises no number, as the decay's doesn't.
  return { shots: shots.filter((s) => s.damage > 0), kills };
}
