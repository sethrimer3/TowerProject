import { controlIcon } from "./control-icon.ts";
import { askForGems, helpButton, showHelp } from "./dialogs.ts";
import { play } from "../sound.ts";
import { permanentBoost, trainingRate } from "../shop/entitlements.ts";
import { TRAINING, TRAINING_GROUPS, TRAINING_PER_LEVEL, trainingCap, trainingDef, type TrainingId } from "../progression/training.ts";
import { trainingBulk, trainingPoints, trainingRowsFull, trainingStep, trainingText, trainingOpen } from "../progression/loadout.ts";
import { whole } from "../whole.ts";
import type { BuyQuantity } from "../progression/buy-quantity.ts";
import { bindBuyQuantity, buyQuantityHtml, maxCount } from "./buy-quantity-select.ts";
import { TrainingParticles } from "../render/effects/training-particles.ts";
import { BOOST_CLAIM_MARGIN_MS, BOOST_MAX_MS, BOOST_RATE, boostLeft, claimBoost, nextTrainerGems, ranksInTraining, trainingJob, trainingSlots, workLeft, type TrainingJob } from "../progression/training-jobs.ts";
import type { AppContext } from "./app.ts";
import { adIcon, clamp, clockIcon, el, gemCount, gemIcon, goldIcon, pointsIcon, POINTER_SVG, redoIcon, riseFrom, uiSprite } from "./dom.ts";
import { TRAINING_RESET_GEMS } from "../economy/gems.ts";
import { ArchivesPanel, COUNTDOWN_MIN_MS, formatCountdown, formatDuration, rushEfficiencyHtml, toNextSecond } from "./archives-page.ts";
import { priceAmount } from "./hud.ts";

type TrainingRow = (typeof TRAINING)[number];
type ResearchTab = "training" | "archives";

/** The real ms until `job`'s timer next shows another second at `now`:
 * training goes `rate` times as fast, and the boost's ×2 besides until
 * `boostUntil`. */
export function nextTrainingCountdownIn(job: TrainingJob, boostUntil: number, now: number, rate: number) {
  const speed = rate * (now < boostUntil ? BOOST_RATE : 1);
  return toNextSecond(workLeft(job.completesAt, boostUntil, now, rate)) / speed;
}

/** The Research page: what grows with time, a tab each. Training (open
 * from the start) and, once that skill is owned, the Archives. Inside a run
 * it opens from the HUD's Research button, with the run paused behind it
 * (`Game.pauseForPage`), and Back returns to the board; ranks bought here
 * reach the run's hero at once. */
export class ResearchPage {
  private tab: ResearchTab = "training";
  private trainingParticles = new TrainingParticles();
  private archives: ArchivesPanel;
  /** The frame time the tab's countdowns next move on: at once after a
   * redraw, which may show others. */
  private nextCountdown = 0;

  constructor(private ctx: AppContext) {
    this.archives = new ArchivesPanel(ctx, () => this.render());
  }

  render() {
    if (!this.archivesOpen) this.tab = "training";
    this.nextCountdown = 0;
    const back = this.ctx.game.run.outside ? "" : `<button class="back" id="research-back">${controlIcon("back")} Back</button>`;
    const head = `${back}${this.tabsHtml()}${this.lessonHtml()}`;
    if (this.tab === "archives") this.renderArchives(head);
    else this.renderTraining(head);
    el("research-back")?.addEventListener("click", () => this.ctx.navigate(this.ctx.game.mode));
    el("archives-lesson")?.addEventListener("click", () => {
      if (!this.ctx.game.finishArchivesLesson()) return;
      this.ctx.update();
      this.render();
    });
  }

  /** The Archives lesson's note (`Game.archivesLesson`), under the tabs:
   * pressing it dismisses it and ends the lesson. */
  private lessonHtml() {
    if (!this.ctx.game.archivesLesson || !this.archivesOpen) return "";
    return `<button type="button" class="tree-lesson research-lesson" id="archives-lesson"><b>Press the Archives tab.</b>`
      + `<p>Pay the archivist Gold to research permanent upgrades. Gems rush research and hire additional archivists to do more research at once.</p><small>Tap to dismiss</small></button>`;
  }

  /** Whether the Archives' tab shows: once that skill is owned, or in Dev mode. */
  private get archivesOpen() {
    const save = this.ctx.game.save;
    return save.settings.devMode || save.upgrades.archives > 0;
  }

