/** A card's upgrade tree, shown in place of the Deck page until closed: a
 * header with the card, its level and XP, the card points left and a
 * respec for Gems; the tree, either the living graph of its upgrades
 * (`upgrade-graph.ts`) or a list of them, with a ? button saying how it
 * works; and, once an upgrade is chosen, its details, whose Buy button
 * spends a point on it (as does choosing it again) and whose ? button
 * says the rest of it.
 * Spending happens through the game's `cardTrees` desk, in the forest only.
 * Arrow keys move between the graph's upgrades (up the tree, down toward
 * the card, and across to its neighbours), and each change is announced.
 * Opened by the card points lesson, it chooses an upgrade that can take a
 * point, points at its Spend button, and holds Back until a point is spent. */
import { CARDS, type CardId } from "../cards/cards.ts";
import { MAX_CARD_LEVEL } from "../cards/levels.ts";
import { CARD_TREES, cardMaxLevel, levelIn, nodeCap, nodeLevel, pointsOf, RESPEC_GEMS, treeNode } from "../cards/trees.ts";
import type { TreeRefusal } from "../game/card-tree-desk.ts";
import type { AppContext } from "./app.ts";
import { askForGems, showHelp } from "./dialogs.ts";
import { cardArt, gemIcon, POINTER_SVG } from "./dom.ts";
import { replay, sparksOver } from "./flourish.ts";
import { cardTreeCardHtml, cardTreeGraph, cardTreeHelpHtml, cardTreeListHtml, cardTreeNodeHelpHtml, nodeName, ROOT, type TreeLevels } from "./card-tree-view.ts";
import { UpgradeGraph } from "./upgrade-graph.ts";

/** How the tree is shown: the graph or the list (kept while the game is
 * open; the graph at first). */
type View = "tree" | "list";
let lastView: View | null = null;

/** Why a point can't go on a node, in words. */
function refusalText(card: CardId, id: string, refusal: TreeRefusal): string {
  if (refusal === "inside") return "Points are spent in the forest: a climb keeps the tree it went in with.";
  if (refusal === "points") return "No card points left: the card earns one each level, by being used in climbs.";
  if (refusal === "sealed") return "Sealed: a card buy opens it. Buy cards on the Deck page.";
  if (refusal === "locked") {
    const after = treeNode(card, id)?.after, parent = after ? treeNode(card, after) : undefined;
    return parent ? `Fill ${nodeName(card, parent)} first.` : "Locked.";
  }
  return "";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One card's tree, in `host` (the Deck page) until closed (`onClose` then
 * runs); `teach`, given by the card points lesson, runs once the first
 * point is spent. */
export class CardTreePanel {
  private readonly el: HTMLElement;
  private graph: UpgradeGraph | null = null;
  private picked = ROOT;
  private view: View = lastView ?? "tree";

  constructor(private readonly ctx: AppContext, private readonly card: CardId, private readonly host: HTMLElement, private readonly onClose?: () => void, private teach?: () => void) {
    const el = (this.el = document.createElement("div"));
    el.className = `card-tree${ctx.game.save.settings.reduceMotion ? "" : " opening"}`;
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", `Upgrade tree: ${CARDS[card].name}`);
    el.innerHTML = `<header class="ct-head">
        <button type="button" class="ct-back" data-ct-close aria-label="Back to the Deck">‹ Deck</button>
        <span class="ct-card" aria-hidden="true">${cardArt(card, CARDS[card].name)}</span>
        <div class="ct-id"><h2>${CARDS[card].name}</h2><div class="ct-xp"></div></div>
        <div class="ct-points"><span class="ct-left"></span><button type="button" class="ug-respec" data-ct-respec></button></div>
      </header>
      <div class="ct-bar-row">
        <button type="button" class="ct-switch" role="switch" data-ct-switch aria-label="Show the upgrades as a list">
          <span>Tree</span><i class="ct-switch-track" aria-hidden="true"><i></i></i><span>List</span>
        </button>
        <ul class="ct-legend" aria-label="Key">
          <li class="owned">Full</li><li class="next">Available</li><li class="locked">Locked</li>
        </ul>
        <button type="button" class="ct-help" data-ct-help aria-label="How the upgrade tree works" title="How the upgrade tree works">?</button>
      </div>
      <div class="ct-body">
        <div class="ct-main"></div>
        <aside class="ug-card" aria-label="Upgrade details"></aside>
      </div>
      <p class="ct-status" role="status" aria-live="polite"></p>`;
    host.replaceChildren(el);
    host.classList.add("tree-open");
    host.scrollTop = 0;
    el.addEventListener("click", this.click);
    el.addEventListener("keydown", this.keys);
    document.addEventListener("keydown", this.escape, true);
    // The lesson starts on the first upgrade that can take a point.
    if (teach) this.picked = (CARD_TREES[card] ?? []).find((n) => !ctx.game.cardTrees.raiseRefusal(card, n.id))?.id ?? ROOT;
    this.render();
    el.querySelector<HTMLElement>(this.view === "tree" ? `.ug-node[data-node="${ROOT}"]` : "[data-ct-pick]")?.focus({ preventScroll: true });
    // The lesson's hand may sit below the tree, out of view on a short screen.
    if (teach) el.querySelector(".ct-lesson-pointer")?.closest("button")?.scrollIntoView({ block: "nearest" });
  }

