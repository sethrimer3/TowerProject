import { isRecord, wholeIn } from "../save/decode.ts";
import type { Save } from "../save/shape.ts";
import { MAX_TRIAL_LEVEL, TRIAL_IDS, type TrialId } from "./catalog.ts";
export {MAX_TRIAL_LEVEL} from "./catalog.ts";

export const DAILY_TRIAL_KEYS = 2;
export type TrialProgress = {cleared:number;claimed:number[]};
export type TrialAccess = { day: number; spent: number; points:number; progress:Partial<Record<TrialId,TrialProgress>> };
export const defaultTrialAccess = (): TrialAccess => ({day:0,spent:0,points:0,progress:{}});
export function decodeTrialAccess(raw: unknown): TrialAccess {
  const access=defaultTrialAccess();
  if(!isRecord(raw))return access;
  if(wholeIn(raw.day,0,100000000) && wholeIn(raw.spent,0,DAILY_TRIAL_KEYS)) {
    access.day=raw.day;access.spent=raw.spent;
  }
  if(wholeIn(raw.points,0,1e9))access.points=raw.points;
  if(isRecord(raw.progress))for(const id of TRIAL_IDS) {
    const p=raw.progress[id];if(!isRecord(p))continue;
    const claimed=Array.isArray(p.claimed)?[...new Set<number>(p.claimed.filter((n:unknown)=>wholeIn(n,1,MAX_TRIAL_LEVEL)))].sort((a,b)=>a-b):[];
    const cleared=Math.max(wholeIn(p.cleared,0,MAX_TRIAL_LEVEL)?p.cleared:0,claimed.at(-1)??0);
    access.progress[id]={cleared,claimed};
  }
  return access;
}
/** A shared UTC daily allowance; moving the clock backwards never refills it. */
export function trialKeys(save: Pick<Save,"trialAccess"|"settings">, now: number) {
  const day=Math.floor(now/86400000),access=save.trialAccess;
  if(day>access.day) {access.day=day;access.spent=0;}
  return save.settings.devMode?Infinity:DAILY_TRIAL_KEYS-access.spent;
}
export function spendTrialKey(save: Pick<Save,"trialAccess"|"settings">, now: number) {
  if(trialKeys(save,now)<=0)return false;
  if(!save.settings.devMode)save.trialAccess.spent++;
  return true;
}
