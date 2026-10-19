/** A card's upgrade tree, shown in place of the Deck page until closed: a
 * header with the card, its level and XP, the card points left and a
 * respec for Gems; the tree, either the living graph of its upgrades
 * (`upgrade-graph.ts`) or a list of them; and the details of the upgrade
 * chosen, whose button spends a point on it (as does choosing it again).
 * Spending happens through the game's `cardTrees` desk, in the forest only.
 * Arrow keys move between the graph's upgrades (up the tree, down toward
 * the card, and across to its neighbours), and each change is announced. */
import { CARDS, type CardId } from "../cards.ts";
import { cardLevel, cardPoints, MAX_CARD_LEVEL } from "../card-levels.ts";
import { CARD_TREES, nodeLevel, RESPEC_GEMS, treeNode } from "../card-trees.ts";
import type { TreeRefusal } from "../game/card-tree-desk.ts";
import type { AppContext } from "./app.ts";
import { askForGems } from "./dialogs.ts";
import { cardArt, gemIcon } from "./dom.ts";
import { replay, sparksOver } from "./flourish.ts";
import { cardTreeCardHtml, cardTreeGraph, cardTreeListHtml, nodeName, ROOT } from "./card-tree-view.ts";
import { UpgradeGraph } from "./upgrade-graph.ts";

/** How the tree is shown: the graph or the list (kept while the game is
 * open; at first the list on a phone, where the graph would have to be
 * panned to be read, and the graph elsewhere). */
type View = "tree" | "list";
let lastView: View | null = null;

