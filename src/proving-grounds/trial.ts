import { ARENA_SIZE, ELEMENTAL, ARENA_TORCHES, ARENA_POTIONS, ARENA_CRATES, arenaFloor, floorAt, wallEdge, key, same, directions, type Spot } from "./arena.ts";
export { ARENA_SIZE, ELEMENTAL, ARENA_TORCHES, ARENA_POTIONS, ARENA_CRATES, arenaFloor, floorAt, wallEdge, key, type Spot } from "./arena.ts";
import { newKeymaster, keymasterStep, enterKeymaster, keymasterDoorAt, decodeKeymaster, type KeymasterState } from "./keymaster.ts";
import { TRAINING, type TrainingId } from "../config.ts";
import type { Player } from "../entities.ts";
import { CARDS, type CardId } from "../cards.ts";
import { finite, isRecord, wholeIn } from "../decode.ts";
import { tileRandom } from "../random.ts";
import { MAX_TRIAL_LEVEL } from "./access.ts";
import { FIRST_TRIAL, TRIALS, difficultyMultiplier, type TrialId } from "./catalog.ts";

export const BEAM_INTERVAL = 10;
export const SLIME_INTERVAL = 3;
export const MAX_SLIMES = 6;
export const BEAM_AXES = [[0, 1], [1, 1], [1, 0], [1, -1]] as const;
export const BEAM_DIRECTIONS = [...BEAM_AXES,[0,-1],[-1,-1],[-1,0],[-1,1]] as const;
export const beamCount = (level: number) => Math.min(8,1+Math.floor(level/10));
export const slimeSpawnInterval = (level: number) => Math.max(2,20-2*Math.floor(level/5));
export const bossHpFactor = difficultyMultiplier;
export type TrialMode = "cards" | "manual" | "hybrid";
export type TrialInput = "cards" | "manual";
export type Elemental = Spot & { incorporeal: boolean; teleport: { from: Spot; step: number } | null };
export type Beam = { origin: Spot; axis: number; step: number; count?: number };
export type LightSlime = Spot & { id: number; from: Spot; jumped: number };
export type TrialState = {
  version: 2;
  trialId:TrialId;
  keymaster?:KeymasterState;
  level: number;
  mode: TrialMode;
  hand: CardId[];
  displayHand?: CardId[];
  purchases?: { silver: number; training: Partial<Record<TrainingId,number>> };
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
  destroyed: Record<string, number>;
};
const breakable = new Set([...ARENA_TORCHES,...ARENA_CRATES].map(key));
export const propDestroyed = (s: TrialState, p: Spot) => Object.hasOwn(s.destroyed,key(p));
function breakProp(s: TrialState, p: Spot) {
  const k=key(p);
  if(breakable.has(k) && !propDestroyed(s,p))s.destroyed[k]=s.steps;
}

export function startTrial(player: Pick<Player, "maxHp" | "attack" | "defense">, mode: TrialMode = "manual", hand: readonly CardId[] = [], seed = 7391, level = 1, trialId:TrialId=FIRST_TRIAL): TrialState {
  if(!wholeIn(level,1,MAX_TRIAL_LEVEL))throw new RangeError("Invalid trial level");
  const bossMaxHp = Math.ceil(Math.max(240, player.attack * 24)*bossHpFactor(level));
  return { version: 2, trialId, ...(trialId==="keymaster"?{keymaster:newKeymaster()}:{}), level, mode, displayHand:[...hand], hand: mode !== "manual" ? [...hand] : [], playing: mode !== "manual", seed: seed >>> 0,
    room: "staging", status: "active", player: { x: 4, y: 2, hp: player.maxHp, maxHp: player.maxHp, attack: player.attack, defense: player.defense },
    elemental: {...ELEMENTAL,incorporeal:false,teleport:null}, beam:null,
    bossHp: bossMaxHp, bossMaxHp, steps: 0, slimes: [], consumed: [], scorches: {}, destroyed: {} };
}

/** Rays include the first wall they strike, so the wall keeps a burn too. */
export const beamHeadings = (axis: number, count: number) => Array.from({length:count},(_,i)=>(axis+Math.floor(i*8/count))%8);
export const beamDirections = (axis: number, count: number) => beamHeadings(axis,count).map(i=>BEAM_DIRECTIONS[i]);
export function rayCells([dx,dy]: readonly number[], origin: Spot): Spot[] {
  const cells: Spot[] = [];
  for (let d = 1; d < ARENA_SIZE; d++) {
    const x = origin.x + dx * d, y = origin.y + dy * d;
    cells.push({ x, y });
    if (!arenaFloor(x, y)) break;
  }
  return cells;
}
export function beamCells(axis: number, origin: Spot = ELEMENTAL, count = 2): Spot[] {
  return beamDirections(axis,count).flatMap(direction=>rayCells(direction,origin));
}
export const nextBeamAxis = (s: TrialState) => Math.floor(s.steps / BEAM_INTERVAL) % 8;

