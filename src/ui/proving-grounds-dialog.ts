import type { Game } from "../state.ts";
import { BEAM_INTERVAL, nextBeamAxis, startTrial, trialStep, type TrialMode } from "../proving-grounds/trial.ts";
import { autoplayTrial } from "../proving-grounds/autoplay.ts";
import { CARDS } from "../cards.ts";
import { cardArt } from "./dom.ts";
import { TrialRenderer } from "../proving-grounds/render.ts";

/** Owns a separate trial modal; the ordinary board and run never get swapped. */
export class ProvingGroundsDialog {
  private showing = false;
  private menu = false;
  private frame = 0;
  private firedAt = 0;
  private nextAutoAt = 0;
  private message = "Climb the staircase to enter the trial.";
  private renderer: TrialRenderer | null = null;
  constructor(private game: Game, private modal: HTMLDialogElement, private save: () => void) {
    window.addEventListener("keydown", e => {
      if (!this.showing || this.menu || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
      if(e.key===" " && (e.target as HTMLElement).closest("button"))return;
      const dirs: Record<string, [number,number]> = { ArrowUp:[0,1],w:[0,1],ArrowDown:[0,-1],s:[0,-1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]," ":[0,0],".":[0,0] };
      const dir=dirs[e.key];
      if(dir) { e.preventDefault(); this.step(...dir); }
    });
    modal.addEventListener("cancel", e => { if(this.showing) { e.preventDefault(); this.leave(); } });
    modal.addEventListener("close", () => {
      if(this.showing) { this.showing=false; this.menu=false; cancelAnimationFrame(this.frame); this.modal.classList.remove("proving-grounds-dialog"); this.modal.removeAttribute("aria-labelledby"); this.renderer=null; }
    });
  }
  check() {
    if(this.showing || this.modal.open) return;
    if(this.game.provingGroundsRequested) {
      this.game.provingGroundsRequested=false;
      this.openMenu();
    } else if(this.game.save.provingGrounds) this.openTrial();
  }
  private openMenu() {
    this.showing=true; this.menu=true;
    this.game.auto=false; this.game.cancelRoute();
    this.modal.classList.add("proving-grounds-dialog");
    this.modal.innerHTML=`<h2 id="trial-heading">Proving Grounds Trials</h2><p>A 25×25 dark hexagonal chamber. Rotating beams every ten steps; jumping light slimes every three.</p>
      <button id="trial-light-elemental-cards" class="trial-choice"><b>Trial I — Light Elemental · With cards</b><small>Your equipped hand controls movement automatically, in priority order. No manual movement.</small></button>
      <button id="trial-light-elemental" class="trial-choice"><b>Trial II — Light Elemental · No cards</b><small>Control every move yourself. No cards or autoplay.</small></button>
      <p>Your current HP capacity, ATK and DEF carry into a separate attempt at full health. Your Tower run and supplies stay safe.</p>
      <button id="trial-leave">Return to the forest</button>`;
    this.modal.setAttribute("aria-labelledby","trial-heading"); this.modal.showModal();
    for (const [id,mode] of [["trial-light-elemental-cards","cards"],["trial-light-elemental","manual"]] as const) {
      this.modal.querySelector<HTMLButtonElement>(`#${id}`)!.onclick=()=> {
        this.begin(mode); this.openTrial();
      };
    }
    this.modal.querySelector<HTMLButtonElement>("#trial-leave")!.onclick=()=>this.leave();
  }
  private begin(mode: TrialMode) {
    this.game.save.provingGrounds=startTrial(this.game.run.player,mode,this.game.hand,this.game.run.seed);
    this.firedAt=0; this.nextAutoAt=performance.now()+450;
    this.message="Climb the staircase to enter the trial."; this.save();
  }
  private openTrial() {
    this.showing=true; this.menu=false;
    this.game.auto=false; this.game.cancelRoute();
    this.modal.classList.add("proving-grounds-dialog");
    const state=this.game.save.provingGrounds!, cards=state.mode==="cards";
    this.nextAutoAt=performance.now()+450;
    const help=cards ? "Your equipped hand moves automatically. Pause or resume below; movement controls are unavailable." : "Arrows / WASD: move · Space: wait · Walk into an enemy: strike. Walls cost no turns.";
    this.modal.innerHTML=`<h2 id="trial-heading">${cards?"Trial I — Light Elemental · With cards":"Trial II — Light Elemental · No cards"}</h2><div id="trial-vitals" aria-live="polite"></div>
      <canvas id="trial-board" width="408" height="408" tabindex="0" aria-label="${help}"></canvas>
      <p id="trial-status" role="status"></p>
      ${cards?`<ol id="trial-hand" aria-label="Equipped cards in priority order">${state.hand.map(id=>`<li title="${CARDS[id].name}">${cardArt(id,CARDS[id].name)}<span>${CARDS[id].name}</span></li>`).join("")}</ol><button id="trial-play"></button>`:`<div class="trial-controls"><button data-trial-move="0,1" aria-label="Move north">▲</button><div>
      <button data-trial-move="-1,0" aria-label="Move west">◀</button><button data-trial-move="0,0" aria-label="Wait one turn">Wait</button><button data-trial-move="1,0" aria-label="Move east">▶</button></div>
      <button data-trial-move="0,-1" aria-label="Move south">▼</button></div>`}
      <small>${help}</small>
      <div class="dialog-actions"><button id="trial-retry" hidden>Retry trial</button><button id="trial-leave">Leave trial</button></div>`;
    this.modal.setAttribute("aria-labelledby","trial-heading");
    if(!this.modal.open) this.modal.showModal();
    const canvas=this.modal.querySelector<HTMLCanvasElement>("#trial-board")!;
    this.renderer=new TrialRenderer(canvas);
    canvas.focus();
    this.modal.querySelectorAll<HTMLButtonElement>("[data-trial-move]").forEach(button=> {
      button.onclick=()=> { const [dx,dy]=button.dataset.trialMove!.split(",").map(Number); this.step(dx,dy); };
    });
    // A tap chooses a cardinal step toward the tapped tile; a swipe is one step.
    let down: {x:number;y:number;id:number} | null=null;
    canvas.onpointerdown=e=> { down={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);e.preventDefault(); };
    canvas.onpointercancel=()=> { down=null; };
    canvas.onpointerup=e=> {
      if(!down || down.id!==e.pointerId)return;
      const dx=e.clientX-down.x,dy=e.clientY-down.y;down=null;
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(Math.max(Math.abs(dx),Math.abs(dy))>=15) this.step(Math.abs(dx)>Math.abs(dy)?Math.sign(dx):0,Math.abs(dy)>=Math.abs(dx)?-Math.sign(dy):0);
      else {
        const r=canvas.getBoundingClientRect(), x=(e.clientX-r.left)/r.width-.5, y=.5-(e.clientY-r.top)/r.height;
        if(Math.max(Math.abs(x),Math.abs(y))<.03)this.step(0,0);
        else this.step(Math.abs(x)>Math.abs(y)?Math.sign(x):0,Math.abs(y)>=Math.abs(x)?Math.sign(y):0);
      }
    };
    this.modal.querySelector<HTMLButtonElement>("#trial-leave")!.onclick=()=>this.leave();
    this.modal.querySelector<HTMLButtonElement>("#trial-retry")!.onclick=()=> {
      this.begin(this.game.save.provingGrounds!.mode); this.openTrial();
    };
    const play=this.modal.querySelector<HTMLButtonElement>("#trial-play");
    if(play) play.onclick=()=> {
      const s=this.game.save.provingGrounds!; s.playing=!s.playing;
      this.nextAutoAt=performance.now()+450;
      this.message=s.playing?"Your cards lead the way.":"Autoplay paused."; this.save(); this.refresh();
    };
    this.message=this.game.save.provingGrounds?.room==="arena"?"Dodge the beams and strike the elemental. Potions line the walls.":"Climb the staircase to enter the trial.";
    this.refresh(); cancelAnimationFrame(this.frame);
    const draw=(now:number)=> {
      if(!this.showing || this.menu)return;
      const state=this.game.save.provingGrounds;
      if(state?.mode==="cards" && state.playing && state.status==="active" && !document.hidden && now>=this.nextAutoAt) {
        this.nextAutoAt=now+450;
        this.apply(autoplayTrial(state));
      }
      if(state) this.renderer!.draw(state,now,this.firedAt,this.game.save.settings.reduceMotion,this.game.save.settings.spritesOff);
      this.frame=requestAnimationFrame(draw);
    };
    this.frame=requestAnimationFrame(draw);
  }
  private step(dx:number,dy:number) {
    const s=this.game.save.provingGrounds;
    if(!s || s.mode!=="manual")return;
    this.apply(trialStep(s,dx,dy));
  }
  private apply(outcome: ReturnType<typeof trialStep>) {
    if(!outcome.changed)return;
    if(outcome.message)this.message=outcome.message;
    if(outcome.fired)this.firedAt=performance.now();
    this.save(); this.refresh();
  }
  private refresh() {
    const s=this.game.save.provingGrounds!;
    const direction=["north–south","northeast–southwest","east–west","southeast–northwest"][nextBeamAxis(s)];
    const vitals=this.modal.querySelector<HTMLElement>("#trial-vitals")!;
    vitals.textContent=`HP ${Math.ceil(s.player.hp)} / ${Math.ceil(s.player.maxHp)} · ${s.room==="staging"?"Staging room":`Elemental ${Math.ceil(s.bossHp)} / ${Math.ceil(s.bossMaxHp)} · Slimes ${s.slimes.length} · Beam ${direction} in ${BEAM_INTERVAL-s.steps%BEAM_INTERVAL} turns`}`;
    this.modal.querySelector<HTMLElement>("#trial-status")!.textContent=s.status==="won"?"Trial complete — Light Elemental defeated!":s.status==="lost"?"Trial failed. Retry, or return safely to the forest.":this.message;
    this.modal.querySelectorAll<HTMLButtonElement>("[data-trial-move]").forEach(b=>b.disabled=s.status!=="active");
    this.modal.querySelector<HTMLButtonElement>("#trial-retry")!.hidden=s.status==="active";
    const play=this.modal.querySelector<HTMLButtonElement>("#trial-play");
    if(play) { play.textContent=s.playing?"Pause autoplay":"Resume autoplay"; play.disabled=s.status!=="active"; }
    this.modal.querySelector<HTMLCanvasElement>("#trial-board")!.dataset.mode=s.mode;
    // Keep the controls' accessible description in step with the countdown.
    this.modal.querySelector<HTMLCanvasElement>("#trial-board")!.dataset.room=s.room;
    this.modal.querySelector<HTMLCanvasElement>("#trial-board")!.dataset.steps=String(s.steps);
  }
  private leave() {
    delete this.game.save.provingGrounds;
    this.save(); this.modal.close();
  }
}
