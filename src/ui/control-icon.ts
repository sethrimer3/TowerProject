import { SMALL_CONTROL_SPRITES } from "../sprite-controls.ts";
import { kitIcon } from "../sprite-kit.ts";
type Control = keyof typeof SMALL_CONTROL_SPRITES;
const FALLBACKS: Record<Control, string> = { close: "✕", back: "←", forward: "›", check: "✓", lock: "🔒", up: "▲", down: "▼", swap: "⇄", star: "★" };
/** A load-aware PNG pair that keeps the original theme's control symbol. */
export const controlIcon = (id: Control, fallback = FALLBACKS[id], className = "") =>
  kitIcon(SMALL_CONTROL_SPRITES[id], fallback, `ui-control-icon ${className}`.trim());