/** Hops and releases have independent schedules. Destinations survive reloads. */
function hopSlimes(s: TrialState, hopExisting: boolean, spawn: boolean) {
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
    breakProp(s,target);
    if (same(target,s.player)) {
      s.player.hp = Math.max(0,s.player.hp-Math.max(1,Math.ceil(s.player.maxHp*.05)));
      hits++;
    } else {
      next.push({ id: slime.id, ...target, from: { x: slime.x, y: slime.y }, jumped: s.steps });
      occupied.add(key(target));
    }
  };
  for (const slime of s.slimes) {
    if(hopExisting)hop(slime);else next.push(slime);
  }
  if (spawn && next.length < MAX_SLIMES) hop({ id: s.steps, x:s.elemental.x,y:s.elemental.y, from: {x:s.elemental.x,y:s.elemental.y}, jumped: s.steps });
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
      if(arenaFloor(x,y) && !same(p,s.player) && !s.slimes.some(q=>same(p,q)) && !ARENA_POTIONS.some(q=>same(p,q))
        && (!breakable.has(key(p)) || propDestroyed(s,p))) choices.push(p);
    }
    choices.sort((a,b)=>(Math.abs(a.x-boss.x)+Math.abs(a.y-boss.y))-(Math.abs(b.x-boss.x)+Math.abs(b.y-boss.y)));
    const target=choices[0];
    boss.x=target.x; boss.y=target.y;
  }
  boss.incorporeal=false;
}

