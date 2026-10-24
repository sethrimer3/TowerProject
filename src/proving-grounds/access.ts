import { isRecord, wholeIn } from "../decode.ts";
import type { Save } from "../save-shape.ts";

export const DAILY_TRIAL_KEYS = 2;
export const MAX_TRIAL_LEVEL = 10000;
export type TrialAccess = { day: number; spent: number; level: number };
export const defaultTrialAccess = (): TrialAccess => ({day:0,spent:0,level:1});
export function decodeTrialAccess(raw: unknown): TrialAccess {
  const access=defaultTrialAccess();
  if(!isRecord(raw))return access;
  if(wholeIn(raw.day,0,100000000) && wholeIn(raw.spent,0,DAILY_TRIAL_KEYS)) {
    access.day=raw.day;access.spent=raw.spent;
  }
  if(wholeIn(raw.level,1,MAX_TRIAL_LEVEL))access.level=raw.level;
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
