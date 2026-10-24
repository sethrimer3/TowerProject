import { METALS, type MaterialId, type MetalId } from "../economy/materials.ts";
import { pngIcon, kitUrl, kitImage } from "./kit.ts";

export const METAL_BAR_URLS: Record<MetalId, string> = {
  iron: kitUrl("metal-iron-bar"),
  steel: kitUrl("metal-steel-bar"),
  silversteel: kitUrl("metal-silversteel-bar"),
  embersteel: kitUrl("metal-embersteel-bar"),
  starsteel: kitUrl("metal-starsteel-bar"),
  voidsteel: kitUrl("metal-voidsteel-bar"),
};

export function metalBarSprite(id: MetalId, className = "ui-sprite") {
  return pngIcon(`metal-${id}-bar`, className);
}

/** Every material's sprite art: the metal bars. */
const MATERIAL_SPRITE_URLS: Partial<Record<MaterialId, string>> = Object.fromEntries(METALS.map((m) => [m.materialId, METAL_BAR_URLS[m.id]]));
/** Materials share the startup-decoded image cache. */
export function materialImage(id: MaterialId) {
  const url = MATERIAL_SPRITE_URLS[id];
  return url ? kitImage(url.split("/").at(-1)!.replace(/\.png$/, "")) : null;
}
