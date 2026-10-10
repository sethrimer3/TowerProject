import type { CardId } from "../cards.ts";
import type { UpgradeId } from "../config.ts";
import { AREA1_ITEM_URLS } from "../area1-tileset.ts";

/** Small DOM, number and sprite helpers shared by every page. */

export const el = (id: string) => document.getElementById(id)!;
export const text = (id: string, value: unknown) =>
  (el(id).textContent = String(value));
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Dungeon coordinates are zero-based internally, but player-facing progress
// starts at 1 once the entrance is crossed. The forest is the sole height /
// depth 0 area.
export const displayedProgress = (value: number, outside = false) => outside ? 0 : value + 1;
/** `word` with its first letter in capitals. */
export const capitalized = (word: string) => word[0].toUpperCase() + word.slice(1);

export type UiSprite = "tower" | "delve" | "defend" | "gear" | "upgrades" | "settings" | "health" | "attack" | "defense" | "undo" | "automove" | "revive" | "log" | "arrow-up" | "arrow-down" | "arrow-left" | "arrow-right" | "gold";
const UI_ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
/** A card's face, from public/assets/cards/. */
export const cardArt = (id: CardId, alt: string) =>
  `<img class="card-art" src="${UI_ASSET_BASE}assets/cards/${id}.png" alt="${alt}">`;
export const uiSprite = (name: UiSprite, className = "ui-sprite") =>
  `<img class="${className}" src="${UI_ASSET_BASE}assets/ui/${name}.png" alt="" aria-hidden="true">`;
