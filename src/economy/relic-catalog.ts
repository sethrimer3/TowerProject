import type { EventThemeId } from "../events/themes.ts";
import type { TrainingId } from "../progression/training.ts";
import type { RelicSpecial } from "./relic-effects.ts";

// Every relic's name, what it boosts and by how much: the one place to
// change them (docs/EVENTS.md). Each event theme lists its relic sets, one
// a year it changes from: an event gives the latest set from its cycle's
// year or before, so a later year can bring new relics by adding a set,
// and the sets before it stay owned and shown. A theme's `store` relics
// (none yet) are sold in its event's Store for Medals. Each tower's last
// Goal gives a relic too, an epic one and, as its premium reward, a
// legendary one (`TOWER_RELICS`), named for the tower that gives it.
//
// A relic's id is `<theme>.<year>.<place>` (a tower's
// `tower.<n>.<rarity>`) and is what saves keep, so a
// name, a stat or an amount can change freely; changing a set's year or
// a relic's place loses it from saves that own it.
//
// A `boost` relic (most free event relics) multiplies a Training row's
// value by its percent, summed with the other relics on that row; a
// `special` one (every premium event relic, and every Gold Bonus relic,
// whose `gold` multiplies all Gold banked) gives an effect training can't (relic-effects.ts says what each does).

export type RelicBonus = { kind: "boost"; stat: TrainingId; percent: number } | { kind: "special"; effect: RelicSpecial; amount: number };
export type RelicEntry = { name: string; bonus: RelicBonus };
/** An event's four relics: two free (the second the stronger), and two
 * opened by the Event Booster (likewise). */
export type RelicSet = { year: number; free: readonly [RelicEntry, RelicEntry]; premium: readonly [RelicEntry, RelicEntry] };
export type StoreRelic = { year: number; relic: RelicEntry; medals: number };

const boost = (name: string, stat: TrainingId, percent: number): RelicEntry => ({ name, bonus: { kind: "boost", stat, percent } });
const special = (name: string, effect: RelicSpecial, amount: number): RelicEntry => ({ name, bonus: { kind: "special", effect, amount } });

