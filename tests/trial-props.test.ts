import {test} from "node:test";
import assert from "node:assert/strict";
import {decode,defaults} from "../src/save/save.ts";
import {ARENA_CRATES,ARENA_POTIONS,ARENA_TORCHES,ELEMENTAL,arenaFloor,beamCells,decodeTrial,key,propDestroyed,startTrial,trialStep,type Spot} from "../src/proving-grounds/trial.ts";

function arena(level=1) {
  const s=startTrial({maxHp:1000,attack:10,defense:0},"manual",[],12,level);
  for(let i=0;i<4;i++)trialStep(s,0,1);
  s.player.x=12;s.player.y=11;
  return s;
}

test("potions, wooden crates and standing torches occupy distinct floor tiles at the room edge",()=> {
  const all=[...ARENA_TORCHES,...ARENA_CRATES,...ARENA_POTIONS];
  assert.equal(new Set(all.map(key)).size,all.length);
  for(const list of [ARENA_TORCHES,ARENA_CRATES,ARENA_POTIONS])assert.ok(list.length>=8);
  for(const p of all) {
    assert.ok(arenaFloor(p.x,p.y));
    assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!arenaFloor(p.x+dx,p.y+dy)));
    assert.notEqual(key(p),key(ELEMENTAL));
    assert.notEqual(key(p),"12,2");
  }
});

test("each laser destroys crossed crates and torches, continues to the wall, and preserves potions",()=> {
  for(const target of [...ARENA_TORCHES,...ARENA_CRATES]) {
    // Four cardinal rays at level 30, with no slime spawn on the laser turn.
    const s=arena(30);s.steps=9;
    const origin:Spot|undefined=[[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy])=>({x:target.x+dx,y:target.y+dy}))
      .find(p=>arenaFloor(p.x,p.y) && !ARENA_POTIONS.some(q=>key(q)===key(p)));
    assert.ok(origin);Object.assign(s.elemental,origin);
    // Keep the pilot away from both source and edge prop.
    s.player.x=12;s.player.y=12;
    if(key(s.player)===key(s.elemental))s.player.y=11;
    const outcome=trialStep(s,0,0);assert.ok(outcome.fired);
    assert.ok(propDestroyed(s,target));
    const crossed=beamCells(s.beam!.axis,s.beam!.origin,s.beam!.count);
    assert.ok(crossed.some(p=>!arenaFloor(p.x,p.y)));
    for(const p of [...ARENA_CRATES,...ARENA_TORCHES])assert.equal(propDestroyed(s,p),crossed.some(q=>key(q)===key(p)));
    assert.deepEqual(s.consumed,[]);
    for(const p of ARENA_POTIONS)assert.equal(propDestroyed(s,p),false);
    assert.deepEqual(decodeTrial(s),s);
  }
});

test("slime landings break both edge prop types deterministically, including when landing on the hero",()=> {
  for(const target of [ARENA_TORCHES[0],ARENA_CRATES[0]]) {
    const from=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:target.x+dx,y:target.y+dy})).find(p=>arenaFloor(p.x,p.y))!;
    for(const heroAtTarget of [false,true]) {
      let hit=false;
      for(let seed=0;seed<500 && !hit;seed++) {
        const s=arena();s.seed=seed;s.steps=2;
        if(heroAtTarget)Object.assign(s.player,target);
        s.slimes=[{id:1,...from,from:{...from},jumped:2}];
        const resumed=structuredClone(s);
        trialStep(s,0,0);trialStep(resumed,0,0);assert.deepEqual(s,resumed);
        if(propDestroyed(s,target)) {
          hit=true;assert.equal(s.destroyed[key(target)],3);
          if(heroAtTarget)assert.equal(s.player.hp,950);
          else assert.ok(s.slimes.some(p=>key(p)===key(target)));
          assert.ok(decodeTrial(s));
        }
      }
      assert.ok(hit,`a legal hop lands on ${key(target)}`);
    }
  }
});

test("destroyed props persist through save/reload, never regrow on later hits, and reset on retry",()=> {
  const s=arena(),target=ARENA_TORCHES[0];
  s.steps=30;s.destroyed[key(target)]=10;
  const save=defaults();save.provingGrounds=s;
  const loaded=decode(JSON.stringify(save)).provingGrounds!;
  assert.ok(propDestroyed(loaded,target));assert.deepEqual(loaded,s);
  for(let i=0;i<40;i++){loaded.player.hp=loaded.player.maxHp;trialStep(loaded,0,0);}
  assert.equal(loaded.destroyed[key(target)],10);
  assert.deepEqual(startTrial(s.player).destroyed,{});
  const {destroyed,...old}=s;
  assert.deepEqual(decodeTrial(old)!.destroyed,{});
});

test("prop decoding rejects invalid containers and drops invalid coordinates and destruction turns",()=> {
  const s=arena();s.steps=30;
  assert.equal(decodeTrial({...s,destroyed:[]}),undefined);
  const good=key(ARENA_TORCHES[0]),crate=key(ARENA_CRATES[0]);
  const clean=decodeTrial({...s,destroyed:{[good]:10,[crate]:31,"12,12":10,"999,999":10,[key(ARENA_POTIONS[0])]:10}})!;
  assert.deepEqual(clean.destroyed,{[good]:10});
  for(const turn of [-1,0,NaN,Infinity,1.5])assert.deepEqual(decodeTrial({...s,destroyed:{[good]:turn}})!.destroyed,{});
});
