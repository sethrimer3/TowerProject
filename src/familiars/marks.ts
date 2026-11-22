import type { Enemy, Tile } from "../entities.ts";
import { snap } from "../exact.ts";
import { wholeIn, isRecord } from "../save/decode.ts";
import { inArea, type BoostArea } from "./rules.ts";

// What familiars leave on enemies (docs/agents/familiars.md). The Dragon's
// burn and the Slime's linger lie on the tile in `run.changes`, beside a
// wound, and move with the enemy. What they do is read as the board reads
// the tile, never saved: so every fight, shot, preview and planner sees one
// ATK, and what is saved stays as generated.

/** A linger: its turns left, which wait while a stun is on the enemy, and the percent it slows by. */
export type Linger = { turns: number; slow: number };

/** What the board reads enemies through: the Dragon's Damage Reduction while
 * it is on, whether the Slime is on, and the Wolf's area while planted. */
export type FamiliarSight = { cut?: number; lingers?: boolean; tag?: BoostArea };

/** The tile at (x, y) as the familiars make it: a burned enemy's ATK cut, a
 * lingering one's slow and what a tagged one's damage is multiplied by read
 * onto it. A familiar switched off leaves its marks lying, doing nothing. */
export function familiarTile(t: Tile, x: number, y: number, sight: (() => FamiliarSight | undefined) | undefined): Tile {
  const foe = t.enemy ?? t.flyer;
  if (!foe || !sight) return t;
  const seen = sight();
  if (!seen) return t;
  const burns = !!t.burn && seen.cut !== undefined, lingers = !!t.linger && !!seen.lingers, tagged = !!seen.tag && inArea(seen.tag, x, y);
  if (!burns && !lingers && !tagged) return t;
  const enemy: Enemy = {
    ...foe,
    ...(burns ? { burned: true as const, attack: snap((foe.attack * (100 - seen.cut!)) / 100) } : {}),
    ...(lingers ? { linger: t.linger!.slow } : {}),
    ...(tagged ? { tagged: seen.tag!.factor } : {}),
  };
  return t.enemy ? { ...t, enemy } : { ...t, flyer: enemy };
}

/** `raw` set alight with the Wisp's boost (hundredths, 100 without): one
 * burn an enemy, the higher boost kept. */
export const burnMark = (raw: Tile, boost: number): Tile => ({ ...raw, burn: Math.max(raw.burn ?? 0, boost) });

/** `raw` left lingering for `turns`, the stronger slow kept. */
export const lingerMark = (raw: Tile, turns: number, slow: number): Tile =>
  ({ ...raw, linger: { turns, slow: Math.max(raw.linger?.slow ?? 0, slow) } });

/** `raw` a turn on: its linger a turn shorter, gone at none. */
export function lingerWorn(raw: Tile): Tile {
  const { linger, ...rest } = raw;
  return linger && linger.turns > 1 ? { ...rest, linger: { ...linger, turns: linger.turns - 1 } } : rest;
}

/** What a saved tile may hold of them. */
export const validFamiliarMarks = (v: { burn?: unknown; linger?: unknown }) =>
  (v.burn === undefined || wholeIn(v.burn, 100, 10_000)) &&
  (v.linger === undefined || (isRecord(v.linger) && wholeIn(v.linger.turns, 1, 1000) && wholeIn(v.linger.slow, 1, 90)));
