import { BUY_QUANTITIES, quantityLabel, type BuyQuantity } from "../progression/buy-quantity.ts";

/** The Buy Quantity dropdown ("x1", "x5", … "Max") among the quantities
 * open, the one in use shown; nothing until there is more than x1 to
 * choose from. The game draws it rather than the browser (a native select
 * opens a large picker over the screen on phones): a button showing the
 * quantity, and a small list of them it opens beside itself. */
export function buyQuantityHtml(open: readonly BuyQuantity[], chosen: BuyQuantity) {
  if (open.length < 2) return "";
  const options = open.map((q) => `<button type="button" role="option" aria-selected="${q === chosen}" data-quantity="${q}">${quantityLabel(q)}</button>`).join("");
  return `<span class="buy-quantity-pick" data-buy-quantity><button type="button" class="buy-quantity" aria-haspopup="listbox" aria-expanded="false" aria-label="Buy quantity: ranks one press buys, ${quantityLabel(chosen)}" title="Ranks one press buys">${quantityLabel(chosen)}<span class="buy-quantity-caret" aria-hidden="true">▾</span></button><span class="buy-quantity-menu" role="listbox" aria-label="Buy quantity" hidden>${options}</span></span>`;
}

/** Wires the dropdown in `root`, if any: its button opens or closes the
 * list (upward when the button sits in the screen's lower half), and a
 * choice closes it and goes to `pick`. */
export function bindBuyQuantity(root: ParentNode, pick: (q: BuyQuantity) => void) {
  const widget = root.querySelector<HTMLElement>("[data-buy-quantity]");
  if (!widget) return;
  widget.onclick = (e) => {
    const target = e.target as HTMLElement, option = target.closest<HTMLElement>("[data-quantity]");
    if (option) {
      setOpen(widget, false);
      return pick(readQuantity(option.dataset.quantity!));
    }
    if (target.closest(".buy-quantity")) setOpen(widget, menuOf(widget).hidden);
  };
  widget.onkeydown = (e) => {
    if (e.key !== "Escape" || menuOf(widget).hidden) return;
    setOpen(widget, false);
    widget.querySelector<HTMLElement>(".buy-quantity")!.focus();
  };
}

const menuOf = (widget: HTMLElement) => widget.querySelector<HTMLElement>(".buy-quantity-menu")!;

function setOpen(widget: HTMLElement, open: boolean) {
  const button = widget.querySelector<HTMLElement>(".buy-quantity")!, menu = menuOf(widget);
  if (open) {
    const box = button.getBoundingClientRect();
    menu.classList.toggle("up", box.top + box.height / 2 > innerHeight / 2);
  }
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
}

// A press anywhere outside an open list closes it.
if (typeof document !== "undefined") document.addEventListener("pointerdown", (e) => {
  document.querySelectorAll<HTMLElement>("[data-buy-quantity]").forEach((w) => {
    if (!w.contains(e.target as Node) && !menuOf(w).hidden) setOpen(w, false);
  });
}, { capture: true });

/** The quantity a dropdown's value names. */
export const readQuantity = (value: string): BuyQuantity =>
  BUY_QUANTITIES.find((q) => String(q) === value) ?? 1;

/** "x12" over a Max press's price: the ranks it buys. */
export const maxCount = (q: BuyQuantity, count: number) => (q === "max" ? `<small class="buy-count">x${count}</small>` : "");
/** "x5" in the bottom-left corner of a run training card's price, for any
 * quantity past x1: the ranks the next press buys (fewer than a fixed
 * quantity near the row's most). */
export const runCount = (q: BuyQuantity, count: number) => (q !== 1 ? `<small class="drill-count">x${count}</small>` : "");
