import { SPRITE_ASSETS } from "./assets.ts";
import { kitImage, preloadKitImage } from "./kit.ts";

const BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const decoded = new Map<string, HTMLImageElement>();
async function decodeImage(url: string) {
  const image = decoded.get(url) ?? new Image();
  decoded.set(url, image);
  if (!image.src) image.src = url;
  await image.decode();
}

/** Decode every shipped sprite before gameplay, including later pages,
 * towers and animation frames. A failed asset keeps the loading screen up. */
export async function preloadSprites(progress: (loaded: number, total: number) => void) {
  let next = 0, loaded = 0, failed = false;
  progress(0, SPRITE_ASSETS.length);
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (!failed && next < SPRITE_ASSETS.length) {
      const path = SPRITE_ASSETS[next++];
      try {
        if (path.startsWith("assets/style/")) {
          const id = path.slice("assets/style/".length, -4);
          await preloadKitImage(id);
          if (!kitImage(id)) throw new Error(`Sprite unavailable: ${path}`);
        } else {
          await decodeImage(`${BASE}${path}`);
        }
        if (!failed) progress(++loaded, SPRITE_ASSETS.length);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }));
}

/** Newly built controls must also finish loading their decoded cached PNGs
 * before the first visible frame; hidden elements are included. */
export async function finishInterfaceLoading(root: HTMLElement) {
  const backgrounds = new Set<string>();
  const visit = (rules: CSSRuleList, base: string) => {
    for (const rule of [...rules]) {
      if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules, base);
      for (const match of rule.cssText.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        if (/\.(png|svg|webp|jpe?g|gif)([?#]|$)/i.test(match[1])) backgrounds.add(new URL(match[1], base).href);
      }
    }
  };
  for (const sheet of [...document.styleSheets]) visit(sheet.cssRules, sheet.href ?? document.baseURI);
  await Promise.all([...backgrounds].map(decodeImage));
  await Promise.all([...root.querySelectorAll("img")].map(image => image.decode()));
  await Promise.all([...document.fonts].map(face => face.load()));
  await document.fonts.ready;
}
