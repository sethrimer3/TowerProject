import {test} from "node:test";
import assert from "node:assert/strict";
import {TrialCamera,TRIAL_TILE_SIZE,type TrialTransition} from "../src/proving-grounds/camera.ts";
import {startTrial,type TrialState} from "../src/proving-grounds/trial.ts";
import {defaults} from "../src/save/save.ts";

function arena() {
  const s=startTrial({maxHp:1000,attack:10,defense:0});s.room="arena";s.player.x=10;s.player.y=10;return s;
}
function frames(c:TrialCamera,s:TrialState,from:number,count:number,transition:TrialTransition="smooth",reduce=false,ahead:readonly {dx:number;dy:number}[]=[]) {
  for(let i=1;i<=count;i++)c.update(s,from+i*1000/60,reduce,transition,ahead);
  return from+count*1000/60;
}

test("trial motion defaults to Smooth and eases the drawn hero without changing a logical turn",()=> {
  assert.equal(defaults().settings.transition,"smooth");
  const s=arena(),c=new TrialCamera();c.update(s,0,false);const first=c.view(s);
  s.player.x++;const before=structuredClone(s);c.update(s,1000/60,false);
  assert.ok(c.hero(s).x>10 && c.hero(s).x<11);assert.deepEqual(c.view(s),first);
  assert.equal(c.settled,false);frames(c,s,1000/60,180);
  assert.equal(c.hero(s).x,11);assert.equal(c.settled,true);assert.deepEqual(s,before);
});

test("the Delve dead zone holds short walks, then the camera trails a longer walk smoothly within the room",()=> {
  const s=arena(),c=new TrialCamera();c.update(s,0,false);const first=c.view(s);let now=0;
  for(let i=0;i<2;i++){s.player.x++;now=frames(c,s,now,60);assert.deepEqual(c.view(s),first);}
  s.player.x++;const last=c.view(s).left;now=frames(c,s,now,1);
  assert.ok(c.view(s).left-last<1);assert.ok(c.view(s).left<s.player.x-8);
  now=frames(c,s,now,180);assert.ok(c.view(s).left>first.left);
  for(let step=0;step<10;step++) {
    s.player.x=Math.min(24,s.player.x+1);s.player.y=Math.min(24,s.player.y+1);
    for(let i=0;i<20;i++) {
      now=frames(c,s,now,1);const v=c.view(s);
      assert.ok(v.left>=-4 && v.left<=12 && v.bottom>=-4 && v.bottom<=12);
      assert.ok(Math.abs(v.left*TRIAL_TILE_SIZE-Math.round(v.left*TRIAL_TILE_SIZE))<1e-9);
      assert.ok(Math.abs(v.bottom*TRIAL_TILE_SIZE-Math.round(v.bottom*TRIAL_TILE_SIZE))<1e-9);
    }
  }
});

test("Fast catches up sooner while Instant and Reduce motion restore immediate centered movement",()=> {
  const s=arena(),smooth=new TrialCamera(),fast=new TrialCamera();smooth.update(s,0,false);fast.update(s,0,false,"fast");
  s.player.x++;smooth.update(s,1000/60,false);fast.update(s,1000/60,false,"fast");
  assert.ok(fast.hero(s).x>smooth.hero(s).x);
  s.player.x=20;s.player.y=20;frames(smooth,s,1000/60,10);frames(fast,s,1000/60,10,"fast");
  assert.ok(fast.view(s).left>smooth.view(s).left);
  smooth.update(s,1000,false,"instant");assert.deepEqual(smooth.view(s),{left:12,bottom:12});
  assert.deepEqual(smooth.hero(s),{x:20,y:20});assert.equal(smooth.settled,true);
  s.player.x=21;smooth.update(s,1016,true,"smooth");assert.deepEqual(smooth.view(s),{left:13,bottom:12});
  assert.equal(smooth.hero(s).x,21);assert.equal(smooth.settled,true);
});

test("small staging stays centered and room changes or new attempts reset the camera safely",()=> {
  const s=startTrial({maxHp:1000,attack:10,defense:0}),c=new TrialCamera();c.update(s,0,false);
  assert.deepEqual(c.view(s),{left:-4,bottom:-4});s.player.y=5;frames(c,s,0,120);
  assert.deepEqual(c.view(s),{left:-4,bottom:-4});
  s.room="arena";s.player.x=12;s.player.y=2;assert.equal(c.tileAt(s,.5,.5),null);
  c.update(s,3000,false);assert.deepEqual(c.view(s),{left:4,bottom:-4});assert.deepEqual(c.hero(s),{x:12,y:2});
  const next=structuredClone(s);next.player.x=23;next.player.y=23;c.update(next,3016,false);
  assert.deepEqual(c.view(next),{left:12,bottom:12});assert.deepEqual(c.hero(next),{x:23,y:23});
});

test("clicks resolve visible tile centers and clipped edges during a fractional camera glide",()=> {
  const s=arena(),c=new TrialCamera();assert.equal(c.tileAt(s,.5,.5),null);c.update(s,0,false);
  s.player.x=17;s.player.y=16;frames(c,s,0,8);
  const v=c.view(s);assert.ok(!Number.isInteger(v.left) || !Number.isInteger(v.bottom));assert.equal(c.settled,false);
  for(let y=Math.ceil(v.bottom);y<v.bottom+16;y++)for(let x=Math.ceil(v.left);x<v.left+16;x++) {
    const u=(x+.5-v.left)/17,yy=1-(y+.5-v.bottom)/17;
    assert.deepEqual(c.tileAt(s,u,yy),{x,y});
  }
  c.update(s,1000,false,"instant");assert.deepEqual(c.tileAt(s,0,0),{x:9,y:24});
  for(const [u,y] of [[-1,.5],[1,.5],[.5,1],[NaN,.5]])assert.equal(c.tileAt(s,u,y),null);
});

test("path framing anticipates the next steps without moving the player, and caller paths remain unchanged",()=> {
  const s=arena(),c=new TrialCamera();s.player.x=12;s.player.y=12;c.update(s,0,false);
  const before=structuredClone(s),path=Array.from({length:8},()=>({dx:1,dy:0})),saved=structuredClone(path),left=c.view(s).left;
  frames(c,s,0,120,"smooth",false,path);assert.ok(c.view(s).left>left);
  assert.deepEqual(c.hero(s),{x:12,y:12});assert.deepEqual(s,before);assert.deepEqual(path,saved);
});
