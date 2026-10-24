import {test} from "node:test";
import assert from "node:assert/strict";
import {startTrial,trialStep,decodeTrial,trialFloor,arenaFloor,type TrialMode} from "../src/proving-grounds/trial.ts";
import {KEYMASTER_DOORS,DOOR_FLIGHT_MS,advanceKeymasterEffects,mimicInterval,MAX_MIMICS} from "../src/proving-grounds/keymaster.ts";
import {trialBoard,trialPlan,autoplayTrial} from "../src/proving-grounds/autoplay.ts";
import {TrialNavigation} from "../src/proving-grounds/navigation.ts";
import {nextDifficulty,settleTrialVictory} from "../src/proving-grounds/progression.ts";
import {defaults,decode} from "../src/save/save.ts";
import {Game} from "../src/state.ts";
import {TrialSession} from "../src/proving-grounds/session.ts";

function arena(mode:TrialMode="manual",level=1,seed=12) {
  const s=startTrial({maxHp:1000,attack:10,defense:0},mode,["key","door","strongEnemy","bossEnemy","stairs"],seed,level,"keymaster");
  for(let i=0;i<4;i++)trialStep(s,0,1,mode==="cards"?"cards":"manual");
  assert.equal(s.room,"arena");return s;
}

test("Keymaster hits scatter exactly three keys three tiles away, deterministically, with no elemental hazards",()=> {
  const choices=new Set<string>();
  for(const seed of [1,2,3,12,100]) {
    const s=arena("manual",1,seed);s.player.x=12;s.player.y=11;
    const before=structuredClone(s),hp=s.bossHp;
    trialStep(s,0,1);trialStep(before,0,1);
    assert.deepEqual(s,before);assert.equal(s.bossHp,hp-10);assert.equal(s.keymaster!.hits,1);
    assert.equal(s.keymaster!.drops.reduce((n,p)=>n+p.count,0),3);
    for(const p of s.keymaster!.drops)assert.equal(Math.max(Math.abs(p.x-12),Math.abs(p.y-12)),3);
    choices.add(JSON.stringify(s.keymaster!.drops));
    for(let i=0;i<9;i++)trialStep(s,0,0);
    assert.equal(s.beam,null);assert.equal(s.elemental.incorporeal,false);assert.deepEqual(s.slimes,[]);
    assert.deepEqual(decodeTrial(s),s);
  }
  assert.ok(choices.size>1);
});

test("key piles collect into the encounter inventory and survive reloads",()=> {
  const s=arena();s.player.x=12;s.player.y=11;
  s.keymaster!.mimics=[];trialStep(s,0,1);
  assert.equal(s.keymaster!.drops.reduce((n,p)=>n+p.count,0),3);
  const p=s.keymaster!.drops[0],count=p.count;s.player.x=p.x;s.player.y=p.y-1;
  trialStep(s,0,1);assert.equal(s.keymaster!.keys,count);
  assert.ok(!s.keymaster!.drops.some(q=>q.x===p.x && q.y===p.y));
  assert.deepEqual(decodeTrial(s),s);
});

test("tough mimics require repeated combat, or one key for a completely free defeat; keys can be reserved",()=> {
  const s=arena(),k=s.keymaster!,m=k.mimics[0];s.player.x=m.x;s.player.y=m.y-1;
  const hp=s.player.hp;trialStep(s,0,1);
  assert.equal(m.hp,m.maxHp-10);assert.ok(s.player.hp<hp);assert.equal(s.player.y,m.y-1);
  k.keys=2;k.useKeys=false;const after=s.player.hp;trialStep(s,0,1);
  assert.equal(k.keys,2);assert.ok(s.player.hp<after);assert.ok(k.mimics.includes(m));
  k.useKeys=true;const before=s.player.hp;trialStep(s,0,1);
  assert.equal(k.keys,1);assert.equal(s.player.hp,before);assert.ok(!k.mimics.includes(m));assert.equal(s.player.y,m.y);
  assert.deepEqual(decodeTrial(s),s);
});

test("four cardinal doors consume one key each, then each delayed arrival deals 20% of maximum HP exactly once",()=> {
  const s=arena(),k=s.keymaster!,hp=s.bossMaxHp;
  for(const [i,p] of KEYMASTER_DOORS.entries()) {
    while(s.elemental.incorporeal){k.mimics=[];trialStep(s,0,0);}
    k.keys=0;
    assert.equal(arenaFloor(p.x,p.y),false);assert.equal(trialFloor(s,p.x,p.y),true);
    s.player.x=p.x===0?1:p.x===24?23:12;s.player.y=p.y===0?1:p.y===24?23:12;
    const dx=p.x-s.player.x,dy=p.y-s.player.y,turn=s.steps;
    assert.equal(trialStep(s,dx,dy).changed,false);assert.equal(s.steps,turn);
    k.keys=1;assert.equal(trialStep(s,dx,dy).changed,true);assert.equal(k.keys,0);
    assert.equal(s.bossHp,hp*(1-i/5));
    assert.equal(advanceKeymasterEffects(s,DOOR_FLIGHT_MS-1).changed,false);
    assert.equal(advanceKeymasterEffects(s,1).changed,true);
    assert.equal(s.bossHp,hp-(i+1)*hp/5);
    assert.equal(advanceKeymasterEffects(s,5000).changed,false);
    trialStep(s,0,0);assert.equal(k.doors.length,i+1);
    assert.deepEqual(decodeTrial(s),s);
  }
  assert.equal(s.bossHp,hp/5);assert.equal(k.doors.length,4);
  const light=startTrial({maxHp:1000,attack:10,defense:0});light.room="arena";
  for(const p of KEYMASTER_DOORS)assert.equal(trialFloor(light,p.x,p.y),false);
});