  /** The tab buttons, Training's wearing a dot while training points can be
   * spent and the hero has levelled up since that tab last showed (so
   * turning to the Archives never brings back a dot already seen); none
   * while Training is the only tab. */
  private tabsHtml() {
    if (!this.archivesOpen) return "";
    const save = this.ctx.game.save, busy = save.archives.slots.filter(s => s.job).length;
    // Once trainers work, Training's subtitle also counts them at work.
    const trainers = this.ctx.game.training.hired ? ` · ${save.trainingJobs.length}/${trainingSlots(save)} TRAINING` : "";
    const trainingDot = this.tab !== "training" && this.ctx.game.notices.waiting("training") ? ` class="notify"` : "";
    // While the Archives lesson waits, the tutorials' hand points up at the Archives tab until it shows.
    const pointer = this.ctx.game.archivesLesson && this.tab !== "archives"
      ? `<span class="research-pointer${save.settings.reduceMotion ? " still" : ""}" aria-hidden="true">${POINTER_SVG}</span>` : "";
    return `<div class="tree-tabs page-tabs" role="group" aria-label="Research">` +
      `<button data-research-tab="training" aria-pressed="${this.tab === "training"}"${trainingDot}><span>${pointsIcon("ui-sprite")}</span>Training<small>${trainingPoints(save).left} POINTS${trainers}</small></button>` +
      `<button data-research-tab="archives" aria-pressed="${this.tab === "archives"}"><span>${uiSprite("log")}</span>Archives<small>${busy}/${save.archives.slots.length} RESEARCHING</small>${pointer}</button></div>`;
  }

  private bindTabs() {
    el("research").querySelectorAll<HTMLButtonElement>("[data-research-tab]").forEach(b => b.onclick = () => {
      this.tab = b.dataset.researchTab as ResearchTab;
      this.archives.reset();
      this.render();
    });
  }

  private renderArchives(tabs: string) {
    el("research").innerHTML = `${tabs}${this.archives.html()}`;
    this.bindTabs();
    this.archives.bind();
  }

  private renderTraining(tabs: string) {
    this.ctx.game.notices.shown("training");
    // The rows scroll; a purchase redraws them without moving the list.
    const scrolled = document.querySelector(".training-scroll")?.scrollTop ?? 0;
    el("research").innerHTML = `${tabs}${this.trainingHtml()}`;
    document.querySelector(".training-scroll")!.scrollTop = scrolled;
    this.bindTabs();
    this.bindTraining();
    el("research-help").onclick = () => this.showTrainingHelp();
  }

  /** The Training tab's buttons: each row's points and trainer, cancel,
   * finish and reset, the boost and the next trainer. */
  private bindTraining() {
    const training = this.ctx.game.training;
    this.onEach("data-train", (id) => {
      let spent = false;
      this.withRefund(() => (spent = training.train(id, this.ctx.game.training.buyQuantity)));
      if (spent) glow(document.querySelector<HTMLElement>(`[data-train="${id}"]`));
    });
    bindBuyQuantity(el("research"), (q) => {
      this.ctx.game.training.setBuyQuantity(q);
      this.ctx.save();
      this.render();
    });
    this.onEach("data-train-gold", (id) => {
      if (training.trainWithGold(id, this.ctx.game.training.buyQuantity)) {
        this.ctx.update();
        play("coin");
      }
      this.render();
    });
    document.querySelector<HTMLButtonElement>("#boost-claim")?.addEventListener("click", () => this.saveAfter(training.claimBoost()));
    this.onEach("data-cancel", (id) => this.withRefund(() => training.cancel(id)));
    this.onEach("data-finish", (id) => {
      const game = this.ctx.game;
      if (game.save.gems < training.finishGems(id)) return askForGems(this.ctx);
      this.saveAfter(training.finish(id));
    });
    document.querySelector<HTMLButtonElement>("#buy-trainer")?.addEventListener("click", () => {
      if (this.trainerShort()) return askForGems(this.ctx);
      this.saveAfter(training.buyTrainer());
    });
    this.onEach("data-reset", (id) => this.confirmReset(id));
    document.querySelectorAll<HTMLInputElement>("[data-auto]").forEach(box => box.onchange = () => {
      training.setAutoContinue(box.dataset.auto as TrainingId, box.checked);
      this.ctx.save();
    });
    document.querySelectorAll<HTMLElement>("[data-training-about]").forEach(name => {
      const id = name.dataset.trainingAbout as TrainingId;
      name.onclick = () => this.showAbout(name, id);
      name.onkeydown = (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        this.showAbout(name, id);
      };
    });
  }

