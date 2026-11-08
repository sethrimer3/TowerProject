import { ITEM_KIT } from "../sprites/items.ts";
import { relicSpriteId } from "../sprites/relics.ts";
import { BREAKTHROUGH_SPRITE, INSPIRATION_SPRITE, kitIcon, pngIcon } from "../sprites/kit.ts";
import { CARDS } from "../cards/cards.ts";
import type { CardId } from "../cards/cards.ts";
import { LIMIT_BREAKS } from "../progression/training.ts";
import type { UpgradeId } from "../progression/upgrades.ts";
import type { RelicRarity } from "../events/catalog.ts";

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
  kitIcon("arrow-up", "", className);
/** A clock face: training time credit. */
export const clockIcon = (className = "clock-icon") =>
  kitIcon("hourglass", "", className);
/** A looping arrow: auto-continue, training the next rank again once one is done. */
export const redoIcon = (className = "redo-icon") =>
  kitIcon("redo", "", className);
/** A small screen with a play mark: watching an ad. */
export const adIcon = (className = "ad-icon") =>
  kitIcon("ad-screen", "", className);
/** A shopping cart: the Shop. */
/** A Bomb: the kit's sprite, or a black ball with a lit fuse. */
export const bombIcon = (className: string) => kitIcon("bomb", "", className);
export const CART_ICON = kitIcon("cart", "", "cart-icon");
/** The Gold coin, sized to sit in a line of text. */
export const goldIcon = () => uiSprite("gold", "ui-sprite gold-icon");
/** A cut cyan gem, the Gems currency's icon (drawn like the board's). */
export const gemIcon = (className = "gem-icon") =>
  kitIcon("gem", "", className);
/** Arcanite: a tall green crystal, worn wherever Shards are shown. */
export const arcaniteIcon = (className = "arcanite-icon") =>
  kitIcon("shard", "", className);
/** A Cell: a yellow triangle, the Archives' Speed Ups' currency. */
export const cellIcon = (className = "cell-icon") =>
  kitIcon("cell", "", className);
/** A Medal: a gold disc with a star, hung from a red ribbon. */
export const medalIcon = (className = "medal-icon") =>
  kitIcon("medal", "", className);
/** A check mark in a rounded box: Missions. */
export const missionIcon = (className = "mission-icon") =>
  kitIcon("mission", "", className);
/** A pennant on a pole bearing a star: Events. */
export const eventIcon = (className = "event-icon") =>
  kitIcon("event", "", className);
/** Named relics use their catalog artwork; generic navigation and unknown
 * future relics retain the rarity pendant. Only the generic legendary
 * pendant is recolored, so actual tower rewards keep their material colors. */
export const relicIcon = (relic: RelicRarity | { name: string; rarity: RelicRarity }, className = "relic-icon") => {
  const id = typeof relic === "string" ? undefined : relicSpriteId(relic);
  if (id) return kitIcon(id, "", className);
  const rarity = typeof relic === "string" ? relic : relic.rarity;
  return rarity === "legendary" ? kitIcon("relic-epic", "", `${className} relic-legendary`) : kitIcon(`relic-${rarity}`, "", className);
};
/** A plain check mark: a weekly reward claimed. */
export const checkIcon = (className = "check-icon") =>
  kitIcon("check", "", className);
/** "1 Gem", "5 Gems". */
/** A trophy: a cup with handles on a stem and base, outlined in `stroke`
 * over `fill` (gold by default; each league's cup its own metal). */
export const trophyIcon = (className = "trophy-icon", stroke = "#ffd34d", fill = "#5a4210") =>
  kitIcon("trophy", "", className);
/** A shrine: a red gate's two posts under its curved lintel, a golden flame between. */
export const shrineIcon = (className = "shrine-icon") =>
  kitIcon("shrine", "", className);
/** A Tournament Ticket: a gold stub with notched ends and a perforation. */
export const ticketIcon = (className = "ticket-icon") =>
  kitIcon("ticket", "", className);
/** An Equipment Ticket: the Tournament's ticket, tinted cool blue so the two
 * never pass for each other. */
export const equipTicketIcon = (className = "equip-ticket-icon") =>
  kitIcon("ticket", "", className);
/** An envelope: Mail. */
export const mailIcon = (className = "mail-icon") =>
  kitIcon("mail", "", className);
/** A gift box: a reward waiting to be claimed. */
export const giftIcon = (className = "gift-icon") =>
  kitIcon("gift", "", className);
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
  renownBanner: "tower", renownOath: "defense", renownCrown: "gear", armorBreak: "defense",
  enemyLevelSkipLimitBreak: "arrow-up", shieldLimitBreak: "arrow-up",
  aetherShield: "defense", heroShield: "defense", shieldThorns: "defense", regrowShield: "defense", shieldRegen: "health",
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
  shroud: "ui-ward", critical: "goal-damage-prediction", critPrediction: "goal-damage-prediction", superCritical: "badge-star",
  thorns: "sword", lifesteal: "boon-lifesteal", parry: "goal-parry", regen: "boon-regen", regenResearch: "boon-regen",
  autoClimb: "play", fasterTrainers: "hourglass", freeTraining: "boon-free-up", buildout: "deck", manualHand: "card-exchange",
  ignore: "ignore", ignoreMore: "ignore", target: "target", targetMore: "target",
  cardBadges: "goal-badge-slots", dashBadge: "badge-dash", dash: "badge-dash", dashCombo: "badge-dash", endRush: "badge-dash", dashRegen: "badge-dash",
  keyLessBadges: "badge-yellowGate", keyAtLeastBadges: "badge-yellowAtLeast", largerHand: "goal-card-groups",
  wealthy: "silver", wishingWell: "silver", onTheJob: "silver", pocketMoney: "silver", interest: "silver", maxInterest: "silver",
  aiMemory: "goal-note-taking", aiEvaluation: "goal-combat-forecast", aiLookahead: "goal-attack-lore",
  renownCrown: "ui-crown",
  enemyLevelSkips: "badge-skip", enemyHpLevelSkips: "boon-enemy-hp-regen", enemyCombatLevelSkips: "boon-enemy-attack",
  avengingAngel: "combat-wing",
};
/** The forest's Enter button: an arrow going up into an arched doorway. */
export const ENTER_ICON = kitIcon("tower", "", "enter-icon");
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
export const RESEARCH_ICON = kitIcon("hourglass", "", "research-icon");
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
/** The tutorials' pointing hand. */
export const POINTER_SVG = kitIcon("pointer", "", "tutorial-pointer-art");

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
