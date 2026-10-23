import type { Player } from "../entities.ts";
import { CARDS, type CardId } from "../cards.ts";
import { finite, isRecord, wholeIn } from "../decode.ts";
import { tileRandom } from "../random.ts";

export const ARENA_SIZE = 25;
export const ELEMENTAL = { x: 12, y: 12 };
export const BEAM_INTERVAL = 10;
export const SLIME_INTERVAL = 3;
export const MAX_SLIMES = 6;
export const BEAM_AXES = [[0, 1], [1, 1], [1, 0], [1, -1]] as const;
export type Spot = { x: number; y: number };
export type TrialMode = "cards" | "manual";
export type Elemental = Spot & { incorporeal: boolean; teleport: { from: Spot; step: number } | null };
export type Beam = { origin: Spot; axis: number; step: number };
export type LightSlime = Spot & { id: number; from: Spot; jumped: number };
export type TrialState = {
  version: 2;
  mode: TrialMode;
  hand: CardId[];
  playing: boolean;
  seed: number;
  room: "staging" | "arena";
  status: "active" | "won" | "lost";
  player: Spot & { hp: number; maxHp: number; attack: number; defense: number };
  elemental: Elemental;
  beam: Beam | null;
  bossHp: number;
  bossMaxHp: number;
  steps: number;
  slimes: LightSlime[];
  consumed: string[];
  scorches: Record<string, number>;
};
export const key = ({ x, y }: Spot) => `${x},${y}`;
const same = (a: Spot, b: Spot) => a.x === b.x && a.y === b.y;
const directions = [[1,0],[-1,0],[0,1],[0,-1]];

/** A six-sided room, including its walls, inside a 25×25 tile square. */
export function arenaFloor(x: number, y: number) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 1 && x <= 23 && y >= 1 && y <= 23
    && Math.abs(x - ELEMENTAL.x) + Math.abs(y - ELEMENTAL.y) / 2 <= 11;
}
export const floorAt = (room: TrialState["room"], x: number, y: number) => room === "staging"
  ? Number.isInteger(x) && Number.isInteger(y) && x >= 1 && x <= 7 && y >= 1 && y <= 7
  : arenaFloor(x, y);
export const wallEdge = (x: number, y: number) => !arenaFloor(x, y)
  && [...directions,[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx,dy]) => arenaFloor(x+dx,y+dy));

export const ARENA_TORCHES: Spot[] = [];
export const ARENA_POTIONS: Spot[] = [];
for (let y = 0; y < ARENA_SIZE; y++) for (let x = 0; x < ARENA_SIZE; x++) {
  if (wallEdge(x, y) && directions.some(([dx,dy])=>arenaFloor(x+dx,y+dy)) && (x + y * 3) % 5 === 0) ARENA_TORCHES.push({ x, y });
  if (arenaFloor(x, y) && (x + y * 3) % 5 === 2
    && directions.some(([dx,dy]) => !arenaFloor(x+dx,y+dy))) ARENA_POTIONS.push({ x, y });
}

export function startTrial(player: Pick<Player, "maxHp" | "attack" | "defense">, mode: TrialMode = "manual", hand: readonly CardId[] = [], seed = 7391): TrialState {
  const bossMaxHp = Math.max(240, player.attack * 24);
  return { version: 2, mode, hand: mode === "cards" ? [...hand] : [], playing: mode === "cards", seed: seed >>> 0,
    room: "staging", status: "active", player: { x: 4, y: 2, hp: player.maxHp, maxHp: player.maxHp, attack: player.attack, defense: player.defense },
    elemental: {...ELEMENTAL,incorporeal:false,teleport:null}, beam:null,
    bossHp: bossMaxHp, bossMaxHp, steps: 0, slimes: [], consumed: [], scorches: {} };
}

/** Rays include the first wall they strike, so the wall keeps a burn too. */
export function beamCells(axis: number, origin: Spot = ELEMENTAL): Spot[] {
  const [dx, dy] = BEAM_AXES[axis % BEAM_AXES.length];
  const cells: Spot[] = [];
  for (const sign of [-1, 1]) for (let d = 1; d < ARENA_SIZE; d++) {
    const x = origin.x + dx * d * sign, y = origin.y + dy * d * sign;
    cells.push({ x, y });
    if (!arenaFloor(x, y)) break;
  }
  return cells;
}
export const nextBeamAxis = (s: TrialState) => Math.floor(s.steps / BEAM_INTERVAL) % BEAM_AXES.length;

