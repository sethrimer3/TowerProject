import type { Player } from "../entities.ts";
import { finite, isRecord, wholeIn } from "../decode.ts";

export const ARENA_SIZE = 50;
export const ELEMENTAL = { x: 25, y: 25 };
export const BEAM_INTERVAL = 10;
export const BEAM_AXES = [[0, 1], [1, 1], [1, 0], [1, -1]] as const;
export type Spot = { x: number; y: number };
export type TrialState = {
  room: "staging" | "arena";
  status: "active" | "won" | "lost";
  player: Spot & { hp: number; maxHp: number; attack: number; defense: number };
  bossHp: number;
  bossMaxHp: number;
  steps: number;
  consumed: string[];
  scorches: Record<string, number>;
};
export const key = ({ x, y }: Spot) => `${x},${y}`;

/** A six-sided room: two horizontal caps and four stair-stepped diagonals. */
export function arenaFloor(x: number, y: number) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 2 && x <= 47 && y >= 2 && y <= 47
    && Math.abs(x - 24.5) + Math.abs(y - 24.5) / 2 <= 22.5;
}
export const floorAt = (room: TrialState["room"], x: number, y: number) => room === "staging"
  ? Number.isInteger(x) && Number.isInteger(y) && x >= 1 && x <= 7 && y >= 1 && y <= 7
  : arenaFloor(x, y);
export const wallEdge = (x: number, y: number) => !arenaFloor(x, y)
  && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => arenaFloor(x+dx,y+dy));

export const ARENA_TORCHES: Spot[] = [];
export const ARENA_POTIONS: Spot[] = [];
for (let y = 1; y < ARENA_SIZE - 1; y++) for (let x = 1; x < ARENA_SIZE - 1; x++) {
  if (wallEdge(x, y) && (x + y * 3) % 7 === 0) ARENA_TORCHES.push({ x, y });
  if (arenaFloor(x, y) && (x + y * 3) % 9 === 0
    && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => !arenaFloor(x+dx,y+dy))) ARENA_POTIONS.push({ x, y });
}

export function startTrial(player: Player): TrialState {
  const bossMaxHp = Math.max(240, player.attack * 24);
  return { room: "staging", status: "active", player: { x: 4, y: 2, hp: player.maxHp, maxHp: player.maxHp, attack: player.attack, defense: player.defense },
    bossHp: bossMaxHp, bossMaxHp, steps: 0, consumed: [], scorches: {} };
}

/** Rays include the first wall they strike, so the wall keeps a burn too. */
export function beamCells(axis: number): Spot[] {
  const [dx, dy] = BEAM_AXES[axis % BEAM_AXES.length];
  const cells: Spot[] = [];
  for (const sign of [-1, 1]) for (let d = 1; d < ARENA_SIZE; d++) {
    const x = ELEMENTAL.x + dx * d * sign, y = ELEMENTAL.y + dy * d * sign;
    cells.push({ x, y });
    if (!arenaFloor(x, y)) break;
  }
  return cells;
}
export const nextBeamAxis = (s: TrialState) => Math.floor(s.steps / BEAM_INTERVAL) % BEAM_AXES.length;

/** One accepted action is a turn: move one tile, strike the boss by walking
 * into it, or wait. Blocked moves never advance the beam countdown. */
