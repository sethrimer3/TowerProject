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
  /** Steps a second, for the hand and Automove, set by the arrows beside the
   * run's play button (no row on the page): 0 (paused) up to 3, and one more
   * per Movement Speed research level; a new hero starts at 2, and the
   * forest walks at least 3 (`Game.stepsPerSecond`, `Game.changeSpeed`). */
  speed: { kind: "choice", default: 2, choices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, `${n} steps / sec`] as const) },
  reduceMotion: { kind: "toggle", default: false, page: { id: "motion", label: "Reduce motion" } },
  /** Dungeon brightness, 20 (very dark) to 100 (default look). */
  brightness: { kind: "range", default: 100, min: 20, max: 100, step: 5, page: { id: "brightness", label: "Brightness", aria: "Dungeon brightness" } },
  /** Which tile-inspection surfaces appear on tap. */
  infoDisplay: {
    kind: "choice", default: "both", choices: [["both", "Popup + status line"], ["popup", "Popup only"], ["status", "Status line only"], ["none", "Off"]],
    page: { id: "info-display", label: "Tile info display" },
  },
  /** The UI theme worn round the board (theme-collection.ts): Classic, or
   * Medieval (the keep's stone, oak, brass and parchment, with its
   * synthesized sounds), Neon (warm glowing laser lines on black),
   * Terminal (an old green-phosphor monitor), Desktop (an old windowed
   * desktop computer: grey bevelled windows on teal), Glyph (glowing
   * many-coloured ASCII cards on purple), Ember (warm glowing ASCII on a
   * maroon field of dim letters), Yang (ink on pale rice paper, spare and
   * still), Yin (pale ink on a dark stone ground), Shiro (flat black on
   * white, nothing more), Kuro (flat white on black), Arcade (an old
   * arcade cabinet's screen: pixel type in a blue maze's frames), System
   * (an old one-bit computer: black-framed white windows on a dithered grey
   * desktop), Orbit (a space-age starship's console: glass capsules on a
   * starfield), Pixel (chunky pixel-art panels with stepped corners and a
   * pressed-in bevel on a night sky of pixel stars), Doodle (a page drawn
   * with a mouse in a simple paint program: wobbly black outlines and flat
   * bright fills on white paper) or Murk (Doodle after dark: the same
   * wobbly outlines with muted fills on dusky paper under a scribbled moon)
   * once owned. Chosen on the Settings page's UI Themes menu, not a row of its
   * own; a new hero starts in Medieval. */
  uiTheme: { kind: "choice", default: "medieval", choices: [["classic", "Classic"], ["medieval", "Medieval"], ["neon", "Neon"], ["terminal", "Terminal"], ["desktop", "Desktop"], ["glyph", "Glyph"], ["ember", "Ember"], ["yang", "Yang"], ["yin", "Yin"], ["shiro", "Shiro"], ["kuro", "Kuro"], ["arcade", "Arcade"], ["system", "System"], ["orbit", "Orbit"], ["pixel", "Pixel"], ["doodle", "Doodle"], ["murk", "Murk"]] },
  /** The Game theme the dungeon is drawn in: Classic, or Neon, Terminal
   * (a green-phosphor text dungeon), Desktop (an old desktop computer's
   * mine-sweeping field), Glyph (a many-coloured neon ASCII dungeon on
   * purple), Ember (warm glowing ASCII on maroon, enemies' red eyes), Yang
   * (a raked sand garden of ink strokes), Yin (the same garden by night),
   * Shiro (flat blocks and the simplest shapes on white), Kuro (the same
   * on black), Arcade (a pixel maze of crawlers and pellets), System (an old
   * one-bit paint program's dungeon of bricks, bombs and folders) Kroz (the
   * old Kroz games' bright text-mode characters) Orbit (a space station
   * adrift among the stars, its crew and creatures our own), Pixel (a
   * shaded, outlined pixel-art dungeon of flagstones, slate walls and little
   * creatures), Doodle (a dungeon drawn with a mouse in a simple paint
   * program, its hero a stick figure) or Murk (Doodle's dungeon after dark:
   * ghosts, bats, cobwebs and candles, its hero a glum stick figure in a
   * scarf) once owned. Chosen on the Game Themes menu. */
  gameTheme: { kind: "choice", default: "classic", choices: [["classic", "Classic"], ["neon", "Neon"], ["terminal", "Terminal"], ["desktop", "Desktop"], ["glyph", "Glyph"], ["ember", "Ember"], ["yang", "Yang"], ["yin", "Yin"], ["shiro", "Shiro"], ["kuro", "Kuro"], ["arcade", "Arcade"], ["system", "System"], ["kroz", "Kroz"], ["orbit", "Orbit"], ["pixel", "Pixel"], ["doodle", "Doodle"], ["murk", "Murk"]] },
  /** Unlimited currency, every floor section and game mode unlocked. */
  devMode: { kind: "toggle", default: false, page: { id: "dev-mode", label: "Dev mode (unlimited currency, all floors &amp; modes unlocked)" } },
  /** Play each fight out strike by strike, damage rising off whoever was
   * struck, instead of settling it at once and showing it in summary. Only
   * Instant Combat shows it, so fights play out until then
   * (`Game.animatesFights`). */
  fightAnimation: { kind: "toggle", default: true, page: { id: "fight-animation", label: "Animate fights" } },
  /** Dev: every purchase is allowed and costs nothing, and research
   * completes the moment it starts. Unlocks and grants nothing itself. */
  freePurchases: { kind: "toggle", default: false, page: { id: "free-purchases", label: "Dev: free purchases (instant research)" } },
  /** How many Training ranks one press buys (`buy-quantity.ts`): chosen
   * on the Training tab or the run's training bar once Buy Quantity is
   * owned, not on the Settings page. */
  buyQuantity: {
    kind: "choice", default: 1, choices: [[1, "x1"], [5, "x5"], [10, "x10"], [25, "x25"], [100, "x100"], ["max", "Max"]],
  },
  /** The same choice for the run's Silver training bar and for the Gear
   * page's provisions: each screen keeps its own, so none shares a value
   * with another. */
  runBuyQuantity: {
    kind: "choice", default: 1, choices: [[1, "x1"], [5, "x5"], [10, "x10"], [25, "x25"], [100, "x100"], ["max", "Max"]],
  },
  provisionBuyQuantity: {
    kind: "choice", default: 1, choices: [[1, "x1"], [5, "x5"], [10, "x10"], [25, "x25"], [100, "x100"], ["max", "Max"]],
  },
  /** Draw on each enemy the HP its fight would cost, and on a Wooden Door
   * what breaking it would (`damage-labels.ts`). Only Damage Visual, Tower
   * I's floor 50 goal, shows it. */
  damageVisual: { kind: "toggle", default: true, page: { id: "damage-visual", label: "Damage on enemies" } },
  /** The values rising off the board in a run, each kind turned off on its
   * own on the Settings page's Toggles menu once the player knows what the
   * floor's items give and take (`Game.gain`): ATK, DEF and HP as they
   * change (a shard or potion picked up, a siphon, max HP raised, a heal),
   * the keys found, what a door takes, and the Gold and Silver found. */
  attackGains: { kind: "toggle", default: true, page: { id: "attack-gains", label: "ATK changes" } },
  defenseGains: { kind: "toggle", default: true, page: { id: "defense-gains", label: "DEF changes" } },
  hpGains: { kind: "toggle", default: true, page: { id: "hp-gains", label: "HP changes" } },
  keyGains: { kind: "toggle", default: true, page: { id: "key-gains", label: "Keys found" } },
  doorGains: { kind: "toggle", default: true, page: { id: "door-gains", label: "Door payments" } },
  goldGains: { kind: "toggle", default: true, page: { id: "gold-gains", label: "Gold found" } },
  silverGains: { kind: "toggle", default: true, page: { id: "silver-gains", label: "Silver found" } },
  /** The numbers a fight raises as each strike lands: the damage dealt and
   * taken, the shroud's share, thorns and Lifesteal (`BoardPopups`). */
  hitNumbers: { kind: "toggle", default: true, page: { id: "hit-numbers", label: "Fight damage numbers" } },
  /** The XP a badge pays, and the Gold combo's "×N Gold" as it grows
   * (`Game.gain`). */
  xpGains: { kind: "toggle", default: true, page: { id: "xp-gains", label: "XP gained" } },
  comboGains: { kind: "toggle", default: true, page: { id: "combo-gains", label: "Gold combo" } },
  /** An enemy's HP bar over it as it is struck, by the hero or an arrow
   * (`BoardPopups`). */
  enemyBars: { kind: "toggle", default: true, page: { id: "enemy-bars", label: "Enemy HP bars" } },
  /** Draw on each item what it gives (`itemLabel`): a potion's HP, a
   * shard's stat, a chest's Gold. Only Damage Visual shows it, as it does
   * the enemies' costs. */
  itemLabels: { kind: "toggle", default: true, page: { id: "item-labels", label: "Item amounts" } },
  /** Cinematic mode (`ui/cinematic.ts`): inside a run, pinching the board
   * in hides everything but the board; pinching out brings it back. */
  cinematic: { kind: "toggle", default: false, page: { id: "cinematic", label: "Cinematic mode (pinch the board in)" } },
  /** With Cinematic mode on: enter it, dimmed, after 2 minutes without input. */
  cinematicIdle: { kind: "toggle", default: false, page: { id: "cinematic-idle", label: "Cinematic mode after 2 minutes idle" } },
  /** With Cinematic mode on: keep the ad's Gem button while it shows. */
  cinematicGems: { kind: "toggle", default: false, page: { id: "cinematic-gems-setting", label: "Show the Gem button in cinematic mode" } },
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
  // Older saves had a Medieval and a Neon toggle, Neon drawing both the page
  // and the board; a hero who never turned Medieval on keeps the Classic page.
  if (typeof s.medievalTheme === "boolean" && settingValue(SETTINGS.uiTheme, s.uiTheme) === undefined)
    out.uiTheme = s.neonTheme === true ? "neon" : s.medievalTheme ? "medieval" : "classic";
  if (s.neonTheme === true && settingValue(SETTINGS.gameTheme, s.gameTheme) === undefined) out.gameTheme = "neon";
  // TODO: remove in a future save version. Item pickups had one toggle,
  // now one each for ATK, DEF, HP and keys.
  if (s.itemGains === false) for (const k of ["attackGains", "defenseGains", "hpGains", "keyGains"] as const) if (s[k] === undefined) out[k] = false;
  return out as Settings;
}