/** Every third arena turn, hop existing slimes and release another from the
 * elemental. Coordinate hashes make the random destinations survive reloads. */
function hopSlimes(s: TrialState) {
  const occupied = new Set(s.slimes.map(key));
  const next: LightSlime[] = [];
  let hits = 0;
  const hop = (slime: LightSlime) => {
    occupied.delete(key(slime));
    const choices: Spot[] = [];
    for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
      const p = { x: slime.x+dx, y: slime.y+dy };
      if ((dx || dy) && arenaFloor(p.x,p.y) && !same(p,s.elemental) && !occupied.has(key(p))) choices.push(p);
    }
    const target = choices[Math.floor(tileRandom(slime.id,s.steps,s.seed) * choices.length)] ?? slime;
    if (same(target,s.player)) {
      s.player.hp = Math.max(0,s.player.hp-Math.max(1,Math.ceil(s.player.maxHp*.05)));
      hits++;
    } else {
      next.push({ id: slime.id, ...target, from: { x: slime.x, y: slime.y }, jumped: s.steps });
      occupied.add(key(target));
    }
  };
  for (const slime of s.slimes) hop(slime);
  if (next.length < MAX_SLIMES) hop({ id: s.steps / SLIME_INTERVAL, x:s.elemental.x,y:s.elemental.y, from: {x:s.elemental.x,y:s.elemental.y}, jumped: s.steps });
  s.slimes = next;
  return hits;
}

/** A hit scatters the elemental to a different, unoccupied interior tile. */
function teleportElemental(s: TrialState) {
  const from = {x:s.elemental.x,y:s.elemental.y}, choices: Spot[] = [];
  for(let y=1;y<ARENA_SIZE-1;y++) for(let x=1;x<ARENA_SIZE-1;x++) {
    const p={x,y};
    if (!arenaFloor(x,y) || same(p,s.player) || s.slimes.some(q=>same(p,q))
      || ARENA_POTIONS.some(q=>same(p,q)) || !directions.every(([dx,dy])=>arenaFloor(x+dx,y+dy))) continue;
    if(Math.abs(x-from.x)+Math.abs(y-from.y)>=6 && Math.abs(x-s.player.x)+Math.abs(y-s.player.y)>=3) choices.push(p);
  }
  const target=choices[Math.floor(tileRandom(s.steps+1,from.x+from.y*ARENA_SIZE,s.seed^0x11a7)*choices.length)];
  s.elemental={...target,incorporeal:true,teleport:{from,step:s.steps+1}};
}

/** A ghost is walkable. If the hero occupies its tile when it reforms,
 * materialize in the closest free tile before casting the rays. */
function materialize(s: TrialState) {
  const boss=s.elemental;
  if(same(boss,s.player)) {
    const choices: Spot[]=[];
    for(let y=1;y<ARENA_SIZE-1;y++) for(let x=1;x<ARENA_SIZE-1;x++) {
      const p={x,y};
      if(arenaFloor(x,y) && !same(p,s.player) && !s.slimes.some(q=>same(p,q)) && !ARENA_POTIONS.some(q=>same(p,q))) choices.push(p);
    }
    choices.sort((a,b)=>(Math.abs(a.x-boss.x)+Math.abs(a.y-boss.y))-(Math.abs(b.x-boss.x)+Math.abs(b.y-boss.y)));
    const target=choices[0];
    boss.x=target.x; boss.y=target.y;
  }
  boss.incorporeal=false;
}

