import { controlIcon } from "./control-icon.ts";
import type { GoalReward } from "../goals.ts";
import { CURRENCIES, type CurrencyId } from "../shop/currency.ts";
import { ENTITLEMENTS } from "../shop/entitlements.ts";
import { bundleAmounts } from "../shop/items.ts";
import type { ShopOffer } from "../shop/offers.ts";
import type { MailItem } from "../mail/message.ts";
import { gemIcon, goldIcon, medalIcon, arcaniteIcon, relicIcon, ticketIcon, uiSprite, vipIcon } from "./dom.ts";
import { RELICS } from "../economy/relics.ts";
import { GIFTS, type GiftsGranted } from "../economy/gifts.ts";
import { GIFT_TEXT } from "../economy/gift-effects.ts";
import { RARITIES as RARITY_TABLE } from "../shop/rarity.ts";
import { giftItemIcon } from "./gift-icons.ts";

/** A reward to celebrate: its icon, the amount beside it (a currency's
 * "+250"), the line over its name, and what it does. A `permanent` one, an
 * unlock bought for good, turns golden rays behind it; currency doesn't.
 * With `grid` (several gifts at once), the grid stands where the icon would. */
export type RewardShown = { icon: string; amount?: string; kicker: string; name: string; text?: string; permanent: boolean; grid?: string };

const CURRENCY_ICONS: Record<CurrencyId, () => string> = { gems: () => gemIcon(), arcanite: () => arcaniteIcon(), gold: goldIcon, medals: () => medalIcon(), vip: () => vipIcon() };

/** Celebrates a reward the way a new card is: it rises from below the screen
 * to its middle, with what it is written underneath, and a press claims it
 * (it is already the player's: the press only dismisses it). With Reduce
 * motion on, it appears still. A reveal still showing gives way to the next.
 * `onDone` runs once it is pressed away. With `onSkip`, one of several shown
 * in turn wears a Skip button, which takes it away and runs `onSkip` instead,
 * so none of the rest show. */
export function revealReward(r: RewardShown, reduceMotion: boolean, onDone?: () => void, onSkip?: () => void) {
  document.querySelector(".reward-reveal")?.remove();
  const layer = document.createElement("div");
  layer.className = `card-reveal reward-reveal${r.permanent ? " permanent" : ""}${reduceMotion ? " still" : ""}`;
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", `${r.kicker}: ${r.name}`);
  const rays = r.permanent ? `<div class="card-reveal-rays" aria-hidden="true"></div>` : "";
  const amount = r.amount ? `<b class="reward-reveal-amount">${r.amount}</b>` : "";
  const prize = r.grid ? `<div class="gift-reveal-grid">${r.grid}</div>` : `${r.icon}${amount}`;
  layer.innerHTML = `<div class="card-reveal-stage${r.grid ? " gift-reveal-stage" : ""}">${rays}<button type="button" class="reward-reveal-prize${r.grid ? " gift-reveal" : ""}" id="reward-reveal-prize" aria-label="${r.name}: claim">${prize}</button></div><div class="card-reveal-text"><small>${r.kicker}</small><b>${r.name}</b>${r.text ? `<p>${r.text}</p>` : ""}<span>Tap to claim</span></div>`;
  if (onSkip) layer.insertAdjacentHTML("beforeend", `<button type="button" class="reward-reveal-skip" id="reward-reveal-skip">Skip</button>`);
  (document.querySelector("#app") ?? document.body).append(layer);
  // The whole screen claims it, so a press anywhere goes on.
  layer.onclick = (e) => {
    layer.remove();
    if (onSkip && (e.target as Element).closest("#reward-reveal-skip")) onSkip();
    else onDone?.();
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
  if (item.kind === "eventBoost")
    return { icon: medalIcon(), amount: "×2", kicker: "PURCHASED", name: o.name, text: o.effects.join(" · "), permanent: true };
  const factor = ENTITLEMENTS[item.id].goldFactor, relic = ENTITLEMENTS[item.id].relic;
  const icon = factor > 1 ? goldIcon() : relic && RELICS[relic] ? relicIcon(RELICS[relic]!) : controlIcon("star", "★", "reward-reveal-star");
  const gained = bundleAmounts(item.amounts).map(([c, n]) => `+${(n * o.quantity).toLocaleString("en-US")} ${CURRENCIES[c].name}`);
  return { icon, amount: factor > 1 ? `×${factor}` : undefined, kicker: "UNLOCKED FOR GOOD", name: o.name, text: [...o.effects, ...gained].join(" · "), permanent: true };
}

/** What a Goals reward just claimed shows: only currency, since unlocks and
 * towers open their own dialogs. */
export const goalRewardShown = (r: GoalReward): RewardShown | null =>
  r.kind === "currency" ? currencyShown(r.currency, r.amount, "GOAL REWARD")
  : r.kind === "breakthrough" ? { icon: uiSprite("breakthrough"), amount: `+${r.amount}`, kicker: "GOAL REWARD", name: "Breakthrough", permanent: false }
  : null;

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

/** What gifts just received show: one gift on its own, its rarity over its
 * bonus; several all at once, in a grid, each gift once with ×N beside
 * those received more than once. Null for none. */
export function giftsShown(granted: GiftsGranted, kicker: string): RewardShown | null {
  const total = granted.reduce((n, g) => n + g.count, 0);
  const [first] = granted;
  if (!first) return null;
  if (total === 1) {
    const def = GIFTS[first.id]!;
    return { icon: giftItemIcon(first.id, "gift-item reward-gift"), kicker, name: `${RARITY_TABLE[def.rarity].displayName} Gift`, text: GIFT_TEXT[def.stat](def.percent), permanent: true };
  }
  const grid = granted.map((g) => {
    const def = GIFTS[g.id]!;
    return `<span class="gift-reveal-cell" title="${GIFT_TEXT[def.stat](def.percent)}">${giftItemIcon(g.id)}${g.count > 1 ? `<b>×${g.count}</b>` : ""}</span>`;
  }).join("");
  return { icon: "", grid, kicker, name: `${total} Gifts`, text: "Their bonuses are yours for good, on the Relics page.", permanent: true };
}
