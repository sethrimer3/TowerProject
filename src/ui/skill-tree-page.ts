import { helpButton, showHelp } from "./dialogs.ts";
import { play } from "../sound.ts";
import { upgradeCard } from "../cards.ts";
import { revealCard } from "./card-reveal.ts";
import { UPGRADES, cost, type UpgradeId } from "../config.ts";
import { TREES, columnGap, mapNodes, skillAvailable, treeHeight, treeOpen, type TreeId } from "../skill-trees.ts";
import { upgradeText } from "../loadout.ts";
import { TreeParticles } from "../tree-particles.ts";
import type { AppContext } from "./app.ts";
import { clamp, el, skillSprite, uiSprite, type UiSprite } from "./dom.ts";
import { bindPanZoom, type View } from "./pan-zoom.ts";
import { currencyHelp } from "./currency-help.ts";

type Tree = (typeof TREES)[number];

const TREE_ICONS: Record<string, UiSprite> = {
  inspiration: "upgrades", courage: "automove", legacy: "tower", wisdom: "settings",
};
/** What a skill's tooltip says can be done with it now. */
function tooltipHint(p: { locked: boolean; maxed: boolean; available: boolean; affordable: boolean }, requirements: string[], unlocks: boolean) {
  if (p.locked) return "Unlock this tree to learn its skills.";
  if (p.maxed) return unlocks ? "Unlocked." : "Mastered.";
  if (requirements.length) return `Requires: ${requirements.join(" + ")}${unlocks ? "" : " (one rank each)"}.`;
  if (!p.available) return "Locked.";
  return p.affordable ? "Tap again to purchase." : "";
}

/** The trees whose buyable skills show their price on a corner badge. */
const PRICED_TREES: TreeId[] = ["inspiration", "courage"];

/** The Upgrades page: one skill tree at a time, a tab each (pannable and
 * zoomable; tap a node to see its tooltip, tap it again to buy a rank). */
export class SkillTreePage {
  private tree: TreeId = "inspiration";
  private skill: UpgradeId = "combatStance";
  private tooltipVisible = false;
  private views: Partial<Record<TreeId, View>> = {};
  private particles = new TreeParticles();

  constructor(private ctx: AppContext) {}

  /** Opens on `skill` in `tree` with its tooltip showing, e.g. to point a
   * locked tab or button at the upgrade that unlocks it. */
  focus(tree: TreeId, skill: UpgradeId) {
    this.tree = tree;
    this.skill = skill;
    this.tooltipVisible = true;
  }

  render() {
    if (!this.shown(this.tree)) this.tree = "inspiration";
    // One tree alone needs no tab row.
    const shown = TREES.filter(t => this.shown(t.id)).length;
    this.renderTree(shown > 1 ? `<div class="tree-tabs" role="group" aria-label="Skill trees">${this.tabsHtml()}</div>` : "");
    // Showing the Inspiration or Courage tree clears the dot a run's currency put on it.
    const notices = this.ctx.game.save.treeNotices;
    if ((this.tree === "inspiration" || this.tree === "courage") && notices[this.tree]) {
      notices[this.tree] = false;
      this.ctx.update();
    }
  }

  /** A tree's tab shows once the tree is open; Dev mode shows them all. */
  private shown(tab: TreeId) {
    const save = this.ctx.game.save;
    return save.settings.devMode || treeOpen(TREES.find(t => t.id === tab)!, save.upgrades);
  }

  /** The tab buttons, one a tree: Inspiration's and Courage's wearing a dot
   * while a run's currency waits to be spent there. */
  private tabsHtml() {
    return TREES.filter(t => this.shown(t.id)).map(t =>
      `<button data-tree="${t.id}" aria-pressed="${t.id === this.tree}"${(t.id === "inspiration" || t.id === "courage") && this.tree !== t.id && this.ctx.game.treeWaiting(t.id) ? ` class="notify"` : ""}><span>${uiSprite(TREE_ICONS[t.id] ?? "defend")}</span>${t.name}</button>`).join("");
  }

  private bindTabs() {
    el("upgrades").querySelectorAll<HTMLButtonElement>("[data-tree]").forEach(b => b.onclick = () => {
      this.tree = b.dataset.tree as TreeId;
      this.tooltipVisible = false;
      this.render();
    });
  }

  private renderTree(tabs: string) {
    const tree = this.current();
    const view = this.view(tree.id);
    const nodes = mapNodes(tree);
    // A tree taller than one view scrolls, with a margin above its first
    // row and below its last so no node is cut off on a short screen, and
    // never shorter than its rows need to keep their nodes apart.
    const tall = treeHeight(tree) !== 100;
    el("upgrades").innerHTML = `${tabs}
      <section class="skill-tree ${tree.id}"><header class="tree-heading"><h3>${tree.name} skill tree${this.helpButton(tree)}</h3></header>
      ${this.lockHtml(tree)}
      <div class="tree-viewport" id="tree-viewport" style="--column-gap:${columnGap(tree)}"><div class="tree-map${tall ? " tall" : ""}" id="tree-map" style="${tall ? `--tree-height:${treeHeight(tree)}%;--tree-rows:${treeHeight(tree)};` : ""}transform:translate(${view.x}px,${view.y}px) scale(${view.scale})"><div class="tree-layer"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${this.linesHtml(nodes)}</svg>
      <canvas class="tree-particles" aria-hidden="true"></canvas>
      ${nodes.map(n => this.nodeHtml(n)).join("")}</div></div><div class="inspect-box tree-tooltip" id="tree-tooltip" hidden></div></div></section>`;
    this.bindTabs();
    if (tree.id === "inspiration" || tree.id === "courage") el("tree-help").onclick = () => this.showHelp(tree.id as "inspiration" | "courage");
    bindPanZoom(el("tree-viewport"), el("tree-map"), view, {
      tap: (target) => this.tapped(target),
      pan: () => this.hideTooltip(),
      zoom: () => { if (this.tooltipVisible) this.showTooltip(); },
    });
    if (this.tooltipVisible && tree.nodes.some(n => n.id === this.skill)) this.showTooltip();
  }

  /** The ? beside the Inspiration and Courage trees' headings. */
  private helpButton(tree: Tree) {
    return tree.id === "inspiration" || tree.id === "courage" ? helpButton(`How ${tree.name} is earned`) : "";
  }

  /** How the tree's currency is earned. */
  private showHelp(tree: "inspiration" | "courage") {
    const help = currencyHelp(this.ctx.game.save, tree);
    showHelp(this.ctx, "UPGRADES", help.title, help.body);
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

  /** Purchase sparkles and node glow on the particle canvas, if showing. */
  drawParticles(time: number) {
    const canvas = document.querySelector<HTMLCanvasElement>(".tree-particles");
    if (!canvas) return;
    const tree = this.current();
    this.particles.draw(canvas, time, {
      tree: tree.id, nodes: mapNodes(tree), selected: this.tooltipVisible ? this.skill : null, reduced: this.ctx.game.save.settings.reduceMotion,
    });
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
