import { UI_ATLAS } from "./ui-atlas-data.ts";
import { WORLD_ATLAS } from "./world-atlas-data.ts";
const ATLASES = [UI_ATLAS, WORLD_ATLAS];
const BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
export const uiAtlasUrl = `${BASE}${UI_ATLAS.image}?v=${UI_ATLAS.revision}`;
type Region = { x: number; y: number; width: number; height: number };
const regions: Record<string, Region> = { ...UI_ATLAS.regions, ...WORLD_ATLAS.regions };
const owner = (path: string) => path in UI_ATLAS.regions ? UI_ATLAS : WORLD_ATLAS;
const atlasUrl = (atlas: typeof ATLASES[number]) => `${BASE}${atlas.image}?v=${atlas.revision}`;
export type AtlasCanvas = HTMLCanvasElement & { naturalWidth: number; naturalHeight: number; complete: boolean; src: string; decode: () => Promise<void> };
let enabled = typeof window !== "undefined" && typeof window.location !== "undefined";
try { const saved = JSON.parse(localStorage.getItem("towerdelve.v1") ?? "null")?.settings?.experimentalAtlas; if (typeof saved === "boolean") enabled = saved; } catch { /* Keep the environment default for unreadable saves. */ }
export const uiAtlasEnabled = () => enabled;
export const atlasRegion = (path: string) => enabled ? regions[path] : undefined;
export function atlasPath(url: string, base = document.baseURI) {
  const resolved = new URL(url, base);
  if (resolved.origin !== new URL(document.baseURI).origin) return undefined;
  const at = resolved.pathname.lastIndexOf("/assets/");
  const path = at < 0 ? "" : resolved.pathname.slice(at + 1);
  return regions[path] ? path : undefined;
}
const images = new Map<string, HTMLImageElement>();
let pending: Promise<void> | undefined;
const slices = new Map<string, AtlasCanvas>();
export function atlasSlice(path: string) {
  const r = atlasRegion(path), atlas = owner(path), image = images.get(atlas.image);
  if (!r || !image?.complete || !image.naturalWidth) return null;
  let canvas = slices.get(path);
  if (!canvas) {
    canvas = document.createElement("canvas") as AtlasCanvas;
    canvas.width = canvas.naturalWidth = r.width; canvas.height = canvas.naturalHeight = r.height;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("UI atlas requires a 2D canvas");
    c.imageSmoothingEnabled = false;
    c.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    canvas.complete = true; canvas.src = `${atlasUrl(atlas)}#${path}`; canvas.decode = () => Promise.resolve();
    slices.set(path, canvas);
  }
  return canvas;
}
export function atlasIcon(path: string, className: string) {
  const r = atlasRegion(path), atlas = owner(path);
  if (!r) return null;
  const px = r.x / (atlas.width - r.width) * 100, py = r.y / (atlas.height - r.height) * 100;
  return `<span class="${className} atlas-region" style="background-image:url('${atlasUrl(atlas)}');background-size:${atlas.width / r.width * 100}% ${atlas.height / r.height * 100}%;background-position:${px}% ${py}%;background-repeat:no-repeat"></span>`;
}
export function drawAtlas(c: CanvasRenderingContext2D, path: string, x: number, y: number, width: number, height: number) {
  const r = atlasRegion(path), atlas = owner(path), image = images.get(atlas.image);
  if (!r || !image?.complete || !image.naturalWidth) return false;
  c.save(); c.imageSmoothingEnabled = false;
  c.drawImage(image, r.x, r.y, r.width, r.height, x, y, width, height);
  c.restore(); return true;
}
/** Two network images; CSS nine-slice/repeat surfaces are cut in memory from them. */
export function prepareUiAtlas() {
  if (!enabled) return Promise.resolve();
  return pending ??= (async () => {
    document.documentElement.classList.add("experimental-atlas");
    await Promise.all(ATLASES.map(async atlas => {
      const image = new Image(); images.set(atlas.image, image); image.src = atlasUrl(atlas);
      await image.decode();
      if (image.naturalWidth !== atlas.width || image.naturalHeight !== atlas.height) throw new Error("Atlas dimensions do not match its manifest");
    }));
    await Promise.all(Object.entries(UI_ATLAS.cssVariables).map(async ([path, variable]) => {
      const canvas = atlasSlice(path)!;
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error(`Cannot slice ${path}`))));
      const url = URL.createObjectURL(blob), decoded = new Image(); decoded.src = url;
      await decoded.decode();
      document.documentElement.style.setProperty(variable, `url("${url}")`);
    }));
  })();
}
