import type { Board } from "../board.ts";
import { CARDS, planHand } from "../cards.ts";
import type { Tile } from "../entities.ts";
import {TRIALS} from "./catalog.ts";
import {keymasterDoorAt,mimicDamage} from "./keymaster.ts";
import type { TowerRun } from "../runs.ts";
import { ARENA_POTIONS, ARENA_SIZE, trialFloor, key, trialStep, type TrialState } from "./trial.ts";

/** Expose the encounter to the normal Tower card planner. Replan each turn
 * because slime targets can move. The ordinary Game/run is never mutated. */
export function trialBoard(s: TrialState): Board {
  return {
    width: s.room === "staging" ? 9 : ARENA_SIZE, floor: s.keymaster && s.room==="arena"?0:1,
    tile(x,y): Tile {
      if (!trialFloor(s,x,y)) return {kind:"wall"};
      if (s.room === "staging") return {kind:x===4 && y===6 ? "stairs" : "floor"};
      if(s.keymaster) {
        const k=s.keymaster,door=keymasterDoorAt(x,y);
        if(door>=0 && !k.doors.some(d=>d.door===door))return {kind:"door",color:"yellow"};
        if(k.drops.some(p=>p.x===x && p.y===y))return {kind:"key",color:"yellow"};
        const mimic=k.mimics.find(p=>p.x===x && p.y===y);
        if(mimic)return {kind:"enemy",enemy:{name:"Mimic",hp:k.useKeys && k.keys>0?1:mimic.hp,attack:k.useKeys && k.keys>0?0:mimicDamage(s),defense:0,tier:1,strength:"strong"}};
      }
      const boss = !s.elemental.incorporeal && x===s.elemental.x && y===s.elemental.y;
      if (boss || s.slimes.some(p=>p.x===x && p.y===y)) return { kind:"enemy", enemy: {
        name:boss ? TRIALS[s.trialId].name : "Light Slime", hp:boss ? s.bossHp : 1,
        attack:0,defense:0,tier:1,strength:boss ? "boss" : "weak",
      }};
      if (ARENA_POTIONS.some(p=>p.x===x && p.y===y) && !s.consumed.includes(key({x,y}))) return {kind:"potion"};
      return {kind:"floor"};
    },
    step(x,y,dx,dy) { return trialFloor(s,x+dx,y+dy) ? {x:x+dx,y:y+dy} : null; },
    clear() {},
    typicalEnemy() { return {name:TRIALS[s.trialId].name,hp:s.bossHp,attack:Math.max(1,Math.ceil(s.player.maxHp*.04)),defense:0,tier:1,strength:"boss"}; },
  };
}

export function trialPlan(s: TrialState) {
  if (s.mode === "manual" || s.status !== "active") return null;
  return planHand(trialPosition(s),s.hand,"tower");
}
export function trialPosition(s:TrialState) {
  const run: TowerRun = { seed:s.seed, player:{...s.player, keys:{yellow:s.keymaster?.keys??0,blue:0,red:0}},
    height:1,kills:0,treasures:0,changes:{},floor:1,damaged:false };
  return {world:trialBoard(s),run};
}

export function autoplayTrial(s: TrialState, plan=trialPlan(s)) {
  if (s.mode === "manual" || !s.playing || s.status !== "active") return { changed:false,message:"",fired:false };
  const next = plan?.path[0];
  if (!next && s.room==="arena" && s.elemental.incorporeal) {
    const outcome=trialStep(s,0,0,"cards");
    return {...outcome,message:outcome.message || "The elemental is incorporeal. Waiting for its next lasers."};
  }
  if (!next) {
    s.playing = false;
    return {changed:true,message:"No card can act. Change your equipped hand in the forest, then retry this trial.",fired:false};
  }
  const outcome = trialStep(s,next.dx,next.dy,"cards");
  return {...outcome,message:outcome.message || `${CARDS[s.hand[plan!.card]].name} leads the way.`};
}
