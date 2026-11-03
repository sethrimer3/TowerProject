import { UI_ATLAS } from "./ui-atlas-data.ts";
const BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
export const uiAtlasUrl = `${BASE}${UI_ATLAS.image}?v=${UI_ATLAS.revision}`;
type Region = { x: number; y: number; width: number; height: number };
const regions: Record<string, Region> = UI_ATLAS.regions;
export type AtlasCanvas = HTMLCanvasElement & { naturalWidth: number; naturalHeight: number; complete: boolean; src: string; decode: () => Promise<void> };
let enabled = false;
try { enabled = JSON.parse(localStorage.getItem("towerdelve.v1") ?? "null")?.settings?.experimentalAtlas === true; } catch { /* Default to individual assets for unreadable saves. */ }
export const uiAtlasEnabled = () => enabled;
export const atlasRegion = (path: string) => enabled ? regions[path] : undefined;
export function atlasPath(url: string, base = document.baseURI) {
  const resolved = new URL(url, base);
  if (resolved.origin !== new URL(document.baseURI).origin) return undefined;
  const at = resolved.pathname.lastIndexOf("/assets/");
  const path = at < 0 ? "" : resolved.pathname.slice(at + 1);
  return regions[path] ? path : undefined;
}
let image: HTMLImageElement | undefined;
let pending: Promise<void> | undefined;
const slices = new Map<string, AtlasCanvas>();
export function atlasSlice(path: string) {
  const r = atlasRegion(path);
  if (!r || !image?.complete || !image.naturalWidth) return null;
  let canvas = slices.get(path);
  if (!canvas) {
    canvas = document.createElement("canvas") as AtlasCanvas;
    canvas.width = canvas.naturalWidth = r.width; canvas.height = canvas.naturalHeight = r.height;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("UI atlas requires a 2D canvas");
    c.imageSmoothingEnabled = false;
    c.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    canvas.complete = true; canvas.src = `${uiAtlasUrl}#${path}`; canvas.decode = () => Promise.resolve();
    slices.set(path, canvas);
  }
  return canvas;
}
export function atlasIcon(path: string, className: string) {
  const r = atlasRegion(path);
  if (!r) return null;
  const px = r.x / (UI_ATLAS.width - r.width) * 100, py = r.y / (UI_ATLAS.height - r.height) * 100;
  return `<span class="${className} atlas-region" style="background-image:url('${uiAtlasUrl}');background-size:${UI_ATLAS.width / r.width * 100}% ${UI_ATLAS.height / r.height * 100}%;background-position:${px}% ${py}%;background-repeat:no-repeat"></span>`;
}
export function drawAtlas(c: CanvasRenderingContext2D, path: string, x: number, y: number, width: number, height: number) {
  const r = atlasRegion(path);
  if (!r || !image?.complete || !image.naturalWidth) return false;
  c.save(); c.imageSmoothingEnabled = false;
  c.drawImage(image, r.x, r.y, r.width, r.height, x, y, width, height);
  c.restore(); return true;
}
/** One network image; CSS nine-slice/repeat surfaces are cut in memory from it. */
export function prepareUiAtlas() {
  if (!enabled) return Promise.resolve();
  return pending ??= (async () => {
    document.documentElement.classList.add("experimental-atlas");
    image = new Image(); image.src = uiAtlasUrl;
    await image.decode();
    if (image.naturalWidth !== UI_ATLAS.width || image.naturalHeight !== UI_ATLAS.height) throw new Error("UI atlas dimensions do not match its manifest");
    await Promise.all(Object.entries(UI_ATLAS.cssVariables).map(async ([path, variable]) => {
      const canvas = atlasSlice(path)!;
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error(`Cannot slice ${path}`))));
      const url = URL.createObjectURL(blob), decoded = new Image(); decoded.src = url;
      await decoded.decode();
      document.documentElement.style.setProperty(variable, `url("${url}")`);
    }));
  })();
}
