/** A card's upgrade tree over the page: the living graph of its nodes
 * (`upgrade-graph.ts`), the card points it has left, a respec for Gems, and
 * the card of the node picked, whose button spends a point on it (as does
 * tapping the picked node again). Spending happens through the game's
 * `cardTrees` desk, in the forest only. */
import { CARDS, type CardId } from "../cards.ts";
import { cardPoints } from "../card-levels.ts";
import { RESPEC_GEMS, treeNode } from "../card-trees.ts";
import type { TreeRefusal } from "../game/card-tree-desk.ts";
import type { AppContext } from "./app.ts";
import { askForGems } from "./dialogs.ts";
import { gemIcon } from "./dom.ts";
import { replay, sparksOver } from "./flourish.ts";
import { cardTreeCardHtml, cardTreeGraph, nodeName, ROOT } from "./card-tree-view.ts";
import { UpgradeGraph } from "./upgrade-graph.ts";

/** Why a point can't go on a node, in words. */
function refusalText(card: CardId, id: string, refusal: TreeRefusal): string {
  if (refusal === "inside") return "Points are spent in the forest: the run keeps the tree it went in with.";
  if (refusal === "points") return "No card points left: the card earns one each level, by being used in runs.";
  if (refusal === "locked") {
    const after = treeNode(card, id)?.after, parent = after ? treeNode(card, after) : undefined;
    return parent ? `Fill ${nodeName(card, parent)} first.` : "Locked.";
  }
  return refusal === "maxed" ? "Full." : "";
}

/** One card's tree, open over the page until closed (`onClose` then runs). */
export class CardTreePanel {
  private readonly el: HTMLElement;
  private readonly graph: UpgradeGraph;
  private picked = ROOT;
  private readonly back = document.activeElement as HTMLElement | null;

  constructor(private readonly ctx: AppContext, private readonly card: CardId, private readonly onClose?: () => void) {
    const el = (this.el = document.createElement("div"));
    el.className = `card-tree${ctx.game.save.settings.reduceMotion ? "" : " opening"}`;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", `Upgrade tree: ${CARDS[card].name}`);
    el.innerHTML = `<header class="ug-top">
        <div class="ug-alloc" data-ug-ignore><small>CARD POINTS</small><b></b><button type="button" class="ug-respec" data-ct-respec></button></div>
        <div class="ug-title"><small>UPGRADE TREE</small><b>${CARDS[card].name}</b></div>
        <button type="button" class="ct-close" data-ct-close aria-label="Close" data-ug-ignore>×</button></header>
      <div class="ug-host"></div>
      <div class="ug-card" data-ug-ignore aria-live="polite"></div>`;
    (document.querySelector("#app") ?? document.body).append(el);
    this.graph = new UpgradeGraph(el.querySelector<HTMLElement>(".ug-host")!, {
      reduceMotion: () => this.ctx.game.save.settings.reduceMotion,
      onPick: (id) => {
        // A second tap on the picked node spends a point on it.
        if (id === this.picked && id !== ROOT) return this.raise();
        this.picked = id;
        this.render();
      },
    });
    el.addEventListener("click", this.click);
    document.addEventListener("keydown", this.key, true);
    this.render();
    el.querySelector<HTMLElement>("[data-ct-close]")!.focus({ preventScroll: true });
  }

  close() {
    this.graph.destroy();
    this.el.remove();
    document.removeEventListener("keydown", this.key, true);
    if (this.back?.isConnected) this.back.focus({ preventScroll: true });
    this.onClose?.();
  }

  private key = (e: KeyboardEvent) => {
    // The shared dialog (a respec's confirm) takes Escape first.
    if (e.key !== "Escape" || this.ctx.modal.open) return;
    e.preventDefault();
    this.close();
  };

  private click = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-ct-close]")) return this.close();
    if (t.closest("[data-ct-raise]")) return this.raise();
    if (t.closest("[data-ct-respec]")) return this.respec();
  };

  /** Spends a point on the picked node. */
  private raise() {
    const { game } = this.ctx;
    if (game.cardTrees.raise(this.card, this.picked)) return this.render();
    this.ctx.save();
    this.render();
    const node = this.el.querySelector(`[data-node="${this.picked}"]`);
    if (!game.save.settings.reduceMotion) replay(node, "bought");
    sparksOver(node, "gold");
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
        sparksOver(this.el.querySelector(".ug-alloc"), "gold");
      },
    );
  }

  private render() {
    const { game } = this.ctx, save = game.save, desk = game.cardTrees;
    const left = desk.pointsLeft(this.card), total = cardPoints(save.cardXp[this.card] ?? 0), spent = desk.pointsSpent(this.card);
    this.el.querySelector(".ug-alloc b")!.textContent = `${left} / ${total}`;
    this.el.querySelector(".ug-alloc")!.setAttribute("title", `${left} of the card's ${total} points left to spend; ${spent} spent on its tree`);
    const respec = this.el.querySelector<HTMLButtonElement>("[data-ct-respec]")!;
    const respecRefusal = desk.respecRefusal(this.card);
    // A Gem price never looks unavailable for lack of Gems: only its price turns red.
    respec.disabled = respecRefusal === "inside" || respecRefusal === "none";
    respec.classList.toggle("short", respecRefusal === "short");
    respec.innerHTML = `Respec · ${game.free ? "free" : `${gemIcon()} <b>${RESPEC_GEMS}</b>`}`;
    respec.setAttribute("aria-label", game.free ? "Respec, free" : `Respec for ${RESPEC_GEMS} Gems`);
    respec.title = respecRefusal === "none" ? "Nothing spent yet" : respecRefusal === "inside" ? "Respec in the forest" : `Get all ${spent} points back to spend again`;
    const refusal = this.picked === ROOT ? null : desk.raiseRefusal(this.card, this.picked);
    this.el.querySelector(".ug-card")!.innerHTML = cardTreeCardHtml(this.card, save.cardTrees, this.picked, left, refusal && refusal !== "maxed" ? refusalText(this.card, this.picked, refusal) : null);
    this.graph.set(cardTreeGraph(this.card, save.cardTrees), this.picked);
  }
}
