import {test} from "node:test";
import assert from "node:assert/strict";
import {defaults,decode} from "../src/save/save.ts";
import {decodeTrialAccess} from "../src/proving-grounds/access.ts";
import {FIRST_TRIAL,MAX_TRIAL_LEVEL} from "../src/proving-grounds/catalog.ts";
import {nextDifficulty,rewardClaimed,settleTrialVictory} from "../src/proving-grounds/progression.ts";
import {startTrial,trialStep,type TrialMode} from "../src/proving-grounds/trial.ts";
import {statsRows} from "../src/ui/stats-dialog.ts";

function victory(level:number,mode:TrialMode) {
  const s=startTrial({maxHp:1000,attack:10,defense:0},mode,["stairs","bossEnemy"],12,level);
  s.room="arena";s.player.x=12;s.player.y=11;s.bossHp=s.player.attack;
  trialStep(s,0,1,mode==="cards"?"cards":"manual");
  assert.equal(s.status,"won");return s;
}

test("all control modes clear the same trial and automatically select its next difficulty",()=> {
  const save=defaults();assert.equal(nextDifficulty(save,FIRST_TRIAL),1);
  for(const [i,mode] of (["manual","cards","hybrid"] as const).entries()) {
    const s=victory(i+1,mode),outcome=settleTrialVictory(save,s);
    assert.equal(outcome.points,i+1);assert.equal(nextDifficulty(save,FIRST_TRIAL),i+2);
    assert.ok(rewardClaimed(save,FIRST_TRIAL,i+1));
  }
  assert.equal(save.trialAccess.points,6);assert.equal(save.profile.earned.trialPoints,6);
  assert.equal(save.gems,0);assert.equal(save.gold,0);
});

test("difficulty five awards five Trial Points once across modes, reloads and repeated settlement",()=> {
  const save=defaults(),s=victory(5,"manual");save.provingGrounds=s;
  const tower=structuredClone(save.tower),delve=structuredClone(save.delve);
  assert.deepEqual(settleTrialVictory(save,s),{changed:true,points:5});
  assert.equal(save.trialAccess.points,5);assert.equal(nextDifficulty(save,FIRST_TRIAL),6);
  for(const mode of ["manual","cards","hybrid"] as const)assert.equal(settleTrialVictory(save,victory(5,mode)).points,0);
  const reloaded=decode(JSON.stringify(save));
  assert.equal(settleTrialVictory(reloaded,reloaded.provingGrounds!).points,0);
  assert.equal(reloaded.trialAccess.points,5);assert.equal(reloaded.profile.earned.trialPoints,5);
  assert.equal(new Map(statsRows(reloaded.profile)).get("Trial Points earned"),"5");
  assert.deepEqual(save.tower,tower);assert.deepEqual(save.delve,delve);
});

test("a later finish cannot regress difficulty, failures pay nothing, and the final difficulty caps progression",()=> {
  const save=defaults();settleTrialVictory(save,victory(5,"hybrid"));
  settleTrialVictory(save,victory(2,"cards"));
  assert.equal(nextDifficulty(save,FIRST_TRIAL),6);assert.equal(save.trialAccess.points,7);
  const active=startTrial({maxHp:100,attack:10,defense:0});
  assert.equal(settleTrialVictory(save,active).points,0);
  active.status="lost";active.player.hp=0;assert.equal(settleTrialVictory(save,active).points,0);
  settleTrialVictory(save,victory(MAX_TRIAL_LEVEL,"manual"));assert.equal(nextDifficulty(save,FIRST_TRIAL),null);
});

test("old selected difficulties do not manufacture victories; keys and valid progress survive decoding",()=> {
  const old=decodeTrialAccess({day:20000,spent:1,level:99});
  assert.equal(old.spent,1);assert.deepEqual(old.progress,{});assert.equal(old.points,0);
  const access=decodeTrialAccess({day:20000,spent:2,points:5,progress:{
    [FIRST_TRIAL]:{cleared:1,claimed:[5,5,0,-1,"6",Infinity,10001]},unknown:{cleared:999,claimed:[1]},
  }});
  assert.deepEqual(access.progress,{[FIRST_TRIAL]:{cleared:5,claimed:[5]}});
  assert.equal(access.points,5);assert.equal(access.spent,2);
  for(const points of [-1,Infinity,NaN,1.2])assert.equal(decodeTrialAccess({points}).points,0);
  const save=defaults();save.trialAccess=access;
  const loaded=decode(JSON.stringify(save));assert.equal(loaded.profile.earned.trialPoints,5);
});
