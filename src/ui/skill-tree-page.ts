import { askForGems } from "./dialogs.ts";
import { play } from "../sound.ts";
import { permanentBoost } from "../shop/entitlements.ts";
import { upgradeCard } from "../cards.ts";
import { revealCard } from "./card-reveal.ts";
import { TRAINING, TRAINING_GROUPS, TRAINING_PER_LEVEL, UPGRADES, cost, trainingOpen, type TrainingId, type UpgradeId } from "../config.ts";
import { TREES, mapNodes, skillAvailable, treeHeight, treeOpen, type TreeId } from "../skill-trees.ts";
import { trainingPoints, trainingSpeed, trainingStep, trainingText, upgradeText } from "../loadout.ts";
import { whole } from "../whole.ts";
import { TreeParticles } from "../tree-particles.ts";
import { TrainingParticles } from "../training-particles.ts";
import { BOOST_RATE, boostLeft, claimBoost, finishGems, nextTrainerGems, trainingJob, trainingMs, trainingSlots } from "../training-jobs.ts";
import type { AppContext } from "./app.ts";
import { adIcon, clamp, clockIcon, el, gemIcon, goldIcon, pointsIcon, riseFrom, skillSprite, uiSprite, type UiSprite } from "./dom.ts";
import { TRAINING_RESET_GEMS } from "../gems.ts";
import { bindPanZoom, type View } from "./pan-zoom.ts";
import { ArchivesPanel, formatDuration } from "./archives-page.ts";

type Tree = (typeof TREES)[number];

const TREE_ICONS: Record<string, UiSprite> = {
  inspiration: "upgrades", courage: "automove", legacy: "tower", wisdom: "settings",
};
type PageTab = TreeId | "training" | "archives";
const gemCount = (n: number) => `${n} ${n === 1 ? "Gem" : "Gems"}`;

/** The Upgrades page: the Training table, one skill tree at a time
 * (pannable and zoomable; tap a node to see its tooltip, tap it again to
 * buy a rank), or the Archives once that skill is owned. */
/** What a skill's tooltip says can be done with it now. */
function tooltipHint(p: { locked: boolean; maxed: boolean; available: boolean; affordable: boolean }, requirements: string[], unlocks: boolean) {
  if (p.locked) return "Unlock this tree to learn its skills.";
  if (p.maxed) return unlocks ? "Unlocked." : "Mastered.";
  if (requirements.length) return `Requires: ${requirements.join(" + ")}${unlocks ? "" : " (one rank each)"}.`;
  if (!p.available) return "Locked.";
  return p.affordable ? "Tap again to purchase." : "";
}

type TrainingRow = (typeof TRAINING)[number];

/** The trees whose buyable skills show their price on a corner badge. */
const PRICED_TREES: TreeId[] = ["inspiration", "courage"];

export class SkillTreePage {
  private tree: PageTab = "inspiration";
  private skill: UpgradeId = "combatStance";
  private tooltipVisible = false;
  private views: Partial<Record<TreeId, View>> = {};
  private particles = new TreeParticles();
  private trainingParticles = new TrainingParticles();
  private archives: ArchivesPanel;

  constructor(private ctx: AppContext) {
    this.archives = new ArchivesPanel(ctx, () => this.render());
  }

  /** Opens on `skill` in `tree` with its tooltip showing, e.g. to point a
   * locked tab or button at the upgrade that unlocks it. */
  focus(tree: TreeId, skill: UpgradeId) {
    this.tree = tree;
    this.skill = skill;
    this.tooltipVisible = true;
  }

  render() {
    if (!this.shown(this.tree)) this.tree = "inspiration";
    const tabs = `<div class="tree-tabs" role="group" aria-label="Skill trees">${this.tabsHtml()}</div>`;
    if (this.tree === "archives") this.renderArchives(tabs);
    else if (this.tree === "training") this.renderTraining(tabs);
    else this.renderTree(tabs);
    // Showing the Inspiration tree clears the dot a run's Inspiration put on it.
    const save = this.ctx.game.save;
    if (this.tree === "inspiration" && save.inspirationNotice) {
      save.inspirationNotice = false;
      this.ctx.update();
    }
  }

