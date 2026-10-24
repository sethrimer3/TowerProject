import {test} from "node:test";
import assert from "node:assert/strict";
import {defaults,decode} from "../src/save/save.ts";
import {defaultTrialAccess,decodeTrialAccess,spendTrialKey,trialKeys} from "../src/proving-grounds/access.ts";
import {beamCells,beamCount,beamDirections,decodeTrial,slimeSpawnInterval,startTrial,trialStep} from "../src/proving-grounds/trial.ts";

const DAY=86400000;
const hero={maxHp:1000,attack:10,defense:0};
function arena(level:number) {
  const s=startTrial(hero,"manual",[],12,level);
  for(let i=0;i<4;i++)trialStep(s,0,1);
  s.player.x=4;s.player.y=12;
  return s;
}

test("every trial level raises boss HP, with beam and spawn breakpoints capped independently",()=> {
  let hp=0;
  for(let level=1;level<=100;level++) {
    const s=startTrial(hero,"manual",[],12,level);
    assert.ok(s.bossMaxHp>hp);hp=s.bossMaxHp;
    assert.equal(beamCount(level),Math.min(8,1+Math.floor(level/10)));
    assert.equal(slimeSpawnInterval(level),Math.max(2,20-2*Math.floor(level/5)));
  }
  assert.deepEqual([1,9,10,19,20,69,70,100].map(beamCount),[1,1,2,2,3,7,8,8]);
  assert.deepEqual([1,4,5,9,10,44,45,100].map(slimeSpawnInterval),[20,20,18,18,16,4,2,2]);
});

test("volleys have exactly the selected number of distinct rays, rotate and scar every wall hit",()=> {
  for(const level of [1,10,20,30,40,50,60,70,100]) {
    const s=arena(level),count=beamCount(level);
    for(let volley=0;volley<9;volley++) {
      for(let i=0;i<10;i++){s.player.hp=s.player.maxHp;trialStep(s,0,0);}
      assert.equal(s.beam!.count,count);assert.equal(s.beam!.axis,volley%8);
      assert.equal(new Set(beamDirections(volley%8,count).map(String)).size,count);
      const cells=beamCells(volley%8,s.elemental,count);
      assert.equal(cells.filter(p=>!beamCells(0,s.elemental,8).some(q=>q.x===p.x&&q.y===p.y)).length,0);
      for(const p of cells)assert.equal(s.scorches[`${p.x},${p.y}`],s.steps);
      assert.deepEqual(decodeTrial(s),s);
    }
  }
  assert.deepEqual(beamDirections(0,2),[[0,1],[0,-1]]);
});

test("one-ray volleys damage only their firing direction",()=> {
  for(const [y,hit] of [[2,false],[22,true]] as const) {
    const s=arena(1);s.player.x=12;s.player.y=y;s.steps=9;
    trialStep(s,0,0);
    assert.equal(s.player.hp,hit?750:1000);
  }
});

test("spawning follows each level interval while existing slimes still hop every three turns",()=> {
  for(const level of [1,5,10,44,45,100]) {
    const s=arena(level),interval=slimeSpawnInterval(level);
    for(let i=1;i<interval;i++){trialStep(s,0,0);assert.equal(s.slimes.length,0);}
    trialStep(s,0,0);assert.equal(s.slimes.length,1);
    assert.deepEqual(s.slimes[0].from,{x:12,y:12});
    while(s.steps%3!==2)trialStep(s,0,0);
    const slime=structuredClone(s.slimes[0]);
    trialStep(s,0,0);
    const jumped=s.slimes.find(p=>p.id===slime.id)!;
    assert.deepEqual(jumped.from,{x:slime.x,y:slime.y});assert.equal(jumped.jumped,s.steps);
    const resumed=decodeTrial(structuredClone(s))!;assert.ok(resumed);
    for(let i=0;i<50;i++) {
      s.player.hp=resumed.player.hp=hero.maxHp;
      trialStep(s,0,0);trialStep(resumed,0,0);
      assert.deepEqual(resumed,s);
    }
  }
});

test("two daily trial keys share one allowance, survive reload and refill only on a new UTC day",()=> {
  const save=defaults(),now=20000*DAY+DAY-1;
  assert.equal(trialKeys(save,now),2);
  assert.ok(spendTrialKey(save,now));assert.equal(trialKeys(save,now),1);
  const loaded=decode(JSON.stringify(save));
  assert.ok(spendTrialKey(loaded,now));assert.equal(trialKeys(loaded,now),0);
  assert.equal(spendTrialKey(loaded,now),false);
  assert.equal(trialKeys(loaded,now-DAY),0);
  assert.equal(trialKeys(loaded,now+1),2);
  assert.equal(trialKeys(loaded,now+10*DAY),2);
});

test("developer mode has unlimited entries without consuming the normal daily allowance",()=> {
  const save=defaults(),now=20000*DAY;
  spendTrialKey(save,now);save.settings.devMode=true;
  for(let i=0;i<10;i++)assert.ok(spendTrialKey(save,now));
  assert.equal(trialKeys(save,now),Infinity);assert.equal(save.trialAccess.spent,1);
  save.settings.devMode=false;assert.equal(trialKeys(save,now),1);
  save.settings.freePurchases=true;
  spendTrialKey(save,now);assert.equal(spendTrialKey(save,now),false);
});

test("level, allowance and legacy attempt decoding are bounded and deterministic",()=> {
  for(const level of [0,-1,1.5,Infinity,10001]) {
    assert.throws(()=>startTrial(hero,"manual",[],12,level),RangeError);
    assert.equal(decodeTrial({...arena(1),level}),undefined);
    assert.deepEqual(decodeTrialAccess({day:2,spent:1,level}).progress,{});
  }
  assert.deepEqual(decodeTrialAccess(null),defaultTrialAccess());
  for(const spent of [-1,3,1.5,Infinity])assert.equal(decodeTrialAccess({day:2,spent}).spent,0);
  const old=arena(1) as Record<string,any>;delete old.level;
  assert.equal(decodeTrial(old)!.level,1);
  old.steps=50;old.beam={origin:{x:12,y:12},axis:0,step:50};
  const migrated=decodeTrial(old)!;
  assert.equal(migrated.beam!.axis,4);assert.deepEqual(decodeTrial(migrated),migrated);
});
