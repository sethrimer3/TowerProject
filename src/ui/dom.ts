import { ITEM_KIT } from "../sprites/items.ts";
import { BREAKTHROUGH_SPRITE, INSPIRATION_SPRITE, kitIcon, pngIcon } from "../sprites/kit.ts";
import { CARDS } from "../cards/cards.ts";
import type { CardId } from "../cards/cards.ts";
import { LIMIT_BREAKS } from "../progression/training.ts";
import type { UpgradeId } from "../progression/upgrades.ts";

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

export type UiSprite = "tower" | "delve" | "gear" | "upgrades" | "settings" | "health" | "attack" | "defense" | "undo" | "automove" | "revive" | "log" | "inspiration" | "breakthrough" | "arrow-up" | "arrow-down" | "arrow-left" | "arrow-right" | "gold";
export const UI_ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
/** A framed native card face with a live name. */
export const cardArt = (id: CardId, alt: string) =>
  pngIcon(`card-${id}`, "card-art sprite-card", alt) + `<small class="sprite-card-label">${CARDS[id].name}</small>`;
const UI_KIT: Record<UiSprite, string> = { tower: "tower", delve: "cave", gear: "helmet", upgrades: "shard", settings: "cog", health: "heart", attack: "sword", defense: "shield", undo: "undo", automove: "boots", revive: "ui-revive", log: "book", inspiration: INSPIRATION_SPRITE, breakthrough: BREAKTHROUGH_SPRITE, gold: "gold", "arrow-up": "arrow-up", "arrow-down": "arrow-down", "arrow-left": "arrow-left", "arrow-right": "arrow-right" };
export const uiSprite = (name: UiSprite, className = "ui-sprite") =>
  pngIcon(name === "gold" && className.includes("silver-sprite") ? "silver" : UI_KIT[name], className);
