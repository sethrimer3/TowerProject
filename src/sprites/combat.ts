/** Native combat pieces, all drawn at the board's 24-pixel tile density. */
export const ARROW_DIRECTIONS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"] as const;
export const COMBAT_MARKS = {
  flying: "combat-wing", ranged: "combat-ranged", fast: "combat-fast", armored: "combat-armor",
  rankUp: "combat-rank-up", rankDown: "combat-rank-down",
} as const;
export const SHIELD_SIZES = [48, 96, 144] as const;
export const COMBAT_SPRITES = [
  ...["arrow", "charged"].flatMap(kind => ARROW_DIRECTIONS.map(dir => `combat-${kind}-${dir}`)),
  "combat-shot", ...Object.values(COMBAT_MARKS),
  "combat-chest-supply", "combat-chest-equipment",
  ...SHIELD_SIZES.map(size => `combat-shield-${size}`),
];
/** Only the sprite's facing is quantized; flight positions stay continuous. */
export function arrowSprite(angle: number, charged: boolean) {
  const direction = (Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8;
  return `combat-${charged ? "charged" : "arrow"}-${ARROW_DIRECTIONS[direction]}`;
}
/** Select the closest native density without changing the bubble's reach. */
export const shieldSprite = (diameter: number) => `combat-shield-${SHIELD_SIZES.reduce((best, size) => Math.abs(size - diameter) < Math.abs(best - diameter) ? size : best, SHIELD_SIZES[0] as number)}`;
