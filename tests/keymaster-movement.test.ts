import {test} from "node:test";
import assert from "node:assert/strict";
import {startTrial,trialStep,decodeTrial,arenaFloor,type TrialState} from "../src/proving-grounds/trial.ts";
import {advanceKeymasterEffects,KEYMASTER_REFORM_INTERVAL,pursueMimics,retreatKeymaster} from "../src/proving-grounds/keymaster.ts";
import {autoplayTrial,trialBoard,trialPlan} from "../src/proving-grounds/autoplay.ts";
const manhattan=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function arena() {
  const s=startTrial({maxHp:10000,attack:10,defense:0},"manual",[],12,1,"keymaster");
  for(let i=0;i<4;i++)trialStep(s,0,1);s.keymaster!.mimics=[];return s;
}
const mimic=(x:number,y:number,id=1)=>({id,x,y,hp:1000,maxHp:1000});

test("a hit teleports the Keymaster into an untargetable, walkable and saved ghost until the ten-step reformation",()=> {
  const s=arena();s.player.x=12;s.player.y=11;const old={...s.elemental},hp=s.bossHp;
  trialStep(s,0,1);assert.ok(s.elemental.incorporeal);assert.ok(manhattan(s.elemental,old)>=6);
  assert.ok(manhattan(s.elemental,s.player)>=3);assert.equal(s.bossHp,hp-10);
  assert.deepEqual(s.elemental.teleport,{from:{x:old.x,y:old.y},step:1});
  assert.equal(trialBoard(s).tile(s.elemental.x,s.elemental.y).kind,"floor");
  s.mode="cards";s.hand=["bossEnemy"];s.playing=true;assert.equal(trialPlan(s),null);
  assert.ok(autoplayTrial(s).changed);assert.ok(s.playing);assert.equal(s.steps,2);
  s.mode="manual";s.hand=[];s.playing=false;
  const ghost={x:s.elemental.x,y:s.elemental.y};s.player.x=ghost.x;s.player.y=ghost.y-1;
  const keys=s.keymaster!.drops.reduce((n,p)=>n+p.count,0);trialStep(s,0,1);
  assert.equal(s.player.x,ghost.x);assert.equal(s.player.y,ghost.y);assert.equal(s.bossHp,hp-10);
  assert.equal(s.keymaster!.drops.reduce((n,p)=>n+p.count,0),keys);assert.deepEqual(decodeTrial(s),s);
  while(s.steps<KEYMASTER_REFORM_INTERVAL){s.keymaster!.mimics=[];trialStep(s,0,0);}
  assert.equal(s.elemental.incorporeal,false);assert.ok(!((s.player.x===s.elemental.x) && (s.player.y===s.elemental.y)));
  assert.equal(s.beam,null);assert.deepEqual(decodeTrial(s),s);
});

test("mimics chase one cardinal tile and the boss retreats one tile after every two accepted player steps",()=> {
  const s=arena();s.player.x=12;s.player.y=5;s.keymaster!.spawned=2;s.keymaster!.mimics=[mimic(6,5),mimic(18,5,2)];
  for(let turn=1;turn<=4;turn++) {
    const boss={...s.elemental},before=structuredClone(s.keymaster!.mimics),range=manhattan(boss,s.player);
    trialStep(s,0,0);
    if(turn%2===1){assert.equal(manhattan(s.elemental,boss),0);assert.deepEqual(s.keymaster!.mimics,before);}
    else {
      assert.equal(manhattan(s.elemental,boss),1);assert.equal(manhattan(s.elemental,s.player),range+1);
      for(const [i,m] of s.keymaster!.mimics.entries()){
        assert.equal(manhattan(m,before[i]),1);assert.equal(manhattan(m,s.player),manhattan(before[i],s.player)-1);
      }
    }
  }
  const paused=structuredClone(s);assert.equal(trialStep(s,99,0).changed,false);assert.deepEqual(s,paused);
  assert.deepEqual(decodeTrial(s),s);
});

