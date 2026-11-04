import type {Save} from "../save/shape.ts";
import {earn} from "../save/profile.ts";
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
  if(record.savedBoss?.level===state.level)delete record.savedBoss;
  const old=record.cleared;record.cleared=Math.max(record.cleared,state.level);
  if(record.claimed.includes(state.level))return {changed:old!==record.cleared,points:0};
  record.claimed.push(state.level);record.claimed.sort((a,b)=>a-b);
  const points=TRIALS[state.trialId].rewardPoints(state.level);
  save.trialAccess.points+=points;earn(save,"trialPoints",points);
  return {changed:true,points};
}

/** Saves the damage inflicted on the Obelisk (and any parts) when a run ends
 * before defeating the boss, so the next trial run resumes from that HP. */
export function saveTrialDamage(save:Pick<Save,"trialAccess">,state:TrialState) {
  if(state.trialId!=="obelisk" || state.bossHp<=0)return false;
  const damage=Math.max(0,Math.round(state.bossMaxHp-state.bossHp));
  const previous=save.trialAccess.progress[state.trialId]?.savedBoss;
  const partDamage: Record<string, number> = previous?.level===state.level ? {...previous.partDamage} : {};
  for(const part of state.bossVariant?.parts??[]) {
    const lost=Math.max(0,Math.round(part.maxHp-part.hp));
    if(lost>0)partDamage[part.id]=lost;
  }
  if(damage<=0 && !Object.keys(partDamage).length)return false;
  const record=save.trialAccess.progress[state.trialId]??={cleared:0,claimed:[]};
  record.savedBoss={level:state.level,damage,maxHp:state.bossMaxHp,...(Object.keys(partDamage).length?{partDamage}:{})};
  return true;
}
