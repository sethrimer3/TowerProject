export const MAX_TRIAL_LEVEL = 10000;
export const difficultyMultiplier = (level:number) => 1+(level-1)/10;
export const TRIALS = {
  "light-elemental": {number:1,name:"Light Elemental",rewardPoints:(level:number)=>level,multiplier:difficultyMultiplier},
} as const;
export type TrialId = keyof typeof TRIALS;
export const FIRST_TRIAL:TrialId="light-elemental";
export const TRIAL_IDS=Object.keys(TRIALS) as TrialId[];
