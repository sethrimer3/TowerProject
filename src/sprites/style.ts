import type { Save } from "../save/shape.ts";
import { gameLook, uiLook } from "../theme-collection.ts";

/** The starting Medieval interface and the free Classic look share the
 * default sprite kit. Every other owned UI theme supplies its own art. */
export function usesUiSprites(save: Pick<Save, "settings" | "themes">) {
  const look = uiLook(save);
  return look === "medieval" || look === "classic";
}

/** A Game theme overrides world sprites independently of the UI theme.
 * Classic always uses the shared pixel-art kit. */
export function usesGameSprites(save: Pick<Save, "settings" | "themes">) {
  return gameLook(save) === "classic";
}
