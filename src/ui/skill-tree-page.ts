import { helpButton, showHelp } from "./dialogs.ts";
import { play } from "../sound.ts";
import { upgradeCards } from "../cards/cards.ts";
import { revealCard } from "./card-reveal.ts";
import { UPGRADES, cost, type UpgradeId } from "../progression/upgrades.ts";
import { TREES, columnGap, mapNodes, skillAvailable, skillHidden, treeHeight, treeOpen, type TreeId } from "../progression/skill-trees.ts";
import { upgradeText } from "../progression/loadout.ts";
import { goalUnlocked, UNLOCK_NAMES } from "../goals.ts";
import { TreeParticles } from "../render/effects/tree-particles.ts";
import type { AppContext } from "./app.ts";
import { clamp, el, POINTER_SVG, skillSprite, uiSprite, type UiSprite } from "./dom.ts";
import { bindPanZoom, type View } from "./pan-zoom.ts";
import { currencyHelp } from "./currency-help.ts";
import { heldAmount } from "./currencies-dialog.ts";
import { PROVISIONS_NOTE } from "./board-lesson.ts";

type Tree = (typeof TREES)[number];

const TREE_ICONS: Record<string, UiSprite> = {
  inspiration: "inspiration", breakthrough: "breakthrough", legacy: "tower", wisdom: "settings",
};
/** What a skill's tooltip says can be done with it now. */
function tooltipHint(p: { locked: boolean; maxed: boolean; available: boolean; affordable: boolean }, requirements: string[], unlocks: boolean) {
  if (p.locked) return "Unlock this tree to learn its skills.";
  if (p.maxed) return unlocks ? "Unlocked." : "Mastered.";
  if (requirements.length) return `Requires: ${requirements.join(" + ")}${unlocks ? "" : " (one rank each)"}.`;
  if (!p.available) return "Locked.";
  return p.affordable ? "Tap again to purchase." : "";
}

/** The Inspiration tree's lessons on a new game's first skills: the note
 * while one waits to be bought (`Game.introSkill`, a hand on its node), and
 * once bought (`Game.introBought`), what its cards do and the way back to
 * the entrance (the hand on the Tower tab is `board-lesson.ts`'s); then, on
 * the Inspiration and Breakthrough trees (where provisions are opened), once a
 * first provision is open, the way to the Gear tab (its hand too). */
function introNote(game: AppContext["game"], tree: TreeId) {
  const intro = tree === "inspiration", buy = intro ? game.introSkill : null, bought = intro ? game.introBought : null;
  const lesson = buy === "cardDoorKey" ? { title: "Unlock Door & Key.", text: `Press Door & Key, then press it again to unlock it for ${cost(buy, 0)} Inspiration.` }
    : buy === "cardEnemy" ? { title: "Unlock Enemy.", text: `Press Enemy, then press it again to unlock it for ${cost(buy, 0)} Inspiration.` }
    : bought === "cardDoorKey" ? { title: "Door and Key join your hand.", text: "During a climb, press them to collect keys and open doors. Each door costs 1 key; with no key, some HP can break down a Wooden Door. Other items in the tower become accessible later on, as you unlock their cards. Press the Tower button to return to the entrance." }
    : bought === "cardEnemy" ? { title: "Enemy joins your hand.", text: "During a climb, press it to fight the closest enemy. Press the Tower button to return to the entrance." }
    : game.provisionsLesson && !game.introBought && PRICED_TREES.includes(tree) ? PROVISIONS_NOTE
    : null;
  return lesson ? `<div class="tree-lesson" role="status"><b>${lesson.title}</b><p>${lesson.text}</p></div>` : "";
}

