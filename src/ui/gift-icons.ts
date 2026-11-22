import { pngIcon } from "../sprites/kit.ts";
import { GIFTS, type GiftStat } from "../economy/gifts.ts";

/** Each gift stat's picture, from the sprites the game already draws. */
const GIFT_SPRITES: Readonly<Record<GiftStat, string>> = {
  maxHp: "boon-max-hp", attack: "boon-attack", defense: "shield", silver: "boon-silver", xp: "badge-xp", regen: "boon-regen",
  shroud: "boon-shroud", potions: "potion-red", shards: "shard", provisions: "helmet", drop3: "chest-silver", critChance: "target",
  gold: "gold", keys: "key-yellow", drop5: "chest-gold", goldenFloor: "stairs", goldenGem: "gem-golden",
};

/** Gift `id`'s icon: its stat's picture in its rarity's frame. */
export function giftItemIcon(id: string, className = "gift-item") {
  const def = GIFTS[id];
  if (!def) return "";
  return `<span class="${className} ${def.rarity}" aria-hidden="true">${pngIcon(`ui-equip-frame-${def.rarity}`, "gift-frame")}${pngIcon(GIFT_SPRITES[def.stat], "gift-stat")}</span>`;
}
