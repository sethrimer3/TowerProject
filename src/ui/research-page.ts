import { askForGems, helpButton, showHelp } from "./dialogs.ts";
import { play } from "../sound.ts";
import { permanentBoost } from "../shop/entitlements.ts";
import { TRAINING, TRAINING_GROUPS, TRAINING_PER_LEVEL, trainingOpen, type TrainingId } from "../config.ts";
import { trainingBulk, trainingPoints, trainingStep, trainingText, trainingWaiting } from "../loadout.ts";
import { whole } from "../whole.ts";
import { buyQuantityHtml, maxCount, readQuantity } from "./buy-quantity-select.ts";
import { TrainingParticles } from "../training-particles.ts";
import { BOOST_RATE, boostLeft, claimBoost, finishGems, nextTrainerGems, trainingJob, trainingSlots } from "../training-jobs.ts";
import type { AppContext } from "./app.ts";
import { adIcon, clockIcon, el, gemCount, gemIcon, goldIcon, pointsIcon, redoIcon, riseFrom, uiSprite } from "./dom.ts";
import { TRAINING_RESET_GEMS } from "../gems.ts";
import { ArchivesPanel, formatDuration } from "./archives-page.ts";

type TrainingRow = (typeof TRAINING)[number];
type ResearchTab = "training" | "archives";

/** The Research page: what grows with time, a tab each. Training (open
 * from the start) and, once that skill is owned, the Archives. Inside a run
 * it opens from the HUD's Research button, with the run paused behind it
 * (`Game.pauseForPage`), and Back returns to the board; ranks bought here
 * reach the run's hero at once. */
export class ResearchPage {
  private tab: ResearchTab = "training";
  private trainingParticles = new TrainingParticles();
  private archives: ArchivesPanel;

  constructor(private ctx: AppContext) {
    this.archives = new ArchivesPanel(ctx, () => this.render());
  }

  render() {
    if (!this.archivesOpen) this.tab = "training";
    const back = this.ctx.game.run.outside ? "" : `<button class="back" id="research-back">← Back</button>`;
    const head = `${back}${this.tabsHtml()}`;
    if (this.tab === "archives") this.renderArchives(head);
    else this.renderTraining(head);
    el("research-back")?.addEventListener("click", () => this.ctx.navigate(this.ctx.game.mode));
  }

  /** Whether the Archives' tab shows: once that skill is owned, or in Dev mode. */
  private get archivesOpen() {
    const save = this.ctx.game.save;
    return save.settings.devMode || save.upgrades.archives > 0;
  }