/** The trees whose buyable skills show their price on a corner badge. */
const PRICED_TREES: TreeId[] = ["inspiration", "breakthrough"];

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
    // The tab row shows even for Inspiration alone, since its tab reads the points held.
    this.renderTree(`<div class="tree-tabs page-tabs" role="group" aria-label="Skill trees">${this.tabsHtml()}</div>`);
    // Showing the Inspiration or Breakthrough tree clears the dot a run's currency put on it.
    if ((this.tree === "inspiration" || this.tree === "breakthrough") && this.ctx.game.notices.shown(this.tree)) this.ctx.update();
  }

  /** A tree's tab shows once the tree is open; Dev mode shows them all. */
  private shown(tab: TreeId) {
    const save = this.ctx.game.save;
    return save.settings.devMode || treeOpen(TREES.find(t => t.id === tab)!, save.upgrades);
  }

  /** The tab buttons, one a tree: Inspiration's and Breakthrough's reading the
   * points held under their name, as Training's tab does, and wearing a dot
   * while a run's currency waits to be spent there. */
  private tabsHtml() {
    const game = this.ctx.game, held = { inspiration: game.save.tower.inspiration, breakthrough: game.save.breakthrough };
    return TREES.filter(t => this.shown(t.id)).map(t => {
      const priced = t.id === "inspiration" || t.id === "breakthrough";
      const points = priced ? `<small>${heldAmount(game, held[t.id as "inspiration" | "breakthrough"])} POINTS</small>` : "";
      return `<button data-tree="${t.id}" aria-pressed="${t.id === this.tree}"${priced && this.tree !== t.id && game.notices.waiting(t.id as "inspiration" | "breakthrough") ? ` class="notify"` : ""}><span>${uiSprite(TREE_ICONS[t.id] ?? "tower")}</span>${t.name}${points}</button>`;
    }).join("");
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
    const nodes = mapNodes(tree), shown = this.visible(nodes);
    // A tree taller than one view scrolls, with a margin above its first
    // row and below its last so no node is cut off on a short screen, and
    // never shorter than its rows need to keep their nodes apart.
    const tall = treeHeight(tree) !== 100;
    el("upgrades").innerHTML = `${tabs}
      <section class="skill-tree ${tree.id}"><header class="tree-heading"><h3>${tree.name} skill tree${this.helpButton(tree)}</h3></header>
      ${this.lockHtml(tree)}${introNote(this.ctx.game, tree.id)}
      <div class="tree-viewport" id="tree-viewport" style="--column-gap:${columnGap(tree)}"><div class="tree-map${tall ? " tall" : ""}" id="tree-map" style="${tall ? `--tree-height:${treeHeight(tree)}%;--tree-rows:${treeHeight(tree)};` : ""}transform:translate(${view.x}px,${view.y}px) scale(${view.scale})"><div class="tree-layer"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${this.linesHtml(nodes)}</svg>
      <canvas class="tree-particles" aria-hidden="true"></canvas>
      ${shown.map(n => this.nodeHtml(n)).join("")}</div></div><div class="inspect-box tree-tooltip" id="tree-tooltip" hidden></div></div></section>`;
    this.bindTabs();
    if (tree.id === "inspiration" || tree.id === "breakthrough") el("tree-help").onclick = () => this.showHelp(tree.id as "inspiration" | "breakthrough");
    bindPanZoom(el("tree-viewport"), el("tree-map"), view, {
      tap: (target) => this.tapped(target),
      pan: () => this.hideTooltip(),
      zoom: () => { if (this.tooltipVisible) this.showTooltip(); },
    });
    if (this.tooltipVisible && shown.some(n => n.id === this.skill)) this.showTooltip();
  }

  /** The ? beside the Inspiration and Breakthrough trees' headings. */
  private helpButton(tree: Tree) {
    return tree.id === "inspiration" || tree.id === "breakthrough" ? helpButton(`How ${tree.name} is earned`) : "";
  }

  /** How the tree's currency is earned. */
  private showHelp(tree: "inspiration" | "breakthrough") {
    const help = currencyHelp(this.ctx.game.save, tree);
    showHelp(this.ctx, "UPGRADES", help.title, help.body);
  }

  /** Why a tree can't be bought from yet, if it can't. */
  private lockHtml(tree: Tree) {
    if (tree.gate === null) return `<p class="tree-lock">What opens this tree is still to come.</p>`;
    if (!this.locked(tree)) return "";
    return `<p class="tree-lock">Unlock ${UPGRADES.find(u => u.id === tree.gate)!.name} in the ${tree.id === "breakthrough" ? "Inspiration" : "Breakthrough"} tree.</p>`;
  }

  /** `nodes` less those hidden (`skillHidden`), which aren't drawn at all. */
  private visible(nodes: ReturnType<typeof mapNodes>) {
    const upgrades = this.ctx.game.save.upgrades;
    return nodes.filter(n => !skillHidden(n.id, upgrades));
  }

  /** The lines from each skill to those it requires, lit once owned; a
   * line from a skill shown to one hidden fades away before reaching it,
   * and none is drawn between hidden skills. */
  private linesHtml(nodes: ReturnType<typeof mapNodes>) {
    const upgrades = this.ctx.game.save.upgrades, shown = new Set(this.visible(nodes).map(n => n.id));
    return nodes.flatMap(n => n.requires.map(id => {
      const parent = nodes.find(p => p.id === id);
      if (!parent || !shown.has(id)) return "";
      const line = `x1="${parent.x}" y1="${parent.y}" x2="${n.x}" y2="${n.y}"`;
      if (shown.has(n.id)) return `<line ${line} class="${upgrades[id] ? "lit" : ""}"/>`;
      // The fade is a mask: a gradient along the line, so it fades in every theme's stroke.
      const fade = `fade-${id}-${n.id}`;
      return `<defs><linearGradient id="${fade}-g" gradientUnits="userSpaceOnUse" ${line}><stop offset="0" stop-color="#fff"/><stop offset=".75" stop-color="#fff" stop-opacity="0"/></linearGradient>`
        + `<mask id="${fade}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><rect x="-10" y="-10" width="120" height="120" fill="url(#${fade}-g)"/></mask></defs>`
        + `<line ${line} class="fading${upgrades[id] ? " lit" : ""}" mask="url(#${fade})"/>`;
    })).join("");
  }

  /** Purchase sparkles and node glow on the particle canvas, if showing. */
  drawParticles(time: number) {
    const canvas = document.querySelector<HTMLCanvasElement>(".tree-particles");
    if (!canvas) return;
    const tree = this.current();
    this.particles.draw(canvas, time, {
      tree: tree.id, nodes: this.visible(mapNodes(tree)), selected: this.tooltipVisible ? this.skill : null, reduced: this.ctx.game.save.settings.reduceMotion,
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
    // In the Inspiration and Breakthrough trees, a skill that can be bought wears
    // its next rank's price on its corner, so each path's cost shows at a
    // glance.
    const { price, affordable, locked, maxed } = this.purchase(n.id);
    const badge = PRICED_TREES.includes(this.current().id) && available && !locked && !maxed
      ? `<span class="node-cost ${affordable ? "" : "short"}" aria-hidden="true">${price}</span>` : "";
    const game = this.ctx.game, pointer = n.id === game.introSkill
      ? `<span class="tree-pointer${game.save.settings.reduceMotion ? " still" : ""}" aria-hidden="true">${POINTER_SVG}</span>` : "";
    return `<button class="skill-node ${rank ? "owned" : ""} ${available ? "available" : "locked"} ${chosen ? "chosen" : ""}" data-skill="${n.id}" style="left:${n.x}%;top:${n.y}%" aria-label="${skill.name}${state}${available ? "" : ", locked"}${badge ? `, costs ${price}` : ""}" aria-pressed="${chosen}"><span class="node-icon">${skillSprite(n.id)}${badge}${pointer}</span><span class="node-label"><span class="node-name">${skill.name}</span>${unlocks ? "" : `<small>${rank} / ${skill.max}</small>`}</span></button>`;
  }

  /** Where buying `id` stands: its price, the balance, and whether it can
   * be bought right now. */
  private purchase(id: UpgradeId) {
    const tree = this.current(), save = this.ctx.game.save;
    const u = UPGRADES.find(u => u.id === id)!;
    const level = save.upgrades[id];
    const price = cost(id, level);
    const balance = tree.currency === "inspiration" ? save.tower.inspiration : save.breakthrough;
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
    game.skills.buy(id);
    const bought = game.save.upgrades[id] > level;
    if (bought) this.celebrate(id, level);
    this.ctx.update();
    // Door & Key reveals its two cards one after the other.
    if (bought) for (const card of upgradeCards(id).reverse()) revealCard(card, game.cardText(card), game.save.settings.reduceMotion);
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
   * which its rays and burst shine from (also the node's own point, where the
   * tree's lines meet, but measured, so it holds under any zoom). */
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
    const requirements = node.requires.filter(rid => !this.ctx.game.save.upgrades[rid]).map(rid => `<span class="required">${UPGRADES.find(u => u.id === rid)!.name}</span>`);
    const currency = this.current().currency === "inspiration" ? "Inspiration" : "Breakthrough";
    const unlocks = this.current().unlocks;
    // Short of Inspiration for a skill it could otherwise buy, it says how much more, and where it comes from.
    const need = price - balance, shortInspiration = !affordable && !locked && !maxed && available && !requirements.length && currency === "Inspiration";
    const hint = shortInspiration ? `You need ${need} more Inspiration point${need === 1 ? "" : "s"}. Climb higher in the tower to get more.`
      : tooltipHint({ locked, maxed, available, affordable }, requirements, !!unlocks);
    // Short of the price, the cost line says how much more it takes.
    const short = affordable || shortInspiration ? "" : ` (need ${need})`;
    // Critical Prediction shows nothing until the Goals open damage predictions.
    const goal = id === "critPrediction" && !goalUnlocked(this.ctx.game.save, "damagePrediction") ? `<div>Predictions show once ${UNLOCK_NAMES.damagePrediction} is claimed on the Goals page.</div>` : "";
    return `<b style="color:var(--tree-color)">${u.name}</b>${unlocks ? "" : `<div>${level} / ${u.max} ranks</div>`}<div>${upgradeText(u.id)}.</div>${goal}${hint ? `<div class="${canBuy ? "safe" : ""}">${hint}</div>` : ""}${!maxed && !locked ? `<div>Cost: ${price} ${currency}${short}</div>` : ""}`;
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
