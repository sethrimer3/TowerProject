import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { OutsideWorld, PROVING_GROUNDS } from "../src/outside.ts";
import { ARENA_POTIONS, ARENA_TORCHES, ARENA_SIZE, MAX_SLIMES, BEAM_AXES, ELEMENTAL, arenaFloor, beamCells, beamCount, decodeTrial, floorAt, key, nextBeamAxis, startTrial, trialStep } from "../src/proving-grounds/trial.ts";

import { autoplayTrial, trialPlan } from "../src/proving-grounds/autoplay.ts";

const hero = () => new Game(defaults()).run.player;
const arena = (level = 1) => {
  const s=startTrial(hero(),"manual",[],7391,level);
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

test("staging stairs enter a connected 25×25 hexagon with border torches and potions", () => {
  const s=arena();
  assert.equal(s.steps,0); assert.deepEqual({x:s.player.x,y:s.player.y},{x:ELEMENTAL.x,y:2});
  const seen=new Set<string>(),queue=[{...s.player}];
  for(let i=0;i<queue.length;i++) {
    const p=queue[i]; if(seen.has(key(p)))continue; seen.add(key(p));
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const q={...p,x:p.x+dx,y:p.y+dy}; if(arenaFloor(q.x,q.y)&&!seen.has(key(q)))queue.push(q);
    }
  }
  let count=0;for(let y=0;y<ARENA_SIZE;y++)for(let x=0;x<ARENA_SIZE;x++)if(arenaFloor(x,y))count++;
  assert.equal(seen.size,count); assert.ok(count>350 && count<500);
  assert.ok(arenaFloor(ELEMENTAL.x,ELEMENTAL.y)); assert.equal(arenaFloor(3,3),false);
  assert.ok(ARENA_TORCHES.length>=10); assert.ok(ARENA_POTIONS.length>=8);
  for(const p of ARENA_TORCHES)assert.equal(arenaFloor(p.x,p.y),false);
  for(const p of ARENA_POTIONS)assert.ok(arenaFloor(p.x,p.y));
});

test("opposing rays rotate 45 degrees every ten accepted turns, stop at walls and persist scars", () => {
  const s=arena(10);
  for(let shot=0;shot<8;shot++) {
    const axis=shot%8;
    assert.equal(nextBeamAxis(s),axis);
    for(let i=0;i<9;i++)assert.equal(trialStep(s,0,0).fired,false);
    assert.ok(trialStep(s,0,0).fired);
    const cells=beamCells(axis), [dx,dy]=BEAM_AXES[axis%4];
    assert.ok(cells.some(p=>p.x===ELEMENTAL.x+dx&&p.y===ELEMENTAL.y+dy));
    assert.ok(cells.some(p=>p.x===ELEMENTAL.x-dx&&p.y===ELEMENTAL.y-dy));
    assert.equal(cells.filter(p=>!arenaFloor(p.x,p.y)).length,2);
    for(const p of cells)assert.equal(s.scorches[key(p)],s.steps);
    // Keep this scheduling test alive independently of beam damage.
    s.player.hp=s.player.maxHp;
  }
  assert.ok(Object.keys(s.scorches).length>70);
});

test("blocked input costs no turn; beams damage only the actual ray and potions heal once", () => {
  const s=arena();s.player.x=ELEMENTAL.x;s.player.y=1;
  assert.equal(trialStep(s,0,-1).changed,false); assert.equal(s.steps,0);
  assert.equal(trialStep(s,1,1).changed,false);
  s.player.y=22;
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
  const s=arena();s.player.x=ELEMENTAL.x;s.player.y=ELEMENTAL.y-1;s.bossHp=s.player.attack;
  trialStep(s,0,1);assert.equal(s.status,"won");assert.equal(s.bossHp,0);
  assert.equal(trialStep(s,0,1).changed,false);
  const lost=arena();lost.player.hp=1;lost.player.y=22;lost.steps=9;
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
  const clean=decodeTrial({...s,scorches:{...s.scorches,"999,999":10,"12,12":99999}})!;
  assert.equal(clean.scorches["999,999"],undefined);assert.equal(clean.scorches["12,12"],undefined);
  assert.equal(decode(JSON.stringify(defaults())).provingGrounds,undefined);
  assert.equal(floorAt("staging",0,0),false);
});