/** A golden arrow pointing up: training points, earned each level. */
export const pointsIcon = (className = "points-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L21 13h-5.5v8h-7v-8H3z" fill="#ffc94a" stroke="#5a3200" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 6L17.5 12" stroke="#fff3b8" stroke-width="1.2" stroke-linecap="round"/></svg>`;
/** A clock face: training time credit. */
export const clockIcon = (className = "clock-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#e9e1c8" stroke="#3b2a12" stroke-width="2"/><path d="M12 7v5l3.5 2.5" fill="none" stroke="#3b2a12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** A looping arrow: auto-continue, training the next rank again once one is done. */
export const redoIcon = (className = "redo-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="#ffc94a" stroke-width="2.4" stroke-linecap="round"/><path d="M20 3.5v5.5h-5.5z" fill="#ffc94a" stroke="#ffc94a" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
/** A small screen with a play mark: watching an ad. */
export const adIcon = (className = "ad-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="#2b2f3a" stroke="#e9e1c8" stroke-width="1.6"/><path d="M10 9l5 3-5 3z" fill="#ffc94a"/></svg>`;
/** A shopping cart: the Shop. */
export const CART_ICON = `<svg class="cart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 3.5h3l2.6 11.2h11.4l2.3-8H6" fill="none" stroke="#e9e1c8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.4 8.8h12.4l-1.4 4.4H8.4z" fill="#ffc94a"/><circle cx="9" cy="19" r="1.9" fill="#e9e1c8"/><circle cx="17" cy="19" r="1.9" fill="#e9e1c8"/></svg>`;
/** The Gold coin, sized to sit in a line of text. */
export const goldIcon = () => uiSprite("gold", "ui-sprite gold-icon");
/** A cut cyan gem, the Gems currency's icon (drawn like the board's). */
export const gemIcon = (className = "gem-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5h9L20 9.5 12 20.5 4 9.5z" fill="#2fa9e0"/><path d="M7.5 5h9L20 9.5H4z" fill="#8fe6ff"/><path d="M7.5 5L10 9.5 12 20.5 14 9.5 16.5 5M10 9.5L12 5 14 9.5" fill="none" stroke="#e1faff" stroke-width="0.8" stroke-linejoin="round"/><path d="M7.5 5h9L20 9.5 12 20.5 4 9.5z" fill="none" stroke="#0d3a5c" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
/** An Ascension Shard: a tall green crystal, worn wherever Shards are shown. */
export const shardIcon = (className = "shard-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l5 6-1.5 11L12 22l-3.5-3L7 8z" fill="#2fbf6a"/><path d="M12 2l5 6-5 2-5-2z" fill="#9dffc4"/><path d="M12 10v12M7 8l5 2 5-2" fill="none" stroke="#dcffe9" stroke-width="0.8" stroke-linejoin="round"/><path d="M12 2l5 6-1.5 11L12 22l-3.5-3L7 8z" fill="none" stroke="#0b4a26" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
/** A Medal: a gold disc with a star, hung from a red ribbon. */
export const medalIcon = (className = "medal-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h4l2 7H9zM13 2h4l-2 7h-4z" fill="#c0392b" stroke="#5a1410" stroke-width="1" stroke-linejoin="round"/><circle cx="12" cy="15.5" r="6.2" fill="#e0a526" stroke="#5a3d08" stroke-width="1.3"/><path d="M12 11.6l1.15 2.35 2.6.38-1.88 1.83.44 2.58L12 17.53l-2.31 1.21.44-2.58-1.88-1.83 2.6-.38z" fill="#fff1b8"/></svg>`;
/** A check mark in a rounded box: Missions. */
export const missionIcon = (className = "mission-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#24402c" stroke="#e9e1c8" stroke-width="1.5"/><path d="M7.5 12.3l3.1 3.1 6-6.6" fill="none" stroke="#8ff0a4" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** A plain check mark: a weekly reward claimed. */
export const checkIcon = (className = "check-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="#8ff0a4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** "1 Gem", "5 Gems". */
/** A trophy: a cup with handles on a stem and base, outlined in `stroke`
 * over `fill` (gold by default; each league's cup its own metal). */
export const trophyIcon = (className = "trophy-icon", stroke = "#ffd34d", fill = "#5a4210") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" fill="none" stroke="${stroke}" stroke-width="1.3"/><path d="M12 13.5v3.5M8.5 20.5h7l-1-3.5h-5z" fill="${fill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
/** A Tournament Ticket: a gold stub with notched ends and a perforation. */
export const ticketIcon = (className = "ticket-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 7h19v3a2 2 0 0 0 0 4v3h-19v-3a2 2 0 0 0 0-4z" fill="#6a4a12" stroke="#ffd34d" stroke-width="1.4" stroke-linejoin="round"/><path d="M15.5 7.5v9" stroke="#ffd34d" stroke-width="1" stroke-dasharray="1.4 1.2"/><path d="M6 10.5h6.5M6 13.5h4.5" stroke="#ffe9a8" stroke-width="1.2" stroke-linecap="round"/></svg>`;
/** An envelope: Mail. */
export const mailIcon = (className = "mail-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="1.5" fill="#3b4a60" stroke="#e9e1c8" stroke-width="1.5"/><path d="M3.8 6.5l8.2 6.5 8.2-6.5" fill="none" stroke="#e9e1c8" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
/** A gift box: a reward waiting to be claimed. */
export const giftIcon = (className = "gift-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11h15v9.5h-15z" fill="#c0392b" stroke="#ffd34d" stroke-width="1.2" stroke-linejoin="round"/><path d="M3 7.5h18V11H3z" fill="#e2533f" stroke="#ffd34d" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 7.5v13" stroke="#ffd34d" stroke-width="2"/><path d="M12 7.3C10.5 4 7 3.6 7 5.6S10.2 7.4 12 7.3c1.8.1 5 0 5-1.7s-3.5-1.6-5 1.7z" fill="none" stroke="#ffd34d" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
/** `text` made safe to put in HTML: for text from outside, such as Mail. */
export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const gemCount = (n: number) => `${n} ${n === 1 ? "Gem" : "Gems"}`;
export const itemSprite = (name: keyof typeof AREA1_ITEM_URLS, className = "ui-sprite") =>
  `<img class="${className}" src="${AREA1_ITEM_URLS[name]}" alt="" aria-hidden="true">`;

/** Each mode's currency icon, as the currencies row shows it: Inspiration
 * the Upgrades sprite, Courage the Automove one. */
export const CURRENCY_SPRITES = { tower: "upgrades", delve: "automove" } as const;

const SKILL_ITEM_SPRITES: Partial<Record<UpgradeId, keyof typeof AREA1_ITEM_URLS>> = {
  yellow: "key_yellow", blue: "key_blue", red: "key_red", extraKey: "key_yellow", findYellowKey: "key_yellow", keyEfficiency: "key_yellow",
  greaterHeal: "potion_flat", regen: "potion_flat", regenResearch: "potion_flat", recovery: "potion_percent",
};
const SKILL_UI_SPRITES: Partial<Record<UpgradeId, UiSprite>> = {
  inspirationUndos: "undo", undos: "undo", archives: "log",
  delve: "delve", gear: "gear", moveSpeed: "automove", rush: "automove", instantCombat: "attack", trainers: "arrow-up", fasterTrainers: "automove", buyQuantity: "arrow-up",
  revive: "revive", spareChange: "gold", loot: "gold", floorSkipReward: "gold", mug: "gold", legacy: "tower", quality: "tower",
  wisdomFocus: "settings", wisdomMemory: "undo", wisdomSight: "upgrades",
  renownBanner: "tower", renownOath: "defense", renownCrown: "gear",
};
/** Skills about Silver show the Gold coin drained of colour, as the purse does. */
const SKILL_SILVER = new Set<UpgradeId>(["wealthy", "wishingWell", "onTheJob", "pocketMoney", "interest", "maxInterest"]);
/** Skills about the hand show a card face. */
const SKILL_CARDS: Partial<Record<UpgradeId, CardId>> = { combatStance: "stairs", buildout: "monster", cardHeal: "heal", cardAtkUp: "atkUp", cardDefUp: "defUp", cardBlueKey: "blueKey", keySiphon: "keySiphon",
  cardYellowDoor: "yellowDoor", cardHeartDoor: "heartDoor", cardWeakEnemy: "weakEnemy", cardBaseEnemy: "baseEnemy", cardStrongEnemy: "strongEnemy",
  cardEliteEnemy: "eliteEnemy", cardBossEnemy: "bossEnemy", cardChest: "chest", blueSiphon: "blueSiphon", blueTrader: "blueTrader", keyToHp: "keyToHp",
  cardRedKey: "redKey", redSiphon: "redSiphon", cardTorch: "torch", cardWoodenDoor: "woodenDoor", heartDoorResilience: "heartDoor" };
/** The forest's Enter button: an arrow going up into an arched doorway. */
export const ENTER_ICON = `<svg class="enter-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 22.5V11a8.5 8.5 0 0 1 17 0v11.5z" fill="#1b1410"/><path d="M3.5 22.5V11a8.5 8.5 0 0 1 17 0v11.5" fill="none" stroke="#c9b48a" stroke-width="2" stroke-linejoin="round"/><path d="M12 21V11.5M8 15.2l4-4 4 4" fill="none" stroke="#ffe27a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** Two cards fanned out: the Deck's icon, made from the card faces. */
const DECK_ICON = `<span class="deck-icon" aria-hidden="true"><img src="${UI_ASSET_BASE}assets/cards/heal.png" alt=""><img src="${UI_ASSET_BASE}assets/cards/stairs.png" alt=""></span>`;
export const skillSprite = (id: UpgradeId) => {
  const card = SKILL_CARDS[id];
  if (card) return `<img class="skill-sprite card-sprite" src="${UI_ASSET_BASE}assets/cards/${card}.png" alt="" aria-hidden="true">`;
  const item = SKILL_ITEM_SPRITES[id];
  if (item) return itemSprite(item, "skill-sprite");
  if (SKILL_SILVER.has(id)) return uiSprite("gold", "skill-sprite silver-sprite");
  return uiSprite(SKILL_UI_SPRITES[id] ?? "upgrades", "skill-sprite");
};
/** An hourglass running gold beside a golden arrow up: the Research page,
 * Training and the Archives, what grows with time. */
export const RESEARCH_ICON = `<svg class="research-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2.5h11M3 21.5h11" stroke="#c9b48a" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 2.5c0 5 4 6.5 4 9.5s-4 4.5-4 9.5h8c0-5-4-6.5-4-9.5s4-4.5 4-9.5z" fill="#1b1410" stroke="#e9e1c8" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.5 6h4L8.5 9.5zM5.8 20.5c.6-2.6 1.8-3.6 2.7-4.3.9.7 2.1 1.7 2.7 4.3z" fill="#ffc94a"/><path d="M18.5 4L23 9.5h-2.8V15h-3.4V9.5H14z" fill="#ffc94a" stroke="#5a3200" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
/** The tab bar along the bottom, in order: icons only, each named for
 * screen readers and on hover. `board` is the active mode's board, its icon
 * that mode's (set by the HUD). */
export const NAV_TABS = [
  { id: "board", name: "Tower", icon: uiSprite("tower") },
  { id: "upgrades", name: "Upgrades", icon: uiSprite("upgrades") },
  { id: "deck", name: "Deck", icon: DECK_ICON },
  { id: "gear", name: "Gear", icon: uiSprite("gear") },
  { id: "research", name: "Research", icon: RESEARCH_ICON },
  { id: "defend", name: "Defend", icon: uiSprite("defend") },
  { id: "shop", name: "Shop", icon: CART_ICON },
] as const;
/** A pixel-art hand pointing up, row by row: `#` outline, `w` skin. */
const POINTER_ROWS = [
  "....##......",
  "...#ww#.....",
  "...#ww#.....",
  "...#ww#.....",
  "...#ww###...",
  "...#ww#ww##.",
  ".###ww#ww#w#",
  "#ww#wwwwwww#",
  "#wwwwwwwwww#",
  ".#wwwwwwwww#",
  ".#wwwwwwww#.",
  "..#wwwwwww#.",
  "...#wwwww#..",
  "...#######..",
];
/** The tutorials' pointing hand. */
export const POINTER_SVG = `<svg viewBox="0 0 12 14" shape-rendering="crispEdges" aria-hidden="true">${POINTER_ROWS.flatMap((row, y) =>
  [...row].map((c, x) => (c === "." ? "" : `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === "#" ? "#2b1d14" : "#f3d9b8"}"/>`)),
).join("")}</svg>`;

/** Raises `html` (an amount gained, such as "+20" with its icon) from over
 * `target`, fading as it rises, then removes it. It sits outside `#app`, in
 * the page's body, so a page drawn again under it leaves it rising. */
export function riseFrom(target: HTMLElement | null, html: string) {
  if (!target) return;
  const box = target.getBoundingClientRect(), pop = document.createElement("div");
  pop.className = "rise-pop";
  pop.innerHTML = html;
  pop.style.left = `${box.left + box.width / 2}px`;
  // Near the top of the screen it starts lower, so it rises over the value instead of out of view.
  pop.style.top = `${Math.max(box.top, 56)}px`;
  pop.addEventListener("animationend", () => pop.remove());
  document.body.append(pop);
}
