import type { CardId } from "../cards/cards.ts";
import { MAX_CARD_LEVEL, cardMaxLevel, levelIn, readyToAscend, type CardLevelSave } from "../cards/levels.ts";
import { CARD_RARITY_NAMES, CARD_RARITY_STARS, rarityAt, type CardRarity } from "../cards/rarity.ts";

/** The frame a card wears for its rarity, laid over it: grey for base,
 * brown for common, green for uncommon, silver with a shine now and then
 * for rare, gold with one for epic, a run of rainbow hues round the edge
 * for legendary, and white over a shifting foil on black for mythic. */
export function rarityFrameHtml(rarity: CardRarity) {
  return `<span class="rarity-frame r-${rarity}" aria-hidden="true"></span>`;
}

/** The stars a rarity wears: a hollow green one for uncommon, one to three
 * gold ones from rare to legendary, a purple one for mythic. */
export function rarityStarsHtml(rarity: CardRarity) {
  const n = CARD_RARITY_STARS[rarity];
  if (!n) return "";
  const star = rarity === "uncommon" ? "☆" : "★";
  return `<span class="rarity-stars r-${rarity}" aria-hidden="true">${star.repeat(n)}</span>`;
}

/** What a card wears over its art: its rarity's frame and its level in
 * small type down its top left (none before level 1). */
export function cardLevelHtml(save: CardLevelSave, id: CardId) {
  const { level } = levelIn(save, id);
  return rarityFrameHtml(rarityAt(level)) + (level ? `<span class="card-level" aria-hidden="true">${level}</span>` : "");
}

/** A card's level of its max level and its XP toward the next, as its
 * details and tooltip say it ("Level 3 / 10 · 120/800 XP"), and, once it
 * can't level further, why: it waits to ascend, or it is at level 60. */
function levelText(save: CardLevelSave, id: CardId) {
  const { level, into, needed } = levelIn(save, id), head = `Level ${level} / ${cardMaxLevel(save.cardAscension, id)}`;
  if (level >= MAX_CARD_LEVEL) return { head, xp: "", flag: "MAX" };
  const xp = `${Math.min(into, needed).toLocaleString("en-US")}/${needed.toLocaleString("en-US")} XP`;
  return { head, xp, flag: readyToAscend(save, id) ? "Ready to ascend" : "" };
}

/** A card's XP toward its next level, laid over the grey rule between its
 * art and its name: the rule itself, filled in white from the left (full
 * at level 60, and while it waits to ascend). */
export function cardXpBarHtml(save: CardLevelSave, id: CardId) {
  const { level, into, needed } = levelIn(save, id);
  const share = level >= MAX_CARD_LEVEL ? 1 : Math.min(1, into / needed);
  return `<span class="card-xp" aria-hidden="true"><span style="width:${+(share * 100).toFixed(2)}%"></span></span>`;
}

/** A card's rarity (with its stars), and its level of its max level with
 * its XP toward the next, as its details say them: "Ready to ascend" or
 * "MAX" in green after them once it levels no further. */
export function cardLevelLines(save: CardLevelSave, id: CardId) {
  const rarity = rarityAt(levelIn(save, id).level), { head, xp, flag } = levelText(save, id);
  return `<p class="card-rarity-line r-${rarity}">${rarityStarsHtml(rarity)}${CARD_RARITY_NAMES[rarity]}</p>`
    + `<p class="card-level-line"><b>${head}</b>${xp ? ` · ${xp}` : ""}${flag ? ` <b class="card-level-flag">${flag}</b>` : ""}</p>`;
}

/** A card's tooltip line for its level ("Level 3 / 10 · 120/800 XP"). */
export function cardLevelTitle(save: CardLevelSave, id: CardId) {
  const { head, xp, flag } = levelText(save, id);
  return [head, xp, flag].filter(Boolean).join(" · ");
}