test("slimes emerge every twenty turns and hop to legal nearby random tiles every three steps", () => {
  const s=arena();
  for(let i=0;i<19;i++)trialStep(s,0,0);
  assert.deepEqual(s.slimes,[]);
  trialStep(s,0,0); assert.equal(s.slimes.length,1);
  assert.deepEqual(s.slimes[0].from,ELEMENTAL);
  const previous=structuredClone(s.slimes);
  trialStep(s,0,0); assert.equal(s.slimes.length,1);
  assert.deepEqual(s.slimes[0].from,{x:previous[0].x,y:previous[0].y});
  assert.notEqual(key(s.slimes[0]),key(previous[0]));
  for(let i=0;i<180;i++) {
    s.player.hp=s.player.maxHp;
    trialStep(s,0,0);
    assert.ok(s.slimes.length<=MAX_SLIMES);
    assert.equal(new Set(s.slimes.map(key)).size,s.slimes.length);
    for(const p of s.slimes) {
      assert.ok(arenaFloor(p.x,p.y)); assert.notEqual(key(p),key(ELEMENTAL)); assert.notEqual(key(p),key(s.player));
      assert.ok(Math.abs(p.x-p.from.x)<=2 && Math.abs(p.y-p.from.y)<=2);
    }
  }
  // Different seeds produce different destinations; neither draws from the game RNG.
  const other=arena();other.seed=s.seed+1;
  for(let i=0;i<20;i++)trialStep(other,0,0);
  assert.notEqual(key(other.slimes[0]),key(previous[0]));
});

test("slime hopping continues deterministically after reload and striking one clears its tile", () => {
  const s=arena();for(let i=0;i<15;i++)trialStep(s,0,0);
  const resumed=decodeTrial(structuredClone(s))!;
  assert.ok(resumed);
  for(let i=0;i<12;i++) {trialStep(s,0,0);trialStep(resumed,0,0);}
  assert.deepEqual(resumed,s);
  const p=s.slimes[0];s.player.x=p.x;s.player.y=p.y-1;
  // Stay off a spawning pulse, so the assertion observes only the strike.
  s.steps=31;
  const id=p.id;
  trialStep(s,0,1);
  assert.equal(s.slimes.some(p=>p.id===id),false);
  assert.equal(key(s.player),key(p));
});

test("the board including ray endpoints stays inside 25×25 and all six sides have walls", () => {
  assert.equal(ARENA_SIZE,25);
  for(let axis=0;axis<4;axis++)for(const p of beamCells(axis)) {
    assert.ok(p.x>=0 && p.x<ARENA_SIZE && p.y>=0 && p.y<ARENA_SIZE);
  }
  for(const p of [...ARENA_TORCHES,...ARENA_POTIONS])assert.ok(p.x>=0 && p.x<25 && p.y>=0 && p.y<25);
});

test("card trials autoplay through staging using the equipped hand and reject manual input", () => {
  const hand=["stairs","monster"] as const,s=startTrial(hero(),"cards",hand,12);
  const before=structuredClone(s);
  assert.equal(trialStep(s,1,0).changed,false); assert.deepEqual(s,before);
  for(let i=0;i<4;i++)assert.ok(autoplayTrial(s).changed);
  assert.equal(s.room,"arena");assert.equal(s.steps,0);
  let sawSlime=false;
  for(let i=0;i<40;i++){s.player.hp=s.player.maxHp;autoplayTrial(s);sawSlime ||= s.slimes.length>0;}
  assert.ok(s.steps>0);assert.ok(sawSlime);assert.ok(s.bossHp<s.bossMaxHp);
  s.playing=false;const paused=structuredClone(s);
  assert.equal(autoplayTrial(s).changed,false);assert.deepEqual(s,paused);
  assert.equal(trialStep(s,0,1).changed,false);
  assert.deepEqual(decodeTrial(s),s);
});

test("card targeting honors hand priority, enemy categories, and pauses when no card can act", () => {
  const s=arena();s.mode="cards";s.playing=true;s.hand=["heal","bossEnemy"];
  let plan=trialPlan(s)!;assert.equal(s.hand[plan.card],"heal");
  s.hand=["bossEnemy","heal"];plan=trialPlan(s)!;assert.equal(s.hand[plan.card],"bossEnemy");
  s.slimes=[{id:1,x:11,y:10,from:{x:11,y:10},jumped:3}];
  s.hand=["weakEnemy","bossEnemy"];plan=trialPlan(s)!;assert.equal(s.hand[plan.card],"weakEnemy");
  s.hand=["yellowKey"];const steps=s.steps;
  assert.match(autoplayTrial(s).message,/No card can act/);assert.equal(s.playing,false);assert.equal(s.steps,steps);
});

