import type { CardId } from "../cards/cards.ts";

/** Nonmodal card details: keep the real card available for a second tap
 * or a swipe. The arrow follows it as the page scrolls or resizes. */
export class DeckCardPopover {
  private node: HTMLElement | null = null;
  private anchor: HTMLElement | null = null;
  private card: CardId | null = null;

  showing(id: CardId) { return this.card === id; }

  show(id: CardId, anchor: HTMLElement, html: string, name: string) {
    this.close();
    this.card = id;
    this.anchor = anchor;
    const node = this.node = document.createElement("div");
    node.id = "deck-card-popover";
    node.className = "deck-card-popover";
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-label", `${name} card details`);
    node.innerHTML = `<div class="deck-popover-content">${html}</div>`;
    (document.getElementById("app") ?? document.body).append(node);
    anchor.setAttribute("aria-expanded", "true");
    anchor.setAttribute("aria-controls", node.id);
    anchor.setAttribute("aria-describedby", node.id);
    anchor.focus({ preventScroll: true });
    document.addEventListener("pointerdown", this.outside, true);
    document.addEventListener("keydown", this.key, true);
    document.addEventListener("scroll", this.position, true);
    window.addEventListener("resize", this.position);
    this.position();
  }

  close = () => {
    this.anchor?.removeAttribute("aria-expanded");
    this.anchor?.removeAttribute("aria-controls");
    this.anchor?.removeAttribute("aria-describedby");
    this.node?.remove();
    this.node = null;
    this.anchor = null;
    this.card = null;
    document.removeEventListener("pointerdown", this.outside, true);
    document.removeEventListener("keydown", this.key, true);
    document.removeEventListener("scroll", this.position, true);
    window.removeEventListener("resize", this.position);
  };

  private outside = (e: PointerEvent) => {
    const target = e.target as Node;
    if (!this.anchor?.contains(target) && !this.node?.contains(target)) this.close();
  };
  private key = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    this.close();
  };
  private position = (event?: Event) => {
    if (event?.target instanceof Node && this.node?.contains(event.target)) return;
    if (!this.node || !this.anchor?.isConnected) return this.close();
    const a = this.anchor.getBoundingClientRect(), p = this.node;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0, leftEdge = viewport?.offsetLeft ?? 0;
    const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
    if (a.bottom < top || a.top > top + height) return this.close();
    const content = p.firstElementChild as HTMLElement;
    content.style.maxHeight = `${Math.min(420, height - 16)}px`;
    const aboveSpace = Math.max(0, a.top - top - 20), belowSpace = Math.max(0, top + height - a.bottom - 20);
    const below = p.offsetHeight > aboveSpace && belowSpace > aboveSpace;
    // A short landscape screen scrolls the text inside the free space,
    // rather than covering the card the player needs to tap again.
    content.style.maxHeight = `${Math.max(48, Math.min(420, below ? belowSpace : aboveSpace))}px`;
    const left = Math.max(leftEdge + 8, Math.min(leftEdge + width - p.offsetWidth - 8, a.left + a.width / 2 - p.offsetWidth / 2));
    p.classList.toggle("below", below);
    p.style.left = `${left}px`;
    p.style.top = `${Math.max(top + 8, Math.min(top + height - p.offsetHeight - 8, below ? a.bottom + 12 : a.top - p.offsetHeight - 12))}px`;
    p.style.setProperty("--arrow-x", `${Math.max(14, Math.min(p.offsetWidth - 14, a.left + a.width / 2 - left))}px`);
  };
}
