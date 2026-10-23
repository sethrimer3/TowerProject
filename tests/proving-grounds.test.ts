import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { OutsideWorld, PROVING_GROUNDS } from "../src/outside.ts";
import { ARENA_POTIONS, ARENA_TORCHES, BEAM_AXES, ELEMENTAL, arenaFloor, beamCells, decodeTrial, floorAt, key, nextBeamAxis, startTrial, trialStep } from "../src/proving-grounds/trial.ts";

const hero = () => new Game(defaults()).run.player;
const arena = () => {
  const s=startTrial(hero());
  for(let i=0;i<4;i++) assert.ok(trialStep(s,0,1).changed);
  assert.equal(s.room,"arena");
  return s;
};

test("the golden square is open ground in the Tower forest and opens trials on entry", () => {
  const g=new Game(defaults()); g.newRun({outside:true,seed:12});
  const world=g.world as OutsideWorld;
  const x=world.entranceX+PROVING_GROUNDS.dx, y=PROVING_GROUNDS.y;
  assert.equal(world.tile(x,y).kind,"floor");
  assert.ok(world.isProvingGrounds(x,y));
  g.run.player.x=x-1; g.run.player.y=y;
  g.auto=true; g.route=[{dx:1,dy:0}];
  const gold=g.save.gold;
  assert.ok(g.move(1,0)); assert.ok(g.provingGroundsRequested);
  assert.equal(g.auto,false); assert.deepEqual(g.route,[]); assert.equal(g.save.gold,gold);
  assert.equal(new OutsideWorld(12,"delve").isProvingGrounds(x,y),false);
});

test("staging stairs enter a connected large hexagon with border torches and potions", () => {
  const s=arena();
  assert.equal(s.steps,0); assert.deepEqual({x:s.player.x,y:s.player.y},{x:25,y:4});
  const seen=new Set<string>(),queue=[{...s.player}];
  for(let i=0;i<queue.length;i++) {
    const p=queue[i]; if(seen.has(key(p)))continue; seen.add(key(p));
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const q={...p,x:p.x+dx,y:p.y+dy}; if(arenaFloor(q.x,q.y)&&!seen.has(key(q)))queue.push(q);
    }
  }
  let count=0;for(let y=0;y<50;y++)for(let x=0;x<50;x++)if(arenaFloor(x,y))count++;
  assert.equal(seen.size,count); assert.ok(count>1400);
  assert.ok(arenaFloor(25,25)); assert.equal(arenaFloor(3,3),false);
  assert.ok(ARENA_TORCHES.length>=12); assert.ok(ARENA_POTIONS.length>=12);
  for(const p of ARENA_TORCHES)assert.equal(arenaFloor(p.x,p.y),false);
  for(const p of ARENA_POTIONS)assert.ok(arenaFloor(p.x,p.y));
});

test("opposing rays rotate 45 degrees every ten accepted turns, stop at walls and persist scars", () => {
  const s=arena();
  for(let shot=0;shot<8;shot++) {
    const axis=shot%4;
    assert.equal(nextBeamAxis(s),axis);
    for(let i=0;i<9;i++)assert.equal(trialStep(s,0,0).fired,false);
    assert.ok(trialStep(s,0,0).fired);
    const cells=beamCells(axis), [dx,dy]=BEAM_AXES[axis];
    assert.ok(cells.some(p=>p.x===ELEMENTAL.x+dx&&p.y===ELEMENTAL.y+dy));
    assert.ok(cells.some(p=>p.x===ELEMENTAL.x-dx&&p.y===ELEMENTAL.y-dy));
    assert.equal(cells.filter(p=>!arenaFloor(p.x,p.y)).length,2);
    for(const p of cells)assert.equal(s.scorches[key(p)],s.steps);
    // Keep this scheduling test alive independently of beam damage.
    s.player.hp=s.player.maxHp;
  }
  assert.ok(Object.keys(s.scorches).length>100);
});

test("blocked input costs no turn; beams damage only the actual ray and potions heal once", () => {
  const s=arena();s.player.x=25;s.player.y=2;
  assert.equal(trialStep(s,0,-1).changed,false); assert.equal(s.steps,0);
  assert.equal(trialStep(s,1,1).changed,false);
  s.steps=9;trialStep(s,0,0);
  assert.equal(s.player.hp,s.player.maxHp-Math.ceil(s.player.maxHp*.25));
  s.player.hp=Math.floor(s.player.maxHp/2);
  const p=ARENA_POTIONS[0];s.player.x=p.x;s.player.y=p.y;
  trialStep(s,0,0);const hp=s.player.hp;
  assert.ok(hp>Math.floor(s.player.maxHp/2));
  trialStep(s,0,0);assert.equal(s.player.hp,hp);
});

test("boss strikes, victory and defeat resolve without touching the Tower run", () => {
  const g=new Game(defaults()), original=JSON.stringify(g.save);
  const s=arena();s.player.x=25;s.player.y=24;s.bossHp=s.player.attack;
  trialStep(s,0,1);assert.equal(s.status,"won");assert.equal(s.bossHp,0);
  assert.equal(trialStep(s,0,1).changed,false);
  const lost=arena();lost.player.hp=1;lost.steps=9;
  assert.ok(trialStep(lost,0,0).fired);assert.equal(lost.status,"lost");
  assert.equal(JSON.stringify(g.save),original);
});

test("reload preserves room, countdown, potions, scars and boss health; malformed trials are discarded", () => {
  const save=defaults(),s=arena();save.provingGrounds=s;
  for(let i=0;i<12;i++)trialStep(s,0,0);
  assert.deepEqual(decode(JSON.stringify(save)).provingGrounds,s);
  assert.equal(decodeTrial({...s,player:{...s.player,x:NaN}}),undefined);
  assert.equal(decodeTrial({...s,steps:Infinity}),undefined);
  assert.equal(decodeTrial({...s,player:{...s.player,hp:s.player.maxHp+1}}),undefined);
  const clean=decodeTrial({...s,scorches:{...s.scorches,"999,999":10,"25,25":99999}})!;
  assert.equal(clean.scorches["999,999"],undefined);assert.equal(clean.scorches["25,25"],undefined);
  assert.equal(decode(JSON.stringify(defaults())).provingGrounds,undefined);
  assert.equal(floorAt("staging",0,0),false);
});

test("a starting hero can complete the full trial by using a wall potion and dodging the next beam", () => {
  const s=arena();
  // Take the opening beam, then recover at the southwest wall.
  for(let i=0;i<10;i++)trialStep(s,0,0);
  for(let i=0;i<4;i++)trialStep(s,-1,0);
  for(let i=0;i<2;i++)trialStep(s,0,-1);
  assert.equal(s.player.hp,s.player.maxHp);
  assert.ok(s.consumed.includes("21,2"));
  for(let i=0;i<22;i++)trialStep(s,0,1);
  for(let i=0;i<4;i++)trialStep(s,1,0);
  assert.deepEqual({x:s.player.x,y:s.player.y},{x:25,y:24});
  for(let i=0;i<40 && s.status==="active";i++) {
    if(s.steps%40===9) { trialStep(s,-1,0); trialStep(s,1,0); }
    else trialStep(s,0,1);
  }
  assert.equal(s.status,"won");
  assert.ok(s.player.hp>0);
});
