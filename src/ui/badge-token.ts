import { levelProgress, MAX_BADGE_LEVEL, badgeDef, badgeLevel, badgeValue, gateSign, type BadgeId } from "../badges.ts";
import { RARITIES } from "../shop/rarity.ts";

const STAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.05 6.6 7.2.8-5.36 4.9 1.5 7.1L12 17.6l-6.39 3.6 1.5-7.1L1.75 9.2l7.2-.8z"/></svg>`;

/** A badge's colours, as CSS variables: its own and its rarity's. */
export function badgeStyle(id: BadgeId) {
  const def = badgeDef(id);
  return `--badge:${def.color};--rarity:${RARITIES[def.rarity].color}`;
}

/** The star on a token's corner and the level written on it. */
export const levelStar = (level: number) => `<span class="badge-level">${STAR_SVG}<b>${level}</b></span>`;

/** A badge's token: a rounded square in its rarity's colour with its
 * symbol, and its level on a star at the corner. */
export function tokenHtml(id: BadgeId, level: number, extra = "") {
  const def = badgeDef(id);
  return `<span class="badge-token rarity-${def.rarity}${extra ? ` ${extra}` : ""}" style="${badgeStyle(id)}"><span class="badge-glyph">${def.glyph}</span>${levelStar(level)}</span>`;
}

/** The small mark a card wears for the badge it holds. */
export function cardBadgeHtml(id: BadgeId) {
  const def = badgeDef(id);
  return `<span class="badge-mark rarity-${def.rarity}" style="${badgeStyle(id)}" title="${def.name}" aria-label="Badge: ${def.name}">${def.glyph}</span>`;
}

/** "2/3": copies toward the next level, or MAX at the top. */
export function progressText(copies: number) {
  const p = levelProgress(copies);
  return p ? `${p.have}/${p.need}` : badgeLevel(copies) >= MAX_BADGE_LEVEL ? "MAX" : "";
}

/** What badge `id` does at `level` (a gate at the threshold `pick`). */
export function badgeText(id: BadgeId, level: number, pick = 0) {
  return badgeDef(id).text(badgeValue(id, level, pick));
}

/** Every level's value of badge `id`, concisely, the one in use (`level`'s,
 * or a gate's picked threshold) in bold: "By level: 1 · 4 · <b>9</b> · … 49 HP". */
export function badgeLevelsHtml(id: BadgeId, level: number, pick = 0) {
  const def = badgeDef(id), gate = def.kind === "gate";
  const current = gate ? Math.max(0, Math.min(pick, level - 1)) : level - 1;
  const values = def.values.map((v, i) => {
    const text = gate ? `${gateSign(id) === "<" ? "&lt;" : "≥"}${v}` : String(v);
    return i === current ? `<b>${text}</b>` : text;
  });
  return `<small class="badge-levels">By level: ${def.lead ? `${def.lead} ` : ""}${values.join(" · ")} ${def.unit}</small>`;
}
