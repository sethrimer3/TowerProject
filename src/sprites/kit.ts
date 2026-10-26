/** The shared PNG kit. Images load once, keep nearest-neighbor sampling,
 * and notify cached render layers through a revision when they arrive. */
const BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
export const ICON_SPRITES = [
  "gold", "silver", "gem", "shard", "cell", "medal",
  "sword", "shield", "heart", "key-yellow", "key-blue", "key-red",
  "potion-blue", "potion-red", "chest-wood", "chest-silver", "chest-gold", "chest-open",
  "stairs", "torch", "scroll", "hourglass", "book", "cog",
  "trophy", "ticket", "mail", "gift", "mission", "event",
  "helmet", "chestplate", "gloves", "boots", "ring", "amulet",
] as const;
export const WORLD_SPRITES = [
  "hero-up", "hero-right", "hero-down", "hero-left", "skeleton", "slime",
  "goblin", "orc", "knight", "mage", "bat", "dragon",
  "troll", "golem", "wraith", "demon", "crystal", "spore",
  "tower", "cave", "blacksmith", "hall",
  "archer", "crate", "barrel", "shrine", "door-wood", "door-steel",
] as const;
export const CONTROL_SPRITES = ["undo", "redo", "play", "pause", "arrow-up", "arrow-down", "arrow-left", "arrow-right", "ad-screen", "settings-cog", "close", "check", "target", "focus", "ignore", "bomb"] as const;
export const DETAIL_SPRITES = [
  "hammer", "merge", "lock", "pointer", "relic-rare", "relic-epic", "cart", "deck",
  "fern", "mushrooms", "tuft", "sprout", "crate-broken", "barrel-broken", "pebbles", "web",
] as const;
export const NAMED_ENEMY_SPRITES = ["amethyst-golem", "armored-knight", "assassin", "bat", "berserker", "blackstone-colossus", "celestial-guardian", "coral-knight", "crystal-savant", "cultist", "demon", "dragon-whelp", "drowned-marauder", "gargoyle", "goblin", "golem", "mage", "obsidian-revenant", "ogre", "orc", "shadow-stalker", "skeleton", "slime", "spore-colossus", "sporeling", "starfire-adept", "stone-warden", "temple-wraith", "thief", "troll"] as const;
/** A compact blue spark and a larger brass/ivory flash on equal native canvases. */
export const INSPIRATION_SPRITE = "inspiration", BREAKTHROUGH_SPRITE = "breakthrough";
export const CURRENCY_ICON_SPRITES = [INSPIRATION_SPRITE,BREAKTHROUGH_SPRITE] as const;
export type KitSprite = typeof ICON_SPRITES[number] | typeof WORLD_SPRITES[number] | typeof CONTROL_SPRITES[number] | typeof DETAIL_SPRITES[number] | typeof CURRENCY_ICON_SPRITES[number];
export const kitUrl = (id: string) => `${BASE}assets/style/${id}.png`;
/** Native PNG controls have one art source across UI themes. */
export function pngIcon(id: string, className: string, alt = "") {
  return `<span class="sprite-icon sprite-ready ${className}" aria-hidden="true"><img class="sprite-native" src="${kitUrl(id)}" alt="${alt}"></span>`;
}
const images = new Map<string, HTMLImageElement>();
let revision = 0;
const listeners = new Set<() => void>();
export const onSpritesLoaded = (listener: () => void) => { listeners.add(listener); };
export const spriteRevision = () => revision;
export function kitImage(id: string) {
  if (typeof Image === "undefined") return null;
  let image = images.get(id);
  if (!image) {
    image = new Image();
    image.onload = () => { revision++; listeners.forEach(listener => listener()); };
    image.src = kitUrl(id);
    images.set(id, image);
  }
  return image.complete && image.naturalWidth ? image : null;
}

/** Startup shares the exact decoded images used by canvas drawing. */
export async function preloadKitImage(id: string) {
  kitImage(id);
  const image = images.get(id);
  if (!image) throw new Error(`Cannot load sprite: ${id}`);
  await image.decode();
}
export function drawKit(c: CanvasRenderingContext2D, id: string, x = 0, y = 0, w = 24, h = w) {
  const image = kitImage(id);
  if (!image) return false;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(image, x, y, w, h);
  c.restore();
  return true;
}

/** Theme-specific vector/text art is kept for non-default UI themes.
 * The default interface uses the PNGs decoded by bootstrap, without a
 * second loading/fallback state for each newly created control. */
export function kitIcon(id: string, themeArt: string, className: string, overlay = "") {
  return `<span class="sprite-icon sprite-ready ${className}" aria-hidden="true"><span class="theme-art">${themeArt}</span><img class="sprite-replacement" src="${kitUrl(id)}" alt="">${overlay}</span>`;
}

/** A themed enemy keeps its roster identity while sharing material ramps.
 * The named silhouettes cover every existing Tower and Delve enemy. */
export function kitEnemy(name: string): string {
  const n = name.toLowerCase();
  const slug = n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if ((NAMED_ENEMY_SPRITES as readonly string[]).includes(slug)) return `enemy-${slug}`;
  if (/slime/.test(n)) return "slime";
  if (/bat|gargoyle/.test(n)) return "bat";
  if (/skeleton|revenant/.test(n)) return "skeleton";
  if (/dragon/.test(n)) return "dragon";
  if (/spore/.test(n)) return "spore";
  if (/crystal|amethyst/.test(n)) return "crystal";
  if (/golem|colossus|warden|guardian/.test(n)) return "golem";
  if (/wraith|shadow/.test(n)) return "wraith";
  if (/demon/.test(n)) return "demon";
  if (/mage|cultist|adept/.test(n)) return "mage";
  if (/troll|ogre/.test(n)) return "troll";
  if (/orc|berserker|marauder/.test(n)) return "orc";
  if (/knight/.test(n)) return "knight";
  return "goblin";
}
