import { BUY_QUANTITIES, quantityLabel, type BuyQuantity } from "../buy-quantity.ts";

/** The Buy Quantity dropdown ("x1", "x5", … "Max") among the quantities
 * open, the one in use selected; nothing before the skill is owned. */
export function buyQuantityHtml(open: readonly BuyQuantity[], chosen: BuyQuantity) {
  if (!open.length) return "";
  const options = open.map((q) => `<option value="${q}"${q === chosen ? " selected" : ""}>${quantityLabel(q)}</option>`).join("");
  return `<select class="buy-quantity" data-buy-quantity aria-label="Buy quantity: ranks one press buys" title="Ranks one press buys">${options}</select>`;
}

/** The quantity a dropdown's value names. */
export const readQuantity = (value: string): BuyQuantity =>
  BUY_QUANTITIES.find((q) => String(q) === value) ?? 1;

/** "x12" over a Max press's price: the ranks it buys. */
export const maxCount = (q: BuyQuantity, count: number) => (q === "max" ? `<small class="buy-count">x${count}</small>` : "");