test("manual trials have no hand, autoplay or card-sourced movement", () => {
  const s=startTrial(hero(),"manual",["stairs","monster"]);
  assert.deepEqual(s.hand,[]);assert.equal(s.playing,false);
  assert.equal(autoplayTrial(s).changed,false);assert.equal(trialStep(s,0,1,"cards").changed,false);
  assert.ok(trialStep(s,0,1).changed);
  assert.equal(trialPlan(s),null);
});

test("legacy large-room attempts restart in staging; bad mode and slime data cannot load", () => {
  const s=arena();
  const old={...s,version:undefined,player:{...s.player,x:25,y:45}};
  const migrated=decodeTrial(old)!;
  assert.equal(migrated.room,"staging");assert.equal(migrated.mode,"manual");assert.equal(migrated.player.maxHp,s.player.maxHp);
  assert.equal(decodeTrial({...s,mode:"unknown"}),undefined);
  assert.equal(decodeTrial({...s,hand:["monster"]}),undefined);
  for(let i=0;i<6;i++)trialStep(s,0,0);
  for(const broken of [
    {...s,slimes:[...s.slimes,s.slimes[0]]},
    {...s,slimes:[{...s.slimes[0],x:25}]},
    {...s,slimes:[{...s.slimes[0],jumped:7}]},
    {...s,mode:"cards",hand:["__proto__"]},
  ])assert.equal(decodeTrial(broken),undefined);
});

test("a starting hero can complete the manual trial with potions and beam dodges", () => {
  const s=arena();
  for(let i=0;i<1000 && s.status==="active";i++) {
    // Use ordinary planner paths as a test pilot, but submit manual input.
    const pilot={...s,mode:"cards" as const,hand:s.player.hp<s.player.maxHp*.6?["heal","monster"] as const:["bossEnemy"] as const};
    const step=trialPlan({...pilot,hand:[...pilot.hand]})?.path[0] ?? {dx:0,dy:0};
    assert.ok(step.dx || step.dy || s.elemental.incorporeal);
    const landing={x:s.player.x+step.dx,y:s.player.y+step.dy};
    if(!s.elemental.incorporeal && key(landing)===key(s.elemental))Object.assign(landing,{x:s.player.x,y:s.player.y});
    const danger=beamCells(nextBeamAxis(s),s.elemental,beamCount(s.level));
    if(s.steps%10===9 && danger.some(p=>key(p)===key(landing))) {
      const safe=[[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dy])=> {
        const p={x:s.player.x+dx,y:s.player.y+dy};
        return arenaFloor(p.x,p.y) && key(p)!==key(s.elemental) && !danger.some(q=>key(q)===key(p));
      });
      assert.ok(safe);trialStep(s,safe[0],safe[1]);
    } else trialStep(s,step.dx,step.dy);
  }
  assert.equal(s.status,"won");assert.ok(s.player.hp>0);
});

test("a hopping slime that lands on the hero deals contact damage and dissipates", () => {
  let hit=false;
  for(let seed=0;seed<200 && !hit;seed++) {
    const s=arena();s.seed=seed;s.steps=5;s.player.x=6;s.player.y=4;
    s.slimes=[{id:1,x:5,y:5,from:{x:5,y:5},jumped:3}];
    const outcome=trialStep(s,0,0);
    if(outcome.message.includes("lands on you")) {
      hit=true;assert.equal(s.player.hp,s.player.maxHp-Math.ceil(s.player.maxHp*.05));
      assert.equal(s.slimes.some(p=>p.id===1),false);
      assert.ok(decodeTrial(s));
    }
  }
  assert.ok(hit,"some nearby random hops can land on the hero");
});