/** Only the matching input source may spend a turn. Walls cost no turns. */
export function trialStep(s: TrialState, dx: number, dy: number, source: TrialMode = "manual"): { changed: boolean; message: string; fired: boolean } {
  const unchanged = { changed: false, message: "", fired: false };
  if (s.mode !== source || (source === "cards" && !s.playing) || s.status !== "active"
    || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) > 1) return unchanged;
  const x = s.player.x + dx, y = s.player.y + dy;
  if (!floorAt(s.room, x, y)) return unchanged;
  if (s.room === "staging") {
    s.player.x = x; s.player.y = y;
    if (x === 4 && y === 6) {
      s.room = "arena"; s.player.x = ELEMENTAL.x; s.player.y = 2;
      return { changed: true, message: "The Light Elemental waits in the dark. First beam: north–south in 10 turns.", fired: false };
    }
    return { changed: true, message: "Climb the staircase to enter the trial.", fired: false };
  }
  let message = "";
  if (x === s.elemental.x && y === s.elemental.y && !s.elemental.incorporeal) {
    s.bossHp = Math.max(0, s.bossHp - Math.max(1, s.player.attack));
    if (s.bossHp === 0) {
      s.status = "won"; s.playing = false; s.slimes = [];
      return { changed: true, message: "Trial complete — the Light Elemental is defeated.", fired: false };
    }
    const damage = Math.max(1, Math.ceil(s.player.maxHp * 0.04) - Math.floor(s.player.defense * 0.1));
    s.player.hp = Math.max(0, s.player.hp - damage);
    teleportElemental(s);
    message = `You strike the elemental for ${Math.max(1,s.player.attack)} damage. It scatters into light, invincible until its next lasers. Its radiance deals ${damage} damage.`;
  } else {
    const slime = s.slimes.findIndex(p => p.x === x && p.y === y);
    if (slime >= 0) { s.slimes.splice(slime,1); message = "You disperse a light slime."; }
    s.player.x = x; s.player.y = y;
    const k = key(s.player);
    if (ARENA_POTIONS.some(p => key(p) === k) && !s.consumed.includes(k)) {
      const healed = Math.min(s.player.maxHp - s.player.hp, Math.ceil(s.player.maxHp * 0.35));
      s.player.hp += healed; s.consumed.push(k);
      message = `Potion restores ${healed} HP.`;
    }
  }
  s.steps++;
  if (s.player.hp > 0 && s.steps % SLIME_INTERVAL === 0) {
    const hits = hopSlimes(s);
    if (hits) message = `A light slime lands on you! ${hits * Math.max(1,Math.ceil(s.player.maxHp*.05))} damage.`;
    else message ||= "Light slimes leap through the dark.";
  }
  const fired = s.steps % BEAM_INTERVAL === 0;
  if (fired) {
    const wasGhost=s.elemental.incorporeal;
    materialize(s);
    s.beam={origin:{x:s.elemental.x,y:s.elemental.y},axis:(s.steps/BEAM_INTERVAL-1)%4,step:s.steps};
    const cells = beamCells(s.beam.axis,s.beam.origin);
    if(wasGhost) message="The elemental fires its lasers and becomes corporeal — it can be struck again.";
    for (const p of cells) s.scorches[key(p)] = s.steps;
    if (cells.some(p => same(p,s.player))) {
      const damage = Math.max(1, Math.ceil(s.player.maxHp * 0.25));
      s.player.hp = Math.max(0, s.player.hp - damage);
      message = `The light beam hits you for ${damage} damage!`;
    } else message ||= "Twin beams sear the stone. The next pair turns 45° clockwise.";
  }
  if (s.player.hp === 0) { s.status = "lost"; s.playing = false; message = "The trial ends in defeat. Your Tower progress is safe."; }
  return { changed: true, message, fired };
}