export function trialStep(s: TrialState, dx: number, dy: number): { changed: boolean; message: string; fired: boolean } {
  const unchanged = { changed: false, message: "", fired: false };
  if (s.status !== "active" || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) > 1) return unchanged;
  const x = s.player.x + dx, y = s.player.y + dy;
  if (!floorAt(s.room, x, y)) return unchanged;
  if (s.room === "staging") {
    s.player.x = x; s.player.y = y;
    if (x === 4 && y === 6) {
      s.room = "arena"; s.player.x = 25; s.player.y = 4;
      return { changed: true, message: "The Light Elemental waits in the dark. First beam: north–south in 10 turns.", fired: false };
    }
    return { changed: true, message: "Climb the staircase to enter the trial.", fired: false };
  }
  let message = "";
  if (x === ELEMENTAL.x && y === ELEMENTAL.y) {
    s.bossHp = Math.max(0, s.bossHp - Math.max(1, s.player.attack));
    if (s.bossHp === 0) {
      s.status = "won";
      return { changed: true, message: "Trial complete — the Light Elemental is defeated.", fired: false };
    }
    const damage = Math.max(1, Math.ceil(s.player.maxHp * 0.04) - Math.floor(s.player.defense * 0.1));
    s.player.hp = Math.max(0, s.player.hp - damage);
    message = `You strike the elemental. Its radiance deals ${damage} damage.`;
  } else {
    s.player.x = x; s.player.y = y;
    const k = key(s.player);
    if (ARENA_POTIONS.some(p => key(p) === k) && !s.consumed.includes(k)) {
      const healed = Math.min(s.player.maxHp - s.player.hp, Math.ceil(s.player.maxHp * 0.35));
      s.player.hp += healed; s.consumed.push(k);
      message = `Potion restores ${healed} HP.`;
    }
  }
  s.steps++;
  const fired = s.steps % BEAM_INTERVAL === 0;
  if (fired) {
    const cells = beamCells((s.steps / BEAM_INTERVAL - 1) % 4);
    for (const p of cells) s.scorches[key(p)] = s.steps;
    if (cells.some(p => p.x === s.player.x && p.y === s.player.y)) {
      const damage = Math.max(1, Math.ceil(s.player.maxHp * 0.25));
      s.player.hp = Math.max(0, s.player.hp - damage);
      message = `The light beam hits you for ${damage} damage!`;
    } else message ||= "Twin beams sear the stone. The next pair turns 45° clockwise.";
  }
  if (s.player.hp === 0) { s.status = "lost"; message = "The trial ends in defeat. Your Tower progress is safe."; }
  return { changed: true, message, fired };
}

/** Defensive, bounded trial loading; older saves simply have no trial. */
export function decodeTrial(raw: unknown): TrialState | undefined {
  if (!isRecord(raw) || !isRecord(raw.player) || !["staging","arena"].includes(raw.room)
    || !["active","won","lost"].includes(raw.status)) return;
  const p = raw.player;
  if (![p.hp,p.maxHp,p.attack,p.defense,raw.bossHp,raw.bossMaxHp].every(n => finite(n, 1e100))
    || p.maxHp <= 0 || p.hp > p.maxHp || raw.bossMaxHp <= 0 || raw.bossHp > raw.bossMaxHp
    || !wholeIn(raw.steps, 0, 1e9) || !floorAt(raw.room, p.x, p.y)
    || (raw.room === "arena" && p.x === ELEMENTAL.x && p.y === ELEMENTAL.y)
    || (raw.status === "active" && (p.hp === 0 || raw.bossHp === 0))
    || (raw.status === "won" && raw.bossHp !== 0) || (raw.status === "lost" && p.hp !== 0)) return;
  const validKey = (k: string) => {
    if (!/^\d{1,2},\d{1,2}$/.test(k)) return false;
    const [x,y] = k.split(",").map(Number);
    return arenaFloor(x,y) || wallEdge(x,y);
  };
  const scorches: Record<string, number> = {};
  if (isRecord(raw.scorches)) for (const [k,v] of Object.entries(raw.scorches).slice(0,2500)) {
    if (validKey(k) && wholeIn(v, 10, raw.steps) && v % 10 === 0) scorches[k] = v;
  }
  const consumed = Array.isArray(raw.consumed) ? raw.consumed.slice(0,ARENA_POTIONS.length).filter((k: unknown) => typeof k === "string" && ARENA_POTIONS.some(p => key(p) === k)) : [];
  return { room: raw.room, status: raw.status, player: { x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,attack:p.attack,defense:p.defense },
    bossHp:raw.bossHp,bossMaxHp:raw.bossMaxHp,steps:raw.steps,consumed:[...new Set<string>(consumed)],scorches };
}