/** Why a point can't go on a node, in words. */
function refusalText(card: CardId, id: string, refusal: TreeRefusal): string {
  if (refusal === "inside") return "Points are spent in the forest: a run keeps the tree it went in with.";
  if (refusal === "points") return "No card points left: the card earns one each level, by being used in runs.";
  if (refusal === "locked") {
    const after = treeNode(card, id)?.after, parent = after ? treeNode(card, after) : undefined;
    return parent ? `Fill ${nodeName(card, parent)} first.` : "Locked.";
  }
  return "";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One card's tree, in `host` (the Deck page) until closed (`onClose` then runs). */
export class CardTreePanel {
  private readonly el: HTMLElement;
  private graph: UpgradeGraph | null = null;
  private picked = ROOT;
  private view: View = lastView ?? (window.matchMedia?.("(max-width: 520px)").matches ? "list" : "tree");

  constructor(private readonly ctx: AppContext, private readonly card: CardId, private readonly host: HTMLElement, private readonly onClose?: () => void) {
    const el = (this.el = document.createElement("div"));
    el.className = `card-tree${ctx.game.save.settings.reduceMotion ? "" : " opening"}`;
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", `Upgrade tree: ${CARDS[card].name}`);
    el.innerHTML = `<header class="ct-head">
        <button type="button" class="ct-back" data-ct-close aria-label="Back to the Deck">‹ Deck</button>
        <span class="ct-card" aria-hidden="true">${cardArt(card, CARDS[card].name)}</span>
        <div class="ct-id"><small>UPGRADE TREE</small><h2>${CARDS[card].name}</h2><div class="ct-xp"></div></div>
        <div class="ct-points"><span class="ct-left"></span><button type="button" class="ug-respec" data-ct-respec></button></div>
      </header>
      <div class="ct-bar-row">
        <div class="ct-views" role="group" aria-label="Show the upgrades as">
          <button type="button" data-ct-view="tree">Tree</button><button type="button" data-ct-view="list">List</button>
        </div>
        <ul class="ct-legend" aria-label="Key">
          <li class="owned">Full</li><li class="next">Available</li><li class="locked">Locked</li>
        </ul>
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
    this.render();
    el.querySelector<HTMLElement>(this.view === "tree" ? `.ug-node[data-node="${ROOT}"]` : "[data-ct-pick]")?.focus({ preventScroll: true });
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
    if (e.key !== "Escape" || this.ctx.modal.open || !this.el.isConnected) return;
    e.preventDefault();
    this.close();
  };

  private click = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-ct-close]")) return this.close();
    if (t.closest("[data-ct-respec]")) return this.respec();
    const view = t.closest<HTMLElement>("[data-ct-view]")?.dataset.ctView as View | undefined;
    if (view) return this.show(view);
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
    this.el.querySelector<HTMLElement>(`[data-ct-view="${view}"]`)?.focus({ preventScroll: true });
  }

  /** Chooses upgrade `id`; choosing the one already chosen spends a point on it. */
  private pick(id: string) {
    if (id === this.picked && id !== ROOT && this.view === "tree") return this.raise(id);
    this.picked = id;
    this.render();
  }

  private say(text: string) {
    this.el.querySelector(".ct-status")!.textContent = text;
  }

  /** Spends a point on upgrade `id`. */
  private raise(id: string) {
    const { game } = this.ctx, refusal = game.cardTrees.raise(this.card, id);
    if (refusal) {
      const words = refusal === "maxed" ? `${nodeName(this.card, treeNode(this.card, id)!)} is full.` : refusalText(this.card, id, refusal);
      if (words) this.say(words);
      return;
    }
    this.ctx.save();
    this.picked = id;
    this.render();
    const node = treeNode(this.card, id)!, level = nodeLevel(game.save.cardTrees, this.card, id);
    this.say(`${nodeName(this.card, node)}: level ${level} of ${node.levels}. ${plural(game.cardTrees.pointsLeft(this.card), "point")} left.`);
    const at = this.el.querySelector(this.view === "tree" ? `.ug-node[data-node="${id}"]` : `.ct-row.picked`);
    if (!game.save.settings.reduceMotion) replay(at, "bought");
    sparksOver(at, "gold");
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

  private render() {
    const { game } = this.ctx, save = game.save, desk = game.cardTrees, xp = save.cardXp[this.card] ?? 0;
    const left = desk.pointsLeft(this.card), total = cardPoints(xp), spent = desk.pointsSpent(this.card);
    const { level, into, needed } = cardLevel(xp), max = level >= MAX_CARD_LEVEL;
    this.el.querySelector(".ct-xp")!.innerHTML = `<b>Level ${level}</b>`
      + `<span class="ct-xp-bar" role="progressbar" aria-label="XP toward level ${level + 1}" aria-valuemin="0" aria-valuemax="${needed || 1}" aria-valuenow="${max ? needed || 1 : into}"><i style="width:${max ? 100 : (into / needed) * 100}%"></i></span>`
      + `<small>${max ? "Max level" : `${into.toLocaleString("en-US")} / ${needed.toLocaleString("en-US")} XP`}</small>`;
    const points = this.el.querySelector(".ct-left")!;
    points.classList.toggle("some", left > 0);
    points.innerHTML = `<b>${left}</b><small>${left === 1 ? "point" : "points"} to spend<br>${spent} of ${total} spent</small>`;
    const respec = this.el.querySelector<HTMLButtonElement>("[data-ct-respec]")!;
    const respecRefusal = desk.respecRefusal(this.card);
    // A Gem price never looks unavailable for lack of Gems: only its price turns red.
    respec.disabled = respecRefusal === "inside" || respecRefusal === "none";
    respec.classList.toggle("short", respecRefusal === "short");
    respec.innerHTML = `Respec · ${game.free ? "free" : `${gemIcon()} <b>${RESPEC_GEMS}</b>`}`;
    respec.setAttribute("aria-label", game.free ? "Respec, free" : `Respec for ${RESPEC_GEMS} Gems`);
    respec.title = respecRefusal === "none" ? "Nothing spent yet" : respecRefusal === "inside" ? "Respec in the forest" : `Get all ${spent} points back to spend again`;
    this.el.querySelectorAll<HTMLElement>("[data-ct-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ctView === this.view)));
    this.el.classList.toggle("list-view", this.view === "list");
    this.el.querySelector(".ct-legend")!.toggleAttribute("hidden", this.view === "list");
    const refusal = this.picked === ROOT ? null : this.why(this.picked);
    this.el.querySelector(".ug-card")!.innerHTML = cardTreeCardHtml(this.card, save.cardTrees, this.picked, left, refusal);
    const main = this.el.querySelector<HTMLElement>(".ct-main")!;
    if (this.view === "list") {
      this.graph?.destroy();
      this.graph = null;
      // Redrawn in place: the list keeps where it was scrolled to, and the
      // keyboard where it was.
      const top = main.scrollTop, focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-ct-pick], [data-ct-raise]");
      const again = focused && main.contains(focused) ? (focused.dataset.ctPick ? `[data-ct-pick="${focused.dataset.ctPick}"]` : `[data-ct-raise="${focused.dataset.ctRaise}"]`) : null;
      main.innerHTML = cardTreeListHtml(this.card, save.cardTrees, this.picked, this.why);
      main.scrollTop = top;
      if (again) (main.querySelector<HTMLElement>(`${again}:not(:disabled)`) ?? main.querySelector<HTMLElement>(`[data-ct-pick="${this.picked}"]`))?.focus({ preventScroll: true });
      return;
    }
    if (!this.graph) {
      main.innerHTML = `<div class="ug-host" role="group" aria-label="Upgrades: the card at the bottom, each track growing up from it. Arrow keys move between them; Enter chooses one, and again spends a point."></div><small class="ct-hint" aria-hidden="true">Drag to pan · pinch or scroll to zoom</small>`;
      this.graph = new UpgradeGraph(main.querySelector<HTMLElement>(".ug-host")!, {
        reduceMotion: () => this.ctx.game.save.settings.reduceMotion,
        onPick: (id) => this.pick(id),
        gap: { x: 76, y: 92 },
        minScale: 0.8,
        maxScale: 1.4,
      });
    }
    this.graph.set(cardTreeGraph(this.card, save.cardTrees, this.why), this.picked);
  }
}