  /** A row's name, pressed to show what the stat does (`showAbout`). */
  private nameHtml(t: { id: TrainingId; name: string }) {
    return `<span class="training-name" role="button" tabindex="0" data-training-about="${t.id}" aria-label="What ${t.name} does">${t.name}</span>`;
  }

  /** Row `id`'s description, as a run's training bar shows it, in a plain
   * box under its name (`name`), outside the page so its redraws keep it.
   * A press anywhere else, or the rows scrolling, takes it away; pressing
   * the name again closes it. */
  private showAbout(name: HTMLElement, id: TrainingId) {
    const open = document.querySelector<HTMLElement>(".training-about");
    open?.remove();
    if (open?.dataset.row === id) return;
    const box = document.createElement("div"), done = new AbortController();
    box.className = "training-about";
    box.setAttribute("role", "tooltip");
    box.dataset.row = id;
    box.textContent = trainingDef(id).description;
    el("app").append(box);
    const at = name.getBoundingClientRect();
    box.style.left = `${clamp(at.left, 8, Math.max(8, innerWidth - box.offsetWidth - 8))}px`;
    box.style.top = `${at.bottom + 4}px`;
    const close = () => {
      box.remove();
      done.abort();
    };
    // The name's own press toggles it in `onclick`.
    document.addEventListener("pointerdown", (e) => {
      const at = e.target as Element;
      if (!box.contains(at) && !at.closest?.(`[data-training-about="${id}"]`)) close();
    }, { capture: true, signal: done.signal });
    document.addEventListener("scroll", close, { capture: true, signal: done.signal });
  }

  /** Binds each button carrying `attribute` to `action` with its row. */
  private onEach(attribute: string, action: (id: TrainingId) => void) {
    document.querySelectorAll<HTMLButtonElement>(`[${attribute}]`).forEach(b => b.onclick = () => action(b.getAttribute(attribute) as TrainingId));
  }

  /** Runs a command that may give Gold and time credit back, raising what
   * it returned over the amounts held. */
  private withRefund(command: () => boolean) {
    const refund = this.refundWatch();
    if (command()) this.ctx.update();
    this.render();
    refund();
  }

  /** After a command: saved and the HUD refreshed when it went through,
   * and the tab drawn again either way. */
  private saveAfter(done: boolean) {
    if (done) {
      this.ctx.save();
      this.ctx.update();
    }
    this.render();
  }

  /** How Training works: the text the tab keeps off its rows. */
  private showTrainingHelp() {
    const hired = this.ctx.game.training.hired, p = (text: string) => `<p>${text}</p>`;
    const body = p(`Each level the hero gains earns ${TRAINING_PER_LEVEL} Training Points. Spend them to train a stat a rank at once.`) +
      p("A rank is worth more as the hero levels up, ranks already bought included.") +
      (hired
        ? p("Or pay Gold to a trainer: the rank takes the time under the stat's name, and trainers work while you play or are away. Each trainer trains one stat at a time; Gems hire more.") +
          p(`Watching an ad makes training go ×${BOOST_RATE} as fast for an hour, up to four hours stored. Tick a stat in training to have its trainer start the next rank as soon as one is done.`) +
          p("Stopping a trainer gives the Gold back and keeps the time spent as credit toward that stat's next rank.")
        : "");
    showHelp(this.ctx, "RESEARCH", "Training", body);
  }

