import type { MaterialId, MetalId } from "./materials.ts";

const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";

export const METAL_BAR_URLS: Record<MetalId, string> = {
  iron: `${ASSET_BASE}assets/materials/iron-bar.png`,
  steel: `${ASSET_BASE}assets/materials/steel-bar.png`,
  silversteel: `${ASSET_BASE}assets/materials/silversteel-bar.png`,
  embersteel: `${ASSET_BASE}assets/materials/embersteel-bar.png`,
  starsteel: `${ASSET_BASE}assets/materials/starsteel-bar.png`,
  voidsteel: `${ASSET_BASE}assets/materials/voidsteel-bar.png`,
};

export const MONSTER_PART_URLS = {
  cinderSlimeBlob: `${ASSET_BASE}assets/materials/cinder-slime-blob.png`,
  emberNucleus: `${ASSET_BASE}assets/materials/ember-nucleus.png`,
  sentinelBone: `${ASSET_BASE}assets/materials/sentinel-bone.png`,
  gildedMarrow: `${ASSET_BASE}assets/materials/gilded-marrow.png`,
  duskFeather: `${ASSET_BASE}assets/materials/dusk-feather.png`,
  eclipsePinion: `${ASSET_BASE}assets/materials/eclipse-pinion.png`,
  ashenPlateShard: `${ASSET_BASE}assets/materials/ashen-plate-shard.png`,
  wardenSigil: `${ASSET_BASE}assets/materials/warden-sigil.png`,
  thievesTools: `${ASSET_BASE}assets/materials/thieves-tools.png`,
  knightsCrest: `${ASSET_BASE}assets/materials/knights-crest.png`,
  slimeGel: `${ASSET_BASE}assets/materials/slime-gel.png`,
  wardenHeartstone: `${ASSET_BASE}assets/materials/warden-heartstone.png`,
  skeletonBone: `${ASSET_BASE}assets/materials/skeleton-bone.png`,
  golemCore: `${ASSET_BASE}assets/materials/golem-core.png`,
  orcTusk: `${ASSET_BASE}assets/materials/orc-tusk.png`,
  frozenGargoyleShard: `${ASSET_BASE}assets/materials/frozen-gargoyle-shard.png`,
  ogreHide: `${ASSET_BASE}assets/materials/ogre-hide.png`,
  demonEmberheart: `${ASSET_BASE}assets/materials/demon-emberheart.png`,
  crystalDust: `${ASSET_BASE}assets/materials/crystal-dust.png`,
  amethystCore: `${ASSET_BASE}assets/materials/amethyst-core.png`,
  wraithEctoplasm: `${ASSET_BASE}assets/materials/wraith-ectoplasm.png`,
  coralCrest: `${ASSET_BASE}assets/materials/coral-crest.png`,
  trollWart: `${ASSET_BASE}assets/materials/troll-wart.png`,
  sporeheart: `${ASSET_BASE}assets/materials/sporeheart.png`,
  revenantShard: `${ASSET_BASE}assets/materials/revenant-shard.png`,
  blackstoneHeart: `${ASSET_BASE}assets/materials/blackstone-heart.png`,
  whelpScale: `${ASSET_BASE}assets/materials/whelp-scale.png`,
  celestialAegis: `${ASSET_BASE}assets/materials/celestial-aegis.png`,
} satisfies Partial<Record<MaterialId, string>>;

export function metalBarSprite(id: MetalId, className = "ui-sprite") {
  return `<img class="${className}" src="${METAL_BAR_URLS[id]}" alt="" aria-hidden="true">`;
}

export function monsterPartSprite(id: MaterialId, className = "ui-sprite") {
  const url = MONSTER_PART_URLS[id as keyof typeof MONSTER_PART_URLS];
  return url ? `<img class="${className}" src="${url}" alt="" aria-hidden="true">` : "";
}