  /** Whether a tab's unlock is owned (none needed when `id` is left out);
   * Dev mode shows them all. */
  private opened(id?: UpgradeId) {
    const save = this.ctx.game.save;
    return save.settings.devMode || !id || save.upgrades[id] > 0;
  }

  /** A tab shows once what unlocks it is owned; Dev mode shows them all. */
  private shown(tab: PageTab) {
    if (tab === "archives" || tab === "training") return this.opened(tab);
    const save = this.ctx.game.save;
    return save.settings.devMode || treeOpen(TREES.find(t => t.id === tab)!, save.upgrades);
  }

  /** The tab buttons: Inspiration, shown from the start, then Training,
   * unlocked a little later; the Archives sit after Courage, before the
   * trees after it. */
  private tabsHtml() {
    const save = this.ctx.game.save;
    const busy = save.archives.slots.filter(s => s.job).length;
    const archives = this.opened("archives") ? `<button data-tree="archives" aria-pressed="${this.tree === "archives"}"><span>${uiSprite("log")}</span>Archives<small>${busy} RESEARCHING</small></button>` : "";
    const training = this.opened("training") ? `<button data-tree="training" aria-pressed="${this.tree === "training"}"><span>${pointsIcon("ui-sprite")}</span>Training<small>${trainingPoints(save).left} POINTS</small></button>` : "";
    const trees = TREES.filter(t => this.shown(t.id)), courage = TREES.findIndex(t => t.id === "courage");
    const archivesAt = trees.findIndex(t => TREES.indexOf(t) > courage);
    return trees.map((t, i) =>
      `${i === archivesAt ? archives : ""}<button data-tree="${t.id}" aria-pressed="${t.id === this.tree}"${t.id === "inspiration" && this.tree !== t.id && this.ctx.game.inspirationWaiting ? ` class="notify"` : ""}><span>${uiSprite(TREE_ICONS[t.id] ?? "defend")}</span>${t.name}<small>${this.locked(t) ? "LOCKED" : "UNLOCKED"}</small></button>${t.id === "inspiration" ? training : ""}`).join("")
      + (archivesAt < 0 ? archives : "");
  }

  private bindTabs() {
    document.querySelectorAll<HTMLButtonElement>("[data-tree]").forEach(b => b.onclick = () => {
      this.tree = b.dataset.tree as PageTab;
      this.tooltipVisible = false;
      this.render();
    });
  }

  private renderArchives(tabs: string) {
    el("upgrades").innerHTML = `${tabs}${this.archives.html()}`;
    this.bindTabs();
    this.archives.bind();
  }

  private renderTraining(tabs: string) {
    el("upgrades").innerHTML = `${tabs}${this.trainingHtml()}`;
    this.bindTabs();
    this.bindTraining();
  }

