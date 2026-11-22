import type { CardId } from "../cards/cards.ts";
import type { ArcanumId } from "../arcana/arcana.ts";
import type { EnemyProfile, EnemyStrength } from "../entities.ts";
import type { Trait } from "../enemies/odds.ts";
import type { FamiliarId } from "../familiars/catalog.ts";

/** The Codex's one-line briefs: what a thing is or is for, in the player's
 * words, never its numbers in full (the pages that sell or use it say
 * those). Each table covers its whole catalog, so a new card, arcanum or
 * enemy kind fails the type check until it has its line here. Keep each
 * line short: tests/codex.test.ts caps them. */

export const CARD_BRIEFS: Record<CardId, string> = {
  stairs: "Climb to the next floor.",
  heal: "Drink the nearest potion to restore HP.",
  door: "Open doors you hold keys for, or break Wooden Doors.",
  key: "Pick up the nearest key of any colour.",
  yellowKey: "Gather Gold Keys; each pays a little Gold.",
  blueKey: "Gather Blue Keys; each pays a little Gold.",
  redKey: "Gather Red Keys; each pays a little Gold.",
  monster: "Fight the nearest enemy for Gold and XP.",
  atkUp: "Grab ATK shards to hit harder.",
  defUp: "Grab DEF shards to take less damage.",
  keySiphon: "Turn Max HP training into Gold Keys.",
  blueSiphon: "Turn DEF training into Blue Keys.",
  redSiphon: "Turn ATK training into Red Keys.",
  yellowDoor: "Open Gold Doors, for less.",
  heartDoor: "Pass Heart Doors, for less HP.",
  woodenDoor: "Open Wooden Doors, for less.",
  bossEnemy: "Hunt bosses, hitting harder and earning more Gold.",
  nonBossEnemy: "Fight ordinary enemies, hitting harder and earning more.",
  chest: "Open treasure chests for more supplies and equipment.",
  keyToHp: "Melt a Gold Key into HP and Gold.",
  smeltBlue: "Melt a Blue Key into HP and Gold.",
  smeltRed: "Melt a Red Key into HP and Gold.",
  blueTrader: "Trade Gold Keys up for a Blue Key.",
  redTrader: "Trade Blue Keys up for a Red Key.",
  torch: "Put out torches. Douse them all to call a Greater Boss.",
  flyingEnemy: "Close in on Flying enemies so your arrows reach them.",
  archer: "Fire arrows at enemies in range, without moving you.",
  angelWings: "Rise again from a fatal blow, a few times a climb.",
  gem: "Collect Gems lying on the floor.",
};

export const ARCANUM_BRIEFS: Record<ArcanumId, string> = {
  ricochetShot: "Your shots may bounce on to more enemies.",
  aurumBloom: "Turns floors Golden or Stellar, multiplying their Gold.",
  overseer: "Sweeping spotlights make enemies in them take more damage.",
  thunderbolt: "Bolts strike random enemies across the floor.",
  lifespring: "Waves drain enemies' HP from a healing pool round you.",
  timeDilation: "A field round you slows every enemy in it.",
  phantasm: "Phantasms circle you and burst on enemies they touch.",
  necroticFrost: "A frost field makes enemies decay, more each turn.",
  voidwell: "A vortex stuns the enemies in it, and grounds Flying ones.",
};

export const FAMILIAR_BRIEFS: Record<FamiliarId, string> = {
  dragon: "Sets enemies round it burning, and weakens them.",
  slime: "Stuns the enemies round it, then slows them.",
  wolf: "Dashes out to tag enemies, which then take more damage.",
  falcon: "Multiplies the Gold of kills beneath it.",
  wisp: "Boosts the other familiars near it.",
};

export const STRENGTH_BRIEFS: Record<EnemyStrength, string> = {
  weak: "25% lower HP, ATK and DEF. Pays no Gold.",
  normal: "The floor's standard foe.",
  strong: "25% higher HP, ATK and DEF.",
  elite: "Fights like an enemy from ten floors higher.",
  boss: "Guards every tenth floor, with far more HP. Drops Rubies.",
  greaterBoss: "Twice a boss. Appears once every torch on a floor is out.",
};

export const TRAIT_BRIEFS: Record<Trait, string> = {
  fast: "Strikes before you, and hits much harder.",
  ranged: "Shoots you from a distance, even through walls.",
  shielded: "Waits in a green bubble near the way up, with escorts.",
  flying: "Hovers out of reach: only arrows can hurt it.",
  armored: "Twice the DEF.",
  aggroed: "A wounded Flying enemy, closing in on you.",
};

export const PROFILE_BRIEFS: Record<EnemyProfile, { name: string; brief: string }> = {
  attackHeavy: { name: "Brutes", brief: "Hit hard, but fall quickly." },
  balanced: { name: "Fighters", brief: "Even HP, ATK and DEF." },
  defenseHeavy: { name: "Guardians", brief: "Tough to wear down, but hit softly." },
};