/** Only the matching input source may spend a turn. Walls cost no turns. */
export function trialStep(s: TrialState, dx: number, dy: number, source: TrialInput = "manual"): { changed: boolean; message: string; fired: boolean } {
  const unchanged = { changed: false, message: "", fired: false };
  if ((source!=="cards" && source!=="manual") || (s.mode!=="hybrid" && s.mode !== source) || (source === "cards" && !s.playing) || s.status !== "active"
    || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) > 1) return unchanged;
  const x = s.player.x + dx, y = s.player.y + dy;
  if (!trialFloor(s, x, y)) return unchanged;
  if (s.room === "staging") {
    s.player.x = x; s.player.y = y;
    if (x === 4 && y === 6) {
      s.room = "arena"; s.player.x = ELEMENTAL.x; s.player.y = 2;
      if(s.keymaster)return enterKeymaster(s);
      return { changed: true, message: `Level ${s.level} Light Elemental. First volley: ${beamCount(s.level)} beam(s) in 10 turns.`, fired: false };
    }
    return { changed: true, message: "Climb the staircase to enter the trial.", fired: false };
  }
  if(s.keymaster)return keymasterStep(s,x,y);
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
  const hop=s.steps%SLIME_INTERVAL===0,spawn=s.steps%slimeSpawnInterval(s.level)===0;
  if (s.player.hp > 0 && (hop || spawn)) {
    const hits = hopSlimes(s,hop,spawn);
    if (hits) message = `A light slime lands on you! ${hits * Math.max(1,Math.ceil(s.player.maxHp*.05))} damage.`;
    else message ||= "Light slimes leap through the dark.";
  }
  const fired = s.steps % BEAM_INTERVAL === 0;
  if (fired) {
    const wasGhost=s.elemental.incorporeal;
    materialize(s);
    s.beam={origin:{x:s.elemental.x,y:s.elemental.y},axis:(s.steps/BEAM_INTERVAL-1)%8,step:s.steps,count:beamCount(s.level)};
    const cells = beamCells(s.beam.axis,s.beam.origin,s.beam.count);
    if(wasGhost) message="The elemental fires its lasers and becomes corporeal — it can be struck again.";
    for (const p of cells) {s.scorches[key(p)] = s.steps;breakProp(s,p);}
    if (cells.some(p => same(p,s.player))) {
      const damage = Math.max(1, Math.ceil(s.player.maxHp * 0.25));
      s.player.hp = Math.max(0, s.player.hp - damage);
      message = `The light beam hits you for ${damage} damage!`;
    } else message ||= `${s.beam.count} beam(s) sear the stone. The next volley turns 45° clockwise.`;
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
  const level=raw.level===undefined?1:raw.level;
  if(!wholeIn(level,1,MAX_TRIAL_LEVEL))return;
  const trialId=raw.trialId??FIRST_TRIAL;
  if(typeof trialId!=="string" || !Object.hasOwn(TRIALS,trialId))return;
  const keymaster=trialId==="keymaster"?decodeKeymaster(raw.keymaster,raw):undefined;
  if(trialId==="keymaster" && !keymaster)return;
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
      || !wholeIn(b.axis,0,7) || b.axis!==(b.step/BEAM_INTERVAL-1)%(raw.level===undefined?4:8)
      || (b.count!==undefined && !wholeIn(b.count,1,8))) return;
    beam={origin:{x:b.origin.x,y:b.origin.y},axis:(b.step/BEAM_INTERVAL-1)%8,step:b.step,...(b.count===undefined?{}:{count:b.count})};
  } else if(raw.elemental===undefined && raw.steps>=BEAM_INTERVAL) {
    const step=Math.floor(raw.steps/BEAM_INTERVAL)*BEAM_INTERVAL;
    beam={origin:{...ELEMENTAL},axis:(step/BEAM_INTERVAL-1)%8,step,...(raw.level===undefined?{}:{count:beamCount(level)})};
  }
  if (raw.version !== 2 || !["cards","manual","hybrid"].includes(raw.mode) || typeof raw.playing !== "boolean"
    || !wholeIn(raw.seed,0,0xffffffff) || !Array.isArray(raw.hand) || raw.hand.length > 64
    || raw.hand.some((id: unknown) => typeof id !== "string" || !Object.hasOwn(CARDS,id))
    || (raw.mode === "manual" && (raw.hand.length > 0 || raw.playing))
    || !(floorAt(raw.room, p.x, p.y) || (keymaster && raw.room==="arena" && keymasterDoorAt(p.x,p.y)>=0 && keymaster.doors.some(d=>d.door===keymasterDoorAt(p.x,p.y)))) || (raw.room === "arena" && !elemental.incorporeal && same(position,elemental))
    || (raw.status === "active" && (p.hp === 0 || raw.bossHp === 0))
    || (raw.status === "won" && raw.bossHp !== 0) || (raw.status === "lost" && p.hp !== 0)
    || (raw.status !== "active" && raw.playing)) return;
  let displayHand: CardId[] | undefined;
  if(raw.displayHand!==undefined) {
    if(!Array.isArray(raw.displayHand) || raw.displayHand.length>64 || raw.displayHand.some((id:unknown)=>typeof id!=="string" || !Object.hasOwn(CARDS,id))) return;
    displayHand=[...raw.displayHand];
  }
  let purchases: TrialState["purchases"];
  if(raw.purchases!==undefined) {
    const bought=raw.purchases;
    if(!isRecord(bought) || !finite(bought.silver,1e100) || !isRecord(bought.training) || Object.keys(bought.training).length>TRAINING.length) return;
    const training: Partial<Record<TrainingId,number>>={};
    for(const [id,n] of Object.entries(bought.training)) {
      if(!TRAINING.some(row=>row.id===id) || !wholeIn(n,0,1e9)) return;
      training[id as TrainingId]=n;
    }
    purchases={silver:bought.silver,training};
  }
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
  const destroyed: Record<string,number>={};
  if(raw.destroyed!==undefined && !isRecord(raw.destroyed))return;
  if(isRecord(raw.destroyed))for(const [k,step] of Object.entries(raw.destroyed).slice(0,breakable.size)) {
    if(breakable.has(k) && wholeIn(step,1,raw.steps))destroyed[k]=step;
  }
  if(raw.room==="staging" && Object.keys(destroyed).length)return;
  const slimes: LightSlime[] = [], occupied = new Set<string>(), ids = new Set<number>();
  if (!Array.isArray(raw.slimes) || raw.slimes.length > MAX_SLIMES || (raw.room === "staging" && raw.slimes.length)) return;
  for (const slime of raw.slimes) {
    if (!isRecord(slime) || !isRecord(slime.from)) return;
    const position = {x:slime.x,y:slime.y};
    if (!wholeIn(slime.id,1,raw.steps)
      || ids.has(slime.id) || !arenaFloor(slime.x,slime.y) || same(position,elemental) || same(position,{x:p.x,y:p.y})
      || occupied.has(key(position)) || !arenaFloor(slime.from.x,slime.from.y)
      || !wholeIn(slime.jumped,2,raw.steps) || (slime.jumped % SLIME_INTERVAL !== 0 && slime.jumped % slimeSpawnInterval(level) !== 0)
      || Math.abs(slime.x-slime.from.x)>2 || Math.abs(slime.y-slime.from.y)>2) return;
    slimes.push({id:slime.id,x:slime.x,y:slime.y,from:{x:slime.from.x,y:slime.from.y},jumped:slime.jumped});
    occupied.add(key(position)); ids.add(slime.id);
  }
  if(keymaster && (elemental.x!==12 || elemental.y!==12 || elemental.incorporeal || elemental.teleport || beam || slimes.length || Object.keys(scorches).length || Object.keys(destroyed).length))return;
  return { version:2,trialId:trialId as TrialId,...(keymaster?{keymaster}:{}),level,...(displayHand?{displayHand}:{}),...(purchases?{purchases}:{}),elemental,beam,mode:raw.mode,hand:[...raw.hand],playing:raw.playing,seed:raw.seed,
    room: raw.room, status: raw.status, player: { x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,attack:p.attack,defense:p.defense },
    bossHp:raw.bossHp,bossMaxHp:raw.bossMaxHp,steps:raw.steps,slimes,consumed:[...new Set<string>(consumed)],scorches,destroyed };
}

/** The Keymaster replaces exactly four wall tiles with cardinal doors. */
export const trialFloor=(s:Pick<TrialState,"room"|"trialId">,x:number,y:number)=>floorAt(s.room,x,y) || (s.room==="arena" && s.trialId==="keymaster" && keymasterDoorAt(x,y)>=0);