  /** Asks before resetting a stat for Gems, one way or the other: the
   * ranks bought with training points, returning the points to spend on
   * any stat, or the ranks trainers trained, returning their Gold and time.
   * Each button names its ranks; a way with none is closed, and the Gold
   * way shows only once trainers are hired or have trained some. */
  private confirmReset(id: TrainingId) {
    const { game, modal } = this.ctx, row = TRAINING.find(t => t.id === id)!, ranks = game.training.resettable(id);
    if (game.save.gems < TRAINING_RESET_GEMS && !game.free) return askForGems(this.ctx);
    const count = (n: number, kind: string) => `${n} ${kind} ${n === 1 ? "rank" : "ranks"}`, back = this.resetReturns(id);
    // Without trainers, and none of their ranks, only the points way shows.
    const goldOpen = ranks.gold > 0 || ranks.inTraining, gold = game.training.hired || goldOpen;
    modal.innerHTML = `<small>TRAINING</small><h2>Reset ${row.name}?</h2>
      <p>Spend ${TRAINING_RESET_GEMS} Gems to take back one kind of ${row.name}'s ranks; the other kind stays.</p>
      <p><b>Training points:</b> the ranks bought with training points are taken back, and the points${back.points ? ` (${back.points})` : ""} return to the pool, to spend on any stat.</p>
      ${gold ? `<p><b>Gold and time:</b> the ranks trainers trained are taken back${ranks.inTraining ? " and the rank in training stops" : ""}${back.gold ? `, returning ${back.gold}` : ""}.</p>${back.gold ? `<p class="hint">The time goes to the time bank, taken off any stat's next ranks trainers train.</p>` : ""}` : ""}
      <p class="hint reset-gems">${gemIcon()} You hold ${game.save.gems} Gems.</p>
      <div class="dialog-actions"><button id="cancel">Cancel</button><button id="reset-points" ${ranks.points ? "" : "disabled"} aria-label="Return ${count(ranks.points, "point")} for ${TRAINING_RESET_GEMS} Gems">Return ${count(ranks.points, "point")} · ${gemIcon()} <b>${TRAINING_RESET_GEMS}</b></button>${gold ? `<button id="reset-gold" ${goldOpen ? "" : "disabled"} aria-label="Return ${count(ranks.gold, "Gold")} for ${TRAINING_RESET_GEMS} Gems">Return ${count(ranks.gold, "Gold")} · ${gemIcon()} <b>${TRAINING_RESET_GEMS}</b></button>` : ""}</div>`;
    modal.showModal();
    el("cancel").onclick = () => modal.close();
    const reset = (way: "points" | "gold") => () => {
      modal.close();
      this.saveAfter(game.training.reset(id, way));
    };
    el("reset-points").onclick = reset("points");
    if (gold) el("reset-gold").onclick = reset("gold");
  }

  /** What each way of resetting `id` gives back, as the dialog shows them:
   * the training points, or the Gold (a rank in training's too) and all the
   * training time spent on it (its trainers' ranks, the rank in training
   * and its time credit). */
  private resetReturns(id: TrainingId) {
    const game = this.ctx.game, paid = game.save.trainingPaid[id], job = trainingJob(game.save.trainingJobs, id);
    const gold = paid.gold + (job?.gold ?? 0), time = paid.ms + game.save.trainingCredit[id] + (job ? game.training.invested(job) : 0);
    return {
      points: paid.points ? `${pointsIcon()} <b>${paid.points}</b>` : "",
      gold: [
        gold ? `${goldIcon()} <b>${whole(gold)}</b>` : "",
        time ? `${clockIcon()} <b>${formatDuration(time)}</b>` : "",
      ].filter(Boolean).join(" "),
    };
  }

