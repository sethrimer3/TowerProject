import {test} from "node:test";
import assert from "node:assert/strict";
import {TrialNavigation,advanceTrial} from "../src/proving-grounds/navigation.ts";
import {autoplayTrial,trialPlan} from "../src/proving-grounds/autoplay.ts";
import {decodeTrial,startTrial,trialStep,type TrialMode} from "../src/proving-grounds/trial.ts";

const hero={maxHp:1000,attack:10,defense:0};
const start=(mode:TrialMode)=>startTrial(hero,mode,["stairs","bossEnemy"],12);

test("tile commands walk a real route, spending one move at a time and stopping at the staging staircase",()=> {
  const s=start("manual"),nav=new TrialNavigation();
  assert.ok(nav.select(s,4,6));assert.equal(s.player.y,2);
  assert.ok(nav.advance(s).changed);assert.equal(s.player.y,3);assert.equal(s.room,"staging");
  for(let i=0;i<3;i++)assert.ok(nav.advance(s).changed);
  assert.equal(s.room,"arena");assert.equal(s.player.y,2);assert.equal(s.steps,0);assert.equal(nav.target,null);
});

test("hybrid commands replace a card's planned step, then return control to the equipped hand",()=> {
  const s=start("hybrid"),nav=new TrialNavigation();
  s.room="arena";s.player.x=6;s.player.y=6;
  const plan=trialPlan(s)!;assert.ok(plan);
  assert.ok(nav.select(s,5,6));const turn=advanceTrial(s,nav);
  assert.equal(turn.card,null);assert.ok(turn.outcome.changed);assert.equal(s.steps,1);
  assert.deepEqual({x:s.player.x,y:s.player.y},{x:5,y:6});assert.equal(nav.target,null);
  const next=advanceTrial(s,nav);assert.notEqual(next.card,null);assert.ok(next.outcome.changed);assert.equal(s.steps,2);
  assert.ok(s.playing);assert.deepEqual(decodeTrial(s),s);
});

test("manual commands work while hybrid cards are paused, while cards-only mode refuses them",()=> {
  const s=start("hybrid"),nav=new TrialNavigation();s.playing=false;
  assert.ok(nav.select(s,5,2));assert.ok(advanceTrial(s,nav).outcome.changed);assert.equal(s.player.x,5);
  assert.equal(autoplayTrial(s).changed,false);
  const cards=start("cards"),before=structuredClone(cards);
  assert.equal(nav.select(cards,5,2),false);assert.equal(trialStep(cards,1,0).changed,false);
  assert.deepEqual(cards,before);assert.ok(autoplayTrial(cards).changed);
});

test("a clicked boss is struck once, rather than walking through its old tile after teleport",()=> {
  const s=start("manual"),nav=new TrialNavigation();s.room="arena";s.player.x=12;s.player.y=11;
  const hp=s.bossHp;assert.ok(nav.select(s,12,12));assert.ok(nav.advance(s).changed);
  assert.equal(s.bossHp,hp-10);assert.ok(s.elemental.incorporeal);assert.equal(s.player.y,11);
  assert.equal(s.steps,1);assert.equal(nav.target,null);assert.equal(nav.advance(s).changed,false);
});

test("route steps advance hazards normally, latest commands replace earlier routes, and wall clicks cost no turns",()=> {
  const s=start("manual"),nav=new TrialNavigation();s.room="arena";s.player.x=5;s.player.y=5;s.steps=8;
  assert.ok(nav.select(s,7,5));assert.equal(nav.advance(s).fired,false);
  assert.equal(s.steps,9);assert.equal(nav.advance(s).fired,true);assert.equal(s.steps,10);
  assert.deepEqual({x:s.player.x,y:s.player.y},{x:7,y:5});assert.equal(nav.target,null);
  assert.ok(nav.select(s,10,5));assert.ok(nav.select(s,6,5));nav.advance(s);assert.equal(s.player.x,6);
  const before=structuredClone(s);assert.equal(nav.select(s,0,0),false);assert.deepEqual(s,before);
  assert.ok(nav.select(s,s.player.x,s.player.y));assert.ok(nav.advance(s).changed);assert.equal(s.steps,12);
  nav.select(s,10,5);nav.clear();assert.equal(nav.advance(s).changed,false);
});
