/** Live text for the optional PNG kit; UI and Game themes gate it separately. */
export const SPRITE_FONT = "Tower Pixel";
let pending: Promise<void> | undefined, revision = 0;
const listeners = new Set<() => void>();
export const spriteFontRevision = () => revision;
export const onSpriteFontLoaded = (listener: () => void) => { listeners.add(listener); };
export function loadSpriteFont() {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  return pending ??= document.fonts.load(`16px "${SPRITE_FONT}"`).then(() => {
    revision++;
    listeners.forEach(listener => listener());
  }).catch(() => { /* The local fallback remains readable if loading fails. */ });
}
/** Keep the original font string byte-for-byte when the Game kit is off. */
export function boardFont(styled: boolean | undefined, size: number, weight: string | number = 700, legacy = "Cinzel") {
  if (!styled) return `${weight} ${size}px ${legacy}`;
  void loadSpriteFont();
  return `${weight} ${Math.round(size)}px "${SPRITE_FONT}", monospace`;
}
