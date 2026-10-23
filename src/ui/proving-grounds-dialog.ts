import type { Game } from "../state.ts";
import { BEAM_INTERVAL, nextBeamAxis, startTrial, trialStep } from "../proving-grounds/trial.ts";
import { TrialRenderer } from "../proving-grounds/render.ts";

/** Owns a separate trial modal; the ordinary board and run never get swapped. */
export class ProvingGroundsDialog {
  private showing = false;
  private menu = false;
  private frame = 0;
  private firedAt = 0;
  private message = "Climb the staircase to enter the trial.";
  private renderer: TrialRenderer | null = null;
  constructor(private game: Game, private modal: HTMLDialogElement, private save: () => void) {
    window.addEventListener("keydown", e => {
      if (!this.showing || this.menu || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
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
    this.modal.innerHTML=`<h2 id="trial-heading">Proving Grounds Trials</h2><p>Step beyond the Tower and face a trial of movement and timing.</p>
      <button id="trial-light-elemental" class="trial-choice"><b>Trial I — Light Elemental</b><small>A dark hexagonal chamber. Opposing beams rotate 45° every ten turns.</small></button>
      <p>Your current HP capacity, ATK and DEF carry into a separate attempt at full health. Your Tower run and supplies stay safe.</p>
      <button id="trial-leave">Return to the forest</button>`;
    this.modal.setAttribute("aria-labelledby","trial-heading"); this.modal.showModal();
    this.modal.querySelector<HTMLButtonElement>("#trial-light-elemental")!.onclick=()=> {
      this.game.save.provingGrounds=startTrial(this.game.run.player); this.save(); this.openTrial();
    };
    this.modal.querySelector<HTMLButtonElement>("#trial-leave")!.onclick=()=>this.leave();
  }
  private openTrial() {
    this.showing=true; this.menu=false;
    this.game.auto=false; this.game.cancelRoute();
    this.modal.classList.add("proving-grounds-dialog");
    this.modal.innerHTML=`<h2 id="trial-heading">Trial I — Light Elemental</h2><div id="trial-vitals" aria-live="polite"></div>
      <canvas id="trial-board" width="408" height="408" tabindex="0" aria-label="Proving Grounds. Move with arrow keys or WASD, or use the direction buttons. Space waits. Walking into the elemental strikes it."></canvas>
      <p id="trial-status" role="status"></p>
      <div class="trial-controls"><button data-trial-move="0,1" aria-label="Move north">▲</button><div>
      <button data-trial-move="-1,0" aria-label="Move west">◀</button><button data-trial-move="0,0" aria-label="Wait one turn">Wait</button><button data-trial-move="1,0" aria-label="Move east">▶</button></div>
      <button data-trial-move="0,-1" aria-label="Move south">▼</button></div>
      <small>Arrows / WASD: move · Space: wait · Walk into the boss: strike. Walls cost no turns.</small>
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
      this.game.save.provingGrounds=startTrial(this.game.run.player); this.firedAt=0; this.message="Climb the staircase to enter the trial."; this.save(); this.refresh(); canvas.focus();
    };
    this.message=this.game.save.provingGrounds?.room==="arena"?"Dodge the beams and strike the elemental. Potions line the walls.":"Climb the staircase to enter the trial.";
    this.refresh(); cancelAnimationFrame(this.frame);
    const draw=(now:number)=> {
      if(!this.showing || this.menu)return;
      const state=this.game.save.provingGrounds;
      if(state) this.renderer!.draw(state,now,this.firedAt,this.game.save.settings.reduceMotion,this.game.save.settings.spritesOff);
      this.frame=requestAnimationFrame(draw);
    };
    this.frame=requestAnimationFrame(draw);
  }
  private step(dx:number,dy:number) {
    const s=this.game.save.provingGrounds;
    if(!s)return;
    const outcome=trialStep(s,dx,dy);
    if(!outcome.changed)return;
    if(outcome.message)this.message=outcome.message;
    if(outcome.fired)this.firedAt=performance.now();
    this.save(); this.refresh();
  }
  private refresh() {
    const s=this.game.save.provingGrounds!;
    const direction=["north–south","northeast–southwest","east–west","southeast–northwest"][nextBeamAxis(s)];
    const vitals=this.modal.querySelector<HTMLElement>("#trial-vitals")!;
    vitals.textContent=`HP ${Math.ceil(s.player.hp)} / ${Math.ceil(s.player.maxHp)} · ${s.room==="staging"?"Staging room":`Elemental ${Math.ceil(s.bossHp)} / ${Math.ceil(s.bossMaxHp)} · Beam ${direction} in ${BEAM_INTERVAL-s.steps%BEAM_INTERVAL} turns`}`;
    this.modal.querySelector<HTMLElement>("#trial-status")!.textContent=s.status==="won"?"Trial complete — Light Elemental defeated!":s.status==="lost"?"Trial failed. Retry, or return safely to the forest.":this.message;
    this.modal.querySelectorAll<HTMLButtonElement>("[data-trial-move]").forEach(b=>b.disabled=s.status!=="active");
    this.modal.querySelector<HTMLButtonElement>("#trial-retry")!.hidden=s.status==="active";
    // Keep the controls' accessible description in step with the countdown.
    this.modal.querySelector<HTMLCanvasElement>("#trial-board")!.dataset.room=s.room;
    this.modal.querySelector<HTMLCanvasElement>("#trial-board")!.dataset.steps=String(s.steps);
  }
  private leave() {
    delete this.game.save.provingGrounds;
    this.save(); this.modal.close();
  }
}