/** Legacy 50×50 attempts restart safely in staging with their copied stats. */
export function decodeTrial(raw: unknown): TrialState | undefined {
  if (!isRecord(raw) || !isRecord(raw.player) || !["staging","arena"].includes(raw.room)
    || !["active","won","lost"].includes(raw.status)) return;
  const p = raw.player;
  if (![p.hp,p.maxHp,p.attack,p.defense,raw.bossHp,raw.bossMaxHp].every(n => finite(n, 1e100))
    || p.maxHp <= 0 || p.hp > p.maxHp || raw.bossMaxHp <= 0 || raw.bossHp > raw.bossMaxHp
    || !wholeIn(raw.steps, 0, 1e9)) return;
  if (raw.version === undefined) return startTrial({maxHp:p.maxHp,attack:p.attack,defense:p.defense});
  const position = {x:p.x,y:p.y};
  const e=raw.elemental;
  let elemental: Elemental={...ELEMENTAL,incorporeal:false,teleport:null};
  if(e!==undefined) {
    if(!isRecord(e) || !arenaFloor(e.x,e.y) || typeof e.incorporeal!=="boolean") return;
    let teleport: Elemental["teleport"]=null;
    if(e.teleport!==null) {
      const t=e.teleport;
      if(!isRecord(t) || !isRecord(t.from) || !arenaFloor(t.from.x,t.from.y) || !wholeIn(t.step,1,raw.steps)) return;
      teleport={from:{x:t.from.x,y:t.from.y},step:t.step};
    }
    if(e.incorporeal && (raw.room!=="arena" || raw.status==="won" || !teleport)) return;
    elemental={x:e.x,y:e.y,incorporeal:e.incorporeal,teleport};
  }
  let beam: Beam | null=null;
  if(raw.beam!==undefined && raw.beam!==null) {
    const b=raw.beam;
    if(!isRecord(b) || !isRecord(b.origin) || !arenaFloor(b.origin.x,b.origin.y)
      || !wholeIn(b.step,BEAM_INTERVAL,raw.steps) || b.step%BEAM_INTERVAL!==0
      || !wholeIn(b.axis,0,BEAM_AXES.length-1) || b.axis!==(b.step/BEAM_INTERVAL-1)%4) return;
    beam={origin:{x:b.origin.x,y:b.origin.y},axis:b.axis,step:b.step};
  } else if(raw.elemental===undefined && raw.steps>=BEAM_INTERVAL) {
    const step=Math.floor(raw.steps/BEAM_INTERVAL)*BEAM_INTERVAL;
    beam={origin:{...ELEMENTAL},axis:(step/BEAM_INTERVAL-1)%4,step};
  }
  if (raw.version !== 2 || !["cards","manual"].includes(raw.mode) || typeof raw.playing !== "boolean"
    || !wholeIn(raw.seed,0,0xffffffff) || !Array.isArray(raw.hand) || raw.hand.length > 64
    || raw.hand.some((id: unknown) => typeof id !== "string" || !Object.hasOwn(CARDS,id))
    || (raw.mode === "manual" && (raw.hand.length > 0 || raw.playing))
    || !floorAt(raw.room, p.x, p.y) || (raw.room === "arena" && !elemental.incorporeal && same(position,elemental))
    || (raw.status === "active" && (p.hp === 0 || raw.bossHp === 0))
    || (raw.status === "won" && raw.bossHp !== 0) || (raw.status === "lost" && p.hp !== 0)
    || (raw.status !== "active" && raw.playing)) return;
  const validKey = (k: string) => {
    if (!/^\d{1,2},\d{1,2}$/.test(k)) return false;
    const [x,y] = k.split(",").map(Number);
    return arenaFloor(x,y) || wallEdge(x,y);
  };
  const scorches: Record<string, number> = {};
  if (isRecord(raw.scorches)) for (const [k,v] of Object.entries(raw.scorches).slice(0,ARENA_SIZE*ARENA_SIZE)) {
    if (validKey(k) && wholeIn(v, BEAM_INTERVAL, raw.steps) && v % BEAM_INTERVAL === 0) scorches[k] = v;
  }
  const consumed = Array.isArray(raw.consumed) ? raw.consumed.slice(0,ARENA_POTIONS.length).filter((k: unknown) => typeof k === "string" && ARENA_POTIONS.some(p => key(p) === k)) : [];
  const slimes: LightSlime[] = [], occupied = new Set<string>(), ids = new Set<number>();
  if (!Array.isArray(raw.slimes) || raw.slimes.length > MAX_SLIMES || (raw.room === "staging" && raw.slimes.length)) return;
  for (const slime of raw.slimes) {
    if (!isRecord(slime) || !isRecord(slime.from)) return;
    const position = {x:slime.x,y:slime.y};
    if (!wholeIn(slime.id,1,Math.floor(raw.steps/SLIME_INTERVAL))
      || ids.has(slime.id) || !arenaFloor(slime.x,slime.y) || same(position,elemental) || same(position,{x:p.x,y:p.y})
      || occupied.has(key(position)) || !arenaFloor(slime.from.x,slime.from.y)
      || !wholeIn(slime.jumped,SLIME_INTERVAL,raw.steps) || slime.jumped % SLIME_INTERVAL !== 0
      || Math.abs(slime.x-slime.from.x)>2 || Math.abs(slime.y-slime.from.y)>2) return;
    slimes.push({id:slime.id,x:slime.x,y:slime.y,from:{x:slime.from.x,y:slime.from.y},jumped:slime.jumped});
    occupied.add(key(position)); ids.add(slime.id);
  }
  return { version:2,elemental,beam,mode:raw.mode,hand:[...raw.hand],playing:raw.playing,seed:raw.seed,
    room: raw.room, status: raw.status, player: { x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,attack:p.attack,defense:p.defense },
    bossHp:raw.bossHp,bossMaxHp:raw.bossMaxHp,steps:raw.steps,slimes,consumed:[...new Set<string>(consumed)],scorches };
}
