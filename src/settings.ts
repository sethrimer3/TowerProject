/** A setting that is on or off. */
type Toggle = { kind: "toggle"; default: boolean; page?: { id: string; label: string; invert?: true } };
/** A setting that is one of a fixed list of values, each with its label. */
type Choice = { kind: "choice"; default: string | number; choices: readonly (readonly [string | number, string])[]; page?: { id: string; label: string } };
/** A number kept within `min`–`max`; out-of-range saved values are clamped
 * and rounded, not rejected. */
type Range = { kind: "range"; default: number; min: number; max: number; step: number; page?: { id: string; label: string; aria: string } };
export type Setting = Toggle | Choice | Range;

/** Every player setting: its default, what a save may hold, and, when it has
 * a `page`, its control's id and label on the Settings page. The Settings
 * type, the defaults and the save decoder all come from this table, so a new
 * setting is one row here. Rows are in saved key order. */
export const SETTINGS = {
  /** Use the original procedural renderers instead of bitmap art. */
  spritesOff: { kind: "toggle", default: false, page: { id: "sprites-off", label: "Turn off Sprites" } },
  weatherSound: { kind: "toggle", default: true, page: { id: "weather-sound", label: "Weather sounds" } },
  /** Hide the procedural environment dressing: moss, vines, plants, crates,
   * pools, and the forest's wind-blown grass. */
  decorOff: { kind: "toggle", default: false, page: { id: "decor", label: "Environment decor", invert: true } },
  /** Draw the board at 30 frames a second, instead of 60, whenever nothing
   * on it is moving. */
  batterySaver: { kind: "toggle", default: false, page: { id: "battery-saver", label: "Battery saver (30 fps while idle)" } },
  transition: {
    kind: "choice", default: "smooth", choices: [["smooth", "Smooth"], ["fast", "Fast"], ["instant", "Off (instant)"]],
    page: { id: "transition", label: "Movement transition" },
  },
  showArrows: { kind: "toggle", default: false, page: { id: "arrows", label: "Show directional buttons" } },
  /** Steps a second, for the hand and Automove; on the page once Movement
   * Speed is owned, up to 3 and one more per Movement Speed research level
   * (`Game.stepsPerSecond`, `speedChoices`). */
  speed: {
    kind: "choice", default: 3, choices: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, `${n} steps / sec`] as const),
    page: { id: "speed", label: "Movement speed" },
  },
  reduceMotion: { kind: "toggle", default: false, page: { id: "motion", label: "Reduce motion" } },
  /** Dungeon brightness, 20 (very dark) to 100 (default look). */
  brightness: { kind: "range", default: 100, min: 20, max: 100, step: 5, page: { id: "brightness", label: "Brightness", aria: "Dungeon brightness" } },
  /** Configurable on the Settings page once the autoPersist upgrade is
   * owned; otherwise Automove always turns off on death. */
  autoOffOnDeath: { kind: "toggle", default: true, page: { id: "auto-off-death", label: "Automove turns off upon death" } },
  /** Tapping a tile walks there immediately instead of requiring a second
   * tap to confirm. The info box still appears either way. */
  oneTapMove: { kind: "toggle", default: false, page: { id: "one-tap", label: "Move with one tap" } },
  /** Which tile-inspection surfaces appear on tap. "none" makes a single tap
   * always walk there directly. */
  infoDisplay: {
    kind: "choice", default: "both", choices: [["both", "Popup + status line"], ["popup", "Popup only"], ["status", "Status line only"], ["none", "Off"]],
    page: { id: "info-display", label: "Tile info display" },
  },
  /** Unlimited currency, every floor section and game mode unlocked. */
  devMode: { kind: "toggle", default: false, page: { id: "dev-mode", label: "Dev mode (unlimited currency, all floors &amp; modes unlocked)" } },
  /** Play each fight out strike by strike, damage rising off whoever was
   * struck, instead of settling it at once. */
  fightAnimation: { kind: "toggle", default: true, page: { id: "fight-animation", label: "Animate fights" } },
  /** Dev: every purchase is allowed and costs nothing, and research
   * completes the moment it starts. Unlocks and grants nothing itself. */
  freePurchases: { kind: "toggle", default: false, page: { id: "free-purchases", label: "Dev: free purchases (instant research)" } },
} as const satisfies Record<string, Setting>;

export type SettingKey = keyof typeof SETTINGS;
type ValueOf<S> = S extends { kind: "toggle" } ? boolean
  : S extends { choices: readonly (readonly [infer V, string])[] } ? V
  : number;
export type Settings = { -readonly [K in SettingKey]: ValueOf<(typeof SETTINGS)[K]> };

const KEYS = Object.keys(SETTINGS) as SettingKey[];

export function defaultSettings(): Settings {
  return Object.fromEntries(KEYS.map((k) => [k, SETTINGS[k].default])) as Settings;
}

/** A saved value for `setting` if the save may hold it, otherwise undefined. */
export function settingValue(setting: Setting, v: unknown): boolean | string | number | undefined {
  switch (setting.kind) {
    case "toggle": return typeof v === "boolean" ? v : undefined;
    case "choice": return setting.choices.some(([c]) => c === v) ? v as string | number : undefined;
    case "range": return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(setting.max, Math.max(setting.min, v))) : undefined;
  }
}

/** Settings from a save: each value it may hold, the rest defaulted. */
export function decodeSettings(raw: any): Settings {
  const s = raw ?? {}, out = defaultSettings() as Record<SettingKey, unknown>;
  for (const k of KEYS) out[k] = settingValue(SETTINGS[k], s[k]) ?? out[k];
  // Older saves had a single showInfoBoxes toggle.
  if (settingValue(SETTINGS.infoDisplay, s.infoDisplay) === undefined && s.showInfoBoxes === false) out.infoDisplay = "none";
  return out as Settings;
}
