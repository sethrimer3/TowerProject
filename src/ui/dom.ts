import type { CardId } from "../cards.ts";
import type { UpgradeId } from "../config.ts";
import type { EquipmentSlot } from "../equipment.ts";
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

export type UiSprite = "tower" | "delve" | "defend" | "gear" | "upgrades" | "settings" | "health" | "attack" | "defense" | "undo" | "automove" | "revive" | "log" | "arrow-up" | "arrow-down" | "arrow-left" | "arrow-right" | EquipmentSlot | "gold";
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
/** A small screen with a play mark: watching an ad. */
export const adIcon = (className = "ad-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="#2b2f3a" stroke="#e9e1c8" stroke-width="1.6"/><path d="M10 9l5 3-5 3z" fill="#ffc94a"/></svg>`;
/** The Gold coin, sized to sit in a line of text. */
export const goldIcon = () => uiSprite("gold", "ui-sprite gold-icon");
/** A cut cyan gem, the Gems currency's icon (drawn like the board's). */
export const gemIcon = (className = "gem-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5h9L20 9.5 12 20.5 4 9.5z" fill="#2fa9e0"/><path d="M7.5 5h9L20 9.5H4z" fill="#8fe6ff"/><path d="M7.5 5L10 9.5 12 20.5 14 9.5 16.5 5M10 9.5L12 5 14 9.5" fill="none" stroke="#e1faff" stroke-width="0.8" stroke-linejoin="round"/><path d="M7.5 5h9L20 9.5 12 20.5 4 9.5z" fill="none" stroke="#0d3a5c" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
export const itemSprite = (name: keyof typeof AREA1_ITEM_URLS, className = "ui-sprite") =>
  `<img class="${className}" src="${AREA1_ITEM_URLS[name]}" alt="" aria-hidden="true">`;

const SKILL_ITEM_SPRITES: Partial<Record<UpgradeId, keyof typeof AREA1_ITEM_URLS>> = {
  attack: "upgrade_attack",
  defense: "upgrade_defense",
  yellow: "key_yellow", blue: "key_blue", red: "key_red", extraKey: "key_yellow",
  greaterHeal: "potion_flat", recovery: "potion_percent",
};
const SKILL_UI_SPRITES: Partial<Record<UpgradeId, UiSprite>> = {
  hp: "health", inspirationUndos: "undo", undos: "undo", archives: "log",
  delve: "delve", gear: "gear", moveSpeed: "automove", training: "arrow-up", fasterTrainers: "automove",
  revive: "revive", spareChange: "gold", loot: "gold", legacy: "tower", quality: "tower",
  wisdomFocus: "settings", wisdomMemory: "undo", wisdomSight: "upgrades",
  renownBanner: "tower", renownOath: "defense", renownCrown: "gear",
};
/** Skills about Silver show the Gold coin drained of colour, as the purse does. */
const SKILL_SILVER = new Set<UpgradeId>(["wealthy", "wishingWell"]);
/** Skills about the hand show a card face. */
const SKILL_CARDS: Partial<Record<UpgradeId, CardId>> = { handOrdering: "stairs", combatStance: "monster", cardHeal: "heal", cardGear: "equipment", blueKey: "blueKey" };
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
export const TAB_ICONS = {
  tower: uiSprite("tower"), delve: uiSprite("delve"), deck: DECK_ICON, defend: uiSprite("defend"), gear: uiSprite("gear"),
  upgrades: uiSprite("upgrades"), settings: uiSprite("settings"),
};
export const SLOT_ICONS: Record<EquipmentSlot, string> = {
  weapon: uiSprite("weapon"), shield: uiSprite("shield"), helmet: uiSprite("helmet"),
  chestplate: uiSprite("chestplate"), leggings: uiSprite("leggings"), boots: uiSprite("boots"),
  gloves: uiSprite("gloves"), necklace: uiSprite("necklace"), ring: uiSprite("ring"),
};