  /** The tab buttons, Training's wearing a dot while training points can be
   * spent; none while Training is the only tab. */
  private tabsHtml() {
    if (!this.archivesOpen) return "";
    const save = this.ctx.game.save, busy = save.archives.slots.filter(s => s.job).length;
    const trainingDot = this.tab !== "training" && trainingWaiting(save) ? ` class="notify"` : "";
    return `<div class="tree-tabs" role="group" aria-label="Research">` +
      `<button data-research-tab="training" aria-pressed="${this.tab === "training"}"${trainingDot}><span>${pointsIcon("ui-sprite")}</span>Training<small>${trainingPoints(save).left} POINTS</small></button>` +
      `<button data-research-tab="archives" aria-pressed="${this.tab === "archives"}"><span>${uiSprite("log")}</span>Archives<small>${busy} RESEARCHING</small></button></div>`;
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
    this.onEach("data-train", (id) => this.withRefund(() => training.train(id, this.ctx.game.buyQuantity)));
    const quantity = document.querySelector<HTMLSelectElement>("[data-buy-quantity]");
    if (quantity) quantity.onchange = () => {
      this.ctx.game.setBuyQuantity(readQuantity(quantity.value));
      this.ctx.save();
      this.render();
    };
    this.onEach("data-train-gold", (id) => {
      if (training.trainWithGold(id)) {
        this.ctx.update();
        play("coin");
      }
      this.render();
    });
    document.querySelector<HTMLButtonElement>("#boost-claim")?.addEventListener("click", () => this.saveAfter(training.claimBoost()));
    this.onEach("data-cancel", (id) => this.withRefund(() => training.cancel(id)));
    this.onEach("data-finish", (id) => {
      const game = this.ctx.game;
      if (!game.free && game.save.gems < finishGems(training.left(id))) return askForGems(this.ctx);
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

  /** Asks before resetting a stat for Gems: what it costs, what it
   * returns (training points, Gold and time credit), and the Gems held;
   * Reset only when they cover it. */
  private confirmReset(id: TrainingId) {
    const { game, modal } = this.ctx, row = TRAINING.find(t => t.id === id)!,
      ranks = game.save.training[id], job = trainingJob(game.save.trainingJobs, id);
    if (game.save.gems < TRAINING_RESET_GEMS && !game.free) return askForGems(this.ctx);
    const back = this.resetReturns(id);
    modal.innerHTML = `<small>TRAINING</small><h2>Reset ${row.name}?</h2>
      <p>Spend ${TRAINING_RESET_GEMS} Gems to reset ${row.name} to no ranks${job ? " and stop the rank in training" : ""}, from ${ranks} ${ranks === 1 ? "rank" : "ranks"}.</p>
      ${back ? `<p class="reset-back">Returns ${back}</p><p class="hint">The time goes to the time bank, taken off any stat's next ranks trainers train.</p>` : ""}
      <p class="hint reset-gems">${gemIcon()} You hold ${game.save.gems} Gems.</p>
      <div class="dialog-actions"><button id="cancel">Cancel</button><button id="confirm">Reset · ${TRAINING_RESET_GEMS} Gems</button></div>`;
    modal.showModal();
    el("cancel").onclick = () => modal.close();
    el("confirm").onclick = () => {
      modal.close();
      this.saveAfter(game.training.reset(id));
    };
  }

  /** What resetting `id` gives back: the training points, the Gold (a rank
   * in training's too) and all the training time spent on it (its trainers'
   * ranks, the rank in training and its time credit), as the dialog shows
   * them. */
  private resetReturns(id: TrainingId) {
    const game = this.ctx.game, paid = game.save.trainingPaid[id], job = trainingJob(game.save.trainingJobs, id);
    const gold = paid.gold + (job?.gold ?? 0), time = paid.ms + game.save.trainingCredit[id] + (job ? Math.max(0, job.ms - game.training.left(id)) : 0);
    return [
      paid.points ? `${pointsIcon()} <b>${paid.points}</b>` : "",
      gold ? `${goldIcon()} <b>${whole(gold)}</b>` : "",
      time ? `${clockIcon()} <b>${formatDuration(time)}</b>` : "",
    ].filter(Boolean).join(" ");
  }

  /** The hero's stats, each with what a rank is worth at the hero's level
   * and what one more rank makes it; beside them, a trainer's Gold price
   * (a rank that takes time) and the training points that buy a rank at
   * once. Above them, the training boost. */
  private trainingHtml() {
    const game = this.ctx.game, save = game.save, points = trainingPoints(save), slots = trainingSlots(save), hired = game.training.hired;
    const row = (t: TrainingRow) => this.trainingRowHtml(t);
    // Buy Quantity sits at the right of the points' row, or before the points at the end of the trainers' row.
    const quantity = buyQuantityHtml(game.buyQuantities, game.buyQuantity);
    // A stat a trainer is training moves up under the trainers, in the
    // order they started, until its training ends.
    const training = (t: TrainingRow) => !!trainingJob(save.trainingJobs, t.id);
    const inTraining = save.trainingJobs.map(j => TRAINING.find(t => t.id === j.id)!).filter(t => trainingOpen(t, save.upgrades));
    // Each group's other rows, leaving out any whose upgrade isn't owned yet.
    const rows = (Object.entries(TRAINING_GROUPS) as [keyof typeof TRAINING_GROUPS, string][]).map(([group, name]) => {
      const open = TRAINING.filter(t => t.group === group && trainingOpen(t, save.upgrades) && !training(t));
      return open.length ? `<h4 class="training-group">${name}</h4>${open.map(row).join("")}` : "";
    }).join("");
    const bank = save.trainingBank > 0
      ? `<span class="training-bank" title="Time bank: taken off any stat's next ranks trainers train, after its own time credit">${clockIcon()} <b id="training-bank">${formatDuration(save.trainingBank)}</b></span>`
      : "";
    // The points held, at the right end of the trainers' row once there are trainers.
    const held = `<span class="training-held" title="Training points"><span class="points-held">${pointsIcon()}<b id="training-points">${points.left}</b></span><small>Training Points</small></span>`;
    return `<section class="training"><canvas class="training-particles" aria-hidden="true"></canvas><header class="tree-heading"><h3>Training${helpButton("How Training works", "research-help")}</h3></header>
      ${hired ? this.boostHtml() : ""}
      ${hired
        ? `<div class="training-points training-slots"><span class="training-trainers">Trainers: <b id="training-slots">${save.trainingJobs.length} / ${slots}</b> ${this.trainerButton()}</span><span class="training-end">${quantity}${bank}${held}</span></div>`
        : `<div class="training-points">${held}${bank}${quantity}</div>`}
      <div class="training-scroll">${inTraining.length ? `<div class="training-table training-busy" role="list" aria-label="Stats in training">${inTraining.map(row).join("")}</div>` : ""}
      <div class="training-table" role="list" aria-label="Stat training">${rows}</div></div></section>`;
  }

  /** One stat's row: its value now and after a rank, the points that train
   * it now, and reset; once the Trainers skill is owned, also the training
   * time its next rank still needs (its time credit taken off) and the
   * trainer (its countdown while it trains). */
  private trainingRowHtml(t: TrainingRow) {
    const game = this.ctx.game, save = game.save, step = trainingStep(save, t.id), hired = game.training.hired;
    // A Buy Quantity above x1 shows its price for the ranks it buys and
    // the value they reach.
    const q = game.buyQuantity, bulk = trainingBulk(save, t.id, q), count = step.maxed ? 1 : Math.max(1, bulk.count);
    const { now, unit } = step, next = count === 1 ? step.next : trainingStep(save, t.id, count).next;
    // A row with a most ranks says so, and once there offers no next one.
    const most = "max" in t ? `up to ${trainingStep({ ...save, training: { ...save.training, [t.id]: t.max }, trainingJobs: [] }, t.id).now}${unit}` : "";
    const shown = (v: number) => trainingText(v, unit);
    const time = step.maxed || !hired ? "" : `<span class="training-left" title="Training time to the next rank">${clockIcon()}<span data-training-left="${t.id}">${formatDuration(game.training.toNextRank(t.id))}</span></span>`;
    const notes = [time, most].filter(Boolean).join(" · ");
    const job = trainingJob(save.trainingJobs, t.id);
    const nowButton = step.maxed
      ? ""
      : `<button class="training-box training-cost training-now" data-train="${t.id}" ${bulk.affordable ? "" : "disabled"} aria-label="Spend ${bulk.cost} training ${bulk.cost === 1 ? "point" : "points"} to train ${t.name} ${count === 1 ? "one rank" : `${count} ranks`} now" title="Train now">${maxCount(q, count)}${pointsIcon()}<span>${bulk.cost}</span></button>`;
    return `<div class="training-row${job ? " active" : ""}" role="listitem" data-training-row="${t.id}"><span class="training-label">${job ? this.autoBox(t) : ""}${t.name} - ${this.levelText(t.id, !!job)}${notes ? `<small>${notes}</small>` : ""}</span><span class="training-box">${shown(now)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(next)}</span>${hired ? this.trainerHtml(t, step) : ""}${nowButton}${this.resetButton(t, !!job)}</div>`;
  }

  /** A row's level, its ranks, and while a trainer trains the next, the
   * level it reaches: "Lv 5", or "Lv 5 → 6". */
  private levelText(id: TrainingId, training: boolean) {
    const ranks = this.ctx.game.save.training[id];
    return `<span class="training-level">Lv ${ranks}${training ? ` → ${ranks + 1}` : ""}</span>`;
  }

  /** A row in training's auto-continue box, with its loop icon: while
   * ticked, its trainer starts the next rank as soon as one is done, when
   * the Gold is there. */
  private autoBox(t: TrainingRow) {
    const on = this.ctx.game.training.autoContinues(t.id);
    return `<label class="training-auto-box" title="Auto-continue: train the next rank as soon as one is done"><input type="checkbox" class="training-auto" data-auto="${t.id}" ${on ? "checked" : ""} aria-label="Auto-continue ${t.name}: train the next rank as soon as one is done">${redoIcon()}</label>`;
  }

  /** A rank a trainer is training shows its countdown (tap to stop it and
   * get the Gold back), else the trainer's price, or Max. */
  private trainerHtml(t: TrainingRow, step: ReturnType<typeof trainingStep>) {
    const game = this.ctx.game, save = game.save;
    if (trainingJob(save.trainingJobs, t.id))
      return `<span class="training-job"><button class="training-box training-timer" data-cancel="${t.id}" aria-label="Training ${t.name}: tap to stop and get the Gold back" title="Tap to stop and get the Gold back"><span data-training-timer="${t.id}">${formatDuration(game.training.left(t.id))}</span></button>${this.finishButton(t.id, t.name)}</span>`;
    if (step.maxed) return `<button class="training-box training-cost" disabled aria-label="${t.name} is fully trained">Max</button>`;
    const full = save.trainingJobs.length >= trainingSlots(save), gold = whole(step.gold);
    const takes = formatDuration(game.training.toNextRank(t.id));
    return `<button class="training-box training-cost training-gold" data-train-gold="${t.id}" ${step.goldAffordable && !full ? "" : "disabled"} aria-label="Pay ${gold} Gold to a trainer to train ${t.name} to ${trainingText(step.next, step.unit)}, taking ${takes}" title="${full ? "Every trainer is busy" : `Takes ${takes}`}">${goldIcon()}<span>${gold}</span></button>`;
  }

  /** A row's Gem reset: closed inside a run, where a hero is only ever
   * trained up (`TrainingDesk.canReset`), and with no ranks to reset. */
  private resetButton(t: TrainingRow, inTraining: boolean) {
    const game = this.ctx.game, ranked = game.save.training[t.id] > 0 || inTraining, open = ranked && game.training.canReset;
    const title = !game.training.canReset ? "Stats reset only between runs" : ranked ? `Reset ${t.name} for ${TRAINING_RESET_GEMS} Gems` : `${t.name} has no ranks to reset`;
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
   * that claims an hour more, up to four; once Ad-Disable is owned it runs
   * for good, and the button only says so. */
  private boostHtml() {
    const game = this.ctx.game;
    if (permanentBoost(game.save))
      return `<div class="training-boost active" id="training-boost"><b class="boost-rate">×${BOOST_RATE}</b><span class="boost-time" id="boost-time">Permanent</span><button id="boost-claim" class="boost-claim boost-permanent" disabled aria-label="Training goes twice as fast for good" title="Training goes twice as fast for good">x${BOOST_RATE}</button></div>`;
    const left = boostLeft(game.save.trainingBoostUntil, game.clock()),
      full = claimBoost(game.save.trainingBoostUntil, game.clock()) === null;
    return `<div class="training-boost${left ? " active" : ""}" id="training-boost"><b class="boost-rate">×${BOOST_RATE}</b><span class="boost-time" id="boost-time">${left ? formatDuration(left) : "Inactive"}</span><button id="boost-claim" class="boost-claim" ${full ? "disabled" : ""} aria-label="Watch an ad: training goes twice as fast for an hour more, up to four" title="${full ? "Four hours is the most" : "Training goes twice as fast for an hour more"}">${adIcon()}<span>+1h</span></button></div>`;
  }

  /** The Gem button that finishes a rank in training at once: one Gem per
   * ten minutes its timer shows, rounded up. */
  private finishButton(id: TrainingId, name: string) {
    const game = this.ctx.game, gems = game.free ? 0 : finishGems(game.training.left(id));
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
    for (const job of game.save.trainingJobs) {
      const left = game.training.left(job.id);
      const span = document.querySelector<HTMLElement>(`[data-training-timer="${job.id}"]`);
      if (span) span.textContent = formatDuration(left);
      const next = document.querySelector<HTMLElement>(`[data-training-left="${job.id}"]`);
      if (next) next.textContent = formatDuration(left);
      const gems = document.querySelector<HTMLElement>(`[data-finish-gems="${job.id}"]`);
      if (gems && !game.free) gems.textContent = String(finishGems(left));
    }
    const boost = document.getElementById("training-boost");
    if (boost) boost.outerHTML = this.boostHtml();
    document.querySelector<HTMLButtonElement>("#boost-claim")?.addEventListener("click", () => this.saveAfter(game.training.claimBoost()));
  }

  /** The Training tab's specks and the stream along each row in training. */
  drawParticles(time: number) {
    if (this.tab !== "training") return;
    const canvas = document.querySelector<HTMLCanvasElement>(".training-particles");
    if (!canvas) return;
    const top = canvas.getBoundingClientRect().top;
    const lanes = Array.from(document.querySelectorAll<HTMLElement>(".training-row.active")).map(row => {
      const r = row.getBoundingClientRect();
      return r.top + r.height / 2 - top;
    });
    this.trainingParticles.draw(canvas, time, { lanes, reduced: this.ctx.game.save.settings.reduceMotion });
  }
}
