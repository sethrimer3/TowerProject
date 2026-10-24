import { kitImage } from "./kit.ts";

/** Native materials and small plants for the optional Classic board kit. */
export const MOSS_SPRITES = ["env-moss-green", "env-moss-teal", "env-moss-wall"] as const;
export const WATER_SPRITES = ["env-water-deep", "env-water-mid", "env-water-shore", "env-water-bank"] as const;
export const FLOWER_SPRITES = ["env-flower-cyan", "env-flower-violet", "env-flower-rose", "env-flower-gold"] as const;
export const GLOWCAP_SPRITES = ["env-glowcap-small", "env-glowcap-pair", "env-glowcap-cluster"] as const;
export const VINE_SPRITES = ["env-vine-leaves", "env-vine-tip"] as const;
export const ENVIRONMENT_SPRITES = [...MOSS_SPRITES, ...WATER_SPRITES, ...FLOWER_SPRITES, ...GLOWCAP_SPRITES, ...VINE_SPRITES];
export const FLOWER_LIGHTS: readonly (readonly number[])[] = [[136, 197, 219], [128, 96, 142], [214, 138, 134], [225, 187, 120]];
export const GLOWCAP_LIGHT: readonly number[] = [136, 197, 219];

export type SpritePixels = { width: number; height: number; data: Uint8ClampedArray };
const pixels = new Map<string, SpritePixels>();
/** Decode a PNG once for masked terrain bakes, retaining its literal pixels.
 * Loading images stay uncached so spriteRevision can replace the fallback. */
export function environmentPixels(id: string): SpritePixels | null {
  const cached = pixels.get(id);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const image = kitImage(id);
  if (!image) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const c = canvas.getContext("2d");
  if (!c) return null;
  c.imageSmoothingEnabled = false;
  c.drawImage(image, 0, 0);
  const decoded = { width: canvas.width, height: canvas.height, data: c.getImageData(0, 0, canvas.width, canvas.height).data };
  pixels.set(id, decoded);
  return decoded;
}