/** A golden arrow pointing up: training points, earned each level. */
export const pointsIcon = (className = "points-icon") =>
  kitIcon("arrow-up", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L21 13h-5.5v8h-7v-8H3z" fill="#ffc94a" stroke="#5a3200" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 6L17.5 12" stroke="#fff3b8" stroke-width="1.2" stroke-linecap="round"/></svg>`, className);
/** A clock face: training time credit. */
export const clockIcon = (className = "clock-icon") =>
  kitIcon("hourglass", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#e9e1c8" stroke="#3b2a12" stroke-width="2"/><path d="M12 7v5l3.5 2.5" fill="none" stroke="#3b2a12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`, className);
/** A looping arrow: auto-continue, training the next rank again once one is done. */
export const redoIcon = (className = "redo-icon") =>
  kitIcon("redo", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="#ffc94a" stroke-width="2.4" stroke-linecap="round"/><path d="M20 3.5v5.5h-5.5z" fill="#ffc94a" stroke="#ffc94a" stroke-width="1.2" stroke-linejoin="round"/></svg>`, className);
/** A small screen with a play mark: watching an ad. */
export const adIcon = (className = "ad-icon") =>
  kitIcon("ad-screen", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="#2b2f3a" stroke="#e9e1c8" stroke-width="1.6"/><path d="M10 9l5 3-5 3z" fill="#ffc94a"/></svg>`, className);
/** A shopping cart: the Shop. */
/** A Bomb: the kit's sprite, or a black ball with a lit fuse. */
export const bombIcon = (className: string) => kitIcon("bomb", `<svg class="${className}" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="8.4" r="4.6" fill="#2a2630" stroke="#0d0b10" stroke-width="0.8"/><circle cx="4.4" cy="6.8" r="1.2" fill="#8a8494"/><path d="M8.8 4.6l1.6-1.6" stroke="#b08850" stroke-width="1.3" stroke-linecap="round"/><circle cx="11.2" cy="2.4" r="1.4" fill="#ffd25a"/></svg>`, className);
export const CART_ICON = kitIcon("cart", `<svg class="cart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 3.5h3l2.6 11.2h11.4l2.3-8H6" fill="none" stroke="#e9e1c8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.4 8.8h12.4l-1.4 4.4H8.4z" fill="#ffc94a"/><circle cx="9" cy="19" r="1.9" fill="#e9e1c8"/><circle cx="17" cy="19" r="1.9" fill="#e9e1c8"/></svg>`, "cart-icon");
/** The Gold coin, sized to sit in a line of text. */
export const goldIcon = () => uiSprite("gold", "ui-sprite gold-icon");
/** A cut cyan gem, the Gems currency's icon (drawn like the board's). */
export const gemIcon = (className = "gem-icon") =>
  kitIcon("gem", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5h9L20 9.5 12 20.5 4 9.5z" fill="#2fa9e0"/><path d="M7.5 5h9L20 9.5H4z" fill="#8fe6ff"/><path d="M7.5 5L10 9.5 12 20.5 14 9.5 16.5 5M10 9.5L12 5 14 9.5" fill="none" stroke="#e1faff" stroke-width="0.8" stroke-linejoin="round"/><path d="M7.5 5h9L20 9.5 12 20.5 4 9.5z" fill="none" stroke="#0d3a5c" stroke-width="1.3" stroke-linejoin="round"/></svg>`, className);
/** An Ascension Shard: a tall green crystal, worn wherever Shards are shown. */
export const shardIcon = (className = "shard-icon") =>
  kitIcon("shard", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l5 6-1.5 11L12 22l-3.5-3L7 8z" fill="#2fbf6a"/><path d="M12 2l5 6-5 2-5-2z" fill="#9dffc4"/><path d="M12 10v12M7 8l5 2 5-2" fill="none" stroke="#dcffe9" stroke-width="0.8" stroke-linejoin="round"/><path d="M12 2l5 6-1.5 11L12 22l-3.5-3L7 8z" fill="none" stroke="#0b4a26" stroke-width="1.3" stroke-linejoin="round"/></svg>`, className);
/** A Cell: a yellow triangle, the Archives' Speed Ups' currency. */
export const cellIcon = (className = "cell-icon") =>
  kitIcon("cell", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5L21.5 20h-19z" fill="#ffd83a" stroke="#5a4200" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 8L16.5 16h-9z" fill="#fff3a8" opacity="0.55"/></svg>`, className);
/** A Medal: a gold disc with a star, hung from a red ribbon. */
export const medalIcon = (className = "medal-icon") =>
  kitIcon("medal", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h4l2 7H9zM13 2h4l-2 7h-4z" fill="#c0392b" stroke="#5a1410" stroke-width="1" stroke-linejoin="round"/><circle cx="12" cy="15.5" r="6.2" fill="#e0a526" stroke="#5a3d08" stroke-width="1.3"/><path d="M12 11.6l1.15 2.35 2.6.38-1.88 1.83.44 2.58L12 17.53l-2.31 1.21.44-2.58-1.88-1.83 2.6-.38z" fill="#fff1b8"/></svg>`, className);
/** A check mark in a rounded box: Missions. */
export const missionIcon = (className = "mission-icon") =>
  kitIcon("mission", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#24402c" stroke="#e9e1c8" stroke-width="1.5"/><path d="M7.5 12.3l3.1 3.1 6-6.6" fill="none" stroke="#8ff0a4" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`, className);
/** A pennant on a pole bearing a star: Events. */
export const eventIcon = (className = "event-icon") =>
  kitIcon("event", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2.5v19" stroke="#c9ced8" stroke-width="1.6" stroke-linecap="round"/><path d="M5.8 3.5h13.5l-3.2 4.8 3.2 4.8H5.8z" fill="#7a2a8c" stroke="#ffd34d" stroke-width="1.3" stroke-linejoin="round"/><path d="M11.5 5.3l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L8.6 7.4l2-.3z" fill="#ffe9a8"/></svg>`, className);
/** A relic: a jewel in a gold setting on a chain, its stone the rarity's
 * colour (rare blue, epic purple), with matching PNG pendants. */
export const relicIcon = (rarity: "rare" | "epic", className = "relic-icon") => {
  const [stone, glint] = rarity === "epic" ? ["#9b4dff", "#e6c8ff"] : ["#3d8bff", "#c8e2ff"];
  return kitIcon(`relic-${rarity}`, `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2.5c0 3 2 4.5 5 4.5s5-1.5 5-4.5" fill="none" stroke="#ffd34d" stroke-width="1.2" stroke-dasharray="1.6 1"/><path d="M12 6.5l7 4.5-2.6 9H7.6L5 11z" fill="#6a4a12" stroke="#ffd34d" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 9l4.3 2.8-1.6 5.7H9.3l-1.6-5.7z" fill="${stone}" stroke="${glint}" stroke-width=".9" stroke-linejoin="round"/><path d="M10.2 11.6l1.8-1.2" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/></svg>`, className);
};
/** A plain check mark: a weekly reward claimed. */
export const checkIcon = (className = "check-icon") =>
  kitIcon("check", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="#8ff0a4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`, className);
/** "1 Gem", "5 Gems". */
/** A trophy: a cup with handles on a stem and base, outlined in `stroke`
 * over `fill` (gold by default; each league's cup its own metal). */
export const trophyIcon = (className = "trophy-icon", stroke = "#ffd34d", fill = "#5a4210") =>
  kitIcon("trophy", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" fill="none" stroke="${stroke}" stroke-width="1.3"/><path d="M12 13.5v3.5M8.5 20.5h7l-1-3.5h-5z" fill="${fill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round"/></svg>`, className);
/** A shrine: a red gate's two posts under its curved lintel, a golden flame between. */
export const shrineIcon = (className = "shrine-icon") =>
  kitIcon("shrine", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 5c3 1 16 1 19 0l-.8 2.6H3.3z" fill="#b8322a" stroke="#ff9a8a" stroke-width="1.1" stroke-linejoin="round"/><path d="M4.5 10.2h15" stroke="#ff9a8a" stroke-width="1.5"/><path d="M6.5 7.6v14M17.5 7.6v14" stroke="#d8483c" stroke-width="2.2" stroke-linecap="round"/><path d="M12 12.2c1.6 1.8 2.1 3.2 2.1 4.4a2.1 2.1 0 0 1-4.2 0c0-1.2.5-2.6 2.1-4.4z" fill="#ffd34d" stroke="#fff1b0" stroke-width=".8"/></svg>`, className);
/** A Tournament Ticket: a gold stub with notched ends and a perforation. */
export const ticketIcon = (className = "ticket-icon") =>
  kitIcon("ticket", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 7h19v3a2 2 0 0 0 0 4v3h-19v-3a2 2 0 0 0 0-4z" fill="#6a4a12" stroke="#ffd34d" stroke-width="1.4" stroke-linejoin="round"/><path d="M15.5 7.5v9" stroke="#ffd34d" stroke-width="1" stroke-dasharray="1.4 1.2"/><path d="M6 10.5h6.5M6 13.5h4.5" stroke="#ffe9a8" stroke-width="1.2" stroke-linecap="round"/></svg>`, className);
/** An envelope: Mail. */
export const mailIcon = (className = "mail-icon") =>
  kitIcon("mail", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="1.5" fill="#3b4a60" stroke="#e9e1c8" stroke-width="1.5"/><path d="M3.8 6.5l8.2 6.5 8.2-6.5" fill="none" stroke="#e9e1c8" stroke-width="1.5" stroke-linejoin="round"/></svg>`, className);
/** A gift box: a reward waiting to be claimed. */
export const giftIcon = (className = "gift-icon") =>
  kitIcon("gift", `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11h15v9.5h-15z" fill="#c0392b" stroke="#ffd34d" stroke-width="1.2" stroke-linejoin="round"/><path d="M3 7.5h18V11H3z" fill="#e2533f" stroke="#ffd34d" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 7.5v13" stroke="#ffd34d" stroke-width="2"/><path d="M12 7.3C10.5 4 7 3.6 7 5.6S10.2 7.4 12 7.3c1.8.1 5 0 5-1.7s-3.5-1.6-5 1.7z" fill="none" stroke="#ffd34d" stroke-width="1.3" stroke-linejoin="round"/></svg>`, className);
/** `text` made safe to put in HTML: for text from outside, such as Mail. */
export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const gemCount = (n: number) => `${n} ${n === 1 ? "Gem" : "Gems"}`;

export const itemSprite = (name: keyof typeof ITEM_KIT, className = "ui-sprite") =>
  pngIcon(ITEM_KIT[name], className);

/** Each mode's currency icon, as the currencies row shows it. */
export const CURRENCY_SPRITES = { tower: "inspiration", delve: "breakthrough" } as const;

const SKILL_ITEM_SPRITES: Partial<Record<UpgradeId, keyof typeof ITEM_KIT>> = {
  yellow: "key_yellow", blue: "key_blue", red: "key_red", extraKey: "key_yellow", findYellowKey: "key_yellow", keyEfficiency: "key_yellow",
  greaterHeal: "potion_flat", recovery: "potion_percent", findPotion: "potion_percent",
  elixirProvision: "potion_flat", whetstoneProvision: "upgrade_attack", aegisProvision: "upgrade_defense",
};
const SKILL_UI_SPRITES: Partial<Record<UpgradeId, UiSprite>> = {
  inspirationUndos: "undo", undos: "undo", archives: "log", questForKnowledge: "log",
  breakthrough: "breakthrough", moveSpeed: "automove", dash: "automove", instantCombat: "attack", trainers: "arrow-up", buyQuantity: "arrow-up",
  pathToWealth: "gold", moreWealth: "gold", goldenFloors: "gold", offlineGold: "gold", physician: "health", keyMastery: "log", cardMastery: "log", beastMastery: "attack", doorMastery: "log",
  revive: "revive", life: "health", overheal: "health", spareChange: "gold", loot: "gold", floorSkipReward: "gold", mug: "gold", legacy: "tower", quality: "tower",
  wisdomFocus: "settings", wisdomMemory: "undo", wisdomSight: "upgrades",
  renownBanner: "tower", renownOath: "defense", renownCrown: "gear",
  ...Object.fromEntries(LIMIT_BREAKS.map((id) => [id, "arrow-up"])),
};
/** Skills about Silver show the Gold coin drained of colour, as the purse does. */
const SKILL_SILVER = new Set<UpgradeId>(["wealthy", "wishingWell", "onTheJob", "pocketMoney", "interest", "maxInterest"]);
/** Skills about the hand show a card face. */
const SKILL_CARDS: Partial<Record<UpgradeId, CardId>> = { cardDoorKey: "door", cardEnemy: "monster", combatStance: "stairs", cardHeal: "heal", cardAtkUp: "atkUp", cardDefUp: "defUp", cardYellowKey: "yellowKey", cardBlueKey: "blueKey", keySiphon: "keySiphon",
  cardYellowDoor: "yellowDoor", cardHeartDoor: "heartDoor", cardWeakEnemy: "weakEnemy", cardBaseEnemy: "baseEnemy", cardStrongEnemy: "strongEnemy",
  cardEliteEnemy: "eliteEnemy", cardBossEnemy: "bossEnemy", cardNonBossEnemy: "nonBossEnemy", cardFastEnemy: "fastEnemy", cardChest: "chest", blueSiphon: "blueSiphon", blueTrader: "blueTrader", keyToHp: "keyToHp", smeltBlue: "smeltBlue", redTrader: "redTrader", smeltRed: "smeltRed",
  cardRedKey: "redKey", redSiphon: "redSiphon", cardTorch: "torch", cardWoodenDoor: "woodenDoor", heartDoorResilience: "heartDoor",
  angelWings: "angelWings" };
const SKILL_DETAIL_SPRITES: Partial<Record<UpgradeId, string>> = {
  shroud: "ui-ward", critical: "goal-damage-prediction", critPrediction: "goal-damage-prediction",
  thorns: "sword", lifesteal: "boon-lifesteal", parry: "goal-parry", regen: "boon-regen", regenResearch: "boon-regen",
  autoClimb: "play", fasterTrainers: "hourglass", freeTraining: "boon-free-up", buildout: "deck", manualHand: "card-exchange",
  ignore: "ignore", ignoreMore: "ignore", target: "target", targetMore: "target",
  cardBadges: "goal-badge-slots", dashBadge: "badge-dash", dash: "badge-dash", dashCombo: "badge-dash", endRush: "badge-dash", dashRegen: "badge-dash",
  keyLessBadges: "badge-yellowGate", keyAtLeastBadges: "badge-yellowAtLeast", largerHand: "goal-card-groups",
  wealthy: "silver", wishingWell: "silver", onTheJob: "silver", pocketMoney: "silver", interest: "silver", maxInterest: "silver",
  aiMemory: "goal-note-taking", aiEvaluation: "goal-combat-forecast", aiLookahead: "goal-attack-lore",
  renownCrown: "ui-crown",
  avengingAngel: "combat-wing",
};
/** The forest's Enter button: an arrow going up into an arched doorway. */
export const ENTER_ICON = kitIcon("tower", `<svg class="enter-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 22.5V11a8.5 8.5 0 0 1 17 0v11.5z" fill="#1b1410"/><path d="M3.5 22.5V11a8.5 8.5 0 0 1 17 0v11.5" fill="none" stroke="#c9b48a" stroke-width="2" stroke-linejoin="round"/><path d="M12 21V11.5M8 15.2l4-4 4 4" fill="none" stroke="#ffe27a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`, "enter-icon");
/** Two cards fanned out: the Deck's icon, made from the card faces. */
export const DECK_ICON = pngIcon("deck", "deck-icon");
export const skillSprite = (id: UpgradeId) => {
  if (id === "bombs") return bombIcon("skill-sprite");
  const card = SKILL_CARDS[id];
  if (card) return pngIcon(`card-${card}`, "skill-sprite card-sprite");
  const detail = SKILL_DETAIL_SPRITES[id];
  if (detail) return pngIcon(detail, "skill-sprite");
  const item = SKILL_ITEM_SPRITES[id];
  if (item) return itemSprite(item, "skill-sprite");
  if (SKILL_SILVER.has(id)) return uiSprite("gold", "skill-sprite silver-sprite");
  return uiSprite(SKILL_UI_SPRITES[id] ?? "inspiration", "skill-sprite");
};
/** An hourglass running gold beside a golden arrow up: the Research page,
 * Training and the Archives, what grows with time. */
export const RESEARCH_ICON = kitIcon("hourglass", `<svg class="research-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2.5h11M3 21.5h11" stroke="#c9b48a" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 2.5c0 5 4 6.5 4 9.5s-4 4.5-4 9.5h8c0-5-4-6.5-4-9.5s4-4.5 4-9.5z" fill="#1b1410" stroke="#e9e1c8" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.5 6h4L8.5 9.5zM5.8 20.5c.6-2.6 1.8-3.6 2.7-4.3.9.7 2.1 1.7 2.7 4.3z" fill="#ffc94a"/><path d="M18.5 4L23 9.5h-2.8V15h-3.4V9.5H14z" fill="#ffc94a" stroke="#5a3200" stroke-width="1.1" stroke-linejoin="round"/></svg>`, "research-icon");
/** The tab bar along the bottom, in order: icons only, each named for
 * screen readers and on hover. `board` is the active mode's board, its icon
 * that mode's (set by the HUD). */
export const NAV_TABS = [
  { id: "board", name: "Tower", icon: uiSprite("tower") },
  { id: "upgrades", name: "Upgrades", icon: uiSprite("inspiration") },
  { id: "deck", name: "Deck", icon: DECK_ICON },
  { id: "gear", name: "Gear", icon: uiSprite("gear") },
  { id: "research", name: "Research", icon: RESEARCH_ICON },
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
export const POINTER_SVG = kitIcon("pointer", `<svg viewBox="0 0 12 14" shape-rendering="crispEdges" aria-hidden="true">${POINTER_ROWS.flatMap((row, y) =>
  [...row].map((c, x) => (c === "." ? "" : `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === "#" ? "#2b1d14" : "#f3d9b8"}"/>`)),
).join("")}</svg>`, "tutorial-pointer-art");

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
