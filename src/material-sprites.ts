import type { MetalId } from "./materials.ts";

const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";

export const METAL_BAR_URLS: Record<MetalId, string> = {
  iron: `${ASSET_BASE}assets/materials/iron-bar.png`,
  steel: `${ASSET_BASE}assets/materials/steel-bar.png`,
  silversteel: `${ASSET_BASE}assets/materials/silversteel-bar.png`,
  embersteel: `${ASSET_BASE}assets/materials/embersteel-bar.png`,
  starsteel: `${ASSET_BASE}assets/materials/starsteel-bar.png`,
  voidsteel: `${ASSET_BASE}assets/materials/voidsteel-bar.png`,
};

export function metalBarSprite(id: MetalId, className = "ui-sprite") {
  return `<img class="${className}" src="${METAL_BAR_URLS[id]}" alt="" aria-hidden="true">`;
}