  /** The Training tab's buttons: each row's points and trainer, cancel,
   * finish and reset, the boost and the next trainer. */
  private bindTraining() {
    const training = this.ctx.game.training;
    this.onEach("data-train", (id) => this.withRefund(() => training.train(id)));
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

  private renderTree(tabs: string) {
    const tree = this.current();
    const view = this.view(tree.id);
    const nodes = mapNodes(tree);
    el("upgrades").innerHTML = `${tabs}
      <section class="skill-tree ${tree.id}"><header class="tree-heading"><h3>${tree.name} skill tree</h3></header>
      ${this.lockHtml(tree)}
      <div class="tree-viewport" id="tree-viewport"><div class="tree-map" id="tree-map" style="${treeHeight(tree) === 100 ? "" : `height:${treeHeight(tree)}%;`}transform:translate(${view.x}px,${view.y}px) scale(${view.scale})"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${this.linesHtml(nodes)}</svg>
      <canvas class="tree-particles" aria-hidden="true"></canvas>
      ${nodes.map(n => this.nodeHtml(n)).join("")}</div><div class="inspect-box tree-tooltip" id="tree-tooltip" hidden></div></div></section>`;
    this.bindTabs();
    bindPanZoom(el("tree-viewport"), el("tree-map"), view, {
      tap: (target) => this.tapped(target),
      pan: () => this.hideTooltip(),
      zoom: () => { if (this.tooltipVisible) this.showTooltip(); },
    });
    if (this.tooltipVisible && tree.nodes.some(n => n.id === this.skill)) this.showTooltip();
  }

  /** Why a tree can't be bought from yet, if it can't. */
  private lockHtml(tree: Tree) {
    if (tree.gate === null) return `<p class="tree-lock">What opens this tree is still to come.</p>`;
    if (!this.locked(tree)) return "";
    return `<p class="tree-lock">Unlock ${UPGRADES.find(u => u.id === tree.gate)!.name} in the ${tree.id === "courage" ? "Inspiration" : "Courage"} tree.</p>`;
  }

  /** The lines from each skill to those it requires, lit once owned. */
  private linesHtml(nodes: ReturnType<typeof mapNodes>) {
    const upgrades = this.ctx.game.save.upgrades;
    return nodes.flatMap(n => n.requires.map(id => {
      const parent = nodes.find(p => p.id === id);
      return parent ? `<line x1="${parent.x}" y1="${parent.y}" x2="${n.x}" y2="${n.y}" class="${upgrades[id] ? "lit" : ""}"/>` : "";
    })).join("");
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
      ${back ? `<p class="reset-back">Returns ${back}</p><p class="hint">Time credit is taken off the next ranks trainers train.</p>` : ""}
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
   * in training's too) and the trainers' time, as the dialog shows them. */
  private resetReturns(id: TrainingId) {
    const game = this.ctx.game, paid = game.save.trainingPaid[id], job = trainingJob(game.save.trainingJobs, id);
    const gold = paid.gold + (job?.gold ?? 0), time = paid.ms + (job ? Math.max(0, job.ms - game.training.left(id)) : 0);
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
    const save = this.ctx.game.save, points = trainingPoints(save), slots = trainingSlots(save);
    const row = (t: TrainingRow) => this.trainingRowHtml(t);
    // Each group's rows, leaving out any whose upgrade isn't owned yet.
    const rows = (Object.entries(TRAINING_GROUPS) as [keyof typeof TRAINING_GROUPS, string][]).map(([group, name]) => {
      const open = TRAINING.filter(t => t.group === group && trainingOpen(t, save.upgrades));
      return open.length ? `<h4 class="training-group">${name}</h4>${open.map(row).join("")}` : "";
    }).join("");
    const credit = save.trainingCredit > 0
      ? `<span class="training-credit" title="Time credit: taken off the next ranks trainers train">${clockIcon()} <b id="training-credit">${formatDuration(save.trainingCredit)}</b></span>`
      : "";
    return `<section class="training"><canvas class="training-particles" aria-hidden="true"></canvas><header class="tree-heading"><h3>Training</h3></header>
      ${this.boostHtml()}
      <p class="training-points"><span class="training-held" title="Training points">${pointsIcon()} <b id="training-points">${points.left}</b></span>${credit}<small>Level up with ${pointsIcon()} or pay ${goldIcon()} to a trainer</small></p>
      <p class="training-points training-slots">Trainers: <b id="training-slots">${save.trainingJobs.length} / ${slots}</b> ${this.trainerButton()}</p>
      <div class="training-table" role="list" aria-label="Stat training">${rows}</div></section>`;
  }

  /** One stat's row: its value now and after a rank, the trainer (its
   * countdown while it trains), the points that train it now, and reset. */
  private trainingRowHtml(t: TrainingRow) {
    const save = this.ctx.game.save, step = trainingStep(save, t.id), { now, next, worth, unit } = step;
    // A row with a most ranks says so, and once there offers no next one.
    const most = "max" in t ? `, up to ${trainingStep({ ...save, training: { ...save.training, [t.id]: t.max }, trainingJobs: [] }, t.id).now}${unit}` : "";
    const shown = (v: number) => trainingText(v, unit);
    // A multiplier's rank adds a percent; other rows add in their own unit.
    // A rank worth under 1 (Regen's) reads to the hundredth.
    const places = worth < 1 ? 100 : 10;
    const rank = unit === "×" ? `${worth}%` : `${unit ? worth : Math.round(worth * places) / places}${unit}`;
    const job = trainingJob(save.trainingJobs, t.id);
    const nowButton = step.maxed
      ? ""
      : `<button class="training-box training-cost training-now" data-train="${t.id}" ${step.affordable ? "" : "disabled"} aria-label="Spend ${t.cost} training ${t.cost === 1 ? "point" : "points"} to train ${t.name} now" title="Train now">${pointsIcon()}<span>${t.cost}</span></button>`;
    return `<div class="training-row${job ? " active" : ""}" role="listitem" data-training-row="${t.id}"><span class="training-label">${this.autoBox(t)}${t.name}<small>+${rank} a rank${most}</small></span><span class="training-box">${shown(now)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(next)}</span>${this.trainerHtml(t, step)}${nowButton}${this.resetButton(t, !!job)}</div>`;
  }

  /** The row's auto-continue box: while ticked, its trainer starts the
   * next rank as soon as one is done, when the Gold is there. */
  private autoBox(t: TrainingRow) {
    const on = this.ctx.game.training.autoContinues(t.id);
    return `<input type="checkbox" class="training-auto" data-auto="${t.id}" ${on ? "checked" : ""} aria-label="Auto-continue ${t.name}: train the next rank as soon as one is done" title="Auto-continue: train the next rank as soon as one is done">`;
  }

  /** A rank a trainer is training shows its countdown (tap to stop it and
   * get the Gold back), else the trainer's price, or Max. */
  private trainerHtml(t: TrainingRow, step: ReturnType<typeof trainingStep>) {
    const game = this.ctx.game, save = game.save;
    if (trainingJob(save.trainingJobs, t.id))
      return `<span class="training-job"><button class="training-box training-timer" data-cancel="${t.id}" aria-label="Training ${t.name}: tap to stop and get the Gold back" title="Tap to stop and get the Gold back"><span data-training-timer="${t.id}">${formatDuration(game.training.left(t.id))}</span></button>${this.finishButton(t.id, t.name)}</span>`;
    if (step.maxed) return `<button class="training-box training-cost" disabled aria-label="${t.name} is fully trained">Max</button>`;
    const full = save.trainingJobs.length >= trainingSlots(save), gold = whole(step.gold);
    const takes = formatDuration(Math.max(0, trainingMs(save.training[t.id], trainingSpeed(save)) - save.trainingCredit));
    return `<button class="training-box training-cost training-gold" data-train-gold="${t.id}" ${step.goldAffordable && !full ? "" : "disabled"} aria-label="Pay ${gold} Gold to a trainer to train ${t.name} to ${trainingText(step.next, step.unit)}, taking ${takes}" title="${full ? "Every trainer is busy" : `Takes ${takes}`}">${goldIcon()}<span>${gold}</span></button>`;
  }

  private resetButton(t: TrainingRow, inTraining: boolean) {
    const resettable = this.ctx.game.save.training[t.id] > 0 || inTraining;
    return `<button class="training-reset" data-reset="${t.id}" ${resettable ? "" : "disabled"} aria-label="Reset ${t.name}" title="${resettable ? `Reset ${t.name} for ${TRAINING_RESET_GEMS} Gems` : `${t.name} has no ranks to reset`}">${uiSprite("undo")}</button>`;
  }

  /** Notes the Gold and time credit held now; the function it returns,
   * called once the page is drawn again, raises what a stopped trainer gave
   * back over each: the Gold over the currencies bar's, the time over the
   * time credit's clock. */
  private refundWatch() {
    const save = this.ctx.game.save, gold = save.gold, credit = save.trainingCredit;
    return () => {
      const back = whole(save.gold - gold), time = save.trainingCredit - credit;
      if (back > 0) riseFrom(el("gold-held"), `${goldIcon()} +${back}`);
      if (time > 0) riseFrom(document.getElementById("training-credit"), `${clockIcon()} +${formatDuration(time)}`);
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
    if (this.tree === "archives") this.archives.tick(completed);
    else if (completed) this.render();
    else if (this.tree === "training") this.tickTraining();
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
      const gems = document.querySelector<HTMLElement>(`[data-finish-gems="${job.id}"]`);
      if (gems && !game.free) gems.textContent = String(finishGems(left));
    }
    const boost = document.getElementById("training-boost");
    if (boost) boost.outerHTML = this.boostHtml();
    document.querySelector<HTMLButtonElement>("#boost-claim")?.addEventListener("click", () => this.saveAfter(game.training.claimBoost()));
  }

  /** Purchase sparkles and node glow on the particle canvas, if showing. */
  drawParticles(time: number) {
    const canvas = document.querySelector<HTMLCanvasElement>(".tree-particles");
    if (this.tree === "training") return this.drawTrainingParticles(time);
    if (!canvas || this.tree === "archives") return;
    const tree = this.current();
    this.particles.draw(canvas, time, {
      tree: tree.id, nodes: mapNodes(tree), selected: this.tooltipVisible ? this.skill : null, reduced: this.ctx.game.save.settings.reduceMotion,
    });
  }

  /** The Training tab's specks and the stream along each row in training. */
  private drawTrainingParticles(time: number) {
    const canvas = document.querySelector<HTMLCanvasElement>(".training-particles");
    if (!canvas) return;
    const top = canvas.getBoundingClientRect().top;
    const lanes = Array.from(document.querySelectorAll<HTMLElement>(".training-row.active")).map(row => {
      const r = row.getBoundingClientRect();
      return r.top + r.height / 2 - top;
    });
    this.trainingParticles.draw(canvas, time, { lanes, reduced: this.ctx.game.save.settings.reduceMotion });
  }

  private current(): Tree {
    return TREES.find(t => t.id === this.tree) ?? TREES[0];
  }
  private view(id: TreeId) {
    return this.views[id] ??= { x: 0, y: 0, scale: 1 };
  }
  private locked(tree: Tree) {
    return !treeOpen(tree, this.ctx.game.save.upgrades);
  }

  private nodeHtml(n: Tree["nodes"][number]) {
    const upgrades = this.ctx.game.save.upgrades;
    const skill = UPGRADES.find(u => u.id === n.id)!;
    const rank = upgrades[n.id];
    const available = skillAvailable(n.id, upgrades);
    const chosen = n.id === this.skill && this.tooltipVisible;
    const unlocks = this.current().unlocks;
    const state = unlocks ? (rank ? ", unlocked" : "") : `, ${rank} of ${skill.max}`;
    // In the Inspiration and Courage trees, a skill that can be bought wears
    // its next rank's price on its corner, so each path's cost shows at a
    // glance.
    const { price, affordable, locked, maxed } = this.purchase(n.id);
    const badge = PRICED_TREES.includes(this.current().id) && available && !locked && !maxed
      ? `<span class="node-cost ${affordable ? "" : "short"}" aria-hidden="true">${price}</span>` : "";
    return `<button class="skill-node ${rank ? "owned" : ""} ${available ? "available" : "locked"} ${chosen ? "chosen" : ""}" data-skill="${n.id}" style="left:${n.x}%;top:${n.y}%" aria-label="${skill.name}${state}${available ? "" : ", locked"}${badge ? `, costs ${price}` : ""}" aria-pressed="${chosen}"><span class="node-icon">${skillSprite(n.id)}${badge}</span><span class="node-name">${skill.name}</span>${unlocks ? "" : `<small>${rank} / ${skill.max}</small>`}</button>`;
  }

  /** Where buying `id` stands: its price, the balance, and whether it can
   * be bought right now. */
  private purchase(id: UpgradeId) {
    const tree = this.current(), save = this.ctx.game.save;
    const u = UPGRADES.find(u => u.id === id)!;
    const level = save.upgrades[id];
    const price = cost(id, level);
    const balance = tree.currency === "inspiration" ? save.tower.inspiration : save.delve.courage;
    const locked = this.locked(tree);
    const maxed = level >= u.max;
    const available = skillAvailable(id, save.upgrades);
    const affordable = this.ctx.game.free || balance >= price;
    return { u, level, price, balance, locked, maxed, available, affordable, canBuy: !locked && !maxed && available && affordable };
  }

  private tapped(target: HTMLElement | null) {
    const node = target?.closest<HTMLElement>("[data-skill]");
    if (node) this.tapSkill(node.dataset.skill as UpgradeId);
    else this.hideTooltip();
  }

  /** A first tap selects a skill and shows its tooltip; a second buys it. */
  private tapSkill(id: UpgradeId) {
    if (this.skill === id && this.tooltipVisible) this.buySkill(id);
    else {
      this.skill = id;
      this.tooltipVisible = true;
    }
    this.render();
  }

  private buySkill(id: UpgradeId) {
    const { canBuy, level } = this.purchase(id);
    if (!canBuy) return;
    const game = this.ctx.game;
    game.buy(id);
    const bought = game.save.upgrades[id] > level, card = upgradeCard(id);
    if (bought) this.celebrate(id, level);
    this.ctx.update();
    if (bought && card) revealCard(card, game.save.upgrades, game.save.settings.reduceMotion);
  }

  /** A rank bought chimes and bursts from its node; the first rank unlocks
   * the node, and it shines as well. */
  private celebrate(id: UpgradeId, level: number) {
    play(level === 0 ? "unlock" : "chime");
    if (this.ctx.game.save.settings.reduceMotion) return;
    const node = mapNodes(this.current()).find(n => n.id === id)!;
    const at = this.iconCenter(id);
    if (level === 0) this.particles.unlock(node, at);
    else this.particles.purchase(node, at);
  }

  /** The centre of node `id`'s circle as a fraction of the particle canvas,
   * which its rays and burst shine from (the node's own point is where the
   * tree's lines meet, below it). */
  private iconCenter(id: UpgradeId) {
    const canvas = document.querySelector<HTMLCanvasElement>(".tree-particles");
    const icon = document.querySelector(`[data-skill="${id}"] .node-icon`);
    if (!canvas || !icon) return undefined;
    const c = canvas.getBoundingClientRect(), i = icon.getBoundingClientRect();
    if (!c.width || !c.height) return undefined;
    return { x: (i.left + i.width / 2 - c.left) / c.width, y: (i.top + i.height / 2 - c.top) / c.height };
  }

  private tooltipHtml(id: UpgradeId): string {
    const node = this.current().nodes.find(n => n.id === id)!;
    const { u, level, price, balance, locked, maxed, available, affordable, canBuy } = this.purchase(id);
    const requirements = node.requires.filter(rid => !this.ctx.game.save.upgrades[rid]).map(rid => UPGRADES.find(u => u.id === rid)!.name);
    const currency = this.current().currency === "inspiration" ? "Inspiration" : "Courage";
    const unlocks = this.current().unlocks;
    const hint = tooltipHint({ locked, maxed, available, affordable }, requirements, !!unlocks);
    // Short of the price, the cost line says how much more it takes.
    const short = affordable ? "" : ` (need ${price - balance})`;
    return `<b style="color:var(--tree-color)">${u.name}</b>${unlocks ? "" : `<div>${level} / ${u.max} ranks</div>`}<div>${upgradeText(u.id)}.</div>${hint ? `<div class="${canBuy ? "safe" : ""}">${hint}</div>` : ""}${!maxed && !locked ? `<div>Cost: ${price} ${currency}${short}</div>` : ""}`;
  }

  /** Above the selected node, or below it when there is no room above. */
  private showTooltip() {
    const nodeEl = document.querySelector<HTMLElement>(`[data-skill="${this.skill}"]`);
    if (!nodeEl) return;
    const tooltip = el("tree-tooltip");
    tooltip.innerHTML = this.tooltipHtml(this.skill);
    tooltip.hidden = false;
    const viewportRect = el("tree-viewport").getBoundingClientRect(),
      nodeRect = nodeEl.getBoundingClientRect(),
      tooltipRect = tooltip.getBoundingClientRect();
    const left = clamp(nodeRect.left - viewportRect.left + nodeRect.width / 2 - tooltipRect.width / 2, 4, viewportRect.width - tooltipRect.width - 4);
    let top = nodeRect.top - viewportRect.top - tooltipRect.height - 8;
    if (top < 4) top = nodeRect.bottom - viewportRect.top + 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  private hideTooltip() {
    if (!this.tooltipVisible) return;
    this.tooltipVisible = false;
    const tooltip = document.getElementById("tree-tooltip");
    if (tooltip) tooltip.hidden = true;
  }
}