  /** The hero's stats, each with what a rank is worth at the hero's level
   * and what one more rank makes it; beside them, a trainer's Gold price
   * (a rank that takes time) and the training points that buy a rank at
   * once. Above them, the training boost. */
  private trainingHtml() {
    const game = this.ctx.game, save = game.save, points = trainingPoints(save), slots = trainingSlots(save), hired = game.training.hired;
    const row = (t: TrainingRow) => this.trainingRowHtml(t);
    // Buy Quantity sits at the right of the points' row, or before the points at the end of the trainers' row.
    const quantity = buyQuantityHtml(game.training.buyQuantities, game.training.buyQuantity);
    // A stat a trainer is training moves up under the trainers, in the
    // order they started, until its training ends.
    const training = (t: TrainingRow) => !!trainingJob(save.trainingJobs, t.id);
    const inTraining = save.trainingJobs.map(j => TRAINING.find(t => t.id === j.id)!).filter(t => trainingOpen(t, save));
    // Each group's other rows, leaving out any whose upgrade isn't owned yet.
    const rows = (Object.entries(TRAINING_GROUPS) as [keyof typeof TRAINING_GROUPS, string][]).map(([group, name]) => {
      const open = TRAINING.filter(t => t.group === group && trainingOpen(t, save) && !training(t));
      return open.length ? `<h4 class="training-group">${name}</h4>${open.map(row).join("")}` : "";
    }).join("");
    const bank = save.trainingBank > 0
      ? `<span class="training-bank" title="Time bank: taken off any stat's next ranks trainers train, after its own time credit">${clockIcon()} <b id="training-bank">${formatDuration(save.trainingBank)}</b></span>`
      : "";
    // The points held, at the right end of the trainers' row once there are trainers.
    const held = `<span class="training-held" title="Training points"><span class="points-held">${pointsIcon()}<b id="training-points">${points.left}</b></span><small>Training Points</small></span>`;
    return `<section class="training"><canvas class="training-particles" aria-hidden="true"></canvas><header class="tree-heading">${rushEfficiencyHtml(trainingRowsFull(save), "finishing a rank in training")}<h3>Training${helpButton("How Training works", "research-help")}</h3></header>
      ${hired ? this.boostHtml() : ""}
      ${hired
        ? `<div class="training-points training-slots"><span class="training-trainers">Trainers: <b id="training-slots">${save.trainingJobs.length} / ${slots}</b> ${this.trainerButton()}${this.speedHtml()}</span><span class="training-end">${quantity}${bank}${held}</span></div>`
        : `<div class="training-points">${held}${bank}${quantity}</div>`}
      <div class="training-scroll">${inTraining.length ? `<div class="training-table training-busy" role="list" aria-label="Stats in training">${inTraining.map(row).join("")}</div>` : ""}
      <div class="training-table" role="list" aria-label="Stat training">${rows}</div></div></section>`;
  }

  /** One stat's row: its value now and after a rank, the points that train
   * it now, and reset; once the Trainers skill is owned, also the training
   * time its next rank still needs (its time credit taken off) and the
   * trainer. A row a trainer is training puts its auto-continue box, name
   * and levels on a line of their own above the rest, which is its batch's
   * speedup (when it has one), the values, the countdown that stops it, the
   * points, and the Gems that finish it in the reset's place: it has no
   * reset while training. */
  private trainingRowHtml(t: TrainingRow) {
    const game = this.ctx.game, save = game.save, view = game.trainingView, step = trainingStep(save, t.id, 1, view), hired = game.training.hired;
    // A Buy Quantity above x1 shows its price for the ranks it buys and
    // the value they reach.
    const q = game.training.buyQuantity, bulk = trainingBulk(save, t.id, q), count = step.maxed ? 1 : Math.max(1, bulk.count);
    const { now, unit } = step, next = count === 1 ? step.next : trainingStep(save, t.id, count, view).next;
    // Attack Range and Attack Speed show the bare value; the row's name says what it counts.
    const shown = (v: number) => trainingText(v, unit, unit === "tiles" || unit === "shots");
    const job = trainingJob(save.trainingJobs, t.id);
    const notes = step.maxed || !hired || job ? "" : this.timeNote(t.id, q);
    // A row at its most has nothing more to show or buy: its label spans the
    // values' columns, Max stands where the trainer's price does (the points'
    // place without trainers), and the reset keeps the right edge.
    if (step.maxed && !job) {
      const max = `<button class="training-box training-cost" disabled aria-label="${t.name} is fully trained">Max</button>`;
      return `<div class="training-row maxed" role="listitem" data-training-row="${t.id}"><span class="training-label">${this.nameHtml(t)} - ${this.levelText(t.id, false)}</span>${max}${hired ? `<span aria-hidden="true"></span>` : ""}${this.resetButton(t, false)}</div>`;
    }
    const nowButton = step.maxed
      ? ""
      : `<button class="training-box training-cost training-now" data-train="${t.id}" ${bulk.affordable ? "" : "disabled"} aria-label="Spend ${bulk.cost} training ${bulk.cost === 1 ? "point" : "points"} to train ${t.name} ${count === 1 ? "one rank" : `${count} ranks`} now" title="Train now">${maxCount(q, count)}${pointsIcon()}<span>${bulk.cost}</span></button>`;
    const values = `<span class="training-box">${shown(now)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(next)}</span>`;
    if (job) {
      const speedup = job.speed > 1
        ? `<span class="training-speedup" title="Training ${job.speed}x faster for training ${job.ranks} ranks at once">×${job.speed}</span>`
        : `<span aria-hidden="true"></span>`;
      return `<div class="training-row active" role="listitem" data-training-row="${t.id}"${job.speed > 1 ? ` data-speed="${job.speed}"` : ""}><span class="training-label training-head">${this.autoBox(t)}${this.nameHtml(t)} - ${this.levelText(t.id, true)}</span>${speedup}${values}${this.trainerHtml(t, step)}${nowButton || `<span aria-hidden="true"></span>`}${this.finishButton(t.id, t.name)}</div>`;
    }
    return `<div class="training-row" role="listitem" data-training-row="${t.id}"><span class="training-label">${this.nameHtml(t)} - ${this.levelText(t.id, false)}${notes ? `<small>${notes}</small>` : ""}</span>${values}${hired ? this.trainerHtml(t, step) : ""}${nowButton}${this.resetButton(t, false)}</div>`;
  }

