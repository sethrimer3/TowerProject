import {test} from "node:test";
import assert from "node:assert/strict";
import {startTrial,trialStep,trialFloor,decodeTrial} from "../src/proving-grounds/trial.ts";
import {KEYMASTER_WALL_BLOCKS,arenaFloor,keymasterArenaFloor,directions,key,ARENA_POTIONS,ARENA_TORCHES,ARENA_CRATES} from "../src/proving-grounds/arena.ts";
import {KEYMASTER_DOORS,pursueMimics,retreatKeymaster} from "../src/proving-grounds/keymaster.ts";
import {teleportBoss,materializeBoss} from "../src/proving-grounds/boss-movement.ts";
import {trialBoard,trialPosition} from "../src/proving-grounds/autoplay.ts";
import {routeTo} from "../src/pathfinding.ts";

function arena() {
  const s=startTrial({maxHp:1000,attack:10,defense:0},"manual",[],12,1,"keymaster");
  for(let i=0;i<4;i++)trialStep(s,0,1);
  return s;
}

test("Keymaster cover has both square sizes, one connected floor and clear approaches to all doors and edge props",()=> {
  const s=arena(),light={...s,trialId:"light-elemental" as const};
  assert.deepEqual(new Set(KEYMASTER_WALL_BLOCKS.map(p=>p.size)),new Set([2,3]));
  for(const p of KEYMASTER_WALL_BLOCKS)for(let y=p.y;y<p.y+p.size;y++)for(let x=p.x;x<p.x+p.size;x++) {
    assert.ok(arenaFloor(x,y));assert.equal(trialFloor(s,x,y),false);
    assert.equal(trialBoard(s).tile(x,y).kind,"wall");assert.equal(trialFloor(light,x,y),true);
  }
  const queue=[{x:12,y:2}],seen=new Set(queue.map(key));
  for(let i=0;i<queue.length;i++)for(const [dx,dy] of directions) {
    const p={x:queue[i].x+dx,y:queue[i].y+dy};
    if(!trialFloor(s,p.x,p.y) || seen.has(key(p)))continue;
    seen.add(key(p));queue.push(p);
  }
  for(let y=0;y<25;y++)for(let x=0;x<25;x++)if(trialFloor(s,x,y))assert.ok(seen.has(key({x,y})));
  for(const p of [...KEYMASTER_DOORS,...ARENA_POTIONS,...ARENA_TORCHES,...ARENA_CRATES])assert.ok(seen.has(key(p)));
});

test("manual routes and mimic pursuit detour around cover; wall bumps spend no turn and retreat cannot enter cover",()=> {
  const s=arena();s.player.x=5;s.player.y=7;s.keymaster!.mimics=[];
  const before=structuredClone(s);assert.equal(trialStep(s,1,0).changed,false);assert.deepEqual(s,before);
  const path=routeTo(trialPosition(s),8,7);assert.ok(path);assert.ok(path.length>3);
  for(const p of path){assert.ok(trialStep(s,p.dx,p.dy).changed);assert.ok(keymasterArenaFloor(s.player.x,s.player.y));}
  assert.deepEqual({x:s.player.x,y:s.player.y},{x:8,y:7});
  s.player.x=8;s.player.y=7;s.keymaster!.spawned=1;
  s.keymaster!.mimics=[{id:1,x:5,y:7,hp:60,maxHp:60}];
  for(let i=0;i<4;i++) {
    pursueMimics(s);const m=s.keymaster!.mimics[0];assert.ok(keymasterArenaFloor(m.x,m.y));
  }
  s.elemental.x=5;s.elemental.y=7;s.player.x=4;s.player.y=7;
  retreatKeymaster(s);assert.ok(keymasterArenaFloor(s.elemental.x,s.elemental.y));
  assert.notDeepEqual({x:s.elemental.x,y:s.elemental.y},{x:6,y:7});
});

test("teleports and occupied-ghost reformation always use free Keymaster floor, including across reloads",()=> {
  const s=arena();s.steps=1;s.keymaster!.mimics=[];
  for(let seed=0;seed<40;seed++) {
    s.seed=seed;teleportBoss(s,1);
    assert.ok(keymasterArenaFloor(s.elemental.x,s.elemental.y));
    assert.deepEqual(decodeTrial(s),s);
    s.player.x=s.elemental.x;s.player.y=s.elemental.y;
    materializeBoss(s);
    assert.ok(keymasterArenaFloor(s.elemental.x,s.elemental.y));
    assert.notEqual(key(s.player),key(s.elemental));assert.deepEqual(decodeTrial(s),s);
  }
});

test("old attempts relocate blocked occupants once, preserving stats, keys, counters, training and door receipts",()=> {
  const raw:any=arena();delete raw.keymaster.layout;raw.steps=9;
  raw.player.x=6;raw.player.y=7;raw.player.hp=450;
  raw.elemental={x:16,y:7,incorporeal:true,teleport:{from:{x:7,y:16},step:1}};
  raw.keymaster.mimics=[{id:1,x:6,y:16,hp:30,maxHp:60},{id:2,x:17,y:17,hp:60,maxHp:60}];
  raw.keymaster.keys=4;raw.keymaster.hits=2;raw.keymaster.spawned=2;
  raw.keymaster.drops=[{x:19,y:12,count:2},{x:5,y:7,count:1}];
  raw.keymaster.doors=[{door:0,elapsed:1100,hit:false}];
  raw.purchases={silver:20,training:{attack:1}};
  const original=structuredClone(raw),s=decodeTrial(raw)!;assert.ok(s);
  assert.deepEqual(raw,original);assert.equal(s.keymaster!.layout,2);
  const actors=[s.player,s.elemental,...s.keymaster!.mimics];
  for(const p of [...actors,...s.keymaster!.drops,s.elemental.teleport!.from])assert.ok(keymasterArenaFloor(p.x,p.y));
  assert.equal(new Set(actors.map(key)).size,actors.length);
  assert.equal(s.player.hp,450);assert.equal(s.steps,9);assert.equal(s.keymaster!.keys,4);
  assert.equal(s.keymaster!.drops.reduce((n,p)=>n+p.count,0),3);
  assert.deepEqual(s.keymaster!.doors,original.keymaster.doors);assert.deepEqual(s.purchases,original.purchases);
  assert.deepEqual(decodeTrial(s),s);
  const current=structuredClone(s);current.player.x=6;current.player.y=7;assert.equal(decodeTrial(current),undefined);
  const unknown=structuredClone(s) as any;unknown.keymaster.layout=3;assert.equal(decodeTrial(unknown),undefined);
});