test("a hit teleports the elemental, makes it invincible and removes every boss target until its lasers", () => {
  const s=arena();s.player.x=ELEMENTAL.x;s.player.y=ELEMENTAL.y-1;
  const hp=s.bossHp;
  assert.ok(trialStep(s,0,1).changed);
  assert.equal(s.bossHp,hp-s.player.attack);assert.ok(s.elemental.incorporeal);
  assert.notEqual(key(s.elemental),key(ELEMENTAL));
  assert.deepEqual(s.elemental.teleport,{from:ELEMENTAL,step:1});
  assert.ok(arenaFloor(s.elemental.x,s.elemental.y));
  assert.ok(!s.slimes.some(p=>key(p)===key(s.elemental)));
  for(const id of ["monster","bossEnemy","nonBossEnemy"] as const) {
    assert.equal(trialPlan({...s,mode:"cards",hand:[id]}),null);
  }
  // The ghost is ordinary passable floor, and cannot be damaged even by waiting on it.
  s.player.x=s.elemental.x;s.player.y=s.elemental.y;
  assert.ok(trialStep(s,0,0).changed);assert.equal(s.bossHp,hp-s.player.attack);
  assert.ok(decodeTrial(s));
  while(s.steps<9)trialStep(s,0,0);
  const position={x:s.elemental.x,y:s.elemental.y};
  assert.ok(trialStep(s,0,0).fired);assert.equal(s.elemental.incorporeal,false);
  assert.notEqual(key(s.elemental),key(s.player));
  assert.ok(Math.abs(s.elemental.x-position.x)+Math.abs(s.elemental.y-position.y)<=1);
  assert.ok(decodeTrial(s));
  assert.ok(trialPlan({...s,mode:"cards",hand:["bossEnemy"]}));
});

test("autoplay waits through an untargetable phase rather than pausing the laser countdown", () => {
  const s=arena();s.mode="cards";s.playing=true;s.hand=["bossEnemy"];
  s.player.x=ELEMENTAL.x;s.player.y=ELEMENTAL.y-1;
  autoplayTrial(s);
  const hp=s.bossHp;
  for(let i=0;i<8;i++) {
    assert.ok(autoplayTrial(s).changed);assert.ok(s.playing);assert.equal(s.bossHp,hp);
  }
  assert.equal(s.steps,9);assert.ok(s.elemental.incorporeal);
  assert.ok(autoplayTrial(s).fired);assert.equal(s.elemental.incorporeal,false);
  // Other real enemies remain valid while the boss is a ghost.
  s.elemental.incorporeal=true;s.hand=["monster"];
  s.slimes=[{id:1,x:11,y:10,from:{x:11,y:10},jumped:9}];
  assert.ok(trialPlan(s));
});

test("lasers and new slimes originate at the teleported tile and previous beam flashes keep their origin", () => {
  const s=arena();
  for(let i=0;i<10;i++)trialStep(s,0,0);
  const beam=structuredClone(s.beam);
  s.player.x=ELEMENTAL.x;s.player.y=ELEMENTAL.y-1;
  trialStep(s,0,1);
  assert.deepEqual(s.beam,beam);
  const target={x:s.elemental.x,y:s.elemental.y};
  while(s.steps<20)trialStep(s,0,0);
  assert.deepEqual(s.slimes.find(p=>p.id===20)?.from,target);
  assert.deepEqual(s.beam,{origin:target,axis:1,step:20,count:1});
  for(const p of beamCells(1,target,1))assert.equal(s.scorches[key(p)],20);
  assert.deepEqual(decodeTrial(s),s);
});

test("teleport destinations and ghost state survive reload and older 25×25 attempts keep their progress", () => {
  const s=arena();s.player.x=ELEMENTAL.x;s.player.y=ELEMENTAL.y-1;
  const copy=structuredClone(s);
  trialStep(s,0,1);trialStep(copy,0,1);assert.deepEqual(copy,s);
  const save=defaults();save.provingGrounds=s;
  assert.deepEqual(decode(JSON.stringify(save)).provingGrounds,s);
  const old=arena();for(let i=0;i<12;i++)trialStep(old,0,0);
  const legacy={...old,elemental:undefined,beam:undefined};
  assert.deepEqual(decodeTrial(legacy),old);
  for(const invalid of [
    {...s,elemental:{...s.elemental,x:0}},
    {...s,elemental:{...s.elemental,incorporeal:"yes"}},
    {...s,elemental:{...s.elemental,teleport:{from:{x:0,y:0},step:1}}},
    {...s,elemental:{...s.elemental,teleport:{from:ELEMENTAL,step:s.steps+1}}},
    {...s,elemental:{...s.elemental,teleport:null}},
    {...s,beam:{origin:ELEMENTAL,step:10,axis:0}},
  ])assert.equal(decodeTrial(invalid),undefined);
});

test("a hit on a laser turn still resolves exactly one volley and restores vulnerability", () => {
  const s=arena();s.steps=9;s.player.x=ELEMENTAL.x;s.player.y=ELEMENTAL.y-1;
  assert.ok(trialStep(s,0,1).fired);
  assert.equal(s.steps,10);assert.equal(s.elemental.incorporeal,false);
  assert.deepEqual(s.beam?.origin,{x:s.elemental.x,y:s.elemental.y});
});