  /** The training time to a row's next rank or ranks (at Buy Quantity
   * `q`) while no trainer trains it: the time left once the stat's credit
   * and the time bank are taken off, and for a batch with a speedup,
   * "30m × 2x → 15m". Light green once any time is banked toward it (and
   * "0s" when that covers it all). */
  private timeNote(id: TrainingId, q: BuyQuantity) {
    const training = this.ctx.game.training;
    const { remaining, work, speedup, banked } = training.nextWork(id, q);
    const title = speedup > 1 ? `Training ${speedup}x faster for training several ranks at once` : "Training time to the next rank";
    return `<span class="training-left" title="${title}">${clockIcon()}${speedup > 1 ? `<span class="training-speedup">${formatDuration(remaining)} ×${speedup}x →</span>` : ""}<span data-training-left="${id}"${banked ? ' class="banked"' : ""}>${formatDuration(work)}</span></span>`;
  }

  /** A row's level, its ranks, and while a trainer trains the next, the
   * level it reaches, out of its most: "Lv 5 / 1,000", or "Lv 5 → 6 / 1,000". */
  private levelText(id: TrainingId, training: boolean) {
    const save = this.ctx.game.save, ranks = save.training[id], row = TRAINING.find((t) => t.id === id)!;
    const most = ` / ${trainingCap(row, save.upgrades).toLocaleString("en-US")}`;
    return `<span class="training-level">Lv ${ranks}${training ? ` → ${ranks + ranksInTraining(save.trainingJobs, id)}` : ""}${most}</span>`;
  }

  /** A row in training's auto-continue box, with its loop icon: while
   * ticked, its trainer starts the next rank as soon as one is done, when
   * the Gold is there. */
  private autoBox(t: TrainingRow) {
    const on = this.ctx.game.training.autoContinues(t.id);
    return `<label class="training-auto-box" title="Auto-continue: train the next rank as soon as one is done"><input type="checkbox" class="training-auto" data-auto="${t.id}" ${on ? "checked" : ""} aria-label="Auto-continue ${t.name}: train the next rank as soon as one is done">${redoIcon()}</label>`;
  }

  /** A rank a trainer is training shows its countdown (tap to stop it and
   * get the Gold back; its Gem finish stands at the row's end), else the
   * trainer's price. */
  private trainerHtml(t: TrainingRow, step: ReturnType<typeof trainingStep>) {
    const game = this.ctx.game, save = game.save;
    if (trainingJob(save.trainingJobs, t.id))
      return `<span class="training-job"><button class="training-box training-timer" data-cancel="${t.id}" aria-label="Training ${t.name}: tap to stop and get the Gold back" title="Tap to stop and get the Gold back"><span data-training-timer="${t.id}">${formatCountdown(game.training.left(t.id))}</span></button></span>`;
    const q = game.training.buyQuantity, batch = game.training.batch(t.id, q), full = save.trainingJobs.length >= trainingSlots(save), gold = whole(batch.gold);
    const takes = formatDuration(game.training.toNextRank(t.id, q)), ranks = batch.count === 1 ? `to ${trainingText(step.next, step.unit)}` : `${batch.count} ranks`;
    return `<button class="training-box training-cost training-gold" data-train-gold="${t.id}" ${batch.affordable && !full ? "" : "disabled"} aria-label="Pay ${gold} Gold to a trainer to train ${t.name} ${ranks}, taking ${takes}" title="${full ? "Every trainer is busy" : `${batch.count === 1 ? "" : `${ranks}: `}Takes ${takes}`}">${maxCount(q, batch.count)}${goldIcon()}<span>${priceAmount(gold)}</span></button>`;
  }

