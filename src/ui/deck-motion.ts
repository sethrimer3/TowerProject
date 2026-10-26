import type { CardId } from "../cards/cards.ts";

export type CardOrigin = { box: DOMRect; html: string };
type Position = { box: DOMRect; card: CardOrigin };

/** Capture the displayed sprite, including the XP, level and rarity marks. */
export function cardOrigin(node: HTMLElement): CardOrigin {
  return { box: node.getBoundingClientRect(), html: node.innerHTML };
}

/** Card identity survives a redraw. Neighbours slide to their new grid
 * positions, while a transferred card flies above both grids to its slot. */
export class DeckMotion {
  private animations = new Set<Animation>();
  private flights = new Set<HTMLElement>();
  private hidden = new Set<HTMLElement>();

  capture() {
    const positions = new Map<string, Position>();
    document.querySelectorAll<HTMLElement>("#deck [data-deck-card]").forEach(node => {
      const card = node.querySelector<HTMLElement>(".deck-card, .deck-add");
      const box = node.getBoundingClientRect();
      if (card && box.width && box.height) positions.set(node.dataset.deckCard!, { box, card: cardOrigin(card) });
    });
    return positions;
  }

  clear() {
    for (const a of this.animations) a.cancel();
    this.animations.clear();
    for (const n of this.flights) n.remove();
    this.flights.clear();
    for (const n of this.hidden) n.style.removeProperty("opacity");
    this.hidden.clear();
  }

  play(before: ReturnType<DeckMotion["capture"]>, reduced: boolean, moving?: CardId, origin?: CardOrigin) {
    if (reduced || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodes = [...document.querySelectorAll<HTMLElement>("#deck [data-deck-card]")];
    const target = nodes.find(n => n.dataset.deckCard === moving)?.querySelector<HTMLElement>(".deck-card, .deck-add");
    const from = origin ?? (moving ? before.get(moving)?.card : undefined);
    if (target && from?.box.width && from.box.height) {
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      const to = target.getBoundingClientRect(), flight = document.createElement("div");
      flight.className = "deck-flight";
      flight.setAttribute("aria-hidden", "true");
      Object.assign(flight.style, { left: `${from.box.left}px`, top: `${from.box.top}px`, width: `${from.box.width}px`, height: `${from.box.height}px` });
      flight.innerHTML = from.html;
      (document.getElementById("app") ?? document.body).append(flight);
      this.flights.add(flight);
      target.style.opacity = "0";
      this.hidden.add(target);
      this.animate(flight, [
        { transform: "translate(0, 0) scale(1)" },
        { transform: `translate(${to.left - from.box.left}px, ${to.top - from.box.top}px) scale(${to.width / from.box.width}, ${to.height / from.box.height})` },
      ], () => {
        target.style.removeProperty("opacity");
        this.hidden.delete(target);
        flight.remove();
        this.flights.delete(flight);
      });
    }
    for (const node of nodes) {
      if (node.dataset.deckCard === moving) continue;
      const old = before.get(node.dataset.deckCard!);
      if (!old) continue;
      const to = node.getBoundingClientRect();
      if (!to.width || !to.height) continue;
      const dx = old.box.left - to.left, dy = old.box.top - to.top;
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
      this.animate(node, [
        { transform: `translate(${dx}px, ${dy}px) scale(${old.box.width / to.width}, ${old.box.height / to.height})`, transformOrigin: "0 0" },
        { transform: "none", transformOrigin: "0 0" },
      ]);
    }
  }

  private animate(node: HTMLElement, frames: Keyframe[], done = () => {}) {
    const a = node.animate(frames, { duration: 380, easing: "cubic-bezier(.22,.75,.25,1)" });
    this.animations.add(a);
    void a.finished.then(done, () => {}).finally(() => this.animations.delete(a));
  }
}
