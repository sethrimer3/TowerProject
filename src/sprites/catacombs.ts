import type {UndeadId, SpiritRarity, IngotId, DropId} from '../catacombs/catalog.ts';

/** Shared native subjects for the board, menus, currency tables and Codex. */
export const undeadSprite=(id:UndeadId)=>`catacomb-undead-${id}` as const;
export const spiritSprite=(rarity:SpiritRarity|'fragments')=>`catacomb-spirit-${rarity}` as const;
export const ingotSprite=(id:IngotId,ui=false)=>`catacomb-ingot-${ui?'ui-':''}${id}` as const;
export const buffSprite=(id:DropId)=>`catacomb-buff-${id}` as const;
export const catacombMenuSprite=(id:'skills'|'spirit'|'forge'|'academy'|'catacombs')=>`catacomb-menu-${id}` as const;
export const MAUSOLEUM_SPRITE='forest-mausoleum';