  /** A row's Gem reset: closed inside a run, where a hero is only ever
   * trained up (`TrainingDesk.canReset`), and with no ranks to reset. */
  private resetButton(t: TrainingRow, inTraining: boolean) {
    const game = this.ctx.game, ranked = game.save.training[t.id] > 0 || inTraining, open = ranked && game.training.canReset;
    const title = !game.training.canReset ? "Stats reset only between climbs" : ranked ? `Reset ${t.name} for ${TRAINING_RESET_GEMS} Gems` : `${t.name} has no ranks to reset`;
    return `<button class="training-reset" data-reset="${t.id}" ${open ? "" : "disabled"} aria-label="Reset ${t.name}" title="${title}">${uiSprite("undo")}</button>`;
  }

  /** Notes the Gold and each stat's time credit held now; the function it
   * returns, called once the page is drawn again, raises what a stopped
   * trainer gave back over each: the Gold over the currencies bar's, the
   * time over its row's time to the next rank. */
  private refundWatch() {
    const save = this.ctx.game.save, gold = save.gold, credit = { ...save.trainingCredit }, bank = save.trainingBank;
    return () => {
      const back = whole(save.gold - gold);
      if (back > 0) riseFrom(el("gold-held"), `${goldIcon()} +${back}`);
      if (save.trainingBank > bank) riseFrom(document.getElementById("training-bank"), `${clockIcon()} +${formatDuration(save.trainingBank - bank)}`);
      for (const t of TRAINING) {
        const time = save.trainingCredit[t.id] - credit[t.id];
        if (time > 0) riseFrom(document.querySelector<HTMLElement>(`[data-training-left="${t.id}"]`), `${clockIcon()} +${formatDuration(time)}`);
      }
    };
  }

  /** The training boost: ×2, its time left or "Inactive", and the button
   * that claims an hour more, up to four (closed while what is stored is
   * within ten minutes of that); none once Ad-Disable runs it
   * for good, `speedHtml` saying so instead. */
  private boostHtml() {
    const game = this.ctx.game;
    if (permanentBoost(game.save)) return "";
    const left = boostLeft(game.save.trainingBoostUntil, game.clock()),
      full = claimBoost(game.save.trainingBoostUntil, game.clock()) === null;
    return `<div class="training-boost${left ? " active" : ""}" id="training-boost"><b class="boost-rate">×${BOOST_RATE}</b><span class="boost-time" id="boost-time">${left ? formatDuration(left) : "Inactive"}</span><button id="boost-claim" class="boost-claim" ${full ? "disabled" : ""} aria-label="Watch an ad: training goes twice as fast for an hour more, up to four" title="${full ? `Can be claimed once under ${formatDuration(BOOST_MAX_MS - BOOST_CLAIM_MARGIN_MS)} is stored` : "Training goes twice as fast for an hour more"}">${adIcon()}<span>+1h</span></button></div>`;
  }

  /** The Shop's permanent training speed, glowing on the trainers' row:
   * Ad-Disable's permanent ×2 boost times the Coin Packs' rates (×2 and
   * ×3), up to ×12 with all three; nothing without any. */
  private speedHtml() {
    const save = this.ctx.game.save, speed = (permanentBoost(save) ? BOOST_RATE : 1) * trainingRate(save);
    if (speed === 1) return "";
    const label = `Training goes ×${speed} as fast for good`;
    return `<span class="training-speed" id="training-speed" role="img" aria-label="${label}" title="${label}">×${speed}</span>`;
  }

  /** The Gem button that finishes a rank in training at once: one Gem per
   * ten minutes its timer shows, rounded up. */
  private finishButton(id: TrainingId, name: string) {
    const game = this.ctx.game, gems = game.training.finishGems(id);
    return `<button class="training-finish${game.save.gems >= gems ? "" : " short"}" data-finish="${id}" aria-label="Finish training ${name} now for ${gemCount(gems)}" title="Finish now for ${gemCount(gems)}">${gemIcon()}<span data-finish-gems="${id}">${gems}</span></button>`;
  }

