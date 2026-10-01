import { upgradeCard } from "../cards.ts";
import { revealCard } from "./card-reveal.ts";
import { TRAINING, TRAINING_GROUPS, TRAINING_PER_LEVEL, UPGRADES, cost, trainingOpen, type TrainingId, type UpgradeId } from "../config.ts";
import { TREES, mapNodes, skillAvailable, treeHeight, type TreeId } from "../skill-trees.ts";
import { trainingPoints, trainingStep, trainingText, upgradeText } from "../loadout.ts";
import { TreeParticles } from "../tree-particles.ts";
import { TrainingParticles } from "../training-particles.ts";
import { trainingJob, trainingSeconds, trainingSlots } from "../training-jobs.ts";
import type { AppContext } from "./app.ts";
import { clamp, el, gemIcon, skillSprite, uiSprite, type UiSprite } from "./dom.ts";
import { TRAINING_RESET_GEMS } from "../gems.ts";
import { bindPanZoom, type View } from "./pan-zoom.ts";
import { ArchivesPanel, formatDuration } from "./archives-page.ts";

type Tree = (typeof TREES)[number];

const TREE_ICONS: Record<string, UiSprite> = {
  inspiration: "upgrades", courage: "automove", legacy: "tower", wisdom: "settings",
};
type PageTab = TreeId | "training" | "archives";

/** The Upgrades page: the Training table, one skill tree at a time
 * (pannable and zoomable; tap a node to see its tooltip, tap it again to
 * buy a rank), or the Archives once that skill is owned. */