export const RELIC_SETS: Readonly<Record<EventThemeId, readonly RelicSet[]>> = {
  newYear: [{
    year: 2027,
    free: [boost("Firstlight Lantern", "regen", 4), boost("Bell of the Final Toll", "attack", 7)],
    premium: [special("Chronomancer's Hourglass", "trainerSpeed", 3), special("Dawnbreak Relic", "freeDouble", 2)],
  }],
  blizzard: [{
    year: 2027,
    free: [boost("Frostveil Mantle", "defense", 4), boost("Glacier's Tear", "hp", 8)],
    premium: [special("Rimeguard Sigil", "shieldRegrow", 3), special("Absolute Zero Seal", "frostDuration", 10)],
  }],
  lunarNewYear: [{
    year: 2027,
    free: [boost("Lucky Coin", "silverBonus", 3), special("Thousandfold Ingot", "gold", 5)],
    premium: [special("Jade Abacus", "goldenFloor", 1), special("Red Envelope of Plenty", "chestDouble", 2)],
  }],
  heartbloom: [{
    year: 2027,
    free: [boost("Rosethorn Locket", "thorns", 2), boost("Lovers' Keepsake", "hp", 10)],
    premium: [special("Twinned Soul Pendant", "heartDoor", 5), special("Crimson Oath Chalice", "lifestealOverheal", 5)],
  }],
  aurora: [{
    year: 2027,
    free: [boost("Polar Prism", "shroud", 3), boost("Shimmering Ribbon", "critFactor", 5)],
    premium: [special("Borealis Brazier", "torchGold", 10), special("Celestial Dewdrop", "lifespring", 8)],
  }],
  springRain: [{
    year: 2027,
    free: [boost("Raindrop Phial", "findPotion", 5), boost("Cloudburst Flask", "potion", 8)],
    premium: [special("Rainmaker's Gourd", "potionDouble", 2), special("Verdant Lifeseed", "overheal", 5)],
  }],
  jestersRevel: [{
    year: 2027,
    free: [boost("Jester's Loaded Die", "critChance", 2), boost("Trickster's Purse", "floorSilver", 8)],
    premium: [special("Gilded Paradox", "superCritChance", 0.5), special("Last Laugh of Creation", "parry", 2)],
  }],
  dragonsHatchery: [{
    year: 2027,
    free: [boost("Scaleshell Buckler", "defense", 5), boost("Wyrmling Claw", "armorBreak", 4)],
    premium: [special("Speckled Egg Clutch", "treasureFloor", 1), special("Dragonheart Reliquary", "bossAttack", 10)],
  }],
  cherryBlossom: [{
    year: 2027,
    free: [boost("Petalwind Sash", "regen", 5), boost("Blossom Blade Tassel", "critFactor", 6)],
    premium: [special("Scroll of Four Seasons", "cardXp", 5), special("Everbloom Branch", "reviveHp", 10)],
  }],
  honeycomb: [{
    year: 2027,
    free: [special("Golden Comb", "gold", 2), boost("Royal Jelly Jar", "regen", 8)],
    premium: [special("Swarmwing Stinger", "ricochet", 1), special("Hivequeen's Crown", "multishotTargets", 1)],
  }],
  fairyRing: [{
    year: 2027,
    free: [boost("Toadstool Trinket", "lifesteal", 2), boost("Feywild Circlet", "freeUtility", 2)],
    premium: [special("Changeling's Mirror", "phantasm", 10), special("Fae Court's Bargain", "shrineBoons", 5)],
  }],
  sunkenKingdom: [{
    year: 2027,
    free: [boost("Coral Tiara", "shieldHp", 3), boost("Tidal Sovereign's Pearl", "hp", 8)],
    premium: [special("Drowned Captain's Ledger", "chestGold", 10), special("Leviathan's Fang", "pierce", 2)],
  }],
  midsummer: [{
    year: 2027,
    free: [boost("Blazing Amulet", "attack", 4), boost("Solstice Garland", "attackSpeed", 5)],
    premium: [special("Longest Day Sundial", "timeDilation", 10), special("Zenith Aegis", "shieldHp", 5)],
  }],
  ember: [{
    year: 2027,
    free: [boost("Ashen Core", "attackPerTile", 3), boost("Lava Spiked Vambrace", "thorns", 4)],
    premium: [special("Forgefire Brand", "critChance", 1), special("Molten Crucible", "materials", 10)],
  }],
  sandstorm: [{
    year: 2027,
    free: [boost("Sandwrap Scarf", "shroud", 3), boost("Mirage Lens", "critChance", 4)],
    premium: [special("Destiny's Broken Compass", "floorGems", 5), special("Dune Scarab Ram", "woodenDoor", 5)],
  }],
  neon: [{
    year: 2027,
    free: [boost("Glowshard Visor", "rapidFireChance", 3), boost("Laserline Bracers", "multishotChance", 5)],
    premium: [special("Splitbeam Emitter", "rapidFireDuration", 10), special("Retrowave Reactor", "superCritFactor", 10)],
  }],
  orbit: [{
    year: 2027,
    free: [boost("Meteorite Spearhead", "attack", 5), boost("Comet-Tail Pennant", "freeOffense", 2)],
    premium: [special("Astral Conduit", "stellarFloor", 0.5), special("Silent Singularity", "voidwell", 10)],
  }],
  tempest: [{
    year: 2027,
    free: [boost("Stormcaller's Horn", "attackSpeed", 3), boost("Galeborn Torc", "rapidFireDuration", 5)],
    premium: [special("Eye of the Hurricane", "bossAttackCut", 5), special("Thunder Titan's Anvil", "thunderbolt", 8)],
  }],
  crystalCaverns: [{
    year: 2027,
    free: [boost("Quartz Ward", "defense", 5), boost("Amethyst Spur", "superCritChance", 2)],
    premium: [special("Geode of Hidden Facets", "rarePull", 0.5), special("Glimmerdeep Font", "arcanite", 2)],
  }],
  autumnWood: [{
    year: 2027,
    free: [boost("Fallen Leaf Brooch", "floorSilver", 5), boost("Russet Barkplate", "hp", 9)],
    premium: [special("Elder Oak Acorn", "xp", 5), special("Squirrel King's Hoard", "maxInterest", 50)],
  }],
  spidersLair: [{
    year: 2027,
    free: [boost("Venomtip Dagger", "critFactor", 3), boost("Broodmother's Silk", "parry", 2)],
    premium: [special("Bloodsucker's Mandible", "lifesteal", 1), special("Dreadweaver's Gaze", "bossCrit", 10)],
  }],
  hauntedKeep: [{
    year: 2027,
    free: [boost("Ghostwick Candle", "shroud", 3), boost("Wraithlord's Fingerbone", "lifesteal", 5)],
    premium: [special("Sleepless Lamp", "offlineGold", 10), special("Hollow Doorknocker", "heartDoor", 8)],
  }],
  arcade: [{
    year: 2027,
    free: [boost("Bonus Stage Token", "floorGold", 5), boost("Power Pellet Charm", "attack", 8)],
    premium: [special("High Score Joystick", "spareChange", 10), special("Combo Gauntlet", "attackSpeed", 2)],
  }],
  harvestFeast: [{
    year: 2027,
    free: [boost("Braided Loaf Talisman", "hp", 5), special("Overflowing Cornucopia", "gold", 4)],
    premium: [special("Harvester's Scythe", "eliteGold", 5), special("Amber Sheaf", "aurumBloom", 10)],
  }],
  wizardsTower: [{
    year: 2027,
    free: [boost("Apprentice's Wand", "critChance", 2), boost("Archmage's Robe", "freeDefense", 2)],
    premium: [special("Spellbinder's Grimoire", "researchSpeed", 3), special("Codex of Unmaking", "arcanumDamage", 5)],
  }],
  longestNight: [{
    year: 2027,
    free: [boost("Starlit Diadem", "regen", 5), boost("Winter Bulwark", "defense", 8)],
    premium: [special("Midwinter Gift Casket", "equipmentDrops", 5), special("Umbral Coronet", "shroudGuard", 3)],
  }],
  // A rare event: twice the usual rewards.
  blueMoon: [{
    year: 2027,
    free: [boost("Moonsilver Medallion", "silverBonus", 8), special("Rare Fortune's Wishbone", "gold", 10)],
    premium: [special("Serendipity Stone", "chestTriple", 2), special("Genesis Fragment", "trainingCost", 5)],
  }],
};

