import type { CardId } from "../cards/cards.ts";
import { MAX_CARD_LEVEL } from "../cards/levels.ts";
import { CARD_RARITY_NAMES, CARD_RARITY_STARS, type CardRarity } from "../cards/rarity.ts";
import { cardLook, cardMaxLevel, levelIn, type TreeSave } from "../cards/trees.ts";

/** What the card marks read from the save: each card's XP and the levels
 * card buys opened on its tree. */
type Levels = Pick<TreeSave, "cardXp" | "cardBuys">;

/** The frame a card or tree node wears for its rarity, laid over it: none
 * for a plain common one, green for a common one card buys raised
 * (`upgraded`), silver with a shine now and then for uncommon, gold with
 * one for rare, a run of rainbow hues round the edge for epic, and white
 * over a shifting foil for legendary. */
export function rarityFrameHtml(rarity: CardRarity, upgraded: boolean) {
  if (rarity === "common" && !upgraded) return "";
  return `<span class="rarity-frame r-${rarity}${rarity === "common" ? " up" : ""}" aria-hidden="true"></span>`;
}

/** The stars a rarity wears: a hollow one for a raised common, one to
 * three gold ones from uncommon to epic, a purple one for legendary. */
export function rarityStarsHtml(rarity: CardRarity, upgraded: boolean) {
  const n = CARD_RARITY_STARS[rarity];
  if (!n && !upgraded) return "";
  const star = n ? "★" : "☆";
  return `<span class="rarity-stars r-${rarity}" aria-hidden="true">${star.repeat(Math.max(1, n))}</span>`;
}

/** What a card wears over its art: its rarity's frame and its level in
 * small type down its top left (none before level 1). */
export function cardLevelHtml(save: Levels, id: CardId) {
  const { level } = levelIn(save, id), { rarity, upgraded } = cardLook(save.cardBuys.opened, id);
  return rarityFrameHtml(rarity, upgraded) + (level ? `<span class="card-level" aria-hidden="true">${level}</span>` : "");
}

/** A card's level of its max level and its XP toward the next, as its
 * details and tooltip say it ("Level 3 / 10 · 120/800 XP"): "max level"
 * at 60, and at a lower cap, the XP it keeps gathering toward the levels a
 * card buy will open. A card's points are its level, so they go unsaid. */
function levelText(save: Levels, id: CardId) {
  const { level, into, needed, capped } = levelIn(save, id), head = `Level ${level} / ${cardMaxLevel(save.cardBuys.opened, id)}`;
  if (level >= MAX_CARD_LEVEL) return { head, xp: "max level" };
  const xp = `${Math.min(into, needed).toLocaleString("en-US")}/${needed.toLocaleString("en-US")} XP`;
  return { head, xp: capped ? `${xp} · buy cards to raise the max` : xp };
}

/** A card's XP toward its next level, laid over the grey rule between its
 * art and its name: the rule itself, filled in white from the left (full
 * at level 60; at a lower cap, the XP it keeps gathering, up to full). */
export function cardXpBarHtml(save: Levels, id: CardId) {
  const { level, into, needed } = levelIn(save, id);
  const share = level >= MAX_CARD_LEVEL ? 1 : Math.min(1, into / needed);
  return `<span class="card-xp" aria-hidden="true"><span style="width:${+(share * 100).toFixed(2)}%"></span></span>`;
}

/** A card's rarity (with its stars), and its level of its max level with
 * its XP toward the next, as its details say them. */
export function cardLevelLines(save: Levels, id: CardId) {
  const { rarity, upgraded } = cardLook(save.cardBuys.opened, id), { head, xp } = levelText(save, id);
  return `<p class="card-rarity-line r-${rarity}">${rarityStarsHtml(rarity, upgraded)}${CARD_RARITY_NAMES[rarity]}</p>`
    + `<p class="card-level-line"><b>${head}</b> · ${xp}</p>`;
}

/** A card's tooltip line for its level ("Level 3 / 10 · 120/800 XP"). */
export function cardLevelTitle(save: Levels, id: CardId) {
  const { head, xp } = levelText(save, id);
  return `${head} · ${xp}`;
}
