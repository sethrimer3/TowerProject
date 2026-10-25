import type {Game} from "../state.ts";
import {BEAM_INTERVAL,beamCount,beamHeadings,nextBeamAxis,slimeSpawnInterval,startTrial,trialStep,type TrialMode,type TrialState} from "../proving-grounds/trial.ts";
import {spendTrialKey,trialKeys} from "../proving-grounds/access.ts";
import {TRIAL_IDS,TRIALS,type TrialId} from "../proving-grounds/catalog.ts";
import {clearedDifficulty,nextDifficulty,settleTrialVictory} from "../proving-grounds/progression.ts";
import {advanceTrial,TrialNavigation} from "../proving-grounds/navigation.ts";
import {advanceKeymasterEffects,mimicInterval,KEYMASTER_REFORM_INTERVAL} from "../proving-grounds/keymaster.ts";
import type {TrainingId} from "../progression/training.ts";
import {TrialSession,TRIAL_TRAINING} from "../proving-grounds/session.ts";
import {TrialRenderer} from "../proving-grounds/render.ts";
import {trialPlan} from "../proving-grounds/autoplay.ts";
import {CARDS} from "../cards/cards.ts";
import {el} from "./dom.ts";
import {setEndRunLabel} from "./run-menu.ts";
import {usesGameSprites} from "../sprites/style.ts";

const MODES=[
  ["manual","Without cards","Click a tile to walk to it. Cards stay disabled."],
  ["cards","Only with cards","Your hand controls movement. Player movement is disabled."],
  ["hybrid","With both","Cards play automatically; your tile commands take priority until you arrive."],
] as const;

/** One list entry per boss, followed by its control picker. Encounters use
 * the normal board/HUD, with shared progress and rewards across all controls. */