test("door flights resume on reload and can finish the boss without spending a player turn or paying twice",()=> {
  const save=defaults(),s=arena();s.player.x=12;s.player.y=23;s.keymaster!.keys=1;s.bossHp=s.bossMaxHp/5;
  trialStep(s,0,1);advanceKeymasterEffects(s,500);save.provingGrounds=s;
  const reload=decode(JSON.stringify(save)),loaded=reload.provingGrounds!;assert.ok(loaded);
  const turn=loaded.steps;advanceKeymasterEffects(loaded,599);assert.equal(loaded.status,"active");
  advanceKeymasterEffects(loaded,1);assert.equal(loaded.status,"won");assert.equal(loaded.steps,turn);
  assert.equal(settleTrialVictory(reload,loaded).points,1);assert.equal(nextDifficulty(reload,"keymaster"),2);
  assert.equal(nextDifficulty(reload,"light-elemental"),1);
  const again=decode(JSON.stringify(reload));advanceKeymasterEffects(again.provingGrounds!,5000);
  assert.equal(settleTrialVictory(again,again.provingGrounds!).points,0);assert.equal(again.trialAccess.points,1);
});

test("cards see actual keys, affordable doors and strong mimics; manual routes reach the south door at row zero",()=> {
  const s=arena("cards"),k=s.keymaster!;s.player.x=12;s.player.y=11;
  assert.equal(trialStep(s,0,1).changed,false);assert.ok(trialStep(s,0,1,"cards").changed);
  assert.equal(trialBoard(s).tile(k.drops[0].x,k.drops[0].y).kind,"key");
  assert.equal(trialPlan(s)!.card,0);
  for(let i=0;i<15 && k.keys===0;i++)autoplayTrial(s);
  assert.ok(k.keys>0);assert.equal(trialPlan(s)!.card,k.drops.length?0:1);
  const m=k.mimics[0],tile=trialBoard(s).tile(m.x,m.y);assert.equal(tile.kind,"enemy");
  if(tile.kind==="enemy"){assert.equal(tile.enemy.strength,"strong");assert.equal(tile.enemy.attack,0);}
  const manual=arena(),nav=new TrialNavigation();manual.keymaster!.keys=1;
  assert.ok(nav.select(manual,12,0));assert.ok(nav.advance(manual).changed);assert.ok(nav.advance(manual).changed);
  assert.equal(manual.player.y,0);assert.equal(manual.keymaster!.doors[0].door,2);assert.deepEqual(decodeTrial(manual),manual);
});

test("mimics scale with difficulty and spawn deterministically up to their cap",()=> {
  const s=arena("manual",10),base=arena();assert.ok(s.keymaster!.mimics[0].maxHp>base.keymaster!.mimics[0].maxHp);
  assert.equal(mimicInterval(1),8);assert.equal(mimicInterval(10),6);assert.equal(mimicInterval(100),2);
  const other=structuredClone(s);for(let i=0;i<100;i++){trialStep(s,0,0);trialStep(other,0,0);}
  assert.deepEqual(s,other);assert.equal(s.keymaster!.mimics.length,MAX_MIMICS);
  assert.equal(new Set(s.keymaster!.mimics.map(m=>`${m.x},${m.y}`)).size,s.keymaster!.mimics.length);
});

test("decoder rejects malformed Keymaster receipts, collisions and cross-boss hazard state",()=> {
  const s=arena();
  for(const mutate of [
    t=>{t.keymaster.keys=-1;},t=>{t.keymaster.doors=[{door:0,elapsed:1101,hit:false}];},
    t=>{t.keymaster.doors=[{door:0,elapsed:0,hit:true}];},t=>{t.keymaster.doors=[{door:4,elapsed:0,hit:false}];},
    t=>{t.keymaster.mimics[0].hp=Infinity;},t=>{t.keymaster.drops=[{x:24,y:24,count:1}];},
    t=>{t.elemental.incorporeal=true;},t=>{t.keymaster=undefined;},
  ] as ((t:any)=>void)[]) {const bad=structuredClone(s);mutate(bad);assert.equal(decodeTrial(bad),undefined);}
  const g=new Game(defaults());g.newRun({outside:true,seed:1});
  const normal=structuredClone(g.save.tower.run),session=new TrialSession(g,s);s.keymaster!.keys=3;session.sync();
  assert.equal(session.game.run.player.keys.yellow,3);assert.deepEqual(g.save.tower.run,normal);
});
