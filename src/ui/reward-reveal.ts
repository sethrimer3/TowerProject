import type { GoalReward } from "../goals.ts";
import { CURRENCIES, type CurrencyId } from "../shop/currency.ts";
import { ENTITLEMENTS } from "../shop/entitlements.ts";
import { bundleAmounts } from "../shop/items.ts";
import type { ShopOffer } from "../shop/offers.ts";
import type { MailItem } from "../mail/message.ts";
import { gemIcon, goldIcon, medalIcon, shardIcon, ticketIcon } from "./dom.ts";

/** A reward to celebrate: its icon, the amount beside it (a currency's
 * "+250"), the line over its name, and what it does. A `permanent` one, an
 * unlock bought for good, turns golden rays behind it; currency doesn't. */
export type RewardShown = { icon: string; amount?: string; kicker: string; name: string; text?: string; permanent: boolean };

const CURRENCY_ICONS: Record<CurrencyId, () => string> = { gems: () => gemIcon(), shards: () => shardIcon(), gold: goldIcon, medals: () => medalIcon() };

/** Celebrates a reward the way a new card is: it rises from below the screen
 * to its middle, with what it is written underneath, and a press claims it
 * (it is already the player's: the press only dismisses it). With Reduce
 * motion on, it appears still. A reveal still showing gives way to the next.
 * `onDone` runs once it is pressed away. */
export function revealReward(r: RewardShown, reduceMotion: boolean, onDone?: () => void) {
  document.querySelector(".reward-reveal")?.remove();
  const layer = document.createElement("div");
  layer.className = `card-reveal reward-reveal${r.permanent ? " permanent" : ""}${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", `${r.kicker}: ${r.name}`);
  const rays = r.permanent ? `<div class="card-reveal-rays" aria-hidden="true"></div>` : "";
  const amount = r.amount ? `<b class="reward-reveal-amount">${r.amount}</b>` : "";
  layer.innerHTML = `<div class="card-reveal-stage">${rays}<button type="button" class="reward-reveal-prize" id="reward-reveal-prize" aria-label="${r.name}: claim">${r.icon}${amount}</button></div><div class="card-reveal-text"><small>${r.kicker}</small><b>${r.name}</b>${r.text ? `<p>${r.text}</p>` : ""}<span>Press to claim</span></div>`;
  (document.querySelector("#app") ?? document.body).append(layer);
  // The whole screen claims it, so a press anywhere goes on.
  layer.onclick = () => {
    layer.remove();
    onDone?.();
  };
  layer.querySelector<HTMLButtonElement>("#reward-reveal-prize")!.focus({ preventScroll: true });
}

/** A currency amount, as the Shop and Goals grant it. */
function currencyShown(currency: CurrencyId, amount: number, kicker: string): RewardShown {
  const name = CURRENCIES[currency].name;
  return { icon: CURRENCY_ICONS[currency](), amount: `+${amount.toLocaleString("en-US")}`, kicker, name, permanent: false };
}

/** What a Shop offer just bought or claimed shows, or null for one that
 * grants nothing. A bundle shows its first currency, the rest written under
 * its name. A permanent unlock wears its Gold multiplier on the coin, or a
 * star when it has none. */
export function offerShown(o: ShopOffer): RewardShown | null {
  const item = o.item, kicker = o.price.kind === "free" ? "CLAIMED" : "PURCHASED";
  if (!item) return null;
  if (item.kind === "currency") return currencyShown(item.currency, item.amount * o.quantity, kicker);
  if (item.kind === "bundle") {
    const [[first, n], ...rest] = bundleAmounts(item.amounts);
    const more = rest.map(([c, m]) => `+${(m * o.quantity).toLocaleString("en-US")} ${CURRENCIES[c].name}`).join(" · ");
    return { ...currencyShown(first, n * o.quantity, kicker), name: CURRENCIES[first].name, text: more || undefined };
  }
  const factor = ENTITLEMENTS[item.id].goldFactor;
  const icon = factor > 1 ? goldIcon() : `<span class="reward-reveal-star" aria-hidden="true">★</span>`;
  const gained = bundleAmounts(item.amounts).map(([c, n]) => `+${(n * o.quantity).toLocaleString("en-US")} ${CURRENCIES[c].name}`);
  return { icon, amount: factor > 1 ? `×${factor}` : undefined, kicker: "UNLOCKED FOR GOOD", name: o.name, text: [...o.effects, ...gained].join(" · "), permanent: true };
}

/** What a Goals reward just claimed shows: only currency, since unlocks and
 * towers open their own dialogs. */
export const goalRewardShown = (r: GoalReward): RewardShown | null =>
  r.kind === "currency" ? currencyShown(r.currency, r.amount, "GOAL REWARD") : null;

/** What a message's items just claimed show: the first, the rest written
 * under its name, as a bundle shows. */
export function mailShown(items: MailItem[]): RewardShown | null {
  const shown = items.flatMap((i): RewardShown[] =>
    i.kind === "currency" ? [currencyShown(i.currency, i.amount, "MAIL")]
    : i.kind === "tickets" ? [{ icon: ticketIcon("ticket-icon reward-ticket"), amount: `+${i.amount}`, kicker: "MAIL", name: i.amount === 1 ? "Ticket" : "Tickets", permanent: false }]
    : [],
  );
  const [first, ...rest] = shown;
  if (!first) return null;
  return { ...first, text: rest.map((x) => `${x.amount} ${x.name}`).join(" · ") || undefined };
}