  /** Whether the Gems held fall short of the next trainer. */
  private trainerShort() {
    const game = this.ctx.game, price = nextTrainerGems(game.save);
    return price !== null && !game.free && game.save.gems < price;
  }

  /** The Gem button that buys one more trainer, or nothing once all are. */
  private trainerButton() {
    const game = this.ctx.game, price = nextTrainerGems(game.save);
    if (price === null) return "";
    const short = this.trainerShort();
    return `<button id="buy-trainer" class="buy-trainer${short ? " short" : ""}" aria-label="Buy a trainer for ${price} Gems: one more stat trains at once" title="${short ? `Needs ${price} Gems` : "One more stat trains at once"}">+ ${gemIcon()} ${price}</button>`;
  }

  /** Once a second while the page shows: the Archives' countdowns, or the
   * whole page once research completes (a tab's count changes). */
  archivesTick(completed: boolean) {
    if (this.tab === "archives") this.archives.tick(completed);
    else if (completed) this.render();
    else this.tickTraining();
  }

  /** Counts the timers beside the ranks in training down (twice as fast
   * while the boost lasts), with the Gems that would finish each, and the
   * boost's own time. */
  private tickTraining() {
    const game = this.ctx.game;
    this.moveTraining();
    const boost = document.getElementById("training-boost");
    if (boost) boost.outerHTML = this.boostHtml();
    document.querySelector<HTMLButtonElement>("#boost-claim")?.addEventListener("click", () => this.saveAfter(game.training.claimBoost()));
  }

  /** Moves the timers of the ranks in training on, with the Gems that
   * would finish each. */
  private moveTraining() {
    const game = this.ctx.game;
    for (const job of game.save.trainingJobs) {
      const left = game.training.left(job.id);
      const span = document.querySelector<HTMLElement>(`[data-training-timer="${job.id}"]`);
      if (span) span.textContent = formatCountdown(left);
      const gems = document.querySelector<HTMLElement>(`[data-finish-gems="${job.id}"]`);
      if (gems) gems.textContent = String(game.training.finishGems(job.id));
    }
  }

  /** The real ms until a timer of a rank in training next shows another
   * second: a second, or less while training goes faster. */
  private nextTrainingIn() {
    const { save } = this.ctx.game, now = this.ctx.game.clock(), rate = trainingRate(save);
    return Math.min(1000, ...save.trainingJobs.map((job) => nextTrainingCountdownIn(job, save.trainingBoostUntil, now, rate)));
  }

  /** Each frame while the page shows: the tab's countdowns, the moment one
   * shows another second, and the Training tab's particles. */
  frame(time: number) {
    this.moveCountdowns(time);
    if (this.tab === "training") this.drawParticles(time);
  }

  /** Moves the tab's countdowns on as each shows another second: every
   * second or, as research or training goes faster, every second shared by
   * its speed (at most ten times a second), so the time left reads true to
   * the second. */
  private moveCountdowns(time: number) {
    if (time < this.nextCountdown) return;
    const archives = this.tab === "archives";
    if (archives) this.archives.moveOn();
    else this.moveTraining();
    const due = archives ? this.archives.nextCountdownIn() : this.nextTrainingIn();
    // A few ms past the turn of the second, so it has turned.
    this.nextCountdown = time + Math.max(COUNTDOWN_MIN_MS, due + 5);
  }

  /** The Training tab's specks and the stream along each row in training. */
  private drawParticles(time: number) {
    if (this.tab !== "training") return;
    const canvas = document.querySelector<HTMLCanvasElement>(".training-particles");
    if (!canvas) return;
    const top = canvas.getBoundingClientRect().top;
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".training-row.active"));
    const lanes = rows.map(row => {
      const r = row.getBoundingClientRect();
      return r.top + r.height / 2 - top;
    });
    const speeds = rows.map(row => Number(row.dataset.speed) || 1);
    this.trainingParticles.draw(canvas, time, { lanes, speeds, reduced: this.ctx.game.save.settings.reduceMotion });
  }
}

/** Lights `button` up for a moment: the points it took were spent. */
function glow(button: HTMLElement | null) {
  if (!button) return;
  button.classList.add("spent");
  button.addEventListener("animationend", () => button.classList.remove("spent"), { once: true });
}
