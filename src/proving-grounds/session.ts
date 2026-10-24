import type { TrainingId } from "../progression/training.ts";
import { Game } from "../state.ts";
import { random } from "../random.ts";
import type { TowerRun } from "../runs.ts";
import { trialBoard } from "./autoplay.ts";
import type { TrialState } from "./trial.ts";

export const TRIAL_TRAINING: ReadonlySet<TrainingId>=new Set(["attack","defense","hp"]);

/** The ordinary HUD and run-training bar read a real, isolated Game.
 * Only copied hero stats, trial Silver and trial training return to the attempt. */
export class TrialSession {
  readonly game: Game;
  constructor(private base: Game, readonly state: TrialState) {
    const save=structuredClone(base.save);
    delete save.provingGrounds;
    save.delve.run=null;
    const game=this.game=new Game(save,random(state.seed));
    state.displayHand ??= [...(state.mode!=="manual"?state.hand:base.hand)];
    state.purchases ??= {silver:base.startingSilver,training:{}};
    game.save.settings=base.save.settings;
    // Trials use their own turn controls and do not repeat Tower lessons.
    for(const key of Object.keys(game.save.tutorials)) game.save.tutorials[key as keyof typeof game.save.tutorials]=true;
    const run: TowerRun={seed:state.seed,player:{...state.player,keys:{yellow:state.keymaster?.keys??0,blue:0,red:0}},
      height:1,maxHeight:1,floor:1,kills:0,treasures:0,changes:{},damaged:false,
      hand:[...state.hand],silver:state.purchases.silver,training:{...state.purchases.training},
      loadout:{attack:state.player.attack,defense:state.player.defense,maxHp:state.player.maxHp}};
    game.run=run; game.save.tower.run=run; game.world=trialBoard(state);
    game.save.tower.history=[];
    const train=game.trainInRun.bind(game);
    game.trainInRun=(...args)=> {
      if(state.status!=="active" || !TRIAL_TRAINING.has(args[0]) || !train(...args)) return false;
      this.capture();return true;
    };
    this.sync();
  }
  sync() {
    const {game,state}=this;
    Object.assign(game.run.player,state.player);
    game.run.player.keys.yellow=state.keymaster?.keys??0;
    game.run.silver=state.purchases!.silver;
    game.run.training={...state.purchases!.training};
    game.auto=state.mode!=="manual" && state.playing && state.status==="active";
    game.handStuck=false;game.world=trialBoard(state);
    game.save.gemDrop={...this.base.save.gemDrop};game.save.goldBoostUntil=this.base.save.goldBoostUntil;
    for(const key of ["gold","gems","ascensionShards","medals"] as const) game.save[key]=this.base.save[key];
  }
  capture() {
    const p=this.game.run.player;
    Object.assign(this.state.player,{x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,attack:p.attack,defense:p.defense});
    this.state.purchases={silver:this.game.silver,training:{...this.game.run.training}};
  }
}