/** Relics a theme's event Store sells for Medals, beside its track's. */
export const STORE_RELICS: Readonly<Partial<Record<EventThemeId, readonly StoreRelic[]>>> = {};

/** The relics each tower's last Goal gives, by tower: an epic one, and a
 * legendary one as its premium reward. */
export const TOWER_RELICS: Readonly<Record<number, { epic: RelicEntry; legendary: RelicEntry }>> = {
  1: { epic: special("T:I Cosmos Sack", "gold", 2), legendary: special("T:I Spatial Ring", "gold", 5) },
  2: { epic: special("T:II Cosmic Workbench", "researchSpeed", 2), legendary: special("T:II Chrono Gate", "researchSpeed", 5) },
  3: { epic: boost("T:III Delver's Cloak", "critFactor", 2), legendary: boost("T:III Auric Lens", "critFactor", 5) },
  4: { epic: boost("T:IV Really Big Sword", "attack", 2), legendary: boost("T:IV Axe of Duality", "attack", 5) },
  5: { epic: boost("T:V Monster Steaks", "hp", 2), legendary: boost("T:V Orb of All", "hp", 5) },
  6: { epic: boost("T:VI Death's Rival", "shroud", 5), legendary: boost("T:VI Starcloak", "shroud", 10) },
  7: { epic: boost("T:VII Weapon Aura", "attackPerTile", 5), legendary: boost("T:VII Stomping Boots", "attackPerTile", 10) },
  8: { epic: special("T:VIII Lucky Blade", "gold", 5), legendary: special("T:VIII Blueprint Engine", "gold", 10) },
  9: { epic: boost("T:IX Godshard", "hp", 5), legendary: special("T:IX Mighty Shorts", "parry", 2) },
};
