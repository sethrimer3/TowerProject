import {finite,isRecord,wholeIn} from "../save/decode.ts";
import {tileRandom} from "../random.ts";
import {arenaFloor,ARENA_POTIONS,ELEMENTAL,key,same,type Spot} from "./arena.ts";
import {difficultyMultiplier} from "./catalog.ts";
import type {TrialState} from "./trial.ts";

export const KEYMASTER_DOORS=[{x:12,y:24},{x:24,y:12},{x:12,y:0},{x:0,y:12}] as const;
export const DOOR_FLIGHT_MS=1100;
export const MAX_MIMICS=6;
export const mimicInterval=(level:number)=>Math.max(2,8-Math.floor(level/5));
export type Mimic=Spot & {id:number;hp:number;maxHp:number};
export type DoorBurst={door:number;elapsed:number;hit:boolean};
export type KeymasterState={keys:number;useKeys:boolean;hits:number;spawned:number;drops:(Spot & {count:number})[];mimics:Mimic[];doors:DoorBurst[]};
export const newKeymaster=():KeymasterState=>({keys:0,useKeys:true,hits:0,spawned:0,drops:[],mimics:[],doors:[]});
export const keymasterDoorAt=(x:number,y:number)=>KEYMASTER_DOORS.findIndex(p=>p.x===x && p.y===y);
const KEY_DIRECTIONS=[[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
const dropTile=(p:Spot)=>Math.max(Math.abs(p.x-ELEMENTAL.x),Math.abs(p.y-ELEMENTAL.y))===3;
export const mimicDamage=(s:TrialState)=>Math.max(1,Math.ceil(s.player.maxHp*.06*difficultyMultiplier(s.level))-Math.floor(s.player.defense*.2));

function spawnMimic(s:TrialState) {
  const k=s.keymaster!;if(k.mimics.length>=MAX_MIMICS)return;
  const choices:Spot[]=[];
  for(let y=4;y<=20;y++)for(let x=4;x<=20;x++) {
    const p={x,y},distance=Math.abs(x-12)+Math.abs(y-12);
    if(distance<4 || distance>10 || dropTile(p) || !arenaFloor(x,y) || same(p,s.player)
      || k.mimics.some(q=>same(p,q)) || ARENA_POTIONS.some(q=>same(p,q)))continue;
    choices.push(p);
  }
  const id=++k.spawned,target=choices[Math.floor(tileRandom(id,s.steps,s.seed^0x6d696d)*choices.length)];
  if(!target)return;
  const maxHp=Math.ceil(Math.max(30,s.player.attack*6)*difficultyMultiplier(s.level));
  k.mimics.push({...target,id,hp:maxHp,maxHp});
}
export function enterKeymaster(s:TrialState) {
  spawnMimic(s);spawnMimic(s);
  return {changed:true,message:"Keymaster: strike him for keys. Keys open the four doors or defeat mimics for free.",fired:false};
}
function dropKeys(s:TrialState) {
  const k=s.keymaster!;k.hits++;
  const choices=KEY_DIRECTIONS.map(([dx,dy],i)=>({x:12+dx*3,y:12+dy*3,score:tileRandom(k.hits,i,s.seed^0x4b4559),i}));
  choices.sort((a,b)=>a.score-b.score || a.i-b.i);
  for(const {x,y} of choices.slice(0,3)) {
    const existing=k.drops.find(p=>p.x===x && p.y===y);
    if(existing)existing.count++;else k.drops.push({x,y,count:1});
  }
}
function win(s:TrialState) {
  s.status="won";s.playing=false;s.keymaster!.mimics=[];
}
/** Door impacts are independent of player turns, but are saved receipts.
 * A reload resumes any remaining flight and can never apply an impact twice. */
export function advanceKeymasterEffects(s:TrialState,ms:number) {
  const unchanged={changed:false,message:"",fired:false};
  if(!s.keymaster || s.status!=="active" || !Number.isFinite(ms) || ms<=0)return unchanged;
  let impacts=0;
  for(const burst of s.keymaster.doors) {
    burst.elapsed=Math.min(DOOR_FLIGHT_MS,burst.elapsed+ms);
    if(!burst.hit && burst.elapsed>=DOOR_FLIGHT_MS) {
      burst.hit=true;impacts++;s.bossHp=Math.max(0,s.bossHp-s.bossMaxHp/5);
    }
  }
  if(!impacts)return unchanged;
  if(s.bossHp===0)win(s);
  return {changed:true,message:s.bossHp===0?"Trial complete — the Keymaster is defeated.":`Red spirits strike the Keymaster for ${impacts*20}% of his maximum HP.`,fired:false};
}
/** Bumping a mimic fights it, or spends one reserved key for a free kill.
 * Doors consume one key and release a single delayed 20%-max-HP burst. */
export function keymasterStep(s:TrialState,x:number,y:number) {
  const k=s.keymaster!,door=keymasterDoorAt(x,y);
  let message="",move=true;
  if(door>=0 && !k.doors.some(d=>d.door===door)) {
    if(k.keys===0)return {changed:false,message:"You need a golden key to open this door.",fired:false};
    k.keys--;k.doors.push({door,elapsed:0,hit:false});
    message="Door opened. Red spirits flood out and converge on the Keymaster.";
  } else if(same({x,y},s.elemental)) {
    move=false;s.bossHp=Math.max(0,s.bossHp-Math.max(1,s.player.attack));dropKeys(s);
    if(s.bossHp===0){win(s);return {changed:true,message:"Trial complete — the Keymaster is defeated.",fired:false};}
    const damage=Math.max(1,Math.ceil(s.player.maxHp*.04)-Math.floor(s.player.defense*.1));
    s.player.hp=Math.max(0,s.player.hp-damage);
    message=`You strike the Keymaster. Three keys scatter three tiles away. He deals ${damage} damage.`;
  } else {
    const index=k.mimics.findIndex(p=>p.x===x && p.y===y);
    if(index>=0) {
      const mimic=k.mimics[index];
      if(k.useKeys && k.keys>0) {k.keys--;k.mimics.splice(index,1);message="One key unlocks the mimic — defeated with no damage.";}
      else {
        mimic.hp=Math.max(0,mimic.hp-Math.max(1,s.player.attack));
        if(mimic.hp===0){k.mimics.splice(index,1);message="You defeat the mimic in combat.";}
        else {
          move=false;const damage=mimicDamage(s);s.player.hp=Math.max(0,s.player.hp-damage);
          message=`The tough mimic has ${mimic.hp} HP left and bites for ${damage} damage.`;
        }
      }
    }
  }
  if(move){s.player.x=x;s.player.y=y;}
  const pickup=k.drops.findIndex(p=>same(p,s.player));
  if(pickup>=0){const [drop]=k.drops.splice(pickup,1);k.keys+=drop.count;message=`Collected ${drop.count} key${drop.count===1?"":"s"}.`;}
  const here=key(s.player);
  if(ARENA_POTIONS.some(p=>key(p)===here) && !s.consumed.includes(here)) {
    const healed=Math.min(s.player.maxHp-s.player.hp,Math.ceil(s.player.maxHp*.35));
    s.player.hp+=healed;s.consumed.push(here);message=`Potion restores ${healed} HP.`;
  }
  s.steps++;
  if(s.player.hp===0){s.status="lost";s.playing=false;message="The Keymaster trial ends in defeat. Your Tower progress is safe.";}
  else if(s.steps%mimicInterval(s.level)===0)spawnMimic(s);
  return {changed:true,message,fired:false};
}

export function decodeKeymaster(raw:unknown,attempt:Record<string,any>):KeymasterState|undefined {
  if(!isRecord(raw) || !wholeIn(raw.keys,0,1e9) || typeof raw.useKeys!=="boolean" || !wholeIn(raw.hits,0,1e9)
    || !wholeIn(raw.spawned,0,1e9) || !Array.isArray(raw.drops) || raw.drops.length>8
    || !Array.isArray(raw.mimics) || raw.mimics.length>MAX_MIMICS || !Array.isArray(raw.doors) || raw.doors.length>4)return;
  const k=newKeymaster();k.keys=raw.keys;k.useKeys=raw.useKeys;k.hits=raw.hits;k.spawned=raw.spawned;
  const occupied=new Set<string>(),ids=new Set<number>();
  for(const p of raw.drops) {
    if(!isRecord(p) || !wholeIn(p.x,9,15) || !wholeIn(p.y,9,15) || !KEY_DIRECTIONS.some(([dx,dy])=>p.x===12+dx*3 && p.y===12+dy*3)
      || !wholeIn(p.count,1,1e9) || occupied.has(key(p as Spot)))return;
    occupied.add(key(p as Spot));k.drops.push({x:p.x,y:p.y,count:p.count});
  }
  for(const m of raw.mimics) {
    if(!isRecord(m) || !arenaFloor(m.x,m.y) || same(m as Spot,ELEMENTAL) || same(m as Spot,attempt.player) || occupied.has(key(m as Spot))
      || !wholeIn(m.id,1,k.spawned) || ids.has(m.id) || !finite(m.hp,1e100) || !finite(m.maxHp,1e100) || m.hp<=0 || m.hp>m.maxHp)return;
    occupied.add(key(m as Spot));ids.add(m.id);k.mimics.push({x:m.x,y:m.y,id:m.id,hp:m.hp,maxHp:m.maxHp});
  }
  for(const d of raw.doors) {
    if(!isRecord(d) || !wholeIn(d.door,0,3) || k.doors.some(p=>p.door===d.door) || !finite(d.elapsed,DOOR_FLIGHT_MS)
      || typeof d.hit!=="boolean" || d.hit!==(d.elapsed===DOOR_FLIGHT_MS))return;
    k.doors.push({door:d.door,elapsed:d.elapsed,hit:d.hit});
  }
  if(attempt.room==="staging" && (k.keys || k.hits || k.spawned || k.drops.length || k.mimics.length || k.doors.length))return;
  if(attempt.status==="won" && k.mimics.length)return;
  return k;
}