  /** Back to the Deck page (`quiet`: without running `onClose`, as when the page is left). */
  close(quiet = false) {
    this.graph?.destroy();
    this.graph = null;
    document.removeEventListener("keydown", this.escape, true);
    this.el.remove();
    this.host.classList.remove("tree-open");
    if (!quiet) this.onClose?.();
  }

  private escape = (e: KeyboardEvent) => {
    // The shared dialog (a respec's confirm) takes Escape first.
    if (e.key !== "Escape" || this.ctx.modal.open || !this.el.isConnected || this.teach) return;
    e.preventDefault();
    this.close();
  };

  private click = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-ct-close]")) return this.teach ? undefined : this.close();
    if (t.closest("[data-ct-respec]")) return this.respec();
    if (t.closest("[data-ct-help]")) return showHelp(this.ctx, "UPGRADE TREE", CARDS[this.card].name, cardTreeHelpHtml(this.card, this.ctx.game.cardTrees.pointsLeft(this.card)));
    if (t.closest("[data-ct-info]")) return this.info();
    if (t.closest("[data-ct-switch]")) return this.show(this.view === "tree" ? "list" : "tree");
    const raise = t.closest<HTMLElement>("[data-ct-raise]");
    if (raise) return this.raise(raise.dataset.ctRaise || this.picked);
    const pick = t.closest<HTMLElement>("[data-ct-pick]")?.dataset.ctPick;
    if (pick) return this.pick(pick);
  };

  /** Arrow keys on a graph node: up the tree to its first upgrade, down
   * toward the card, left and right to its neighbours. */
  private keys = (e: KeyboardEvent) => {
    const at = (e.target as HTMLElement).closest<HTMLElement>(".ug-node")?.dataset.node;
    if (!at || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const nodes = CARD_TREES[this.card] ?? [], parentOf = (id: string) => (id === ROOT ? undefined : treeNode(this.card, id)?.after ?? ROOT);
    const children = (id: string) => nodes.filter((n) => (n.after ?? ROOT) === id).map((n) => n.id);
    let to: string | undefined;
    if (e.key === "ArrowUp") to = children(at)[0];
    else if (e.key === "ArrowDown") to = parentOf(at);
    else {
      const parent = parentOf(at);
      if (parent === undefined) return;
      const row = children(parent), i = row.indexOf(at) + (e.key === "ArrowRight" ? 1 : -1);
      to = row[(i + row.length) % row.length];
    }
    e.preventDefault();
    if (!to) return;
    this.pick(to);
    this.graph?.reveal(to);
    this.el.querySelector<HTMLElement>(`.ug-node[data-node="${to}"]`)?.focus({ preventScroll: true });
  };

  private show(view: View) {
    if (view === this.view) return;
    this.view = lastView = view;
    this.render();
    this.el.querySelector<HTMLElement>("[data-ct-switch]")?.focus({ preventScroll: true });
  }

  /** Lets go of the upgrade chosen: a press on the tree away from every
   * upgrade, which hides the details. */
  private unpick() {
    if (this.picked === ROOT) return;
    this.picked = ROOT;
    this.render();
  }

  /** Chooses upgrade `id`; choosing the one already chosen spends a point on it. */
  private pick(id: string) {
    if (id === this.picked && id !== ROOT && this.view === "tree") return this.raise(id);
    this.picked = id;
    this.render();
  }

  /** The rest of the upgrade chosen, behind its details' ? button: with no
   * card points left (and room for a level), that first. */
  private info() {
    const desk = this.ctx.game.cardTrees, node = treeNode(this.card, this.picked);
    if (!node) return;
    const none = !desk.pointsLeft(this.card) && desk.raiseRefusal(this.card, this.picked) !== "maxed";
    showHelp(this.ctx, "UPGRADE", nodeName(this.card, node), cardTreeNodeHelpHtml(this.card, this.levels, this.picked, none ? refusalText(this.card, this.picked, "points") : null));
  }

  private say(text: string) {
    this.el.querySelector(".ct-status")!.textContent = text;
  }

  /** Spends a point on upgrade `id`. */
  private raise(id: string) {
    const { game } = this.ctx, refusal = game.cardTrees.raise(this.card, id);
    if (refusal) {
      const words = refusal === "maxed" ? `${nodeName(this.card, treeNode(this.card, id)!)} is full: card buys open more levels.` : refusalText(this.card, id, refusal);
      if (words) this.say(words);
      return;
    }
    this.ctx.save();
    this.picked = id;
    this.render();
    const node = treeNode(this.card, id)!, level = nodeLevel(game.save.cardTrees, this.card, id);
    this.say(`${nodeName(this.card, node)}: level ${level} of ${nodeCap(game.save.cardBuys.opened, this.card, node)}. ${plural(game.cardTrees.pointsLeft(this.card), "point")} left.`);
    const at = this.el.querySelector(this.view === "tree" ? `.ug-node[data-node="${id}"]` : `.ct-row.picked`);
    if (!game.save.settings.reduceMotion) replay(at, "bought");
    sparksOver(at, "gold");
    const taught = this.teach;
    if (!taught) return;
    this.teach = undefined;
    this.lesson();
    taught();
  }

  /** Asks before respeccing the card for Gems: every point comes back. */
  private respec() {
    const { game } = this.ctx, refusal = game.cardTrees.respecRefusal(this.card);
    if (refusal === "short") return askForGems(this.ctx);
    if (refusal) return;
    const price = game.free ? "free" : `${gemIcon()} <b>${RESPEC_GEMS}</b>`;
    this.ctx.confirm(
      {
        title: `Respec ${CARDS[this.card].name}?`,
        body: `Every card point spent on its tree comes back, to be spent again${game.free ? "" : ` for ${gemIcon()} <b>${RESPEC_GEMS}</b>`}.`,
        label: `Respec · ${price}`,
        cancel: "Cancel",
      },
      () => {
        if (game.cardTrees.respec(this.card)) return;
        this.ctx.save();
        this.ctx.update();
        this.picked = ROOT;
        this.render();
        this.say(`Respecced: ${plural(game.cardTrees.pointsLeft(this.card), "point")} to spend.`);
        sparksOver(this.el.querySelector(".ct-points"), "gold");
      },
    );
  }

  /** Why upgrade `id` can't take a point now, in words (null when it can, or is full). */
  private why = (id: string) => {
    const refusal = this.ctx.game.cardTrees.raiseRefusal(this.card, id);
    return refusal && refusal !== "maxed" ? refusalText(this.card, id, refusal) : null;
  };

  /** The levels spent on the card's tree and those card buys opened on it. */
  private get levels(): TreeLevels {
    const save = this.ctx.game.save;
    return { levels: save.cardTrees, opened: save.cardBuys.opened };
  }

  private render() {
    this.renderTree();
    this.lesson();
  }

  /** The card points lesson's part of the panel while it waits: its note
   * under the header, Back held, and the pointing hand on the button that
   * spends a point on the upgrade chosen. */
  private lesson() {
    const teaching = !!this.teach;
    this.el.classList.toggle("teaching", teaching);
    this.el.querySelector<HTMLButtonElement>("[data-ct-close]")!.disabled = teaching;
    this.el.querySelector(".ct-lesson-pointer")?.remove();
    const tip = this.el.querySelector(".ct-tip");
    if (!teaching) return tip?.remove();
    if (!tip) this.el.querySelector(".ct-head")!.insertAdjacentHTML("afterend", `<div class="deck-tip ct-tip" role="status"><b>Spend a card point</b><p>Choose an upgrade on the tree, then buy it with a card point to unlock its bonus.</p></div>`);
    const spend = this.el.querySelector(this.view === "tree" ? ".ug-card [data-ct-raise]:not(:disabled)" : ".ct-row.picked [data-ct-raise]:not(:disabled)");
    spend?.insertAdjacentHTML("beforeend", `<span class="deck-pointer ct-lesson-pointer${this.ctx.game.save.settings.reduceMotion ? " still" : ""}" aria-hidden="true">${POINTER_SVG}</span>`);
  }

  private renderTree() {
    const { game } = this.ctx, save = game.save, desk = game.cardTrees;
    const left = desk.pointsLeft(this.card), total = pointsOf(save, this.card), spent = desk.pointsSpent(this.card);
    const { level, into, needed, capped } = levelIn(save, this.card), cap = cardMaxLevel(save.cardBuys.opened, this.card), max = level >= MAX_CARD_LEVEL;
    const shown = Math.min(into, needed);
    this.el.querySelector(".ct-xp")!.innerHTML = `<b>Level ${level} / ${cap}</b>`
      + `<span class="ct-xp-bar" role="progressbar" aria-label="XP toward level ${level + 1}" aria-valuemin="0" aria-valuemax="${needed || 1}" aria-valuenow="${max ? needed || 1 : shown}"><i style="width:${max ? 100 : (shown / needed) * 100}%"></i></span>`
      + `<small${capped && !max ? ` title="Max level: buy cards to raise it"` : ""}>${max ? "Max level" : `${shown.toLocaleString("en-US")} / ${needed.toLocaleString("en-US")} XP${capped ? " · max" : ""}`}</small>`;
    const points = this.el.querySelector(".ct-left")!;
    points.classList.toggle("some", left > 0);
    points.innerHTML = `<b>${left}</b><small>${left === 1 ? "point" : "points"} · ${spent}/${total} spent</small>`;
    const respec = this.el.querySelector<HTMLButtonElement>("[data-ct-respec]")!;
    const respecRefusal = desk.respecRefusal(this.card);
    // A Gem price never looks unavailable for lack of Gems: only its price turns red.
    respec.disabled = respecRefusal === "inside" || respecRefusal === "none";
    respec.classList.toggle("short", respecRefusal === "short");
    respec.innerHTML = `Respec · ${game.free ? "free" : `${gemIcon()} <b>${RESPEC_GEMS}</b>`}`;
    respec.setAttribute("aria-label", game.free ? "Respec, free" : `Respec for ${RESPEC_GEMS} Gems`);
    respec.title = respecRefusal === "none" ? "Nothing spent yet" : respecRefusal === "inside" ? "Respec in the forest" : `Get all ${spent} points back to spend again`;
    this.el.querySelector("[data-ct-switch]")!.setAttribute("aria-checked", String(this.view === "list"));
    this.el.classList.toggle("list-view", this.view === "list");
    this.el.querySelector(".ct-legend")!.toggleAttribute("hidden", this.view === "list");
    // No points left is said behind the details' ? button, not in them.
    const raw = this.picked === ROOT ? null : desk.raiseRefusal(this.card, this.picked), tree = this.levels;
    const refusal = raw && raw !== "maxed" && raw !== "points" ? refusalText(this.card, this.picked, raw) : null;
    // The details show only once an upgrade is chosen: the root's are behind the ? button.
    const details = this.el.querySelector<HTMLElement>(".ug-card")!;
    details.innerHTML = cardTreeCardHtml(this.card, tree, this.picked, left, refusal);
    details.hidden = !details.innerHTML;
    const main = this.el.querySelector<HTMLElement>(".ct-main")!;
    if (this.view === "list") {
      this.graph?.destroy();
      this.graph = null;
      // Redrawn in place: the list keeps where it was scrolled to, and the
      // keyboard where it was.
      const top = main.scrollTop, focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-ct-pick], [data-ct-raise]");
      const again = focused && main.contains(focused) ? (focused.dataset.ctPick ? `[data-ct-pick="${focused.dataset.ctPick}"]` : `[data-ct-raise="${focused.dataset.ctRaise}"]`) : null;
      main.innerHTML = cardTreeListHtml(this.card, tree, this.picked, this.why);
      main.scrollTop = top;
      if (again) (main.querySelector<HTMLElement>(`${again}:not(:disabled)`) ?? main.querySelector<HTMLElement>(`[data-ct-pick="${this.picked}"]`))?.focus({ preventScroll: true });
      return;
    }
    if (!this.graph) {
      main.innerHTML = `<div class="ug-host" role="group" aria-label="Upgrades: the card at the bottom, each track growing up from it. Arrow keys move between them; Enter chooses one, and again spends a point. A press away from every upgrade lets go of the one chosen."></div><small class="ct-hint" aria-hidden="true">Drag to pan · pinch or scroll to zoom</small>`;
      this.graph = new UpgradeGraph(main.querySelector<HTMLElement>(".ug-host")!, {
        reduceMotion: () => this.ctx.game.save.settings.reduceMotion,
        onPick: (id) => this.pick(id),
        onClear: () => this.unpick(),
        gap: { x: 76, y: 92 },
        minScale: 0.8,
        maxScale: 1.4,
      });
    }
    this.graph.set(cardTreeGraph(this.card, tree, this.why), this.picked);
  }
}
