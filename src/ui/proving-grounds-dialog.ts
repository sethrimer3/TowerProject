import type { Game } from "../state.ts";
import { BEAM_INTERVAL, nextBeamAxis, startTrial, trialStep, type TrialMode } from "../proving-grounds/trial.ts";
import { autoplayTrial, trialPlan } from "../proving-grounds/autoplay.ts";
import type {TrainingId} from "../config.ts";
import { TrialSession, TRIAL_TRAINING } from "../proving-grounds/session.ts";
import { TrialRenderer } from "../proving-grounds/render.ts";
import { CARDS } from "../cards.ts";
import { el } from "./dom.ts";

/** The entrance menu is a dialog; the encounter owns the ordinary game board,
 * HUD and hand instead of creating a second game screen inside a popup. */
export class ProvingGroundsDialog {
  private session: TrialSession | null=null;
  private renderer: TrialRenderer | null=null;
  private nextAutoAt=0;
  private firedAt=0;
  private message="Climb the staircase to enter the trial.";
  private canvas=el("world") as HTMLCanvasElement;
  private originalTabIndex=this.canvas.tabIndex;
  private originalLabel=this.canvas.getAttribute("aria-label")!;
  constructor(private base: Game, private modal: HTMLDialogElement, private save: () => void, private changed: () => void = () => {}, private visible: () => boolean = () => true) {
    window.addEventListener("keydown",e=> {
      if(!this.active || !this.visible() || this.modal.open || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName))return;
      if(e.key==="Escape") {e.preventDefault();e.stopImmediatePropagation();this.leave();return;}
      if(e.key===" " && (e.target as HTMLElement).closest("button"))return;
      const dirs: Record<string,[number,number]>={ArrowUp:[0,1],w:[0,1],ArrowDown:[0,-1],s:[0,-1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]," ":[0,0],".":[0,0]};
      const move=dirs[e.key];
      if(move) {e.preventDefault();e.stopImmediatePropagation();this.step(...move);}
    },true);
    let down:{x:number;y:number;id:number}|null=null;
    this.canvas.addEventListener("pointerdown",e=> {
      if(!this.active || this.modal.open)return;
      e.preventDefault();e.stopImmediatePropagation();down={x:e.clientX,y:e.clientY,id:e.pointerId};this.canvas.setPointerCapture(e.pointerId);
    },true);
    this.canvas.addEventListener("pointermove",e=> {if(this.active)e.stopImmediatePropagation();},true);
    this.canvas.addEventListener("pointercancel",()=>{down=null;},true);
    this.canvas.addEventListener("pointerup",e=> {
      if(!this.active)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(!down || down.id!==e.pointerId)return;
      const dx=e.clientX-down.x,dy=e.clientY-down.y;down=null;
      if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
      if(Math.max(Math.abs(dx),Math.abs(dy))>=15)this.step(Math.abs(dx)>Math.abs(dy)?Math.sign(dx):0,Math.abs(dy)>=Math.abs(dx)?-Math.sign(dy):0);
      else {
        const r=this.canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=.5-(e.clientY-r.top)/r.height;
        if(Math.max(Math.abs(x),Math.abs(y))<.03)this.step(0,0);
        else this.step(Math.abs(x)>Math.abs(y)?Math.sign(x):0,Math.abs(y)>=Math.abs(x)?Math.sign(y):0);
      }
    },true);
    modal.addEventListener("close",()=> {this.modal.classList.remove("proving-grounds-dialog");if(this.modal.getAttribute("aria-labelledby")==="trial-heading")this.modal.removeAttribute("aria-labelledby");});
  }
  get active() { return !!this.session; }
  get viewGame() { this.session?.sync();return this.session?.game; }
  allowsTraining(id: TrainingId) {return TRIAL_TRAINING.has(id);}
  get displayHand() { return this.session?.state.displayHand; }
  check() {
    if(this.session && this.session.state!==this.base.save.provingGrounds)this.detach();
    if(this.active || this.modal.open)return;
    if(this.base.provingGroundsRequested) {this.base.provingGroundsRequested=false;this.openMenu();}
    else if(this.base.save.provingGrounds)this.openTrial();
  }
  private openMenu() {
    this.base.auto=false;this.base.cancelRoute();
    this.modal.classList.add("proving-grounds-dialog");
    this.modal.innerHTML=`<h2 id="trial-heading">Proving Grounds Trials</h2><p>A 25×25 dark hexagonal chamber. Rotating beams every ten steps; jumping light slimes every three.</p>
      <button id="trial-light-elemental-cards" class="trial-choice"><b>Trial I — Light Elemental · With cards</b><small>Your equipped hand controls movement automatically. No manual movement.</small></button>
      <button id="trial-light-elemental" class="trial-choice"><b>Trial II — Light Elemental · No cards</b><small>Control every move yourself. Your cards are crossed out and disabled.</small></button>
      <p>Your stats carry into a separate attempt at full health. Trial training uses its own Silver; your Tower run stays safe.</p><button id="trial-menu-leave">Return to the forest</button>`;
    this.modal.setAttribute("aria-labelledby","trial-heading");
    this.modal.showModal();
    for(const [id,mode] of [["trial-light-elemental-cards","cards"],["trial-light-elemental","manual"]] as const) {
      el(id).onclick=()=> {this.begin(mode);this.modal.close();this.openTrial();};
    }
    el("trial-menu-leave").onclick=()=>this.modal.close();
  }
  private begin(mode: TrialMode) {
    this.base.save.provingGrounds=startTrial(this.base.run.player,mode,this.base.hand,this.base.run.seed);
    this.firedAt=0;this.message="Climb the staircase to enter the trial.";
  }
  private openTrial() {
    // An older paused Delve must not steal the Tower trial on reload.
    if(this.base.mode!=="tower" && this.base.save.tower.run?.outside)this.base.switchMode("tower");
    this.base.auto=false;this.base.cancelRoute();
    this.session=new TrialSession(this.base,this.base.save.provingGrounds!);
    const state=this.session.state;
    this.message=state.room==="staging"?"Climb the staircase to enter the trial.":state.elemental.incorporeal?"The elemental is invincible until its next lasers.":"Dodge beams. Walk into the corporeal elemental to strike.";
    this.renderer=new TrialRenderer(this.canvas);
    this.canvas.tabIndex=0;
    this.canvas.setAttribute("aria-label","Proving Grounds trial. Arrows, WASD, tap or swipe to move in manual mode. Space waits.");
    document.documentElement.classList.add("trial-running");
    document.documentElement.classList.toggle("trial-manual",this.session.state.mode==="manual");
    el("board-frame").querySelector("#trial-overlay")?.remove();
    el("board-frame").insertAdjacentHTML("beforeend",`<div id="trial-overlay"><div id="trial-vitals" aria-live="polite"></div>
      <div class="trial-actions"><button id="trial-retry" hidden>Retry trial</button><button id="trial-leave">Leave trial</button></div>
      <div class="trial-controls"><button data-trial-move="-1,0" aria-label="Move west">◀</button><button data-trial-move="0,1" aria-label="Move north">▲</button><button data-trial-move="0,0" aria-label="Wait one turn">Wait</button><button data-trial-move="0,-1" aria-label="Move south">▼</button><button data-trial-move="1,0" aria-label="Move east">▶</button></div></div>`);
    el("trial-leave").onclick=()=>this.leave();
    el("trial-retry").onclick=()=> {const mode=this.session!.state.mode;this.begin(mode);this.openTrial();};
    document.querySelectorAll<HTMLButtonElement>("[data-trial-move]").forEach(b=>b.onclick=()=> {const [dx,dy]=b.dataset.trialMove!.split(",").map(Number);this.step(dx,dy);});
    if(this.session.state.mode==="cards" && this.session.state.playing && this.base.save.settings.speed===0)this.base.save.settings.speed=1;
    this.nextAutoAt=performance.now()+450;
    this.save();this.changed();this.canvas.focus();
  }
  /** The main frame loop calls this in place of ordinary board/route turns. */
  frame(now:number) {
    if(!this.session)return false;
    const s=this.session.state,g=this.session.game;
    if(!this.modal.open && s.mode==="cards" && s.playing && s.status==="active" && now>=this.nextAutoAt) {
      this.nextAutoAt=now+1000/Math.max(1,g.stepsPerSecond);
      g.activeCard=trialPlan(s)?.card??null;
      this.apply(autoplayTrial(s));
    }
    this.renderer!.draw(s,now,this.firedAt,this.base.save.settings.reduceMotion,this.base.save.settings.spritesOff);
    return true;
  }
  toggleAuto() {
    const s=this.session?.state;
    if(!s || s.mode!=="cards" || s.status!=="active")return;
    s.playing=!s.playing;
    if(s.playing && this.base.save.settings.speed===0)this.base.save.settings.speed=1;
    this.nextAutoAt=performance.now()+450;
    this.message=s.playing?"Your cards lead the way.":"Autoplay paused.";this.save();this.changed();
  }
  changeSpeed(delta: -1 | 1) {
    if(!this.session || this.session.state.mode!=="cards")return;
    this.session.sync();this.session.game.changeSpeed(delta);this.session.state.playing=this.session.game.auto;
    this.nextAutoAt=performance.now()+450;this.save();this.changed();
  }
  purchasesChanged() {if(this.session){this.message=this.session.game.message;this.save();this.changed();}}
  private step(dx:number,dy:number) {
    if(this.session?.state.mode==="manual")this.apply(trialStep(this.session.state,dx,dy));
  }
  private apply(outcome: ReturnType<typeof trialStep>) {
    if(!outcome.changed)return;
    if(outcome.message)this.message=outcome.message;
    if(outcome.fired)this.firedAt=performance.now();
    this.save();this.changed();
  }
  /** Keep the shared HUD in its in-run presentation after its ordinary refresh. */
  decorate() {
    if(!this.session)return;
    const s=this.session.state,g=this.session.game,manual=s.mode==="manual";
    g.message=s.status==="won"?"Trial complete — Light Elemental defeated!":s.status==="lost"?"Trial failed. Retry, or return safely to the forest.":this.message;
    el("message").textContent=g.message;
    el("inspect").textContent="";
    el("height-label").textContent="TRIAL";el("height").textContent=manual?"II":"I";
    el("height-tier").textContent="PROVING";
    el("height-tier").hidden=false;
    for(const id of ["section-pick","enter-run","stuck-end-run","run-earned","best-reward","gold-bonus","gold-bonus-divider"])el(id).hidden=true;
    el("end-run").textContent="Leave trial";
    (el("base-enemy") as HTMLButtonElement).disabled=true;
    el("base-enemy").title="Light Elemental";
    (el("auto") as HTMLButtonElement).disabled=manual || s.status!=="active";
    if(manual) {el("auto-state").textContent="MANUAL";el("auto").setAttribute("aria-label","Manual movement — cards disabled");}
    (el("speed-down") as HTMLButtonElement).disabled ||= manual;
    (el("speed-up") as HTMLButtonElement).disabled ||= manual;
    const direction=["N–S","NE–SW","E–W","SE–NW"][nextBeamAxis(s)];
    el("trial-vitals").textContent=s.room==="staging"?"Light Elemental · Staging room":`Elemental ${Math.ceil(s.bossHp)}/${Math.ceil(s.bossMaxHp)} · ${s.elemental.incorporeal?"Incorporeal · invincible":"Corporeal"} · Beam ${direction} in ${BEAM_INTERVAL-s.steps%BEAM_INTERVAL}`;
    (el("trial-retry") as HTMLButtonElement).hidden=s.status==="active";
    const controls=document.querySelector<HTMLElement>("#trial-overlay .trial-controls")!;controls.hidden=!manual;
    controls.querySelectorAll<HTMLButtonElement>("button").forEach(b=>b.disabled=s.status!=="active");
    const utility=document.querySelector<HTMLButtonElement>('[data-run-group="utility"]');
    if(utility)utility.title="Utility training does not apply to this boss trial.";
    el("hand").classList.remove("can-focus");
    el("hand").querySelectorAll<HTMLElement>(".hand-card").forEach(card=> {
      card.setAttribute("aria-disabled",String(manual));
      card.title=`${CARDS[card.dataset.card as keyof typeof CARDS].name}${manual?" — disabled in manual trials":" — trial card"}`;
      if(manual)card.classList.remove("active","focused");
    });
    Object.assign(this.canvas.dataset,{trialMode:s.mode,trialRoom:s.room,trialSteps:String(s.steps),trialPhase:s.elemental.incorporeal?"incorporeal":"corporeal"});
  }
  leave() {
    if(!this.active)return;
    delete this.base.save.provingGrounds;this.detach();this.save();this.changed();
  }
  private detach() {
    this.session=null;this.renderer=null;
    document.documentElement.classList.remove("trial-running","trial-manual");
    el("trial-overlay")?.remove();
    for(const key of ["trialMode","trialRoom","trialSteps","trialPhase"])delete this.canvas.dataset[key];
    this.canvas.setAttribute("aria-label",this.originalLabel);this.canvas.tabIndex=this.originalTabIndex;
    el("hand").querySelectorAll("[aria-disabled]").forEach(c=>c.removeAttribute("aria-disabled"));
    (el("base-enemy") as HTMLButtonElement).disabled=false;el("end-run").textContent="End Run";
    delete el("board").dataset.heading;
  }
}
