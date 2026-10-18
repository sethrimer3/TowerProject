import { cardLevel, cardPoints, cardSheen, MAX_CARD_LEVEL } from "../card-levels.ts";

/** What a card wears for its level, laid over its art: the sheen of a high
 * level (silver from level 15, gold at the cap) and the level in small type
 * down its top left (none before level 1). */
export function cardLevelHtml(xp: number) {
  const { level } = cardLevel(xp), sheen = cardSheen(level);
  return (sheen ? `<span class="card-sheen ${sheen}" aria-hidden="true"></span>` : "")
    + (level ? `<span class="card-level" aria-hidden="true">${level}</span>` : "");
}

/** A card's level, its XP toward the next (X/Y) and its card points, as
 * its details say them. */
export function cardLevelLines(xp: number) {
  const { level, into, needed } = cardLevel(xp), points = cardPoints(xp);
  const progress = level >= MAX_CARD_LEVEL ? "Max level" : `${into.toLocaleString("en-US")}/${needed.toLocaleString("en-US")} XP`;
  return `<p class="card-level-line"><b>Level ${level}</b> · ${progress}</p>`
    + `<p class="card-points-line">${points} card point${points === 1 ? "" : "s"} · the card's upgrade tree is coming soon</p>`;
}

/** A card's tooltip line for its level ("Level 3 · 120/800 XP"). */
export function cardLevelTitle(xp: number) {
  const { level, into, needed } = cardLevel(xp);
  return `Level ${level} · ${level >= MAX_CARD_LEVEL ? "Max level" : `${into.toLocaleString("en-US")}/${needed.toLocaleString("en-US")} XP`}`;
}
