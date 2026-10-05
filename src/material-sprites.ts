import { METALS, type MaterialId, type MetalId } from "./materials.ts";

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

/** Every material's sprite art: the metal bars. */
const MATERIAL_SPRITE_URLS: Partial<Record<MaterialId, string>> = Object.fromEntries(METALS.map((m) => [m.materialId, METAL_BAR_URLS[m.id]]));
const images = new Map<MaterialId, HTMLImageElement>();

/** The material's loaded sprite for drawing on a canvas, or null while it
 * loads or when the material has none. */
export function materialImage(id: MaterialId) {
  const url = MATERIAL_SPRITE_URLS[id];
  if (!url || typeof Image === "undefined") return null;
  let image = images.get(id);
  if (!image) {
    image = new Image();
    image.src = url;
    images.set(id, image);
  }
  return image.complete && image.naturalWidth ? image : null;
}
