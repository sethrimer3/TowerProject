import { UPGRADES, cost, type UpgradeId } from "../config.ts";
import { TREES, skillAvailable, type TreeId } from "../skill-trees.ts";
import { TreeParticles } from "../tree-particles.ts";
import type { AppContext } from "./app.ts";
import { clamp, el, skillSprite, uiSprite, type UiSprite } from "./dom.ts";
import { bindPanZoom, type View } from "./pan-zoom.ts";

type Tree = (typeof TREES)[number];

const TREE_ICONS: Record<string, UiSprite> = {
  inspiration: "upgrades", courage: "automove", legacy: "tower", wisdom: "settings",
};

/** The Upgrades page: one skill tree at a time, pannable and zoomable. Tap a
 * node to see its tooltip; tap it again to buy a rank. */
export class SkillTreePage {
  private tree: TreeId = "inspiration";
  private skill: UpgradeId = "shardHp";
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
    const upgrades = this.ctx.game.save.upgrades;
    const tree = this.current();
    const view = this.view(tree.id);
    const tabs = TREES.map(t => `<button data-tree="${t.id}" aria-pressed="${t.id === tree.id}"><span>${uiSprite(TREE_ICONS[t.id] ?? "defend")}</span>${t.name}<small>${t.gate && !upgrades[t.gate] ? "LOCKED" : "UNLOCKED"}</small></button>`).join("");
    const lock = this.locked(tree)
      ? `<p class="tree-lock">Unlock ${UPGRADES.find(u => u.id === tree.gate)!.name} in the ${tree.id === "courage" ? "Inspiration" : "Courage"} tree.</p>`
      : "";
    const lines = tree.nodes.flatMap(n => n.requires.map(id => {
      const parent = tree.nodes.find(p => p.id === id);
      return parent ? `<line x1="${parent.x}" y1="${parent.y}" x2="${n.x}" y2="${n.y}" class="${upgrades[id] ? "lit" : ""}"/>` : "";
    })).join("");
    el("upgrades").innerHTML = `<div class="tree-tabs" role="group" aria-label="Skill trees">${tabs}</div>
      <section class="skill-tree ${tree.id}"><header class="tree-heading"><h3>${tree.name} skill tree</h3></header>
      ${lock}
      <div class="tree-viewport" id="tree-viewport"><div class="tree-map" id="tree-map" style="transform:translate(${view.x}px,${view.y}px) scale(${view.scale})"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      <canvas class="tree-particles" aria-hidden="true"></canvas>
      ${tree.nodes.map(n => this.nodeHtml(n)).join("")}</div><div class="inspect-box tree-tooltip" id="tree-tooltip" hidden></div></div></section>`;
    document.querySelectorAll<HTMLButtonElement>("[data-tree]").forEach(b => b.onclick = () => {
      this.tree = b.dataset.tree as TreeId;
      this.tooltipVisible = false;
      this.render();
    });
    bindPanZoom(el("tree-viewport"), el("tree-map"), view, {
      tap: (target) => this.tapped(target),
      pan: () => this.hideTooltip(),
      zoom: () => { if (this.tooltipVisible) this.showTooltip(); },
    });
    if (this.tooltipVisible && tree.nodes.some(n => n.id === this.skill)) this.showTooltip();
  }

  /** Purchase sparkles and node glow on the particle canvas, if showing. */
  drawParticles(time: number) {
    const canvas = document.querySelector<HTMLCanvasElement>(".tree-particles");
    const tree = this.current();
    if (canvas) this.particles.draw(canvas, time, tree.id, tree.nodes, this.tooltipVisible ? this.skill : null, this.ctx.game.save.settings.reduceMotion);
  }

  private current(): Tree {
    return TREES.find(t => t.id === this.tree)!;
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
    return `<button class="skill-node ${rank ? "owned" : ""} ${available ? "available" : "locked"} ${chosen ? "chosen" : ""}" data-skill="${n.id}" style="left:${n.x}%;top:${n.y}%" aria-label="${skill.name}, ${rank} of ${skill.max}${available ? "" : ", locked"}" aria-pressed="${chosen}"><span class="node-icon">${skillSprite(n.id)}</span><span class="node-name">${skill.name}</span><small>${rank} / ${skill.max}</small></button>`;
  }

  /** Where buying `id` stands: its price, the balance, and whether it can
   * be bought right now. */
  private purchase(id: UpgradeId) {
    const tree = this.current(), save = this.ctx.game.save;
    const u = UPGRADES.find(u => u.id === id)!;
    const level = save.upgrades[id];
    const price = cost(id, level);
    const balance = tree.currency === "shards" ? save.tower.shards : save.delve.essence;
    const locked = this.locked(tree);
    const maxed = level >= u.max;
    const available = skillAvailable(id, save.upgrades);
    return { u, level, price, balance, locked, maxed, available, affordable: balance >= price, canBuy: !locked && !maxed && available && balance >= price };
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
      if (game.save.upgrades[id] > level && !game.save.settings.reduceMotion) this.particles.purchase(this.current().nodes.find(n => n.id === id)!);
      this.ctx.update();
    }
    this.render();
  }

  private tooltipHtml(id: UpgradeId): string {
    const node = this.current().nodes.find(n => n.id === id)!;
    const { u, level, price, balance, locked, maxed, available, canBuy } = this.purchase(id);
    const requirements = node.requires.filter(rid => !this.ctx.game.save.upgrades[rid]).map(rid => UPGRADES.find(u => u.id === rid)!.name);
    const currency = this.current().currency === "shards" ? "Inspiration" : "Courage";
    let hint: string;
    if (locked) hint = "Unlock this tree to learn its skills.";
    else if (maxed) hint = "Mastered.";
    else if (requirements.length) hint = `Requires: ${requirements.join(" + ")} (one rank each).`;
    else if (!available) hint = "Locked.";
    else if (balance < price) hint = `Need ${price} ${currency} · have ${balance}.`;
    else hint = "Tap again to purchase.";
    return `<b style="color:var(--tree-color)">${u.name}</b><div>${level} / ${u.max} ranks</div><div>${u.description}.</div><div class="${canBuy ? "safe" : ""}">${hint}</div>${!maxed && !locked ? `<div>Cost: ${price} ${currency}</div>` : ""}`;
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
