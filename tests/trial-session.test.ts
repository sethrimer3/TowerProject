import {test} from "node:test";
import assert from "node:assert/strict";
import {Game} from "../src/state.ts";
import {defaults,decode} from "../src/save.ts";
import {TrialSession} from "../src/proving-grounds/session.ts";
import {decodeTrial,startTrial} from "../src/proving-grounds/trial.ts";
import {silverPrice} from "../src/progression/run-training.ts";

function setup() {
  const base=new Game(defaults());base.newRun({outside:true,seed:12});
  base.save.upgrades.onTheJob=1;
  const state=startTrial(base.run.player,"manual",base.hand,12);
  state.purchases={silver:100,training:{}};
  base.save.provingGrounds=state;
  return {base,state};
}

test("trial HUD uses an in-run Game while manual cards remain display-only",()=> {
  const {base,state}=setup();
  state.displayHand=["stairs","archer","monster"];
  const before=JSON.stringify(base.save.tower.run),session=new TrialSession(base,state);
  assert.equal(session.game.run.outside,undefined);
  assert.ok(session.game.playing);
  assert.deepEqual(session.game.hand,[]);
  assert.equal(session.game.isArcher,false);
  assert.deepEqual(state.displayHand,["stairs","archer","monster"]);
  assert.equal(session.game.world.tile(4,2).kind,"floor"); // staging
  assert.equal(JSON.stringify(base.save.tower.run),before);
});

test("the shared run-training command spends trial Silver and persists its exact stat gains",()=> {
  const {base,state}=setup(),before=JSON.stringify(base.save.tower.run);
  const wallet={gold:base.save.gold,gems:base.save.gems,training:structuredClone(base.save.training)};
  const session=new TrialSession(base,state),attack=state.player.attack;
  assert.ok(session.game.trainInRun("attack"));
  assert.ok(state.player.attack>attack);
  assert.equal(state.purchases!.training.attack,1);
  assert.equal(state.purchases!.silver,100-silverPrice("attack",0));
  assert.equal(JSON.stringify(base.save.tower.run),before);
  assert.deepEqual({gold:base.save.gold,gems:base.save.gems,training:base.save.training},wallet);
  const loaded=decode(JSON.stringify(base.save));
  assert.deepEqual(loaded.provingGrounds,state);
  const resumed=new TrialSession(new Game(loaded),loaded.provingGrounds!);
  assert.equal(resumed.game.run.player.attack,state.player.attack);
  assert.ok(resumed.game.trainInRun("attack"));
  assert.equal(loaded.provingGrounds!.purchases!.training.attack,2);
  assert.equal(loaded.provingGrounds!.purchases!.silver,100-silverPrice("attack",0)-silverPrice("attack",1));
});

test("trial stat training uses ordinary HP gains and stops after the attempt ends",()=> {
  const {base,state}=setup(),session=new TrialSession(base,state);
  const max=state.player.maxHp;
  assert.ok(session.game.trainInRun("hp"));
  assert.ok(state.player.maxHp>max);assert.equal(state.player.hp,state.player.maxHp);
  state.status="won";state.bossHp=0;
  const before=structuredClone(state);
  assert.equal(session.game.trainInRun("attack"),false);
  assert.deepEqual(state,before);
});

test("trial purchase decoding rejects malformed prices, ranks and displayed cards",()=> {
  const {state}=setup();
  for(const bad of [
    {...state,purchases:{silver:NaN,training:{}}},
    {...state,purchases:{silver:100,training:{attack:-1}}},
    {...state,purchases:{silver:100,training:{fake:1}}},
    {...state,displayHand:["__proto__"]},
  ])assert.equal(decodeTrial(bad),undefined);
});


test("unsupported normal-run training cannot consume a trial's Silver",()=> {
  const {base,state}=setup();base.save.upgrades.regen=1;
  const session=new TrialSession(base,state),before=structuredClone(state);
  assert.equal(session.game.trainInRun("regen"),false);
  assert.deepEqual(state,before);
});