test("pursuit routes around the boss and reserves distinct tiles, while contact uses ordinary or free-key combat",()=> {
  const s=arena();s.player.x=12;s.player.y=16;s.keymaster!.spawned=2;s.keymaster!.mimics=[mimic(12,11),mimic(13,11,2)];
  const before=structuredClone(s.keymaster!.mimics);pursueMimics(s);
  const occupied=new Set<string>();
  for(const [i,m] of s.keymaster!.mimics.entries()) {
    assert.equal(manhattan(m,before[i]),1);assert.ok(arenaFloor(m.x,m.y));assert.notEqual(manhattan(m,s.elemental),0);
    assert.ok(!occupied.has(`${m.x},${m.y}`));occupied.add(`${m.x},${m.y}`);
  }
  s.keymaster!.mimics=[mimic(12,15)];s.keymaster!.keys=1;const hp=s.player.hp;
  pursueMimics(s);assert.equal(s.keymaster!.keys,0);assert.equal(s.keymaster!.mimics.length,0);assert.equal(s.player.hp,hp);
  s.keymaster!.mimics=[mimic(12,15)];s.keymaster!.keys=1;s.keymaster!.useKeys=false;
  pursueMimics(s);assert.equal(s.keymaster!.keys,1);assert.ok(s.player.hp<hp);assert.equal(s.keymaster!.mimics[0].hp,990);
});

test("cornered retreat stays in the arena and both movements remain deterministic across reloads",()=> {
  const s=arena();s.elemental.x=1;s.elemental.y=12;s.player.x=2;s.player.y=12;
  const before={...s.elemental};retreatKeymaster(s);assert.equal(manhattan(s.elemental,before),0);
  s.elemental.x=12;s.elemental.y=12;s.player.x=12;s.player.y=2;
  s.keymaster!.spawned=2;s.keymaster!.mimics=[mimic(6,10),mimic(18,10,2)];
  const reloaded=decodeTrial(s)!;assert.ok(reloaded);
  for(let i=0;i<40 && s.status==="active";i++) {
    trialStep(s,0,0);trialStep(reloaded,0,0);assert.deepEqual(reloaded,s);
    const seen=new Set<string>();for(const m of s.keymaster!.mimics){assert.ok(arenaFloor(m.x,m.y));assert.ok(!seen.has(`${m.x},${m.y}`));seen.add(`${m.x},${m.y}`);}
  }
});

test("moving bosses scatter three legal keys at each edge, and key piles decode away from the old center",()=> {
  for(let y=1;y<=23;y++)for(let x=1;x<=23;x++) {
    if(!arenaFloor(x,y))continue;
    const s=arena();s.elemental.x=x;s.elemental.y=y;
    const neighbor=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:x+dx,y:y+dy})).find(p=>arenaFloor(p.x,p.y))!;
    s.player.x=neighbor.x;s.player.y=neighbor.y;
    trialStep(s,x-neighbor.x,y-neighbor.y);
    assert.equal(s.keymaster!.drops.reduce((n,p)=>n+p.count,0),3,`${x},${y}`);
    for(const p of s.keymaster!.drops){assert.ok(arenaFloor(p.x,p.y));assert.equal(Math.max(Math.abs(p.x-x),Math.abs(p.y-y)),3);}
    assert.deepEqual(decodeTrial(s),s);
  }
});

test("door spirits track a ghost, wait without consuming their impact, then damage and teleport the reformed boss once",()=> {
  const s=arena();s.player.x=12;s.player.y=11;trialStep(s,0,1);
  s.keymaster!.doors=[{door:0,elapsed:0,hit:false}];const hp=s.bossHp;
  assert.equal(advanceKeymasterEffects(s,1100).changed,false);assert.equal(s.bossHp,hp);
  assert.equal(s.keymaster!.doors[0].hit,false);assert.deepEqual(decodeTrial(s),s);
  while(s.steps<10){s.keymaster!.mimics=[];trialStep(s,0,0);}
  const from={x:s.elemental.x,y:s.elemental.y};assert.ok(advanceKeymasterEffects(s,1).changed);
  assert.equal(s.bossHp,hp-s.bossMaxHp/5);assert.ok(s.elemental.incorporeal);assert.ok(manhattan(s.elemental,from)>=6);
  assert.equal(s.keymaster!.doors[0].hit,true);assert.equal(advanceKeymasterEffects(s,1100).changed,false);
  assert.deepEqual(decodeTrial(s),s);
});

test("a room full of dropped keys cannot prevent safe reformation on a player-occupied ghost tile",()=> {
  const s=arena();s.steps=9;s.elemental={x:12,y:12,incorporeal:true,teleport:{from:{x:6,y:6},step:1}};
  s.player.x=12;s.player.y=12;
  for(let y=1;y<=23;y++)for(let x=1;x<=23;x++)if(arenaFloor(x,y))s.keymaster!.drops.push({x,y,count:1});
  trialStep(s,0,0);assert.equal(s.elemental.incorporeal,false);assert.ok(manhattan(s.elemental,s.player)>0);
  const tile=trialBoard(s).tile(s.elemental.x,s.elemental.y);assert.equal(tile.kind,"enemy");
  assert.deepEqual(decodeTrial(s),s);
});