export class SkillTreePage {
  private tree: PageTab = "inspiration";
  private skill: UpgradeId = "handOrdering";
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
    const upgrades = this.ctx.game.save.upgrades;
    if (this.tree === "archives" && !upgrades.archives) this.tree = "inspiration";
    const busy = this.ctx.game.save.archives.slots.filter(s => s.job).length;
    // The Archives tab, once owned, sits before Wayfinding.
    const archives = upgrades.archives ? `<button data-tree="archives" aria-pressed="${this.tree === "archives"}"><span>${uiSprite("log")}</span>Archives<small>${busy} RESEARCHING</small></button>` : "";
    const tabs = `<button data-tree="training" aria-pressed="${this.tree === "training"}"><span>${uiSprite("attack")}</span>Training<small>${trainingPoints(this.ctx.game.save).left} POINTS</small></button>` +
      TREES.map(t => `${t.id === "wayfinding" ? archives : ""}<button data-tree="${t.id}" aria-pressed="${t.id === this.tree}"><span>${uiSprite(TREE_ICONS[t.id] ?? "defend")}</span>${t.name}<small>${t.gate && !upgrades[t.gate] ? "LOCKED" : "UNLOCKED"}</small></button>`).join("");
    const bindTabs = () => document.querySelectorAll<HTMLButtonElement>("[data-tree]").forEach(b => b.onclick = () => {
      this.tree = b.dataset.tree as PageTab;
      this.tooltipVisible = false;
      this.render();
    });
    if (this.tree === "archives") {
      el("upgrades").innerHTML = `<div class="tree-tabs" role="group" aria-label="Skill trees">${tabs}</div>${this.archives.html()}`;
      bindTabs();
      this.archives.bind();
      return;
    }
    if (this.tree === "training") {
      el("upgrades").innerHTML = `<div class="tree-tabs" role="group" aria-label="Skill trees">${tabs}</div>${this.trainingHtml()}`;
      bindTabs();
      document.querySelectorAll<HTMLButtonElement>("[data-train]").forEach(b => b.onclick = () => {
        if (this.ctx.game.train(b.dataset.train as TrainingId)) this.ctx.update();
        this.render();
      });
      document.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach(b => b.onclick = () => {
        if (this.ctx.game.cancelTraining(b.dataset.cancel as TrainingId)) this.ctx.update();
        this.render();
      });
      document.querySelectorAll<HTMLButtonElement>("[data-reset]").forEach(b => b.onclick = () => this.confirmReset(b.dataset.reset as TrainingId));
      return;
    }
    const tree = this.current();
    const view = this.view(tree.id);
    const lock = this.locked(tree)
      ? `<p class="tree-lock">Unlock ${UPGRADES.find(u => u.id === tree.gate)!.name} in the ${tree.id === "courage" ? "Inspiration" : "Courage"} tree.</p>`
      : "";
    const nodes = mapNodes(tree);
    const lines = nodes.flatMap(n => n.requires.map(id => {
      const parent = nodes.find(p => p.id === id);
      return parent ? `<line x1="${parent.x}" y1="${parent.y}" x2="${n.x}" y2="${n.y}" class="${upgrades[id] ? "lit" : ""}"/>` : "";
    })).join("");
    el("upgrades").innerHTML = `<div class="tree-tabs" role="group" aria-label="Skill trees">${tabs}</div>
      <section class="skill-tree ${tree.id}"><header class="tree-heading"><h3>${tree.name} skill tree</h3></header>
      ${lock}
      <div class="tree-viewport" id="tree-viewport"><div class="tree-map" id="tree-map" style="${treeHeight(tree) === 100 ? "" : `height:${treeHeight(tree)}%;`}transform:translate(${view.x}px,${view.y}px) scale(${view.scale})"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      <canvas class="tree-particles" aria-hidden="true"></canvas>
      ${nodes.map(n => this.nodeHtml(n)).join("")}</div><div class="inspect-box tree-tooltip" id="tree-tooltip" hidden></div></div></section>`;
    bindTabs();
    bindPanZoom(el("tree-viewport"), el("tree-map"), view, {
      tap: (target) => this.tapped(target),
      pan: () => this.hideTooltip(),
      zoom: () => { if (this.tooltipVisible) this.showTooltip(); },
    });
    if (this.tooltipVisible && tree.nodes.some(n => n.id === this.skill)) this.showTooltip();
  }

  /** Asks before resetting a stat for Gems: what it costs, the points it
   * returns, and the Gems held; Reset only when they cover it. */
  private confirmReset(id: TrainingId) {
    const { game, modal } = this.ctx, row = TRAINING.find(t => t.id === id)!,
      ranks = game.save.training[id], points = row.cost * ranks,
      short = game.save.gems < TRAINING_RESET_GEMS && !game.free;
    modal.innerHTML = `<small>TRAINING</small><h2>Reset ${row.name}?</h2>
      <p>Spend ${TRAINING_RESET_GEMS} Gems to reset ${row.name} to no ranks and recover all <b>${points}</b> training ${points === 1 ? "point" : "points"} spent on its ${ranks} ${ranks === 1 ? "rank" : "ranks"}.</p>
      <p class="hint reset-gems">${gemIcon()} You hold ${game.save.gems} Gems${short ? ": not enough." : "."}</p>
      <div class="dialog-actions"><button id="cancel">Cancel</button><button id="confirm" ${short ? "disabled" : ""}>Reset · ${TRAINING_RESET_GEMS} Gems</button></div>`;
    modal.showModal();
    el("cancel").onclick = () => modal.close();
    el("confirm").onclick = () => {
      modal.close();
      if (game.resetTraining(id)) {
        this.ctx.save();
        this.ctx.update();
      }
      this.render();
    };
  }

  /** The hero's stats, each with what a rank is worth at the hero's level,
   * what one more rank makes it and what that costs; tap the cost to train. */
  private trainingHtml() {
    const save = this.ctx.game.save, points = trainingPoints(save), slots = trainingSlots(save);
    const row = (t: (typeof TRAINING)[number]) => {
      const { now, next, worth, affordable, unit, maxed } = trainingStep(save, t.id);
      const price = `${t.cost} ${t.cost === 1 ? "point" : "points"}`;
      // A row with a most ranks says so, and once there offers no next one.
      const most = "max" in t ? `, up to ${trainingStep({ ...save, training: { ...save.training, [t.id]: t.max } }, t.id).now}${unit}` : "";
      const shown = (v: number) => trainingText(v, unit);
      // A multiplier's rank adds a percent; other rows add in their own unit.
      const step = unit === "×" ? `${worth}%` : `${unit ? worth : Math.round(worth * 10) / 10}${unit}`;
      const job = trainingJob(save.trainingJobs, t.id), full = save.trainingJobs.length >= slots;
      const takes = formatDuration(trainingSeconds(save.training[t.id]) * 1000);
      // A rank in training shows its countdown (tap to stop it and get the points back).
      const buy = job
        ? `<button class="training-box training-timer" data-cancel="${t.id}" aria-label="Training ${t.name}: tap to cancel and get the points back" title="Tap to cancel and get the points back"><span data-training-timer="${t.id}">${formatDuration(job.completesAt - this.ctx.game.clock())}</span></button>`
        : maxed
        ? `<button class="training-box training-cost" disabled aria-label="${t.name} is fully trained">Max</button>`
        : `<button class="training-box training-cost" data-train="${t.id}" ${affordable && !full ? "" : "disabled"} aria-label="Train ${t.name} to ${shown(next)} for ${price}, taking ${takes}" title="${full ? "Every training slot is busy" : `Takes ${takes}`}">${price}</button>`;
      const ranks = save.training[t.id];
      const reset = `<button class="training-reset" data-reset="${t.id}" ${ranks ? "" : "disabled"} aria-label="Reset ${t.name}" title="${ranks ? `Reset ${t.name} for ${TRAINING_RESET_GEMS} Gems` : `${t.name} has no ranks to reset`}">${uiSprite("undo")}</button>`;
      const takesText = maxed ? "" : ` · takes ${takes}`;
      return `<div class="training-row${job ? " active" : ""}" role="listitem" data-training-row="${t.id}"><span class="training-label">${t.name}<small>+${step} a rank${most}${takesText}</small></span><span class="training-box">${shown(now)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(next)}</span>${buy}${reset}</div>`;
    };
    // Each group's rows, leaving out any whose upgrade isn't owned yet.
    const rows = (Object.entries(TRAINING_GROUPS) as [keyof typeof TRAINING_GROUPS, string][]).map(([group, name]) => {
      const open = TRAINING.filter(t => t.group === group && trainingOpen(t, save.upgrades));
      return open.length ? `<h4 class="training-group">${name}</h4>${open.map(row).join("")}` : "";
    }).join("");
    return `<section class="training"><canvas class="training-particles" aria-hidden="true"></canvas><header class="tree-heading"><h3>Training</h3></header>
      <p class="training-points">Training points: <b id="training-points">${points.left}</b> <small>· ${TRAINING_PER_LEVEL} each level · every rank grows as you level up</small></p>
      <p class="training-points training-slots">Training slots: <b id="training-slots">${save.trainingJobs.length} / ${slots}</b> <small>· each rank trained takes 50% longer than the last</small></p>
      <div class="training-table" role="list" aria-label="Stat training">${rows}</div></section>`;
  }

  /** Once a second while the page shows: the Archives' countdowns, or the
   * whole page once research completes (a tab's count changes). */
  archivesTick(completed: boolean) {
    if (this.tree === "archives") this.archives.tick(completed);
    else if (completed) this.render();
    else if (this.tree === "training") this.tickTraining();
  }

  /** Counts the timers beside the ranks in training down. */
  private tickTraining() {
    const now = this.ctx.game.clock();
    for (const job of this.ctx.game.save.trainingJobs) {
      const span = document.querySelector<HTMLElement>(`[data-training-timer="${job.id}"]`);
      if (span) span.textContent = formatDuration(job.completesAt - now);
    }
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
    return !!tree.gate && !this.ctx.game.save.upgrades[tree.gate];
  }

  private nodeHtml(n: Tree["nodes"][number]) {
    const upgrades = this.ctx.game.save.upgrades;
    const skill = UPGRADES.find(u => u.id === n.id)!;
    const rank = upgrades[n.id];
    const available = skillAvailable(n.id, upgrades);
    const chosen = n.id === this.skill && this.tooltipVisible;
    const unlocks = this.current().unlocks;
    const state = unlocks ? (rank ? ", unlocked" : "") : `, ${rank} of ${skill.max}`;
    return `<button class="skill-node ${rank ? "owned" : ""} ${available ? "available" : "locked"} ${chosen ? "chosen" : ""}" data-skill="${n.id}" style="left:${n.x}%;top:${n.y}%" aria-label="${skill.name}${state}${available ? "" : ", locked"}" aria-pressed="${chosen}"><span class="node-icon">${skillSprite(n.id)}</span><span class="node-name">${skill.name}</span>${unlocks ? "" : `<small>${rank} / ${skill.max}</small>`}</button>`;
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

  private tapSkill(id: UpgradeId) {
    if (!(this.skill === id && this.tooltipVisible)) {
      this.skill = id;
      this.tooltipVisible = true;
      this.render();
      return;
    }
    const { canBuy, level } = this.purchase(id);
    if (canBuy) {
      const game = this.ctx.game;
      game.buy(id);
      const bought = game.save.upgrades[id] > level, card = upgradeCard(id);
      if (bought && !game.save.settings.reduceMotion) {
        // The first rank unlocks the node: it shines as well as bursting.
        const node = mapNodes(this.current()).find(n => n.id === id)!;
        if (level === 0) this.particles.unlock(node);
        else this.particles.purchase(node);
      }
      this.ctx.update();
      if (bought && card) revealCard(card, game.save.settings.reduceMotion);
    }
    this.render();
  }

  private tooltipHtml(id: UpgradeId): string {
    const node = this.current().nodes.find(n => n.id === id)!;
    const { u, level, price, balance, locked, maxed, available, affordable, canBuy } = this.purchase(id);
    const requirements = node.requires.filter(rid => !this.ctx.game.save.upgrades[rid]).map(rid => UPGRADES.find(u => u.id === rid)!.name);
    const currency = this.current().currency === "inspiration" ? "Inspiration" : "Courage";
    const unlocks = this.current().unlocks;
    let hint: string;
    if (locked) hint = "Unlock this tree to learn its skills.";
    else if (maxed) hint = unlocks ? "Unlocked." : "Mastered.";
    else if (requirements.length) hint = `Requires: ${requirements.join(" + ")}${unlocks ? "" : " (one rank each)"}.`;
    else if (!available) hint = "Locked.";
    else if (affordable) hint = "Tap again to purchase.";
    else hint = "";
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