export class ProvingGroundsDialog {
  private session:TrialSession|null=null;
  private renderer:TrialRenderer|null=null;
  private navigation=new TrialNavigation();
  private nextAutoAt=0;
  private firedAt=0;
  private lastFrame=0;
  private cameraPathKey="";
  private cameraPath:readonly {dx:number;dy:number}[]=[];
  private message="Climb the staircase to enter the trial.";
  private settled:TrialState|null=null;
  private award=0;
  private canvas=el("world") as HTMLCanvasElement;
  private originalTabIndex=this.canvas.tabIndex;
  private originalLabel=this.canvas.getAttribute("aria-label")!;
  constructor(private base:Game,private modal:HTMLDialogElement,private save:()=>void,private changed:()=>void=()=>{},private visible:()=>boolean=()=>true) {
    window.addEventListener("keydown",e=> {
      if(!this.active || !this.visible() || this.modal.open || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName))return;
      if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();this.leave();return;}
      if(e.key===" " && (e.target as HTMLElement).closest("button"))return;
      const moves:Record<string,[number,number]>={ArrowUp:[0,1],w:[0,1],ArrowDown:[0,-1],s:[0,-1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]," ":[0,0],".":[0,0]};
      const move=moves[e.key];if(move){e.preventDefault();e.stopImmediatePropagation();this.step(...move);}
    },true);
    let down:{x:number;y:number;id:number}|null=null;
    this.canvas.addEventListener("pointerdown",e=> {
      if(!this.active || this.modal.open)return;
      e.preventDefault();e.stopImmediatePropagation();down={x:e.clientX,y:e.clientY,id:e.pointerId};this.canvas.setPointerCapture(e.pointerId);
    },true);
    this.canvas.addEventListener("pointermove",e=>{if(this.active)e.stopImmediatePropagation();},true);
    this.canvas.addEventListener("pointercancel",()=>{down=null;},true);
    this.canvas.addEventListener("pointerup",e=> {
      if(!this.active)return;
      e.preventDefault();e.stopImmediatePropagation();
      const start=down;down=null;
      if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
      if(!start || start.id!==e.pointerId || this.modal.open || Math.max(Math.abs(e.clientX-start.x),Math.abs(e.clientY-start.y))>10)return;
      const s=this.session!.state;if(s.mode==="cards")return;
      const box=this.canvas.getBoundingClientRect();
      const point=this.renderer!.tileAt(s,(e.clientX-box.left)/box.width,(e.clientY-box.top)/box.height);
      if(point && this.navigation.select(s,point.x,point.y)) {
        this.session!.game.activeCard=null;this.nextAutoAt=0;
        this.message="Moving to the selected tile.";this.changed();
      }
    },true);
    modal.addEventListener("close",()=>{this.modal.classList.remove("proving-grounds-dialog");if(this.modal.getAttribute("aria-labelledby")==="trial-heading")this.modal.removeAttribute("aria-labelledby");});
  }
  get active(){return !!this.session;}
  get viewGame(){this.session?.sync();return this.session?.game;}
  get displayHand(){return this.session?.state.displayHand;}
  allowsTraining(id:TrainingId){return TRIAL_TRAINING.has(id);}
  tick(){if(this.modal.open && this.modal.querySelector("#trial-key-balance"))this.refreshAccess();else if(this.session && this.session.state.status!=="active")this.decorate();}
  check() {
    if(this.session && this.session.state!==this.base.save.provingGrounds)this.detach();
    const state=this.base.save.provingGrounds;
    if(state?.status==="won" && this.settled!==state) {
      const result=settleTrialVictory(this.base.save,state);
      this.settled=state;this.award=result.points;if(result.changed)this.save();
    }
    if(this.modal.open && this.modal.querySelector("#trial-key-balance"))this.refreshAccess();
    if(this.active || this.modal.open)return;
    if(this.base.provingGroundsRequested){this.base.provingGroundsRequested=false;this.openMenu();}
    else if(state)this.openTrial();
  }
  private show(html:string) {
    this.modal.classList.add("proving-grounds-dialog");this.modal.innerHTML=html;
    this.modal.setAttribute("aria-labelledby","trial-heading");if(!this.modal.open)this.modal.showModal();
    this.refreshAccess();
  }
  private header(){return `<p id="trial-key-balance" role="status"></p><p class="trial-points">Trial Points: <b>${this.base.save.trialAccess.points.toLocaleString("en-US")}</b></p>`;}
  private openMenu() {
    this.base.auto=false;this.base.cancelRoute();
    this.show(`<h2 id="trial-heading">Proving Grounds Trials</h2>${this.header()}<small>Two keys daily, shared by all trials. Refills at midnight UTC. An attempt costs one key.</small>
      ${TRIAL_IDS.map(id=> {
        const trial=TRIALS[id],level=nextDifficulty(this.base.save,id);
        return `<button id="trial-${id}" class="trial-choice"><b>Trial ${trial.number} — ${trial.name}</b><small>${level===null?"All difficulties cleared":`Next: Difficulty ${level} · Multiplier ×${trial.multiplier(level).toFixed(1)}`}</small><span>${clearedDifficulty(this.base.save,id)} difficulties cleared</span></button>`;
      }).join("")}<button id="trial-menu-leave">Return to the forest</button>`);
    for(const id of TRIAL_IDS)el(`trial-${id}`).onclick=()=>this.openDetails(id);
    el("trial-menu-leave").onclick=()=>{if(this.active)this.leave();this.modal.close();};
  }
  private openDetails(id:TrialId) {
    const trial=TRIALS[id],level=nextDifficulty(this.base.save,id);
    this.show(`<h2 id="trial-heading">Trial ${trial.number} — ${trial.name}</h2>${this.header()}
      <p id="trial-difficulty">${level===null?"All difficulties cleared":`Difficulty ${level} · Difficulty multiplier ×${trial.multiplier(level).toFixed(1)}`}</p>
      <p id="trial-reward">${level===null?"All first-clear rewards claimed.":`First-clear reward: ${trial.rewardPoints(level)} Trial ${level===1?"Point":"Points"}. One reward per difficulty, shared across all control modes.`}</p>
      ${level===null?"":`<small>${id==="keymaster"?`Hit: ghost teleport · Both move every 2 steps · Tough mimic every ${mimicInterval(level)} turns · Four doors deal 20% max HP each.`:`${beamCount(level)} beam${beamCount(level)===1?"":"s"} every 10 turns · Slime every ${slimeSpawnInterval(level)} turns.`}</small>`}
      ${MODES.map(([mode,label,help])=>`<button id="trial-mode-${mode}" data-trial-attempt="${id}" class="trial-choice"><b>${label}</b><small>${help}</small><span></span></button>`).join("")}
      <p>Your stats carry in at full health. Trial training has its own Silver.</p><button id="trial-list-back">Back to trials</button>`);
    for(const [mode] of MODES)el(`trial-mode-${mode}`).onclick=()=>{if(this.begin(id,mode)){this.modal.close();this.openTrial();}else this.refreshAccess();};
    el("trial-list-back").onclick=()=>this.openMenu();
  }
  private refreshAccess() {
    const day=this.base.save.trialAccess.day,keys=trialKeys(this.base.save,this.base.clock());
    el("trial-key-balance").textContent=keys===Infinity?"Trial keys: Unlimited (Developer mode)":`Trial keys: ${keys} / 2`;
    this.modal.querySelectorAll<HTMLButtonElement>("[data-trial-attempt]").forEach(button=> {
      button.disabled=keys===0 || nextDifficulty(this.base.save,button.dataset.trialAttempt as TrialId)===null;
      button.querySelector("span")!.textContent=keys===Infinity?"Attempt · Free":"Attempt · 1 trial key";
    });
    if(day!==this.base.save.trialAccess.day)this.save();
  }
  private begin(id:TrialId,mode:TrialMode) {
    const level=nextDifficulty(this.base.save,id);
    if(level===null || !spendTrialKey(this.base.save,this.base.clock()))return false;
    this.base.save.provingGrounds=startTrial(this.base.run.player,mode,this.base.hand,this.base.run.seed,level,id);
    this.firedAt=0;this.award=0;this.message="Climb the staircase to enter the trial.";this.save();return true;
  }
  private openTrial() {
    if(this.base.mode!=="tower" && this.base.save.tower.run?.outside)this.base.switchMode("tower");
    this.base.auto=false;this.base.cancelRoute();this.navigation.clear();
    this.session=new TrialSession(this.base,this.base.save.provingGrounds!);
    const s=this.session.state;
    this.message=s.room==="staging"?"Click the staircase to enter the trial.":s.keymaster?(s.elemental.incorporeal?"The Keymaster is incorporeal and invincible until his next reformation.":"Strike the Keymaster for golden keys. Open the four doors to release red spirits."):s.elemental.incorporeal?"The elemental is invincible until its next lasers.":"Click a tile to move. Click the corporeal elemental to strike.";
    this.renderer=new TrialRenderer(this.canvas);this.cameraPathKey="";this.cameraPath=[];this.canvas.tabIndex=0;
    this.canvas.setAttribute("aria-label","Proving Grounds. Click a floor tile to walk to it in manual or combined mode. Click your tile or press Space to wait.");
    document.documentElement.classList.add("trial-running");document.documentElement.classList.toggle("trial-manual",s.mode==="manual");
    el("board-frame").querySelector("#trial-overlay")?.remove();
    el("board-frame").insertAdjacentHTML("beforeend",`<div id="trial-overlay"><div id="trial-vitals" aria-live="polite"></div><div class="trial-actions"><button id="trial-wait">Wait</button><button id="trial-key-use" hidden>Use keys on mimics</button><button id="trial-retry" hidden>Try again</button><button id="trial-leave">Leave trial</button></div></div>`);
    el("trial-leave").onclick=()=>this.leave();el("trial-wait").onclick=()=>this.step(0,0);
    el("trial-key-use").onclick=()=>{if(s.keymaster){s.keymaster.useKeys=!s.keymaster.useKeys;this.save();this.changed();}};
    el("trial-retry").onclick=()=>this.openDetails(this.session!.state.trialId);
    if(s.mode!=="manual" && s.playing && this.base.save.settings.speed===0)this.base.save.settings.speed=1;
    this.lastFrame=performance.now();this.nextAutoAt=this.lastFrame+450;this.save();this.changed();this.canvas.focus();
  }
  frame(now:number) {
    if(!this.session)return false;
    const s=this.session.state,g=this.session.game;
    if(!this.modal.open)this.apply(advanceKeymasterEffects(s,Math.min(100,Math.max(0,now-this.lastFrame))));
    this.lastFrame=now;
    if(!this.modal.open && s.status==="active" && now>=this.nextAutoAt && (this.navigation.target || (s.mode!=="manual" && s.playing))) {
      const manual=!!this.navigation.target,turn=advanceTrial(s,this.navigation);
      this.nextAutoAt=now+1000/Math.max(manual?4:1,g.stepsPerSecond);g.activeCard=turn.card;
      this.apply(turn.outcome);
    }
    const target=this.navigation.target;
    const pathKey=`${s.room}:${s.status}:${s.steps}:${s.player.x},${s.player.y}:${s.player.hp}:${s.player.attack}:${s.player.defense}:${s.mode}:${s.playing}:${target?.x},${target?.y}:${s.elemental.x},${s.elemental.y}:${s.elemental.incorporeal}`;
    if(pathKey!==this.cameraPathKey) {
      this.cameraPathKey=pathKey;
      this.cameraPath=target?this.navigation.path(s):s.mode!=="manual" && s.playing?trialPlan(s)?.path??[]:[];
    }
    this.renderer!.draw(s,now,this.firedAt,this.base.save.settings.reduceMotion,
      {styledSprites:usesGameSprites(this.base.save),spriteAnimations:this.base.save.settings.spriteAnimations,destination:target,
        transition:this.base.save.settings.transition,pathAhead:this.cameraPath});
    const view=this.renderer!.view(s),hero=this.renderer!.hero(s);
    Object.assign(this.canvas.dataset,{trialViewLeft:String(view.left),trialViewBottom:String(view.bottom),trialViewRoom:s.room,trialHeroX:String(hero.x),trialHeroY:String(hero.y),trialCameraMoving:String(!this.renderer!.settled)});
    return true;
  }
  toggleAuto() {
    const s=this.session?.state;if(!s || s.mode==="manual" || s.status!=="active")return;
    s.playing=!s.playing;if(s.playing && this.base.save.settings.speed===0)this.base.save.settings.speed=1;
    this.nextAutoAt=performance.now()+450;this.message=s.playing?"Your cards lead the way.":"Cards paused. Player movement is still available in combined mode.";this.save();this.changed();
  }
  changeSpeed(delta:-1|1) {
    if(!this.session || this.session.state.mode==="manual")return;
    this.session.sync();this.session.game.changeSpeed(delta);this.session.state.playing=this.session.game.auto;
    this.nextAutoAt=performance.now()+450;this.save();this.changed();
  }
  purchasesChanged(){if(this.session){this.message=this.session.game.message;this.save();this.changed();}}
  private step(dx:number,dy:number) {
    if(!this.session || this.session.state.mode==="cards")return;
    this.navigation.clear();this.session.game.activeCard=null;
    this.nextAutoAt=performance.now()+250;this.apply(trialStep(this.session.state,dx,dy));
  }
  private apply(outcome:ReturnType<typeof trialStep>) {
    if(!outcome.changed){if(outcome.message){this.message=outcome.message;this.changed();}return;}
    if(outcome.message)this.message=outcome.message;if(outcome.fired)this.firedAt=performance.now();
    this.check();this.save();this.changed();
  }
  decorate() {
    if(!this.session)return;
    const s=this.session.state,g=this.session.game,manual=s.mode==="manual",trial=TRIALS[s.trialId];
    const next=nextDifficulty(this.base.save,s.trialId);
    g.message=s.status==="won"?`Difficulty ${s.level} cleared! ${this.award?`+${this.award} Trial ${this.award===1?"Point":"Points"}.`:"First-clear reward already claimed."}`:s.status==="lost"?"Trial failed. Try again or return to the forest.":this.message;
    el("message").textContent=g.message;el("inspect").textContent="";
    el("height-label").textContent="TRIAL";el("height").textContent=String(trial.number);el("height-tier").textContent=`×${trial.multiplier(s.level).toFixed(1)}`;el("height-tier").hidden=false;
    for(const id of ["section-pick","enter-run","stuck-end-run","run-earned","best-reward","gold-bonus","gold-bonus-divider"])el(id).hidden=true;
    el("end-run").textContent="Leave trial";(el("base-enemy") as HTMLButtonElement).disabled=true;el("base-enemy").title=trial.name;
    (el("auto") as HTMLButtonElement).disabled=manual || s.status!=="active";
    if(manual){el("auto-state").textContent="MANUAL";el("auto").setAttribute("aria-label","Manual movement — cards disabled");}
    (el("speed-down") as HTMLButtonElement).disabled ||= manual;(el("speed-up") as HTMLButtonElement).disabled ||= manual;
    const names=["N","NE","E","SE","S","SW","W","NW"],direction=beamHeadings(nextBeamAxis(s),beamCount(s.level)).map(i=>names[i]).join("/");
    el("trial-vitals").textContent=s.keymaster && s.room==="arena"?`Difficulty ${s.level} · ×${trial.multiplier(s.level).toFixed(1)} · Keymaster ${Math.ceil(s.bossHp)}/${Math.ceil(s.bossMaxHp)} · Golden keys ${s.keymaster.keys} · Doors ${s.keymaster.doors.length}/4 · Mimics ${s.keymaster.mimics.length} · ${s.elemental.incorporeal?`Incorporeal · Reforms in ${KEYMASTER_REFORM_INTERVAL-s.steps%KEYMASTER_REFORM_INTERVAL}`:"Corporeal"}`:s.room==="staging"?`Trial ${trial.number} · Difficulty ${s.level} · ×${trial.multiplier(s.level).toFixed(1)} · Staging room`:`Difficulty ${s.level} · ×${trial.multiplier(s.level).toFixed(1)} · Elemental ${Math.ceil(s.bossHp)}/${Math.ceil(s.bossMaxHp)} · ${s.elemental.incorporeal?"Incorporeal · invincible":"Corporeal"} · Beam ${direction} in ${BEAM_INTERVAL-s.steps%BEAM_INTERVAL}`;
    const keyUse=el("trial-key-use") as HTMLButtonElement;keyUse.hidden=!s.keymaster || s.status!=="active";
    if(s.keymaster){keyUse.textContent=s.keymaster.useKeys?"Mimics: use keys":"Mimics: save keys";keyUse.setAttribute("aria-pressed",String(s.keymaster.useKeys));keyUse.title="Use one golden key to defeat a mimic for free, or save keys for doors and fight mimics normally.";}
    const retry=el("trial-retry") as HTMLButtonElement;retry.hidden=s.status==="active";retry.disabled=s.status==="won" && next===null;retry.textContent=s.status==="won"?(next===null?"All difficulties cleared":"Next difficulty"):"Try again";
    (el("trial-wait") as HTMLButtonElement).hidden=s.mode==="cards" || s.status!=="active";
    const utility=document.querySelector<HTMLButtonElement>('[data-run-group="utility"]');if(utility)utility.title="Utility training does not apply to this boss trial.";
    el("hand").classList.remove("can-focus");el("hand").querySelectorAll<HTMLElement>(".hand-card").forEach(card=> {
      card.setAttribute("aria-disabled",String(manual));card.title=`${CARDS[card.dataset.card as keyof typeof CARDS].name}${manual?" — disabled in manual trials":" — trial card"}`;
      if(manual)card.classList.remove("active","focused");
    });
    Object.assign(this.canvas.dataset,{trialMode:s.mode,trialLevel:String(s.level),trialRoom:s.room,trialSteps:String(s.steps),trialPhase:s.elemental.incorporeal?"incorporeal":"corporeal"});
  }
  leave(){if(!this.active)return;delete this.base.save.provingGrounds;this.detach();this.save();this.changed();}
  private detach() {
    this.session=null;this.renderer=null;this.navigation.clear();document.documentElement.classList.remove("trial-running","trial-manual");el("trial-overlay")?.remove();
    for(const key of ["trialMode","trialLevel","trialRoom","trialSteps","trialPhase","trialViewLeft","trialViewBottom","trialViewRoom","trialHeroX","trialHeroY","trialCameraMoving"])delete this.canvas.dataset[key];
    this.canvas.setAttribute("aria-label",this.originalLabel);this.canvas.tabIndex=this.originalTabIndex;el("hand").querySelectorAll("[aria-disabled]").forEach(c=>c.removeAttribute("aria-disabled"));
    (el("base-enemy") as HTMLButtonElement).disabled=false;setEndRunLabel(this.base);delete el("board").dataset.heading;
  }
}
