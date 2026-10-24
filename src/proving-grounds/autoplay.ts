import type { Board } from "../board.ts";
import { CARDS, planHand } from "../cards.ts";
import type { Tile } from "../entities.ts";
import type { TowerRun } from "../runs.ts";
import { ARENA_POTIONS, ARENA_SIZE, floorAt, key, trialStep, type TrialState } from "./trial.ts";

/** Expose the encounter to the normal Tower card planner. Replan each turn
 * because slime targets can move. The ordinary Game/run is never mutated. */
export function trialBoard(s: TrialState): Board {
  return {
    width: s.room === "staging" ? 9 : ARENA_SIZE, floor: 1,
    tile(x,y): Tile {
      if (!floorAt(s.room,x,y)) return {kind:"wall"};
      if (s.room === "staging") return {kind:x===4 && y===6 ? "stairs" : "floor"};
      const boss = !s.elemental.incorporeal && x===s.elemental.x && y===s.elemental.y;
      if (boss || s.slimes.some(p=>p.x===x && p.y===y)) return { kind:"enemy", enemy: {
        name:boss ? "Light Elemental" : "Light Slime", hp:boss ? s.bossHp : 1,
        attack:0,defense:0,tier:1,strength:boss ? "boss" : "weak",
      }};
      if (ARENA_POTIONS.some(p=>p.x===x && p.y===y) && !s.consumed.includes(key({x,y}))) return {kind:"potion"};
      return {kind:"floor"};
    },
    step(x,y,dx,dy) { return floorAt(s.room,x+dx,y+dy) ? {x:x+dx,y:y+dy} : null; },
    clear() {},
    typicalEnemy() { return {name:"Light Elemental",hp:s.bossHp,attack:Math.max(1,Math.ceil(s.player.maxHp*.04)),defense:0,tier:1,strength:"boss"}; },
  };
}

export function trialPlan(s: TrialState) {
  if (s.mode !== "cards" || s.status !== "active") return null;
  const world=trialBoard(s);
  const run: TowerRun = { seed:s.seed, player:{...s.player, keys:{yellow:0,blue:0,red:0}},
    height:1,kills:0,treasures:0,changes:{},floor:1,damaged:false };
  return planHand({world,run},s.hand,"tower");
}

export function autoplayTrial(s: TrialState) {
  if (s.mode !== "cards" || !s.playing || s.status !== "active") return { changed:false,message:"",fired:false };
  const plan = trialPlan(s), next = plan?.path[0];
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
