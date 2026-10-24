import type {Save} from "../save-shape.ts";
import {earn} from "../profile.ts";
import {MAX_TRIAL_LEVEL,TRIALS,type TrialId} from "./catalog.ts";
import type {TrialState} from "./trial.ts";

export const clearedDifficulty = (save:Pick<Save,"trialAccess">,id:TrialId) => save.trialAccess.progress[id]?.cleared??0;
export function nextDifficulty(save:Pick<Save,"trialAccess">,id:TrialId) {
  const cleared=clearedDifficulty(save,id);return cleared>=MAX_TRIAL_LEVEL?null:cleared+1;
}
export const rewardClaimed = (save:Pick<Save,"trialAccess">,id:TrialId,level:number) => save.trialAccess.progress[id]?.claimed.includes(level)??false;
/** Every control mode settles into the same trial record. The reward and
 * its receipt are saved together, so reloads or repeated wins cannot pay twice. */
export function settleTrialVictory(save:Save,state:TrialState) {
  if(state.status!=="won" || state.bossHp!==0)return {changed:false,points:0};
  const record=save.trialAccess.progress[state.trialId]??={cleared:0,claimed:[]};
  const old=record.cleared;record.cleared=Math.max(record.cleared,state.level);
  if(record.claimed.includes(state.level))return {changed:old!==record.cleared,points:0};
  record.claimed.push(state.level);record.claimed.sort((a,b)=>a-b);
  const points=TRIALS[state.trialId].rewardPoints(state.level);
  save.trialAccess.points+=points;earn(save,"trialPoints",points);
  return {changed:true,points};
}
