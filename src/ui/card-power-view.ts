/** A card's powers as the player meets them: each power's row on the Deck
 * page (`cardPowersHtml`), what a level of it adds (`powerStepHtml`, as an
 * ascension names its new power), and each stat's words, units and icon.
 * The powers themselves come from `cards/powers.ts`. */
import { CARDS, type CardId } from "../cards/cards.ts";
import { powerAmounts, powerLevel, powersOf, type CardPower, type ColorKeyPart, type ColorKeyStat, type DoorLockPart, type DoorLockStat, type FoeCardStat, type FoePart, type FoeTreeCard, type SmeltPart, type SmeltStat, type TradeColor, type TradePart, type TradeStat, type PowerStat } from "../cards/powers.ts";
import { KEY_NAMES, type DoorKind } from "../doors.ts";
import type { KeyColor } from "../entities.ts";
import { CARD_RARITY_NAMES, rarityRank } from "../cards/rarity.ts";
import { snap } from "../exact.ts";
import { cellIcon, gemIcon, goldenGemIcon, rubyIcon, stellarGemIcon, itemSprite, uiSprite, type UiSprite } from "./dom.ts";


/** One entry for each key colour's own stats (`ColorKeyStat`), `each`
 * giving a colour's, by part, from the colour and its capitalized word. */
function byKeyColor<T>(each: (color: KeyColor, word: string) => Record<ColorKeyPart, T>) {
  const words: Record<KeyColor, string> = { yellow: "Gold", blue: "Blue", red: "Red" };
  return Object.fromEntries((Object.keys(words) as KeyColor[]).flatMap((color) =>
    Object.entries(each(color, words[color])).map(([part, value]) => [`${color}${part}`, value]))) as Record<ColorKeyStat, T>;
}

/** One entry for each key trader's own stats (`TradeStat`), `each` giving
 * a trader's, by part, from the colour it trades for and that colour's
 * capitalized word. */
function byTrade<T>(each: (color: TradeColor, word: string) => Record<TradePart, T>) {
  const words: Record<TradeColor, string> = { blue: "Blue", red: "Red" };
  return Object.fromEntries((Object.keys(words) as TradeColor[]).flatMap((color) =>
    Object.entries(each(color, words[color])).map(([part, value]) => [`${color}${part}`, value]))) as Record<TradeStat, T>;
}

/** One entry for each smelt's own stats (`SmeltStat`), `each` giving a
 * smelt's, by part, from the colour it smelts, that colour's capitalized
 * word, and what its Smelt Free gives: the name, and the words for a level
 * of it. */
const SMELT_FREE_WORDS: Record<KeyColor, { name: string; level: string }> = {
  yellow: { name: "Free Defense", level: "a free Defense level" },
  blue: { name: "Free Offense", level: "a free Offense level" },
  red: { name: "Free Upgrades", level: "a free level of each group: Offense, Defense and Utility, each rolled apart" },
};
function bySmelt<T>(each: (color: KeyColor, word: string, free: (typeof SMELT_FREE_WORDS)[KeyColor]) => Record<SmeltPart, T>) {
  return Object.fromEntries((Object.keys(KEY_NAMES) as KeyColor[]).flatMap((color) =>
    Object.entries(each(color, KEY_NAMES[color], SMELT_FREE_WORDS[color])).map(([part, value]) => [`${color}${part}`, value]))) as Record<SmeltStat, T>;
}

/** How each door card's doors are named in its stats' words: one, many,
 * and the word its nodes' names start with. */
const DOOR_WORDS: Record<DoorKind, { one: string; many: string; word: string }> = {
  yellow: { one: "door with a gold lock", many: "doors with a gold lock", word: "Gold" },
  heart: { one: "Heart Door", many: "Heart Doors", word: "Heart" },
  wood: { one: "Wooden Door", many: "Wooden Doors", word: "Wooden" },
};
/** One entry for each door card's own stats (`DoorLockStat`), `each`
 * giving a card's, by part, from its kind and its doors' words. */
function byDoorLock<T>(each: (kind: DoorKind, words: (typeof DOOR_WORDS)[DoorKind]) => Record<DoorLockPart, T>) {
  return Object.fromEntries((Object.keys(DOOR_WORDS) as DoorKind[]).flatMap((kind) =>
    Object.entries(each(kind, DOOR_WORDS[kind])).map(([part, value]) => [`${kind}Lock${part}`, value]))) as Record<DoorLockStat, T>;
}

/** How each enemy card's enemies are named in its stats' words: one with
 * its article (`a`), one without (`one`), and many. */
const FOE_WORDS: Record<FoeTreeCard, { a: string; one: string; many: string }> = {
  bossEnemy: { a: "a boss or Greater Boss", one: "boss or Greater Boss", many: "bosses and Greater Bosses" },
  nonBossEnemy: { a: "a non-boss enemy", one: "non-boss enemy", many: "non-boss enemies" },
  archer: { a: "an enemy", one: "enemy", many: "enemies" },
};
/** One entry for each enemy card's own stats (`FoeCardStat`), `each`
 * giving a card's, by part, from its enemies' words. */
function byFoeCard<T>(each: (words: (typeof FOE_WORDS)[FoeTreeCard]) => Record<FoePart, T>) {
  return Object.fromEntries((Object.keys(FOE_WORDS) as FoeTreeCard[]).flatMap((card) =>
    Object.entries(each(FOE_WORDS[card])).map(([part, value]) => [`${card}${part}`, value]))) as Record<FoeCardStat, T>;
}


/** What `n` of each stat does, a line. */
const STAT_TEXT: Record<PowerStat, (n: string) => string> = {
  floorGold: (n) => `+${n}% Spare Change Gold on each floor`,
  floorSilver: (n) => `+${n}% Wishing Well Silver on each floor`,
  goldBonus: (n) => `+${n}% Gold Bonus`,
  silverBonus: (n) => `+${n}% Silver Bonus`,
  freeOffense: (n) => `+${n}% Free Offense Upgrade chance`,
  freeDefense: (n) => `+${n}% Free Defense Upgrade chance`,
  freeUtility: (n) => `+${n}% Free Utility Upgrade chance`,
  freeOffenseChance: (n) => `+${n}% Free Offense Upgrade chance, trained or not`,
  freeDefenseChance: (n) => `+${n}% Free Defense Upgrade chance, trained or not`,
  freeUtilityChance: (n) => `+${n}% Free Utility Upgrade chance, trained or not`,
  floorHeal: (n) => `Heals ${n}% of max HP on each floor`,
  overhealMax: (n) => `+${n}% of max HP on the Overheal ceiling, Overheal owned or not`,
  stairSkip: (n) => `${n}% chance the Tower's stairs climb two floors`,
  percentPotions: (n) => `+${n}% chance each potion is a percent potion`,
  potionHeal: (n) => `+${n}% HP from every potion`,
  potionMaxHp: (n) => `+${n}% max HP for the climb each time a potion is reached`,
  potionSilver: (n) => `+${n} Silver from each potion`,
  regen: (n) => `+${n}% Regen`,
  shroud: (n) => `+${n}% shroud against every enemy`,
  parry: (n) => `+${n}% Parry, owned or not`,
  doorCost: (n) => `−${n}% of each key every door takes`,
  doorGold: (n) => `+${n}% Gold from doors`,
  doorSilver: (n) => `+${n} Silver from each door opened`,
  doorHeal: (n) => `Heals ${n}% of max HP on opening each door`,
  skeletonKey: (n) => `${n}% chance each colour door on a floor is a Wooden Door`,
  lockPick: (n) => `${n}% chance each door of two or three colours loses its rarest lock`,
  secretKnock: (n) => `${n}% chance a door opens for nothing: no keys, no HP`,
  doorChest: (n) => `${n}% chance an opened door leaves a treasure chest`,
  ...byDoorLock((_, { one, many }): Record<DoorLockPart, (n: string) => string> => ({
    Gold: (n) => `+${n}% Gold from ${many}`,
    Silver: (n) => `+${n} Silver from each ${one} opened`,
    Chest: (n) => `${n}% chance an opened ${one} leaves a treasure chest`,
    Knock: (n) => `${n}% chance a ${one} opens for nothing: no keys, no HP`,
  })),
  yellowLockHeal: (n) => `Heals ${n}% of max HP on opening each door with a gold lock`,
  yellowTransmute: (n) => `${n}% chance each Wooden Door on a floor is a Gold Door`,
  woodTransmute: (n) => `${n}% chance each Heart Door taking no keys on a floor is a Wooden Door`,
  heartLockCost: (n) => `−${n}% of the HP each Heart Door drains`,
  heartLockPick: (n) => `${n}% chance each Heart Door taking keys on a floor loses its drain`,
  heartShroud: (n) => `+${n}% shroud against every enemy for the climb, each Heart Door's drain paid`,
  woodKeyCost: (n) => `−${n}% of the key each Wooden Door takes`,
  woodDurability: (n) => `−${n}% of the HP breaking down each Wooden Door takes`,
  druidKey: (n) => `${n}% chance an opened Wooden Door gives a gold key`,
  keyChest: (n) => `${n}% chance a key picked up leaves a treasure chest`,
  keyFind: (n) => `+${n}% more each key of every colour`,
  keyGold: (n) => `+${n}% Gold from each key`,
  keyHeal: (n) => `Heals ${n}% of max HP on picking up each key`,
  keyOverheal: (n) => `Heals ${n}% of the HP ceiling, Overheal included, on picking up each key`,
  keySilver: (n) => `+${n} Silver from each key picked up`,
  plainDoorCost: (n) => `−${n}% of the key or HP each Wooden Door takes`,
  heartDoorCost: (n) => `−${n}% of the keys and HP each Heart Door takes`,
  doubleKey: (n) => `${n}% chance a key picked up is two`,
  masterKey: (n) => `${n}% chance a key picked up opens every door on its floor`,
  ...byKeyColor((_, word): Record<ColorKeyPart, (n: string) => string> => {
    const color = word.toLowerCase();
    return {
    KeyHeal: (n) => `Heals ${n}% of max HP on picking up each ${color} key`,
    KeyOverheal: (n) => `Heals ${n}% of the HP ceiling, Overheal included, on picking up each ${color} key`,
    KeyGold: (n) => `+${n}% Gold from each ${color} key`,
    KeyFind: (n) => `+${n}% more each ${color} key`,
    KeySilver: (n) => `+${n} Silver from each ${color} key picked up`,
    KeyChest: (n) => `${n}% chance a ${color} key picked up leaves a treasure chest`,
    DoorCost: (n) => `−${n}% of each ${color} key a door takes`,
    DoubleKey: (n) => `${n}% chance a ${color} key picked up is two`,
    MasterKey: (n) => `${n}% chance a ${color} key picked up opens every door with a ${color} lock on its floor`,
    FloorKey: (n) => `${n}% chance of a ${color} key on each floor new to the climb`,
    };
  }),
  ...byTrade((color, word): Record<TradePart, (n: string) => string> => ({
    TradeCost: (n) => `−${n}% of the keys each trade for a ${color} key takes`,
    TradeFreeUtility: (n) => `${n}% chance of a free Utility level with each trade for a ${color} key, trained or not`,
    Forge: (n) => `${n}% chance a trade for a ${color} key gives a second`,
    Smelter: (n) => `${n}% chance a ${word} Forge gives a third ${color} key`,
  })),
  ...bySmelt((color, word, free): Record<SmeltPart, (n: string) => string> => {
    const key = `${word.toLowerCase()} key`;
    return {
    SmeltGold: (n) => `+${n} Gold from each ${key} smelted, before Gold Bonus`,
    SmeltHeal: (n) => `Each ${key} smelted heals ${n}% more of max HP`,
    SmeltSilver: (n) => `+${n} Silver from each ${key} smelted`,
    SmeltFree: (n) => `${n}% chance of ${free.level} with each ${key} smelted, trained or not`,
    SmeltCost: (n) => `−${n}% of the ${key} each smelt takes`,
    SmeltMaster: (n) => `${n}% chance a ${key} smelted pays three times its Gold, six times with Key Smelter`,
    };
  }),
  keySmelter: (n) => `${n}% chance any smelt pays twice its Gold`,
  ...byFoeCard(({ a, one, many }): Record<FoePart, (n: string) => string> => ({
    Gold: (n) => `+${n}% Gold from each ${one} killed`,
    InstakillGold: (n) => `+${n}% Gold from each Instakill of ${a}`,
    Silver: (n) => `+${n} Silver from each ${one} killed`,
    Attack: (n) => `+${n}% ATK against ${many}`,
    Defense: (n) => `+${n}% DEF against ${many}`,
    Shroud: (n) => `+${n}% shroud against ${many}`,
    CritChance: (n) => `+${n}% Crit % chance against ${many}`,
    CritFactor: (n) => `+${n}% Crit x factor against ${many}`,
    KillXp: (n) => `+${n}% XP from each ${one} killed`,
    SpawnRate: (n) => `+${n}% more ${many} on each floor`,
    Material: (n) => `${n}% chance each ${one} killed drops upgrade materials`,
    InstakillMaterial: (n) => `${n}% chance each Instakill of ${a} drops upgrade materials`,
    Equipment: (n) => `${n}% chance each ${one} killed drops a piece of equipment`,
    InstakillMaxHp: (n) => `+${n}% max HP for the climb with each Instakill of ${a}`,
    StealOverheal: (n) => `Lifesteal heals up to ${n}% above max HP against ${many}`,
    SurpriseAttack: (n) => `${n}% chance the first strike of a fight with ${a} right after a Dash deals twice your ATK`,
    Cells: (n) => `+${n} Cell${n === "1" ? "" : "s"} from each ${one} killed`,
    Takedown: (n) => `${a[0]!.toUpperCase()}${a.slice(1)} loses ${n}% of its max HP as a fight with it begins`,
    Tangle: (n) => `${a[0]!.toUpperCase()}${a.slice(1)} loses ${n}% of its ATK as a fight with it begins`,
    FirstStrike: (n) => `${n}% chance ${a} loses its first strike: you strike first`,
    ChargeShot: (n) => `+${n}% Charged Shot against ${many}`,
  })),
  maxHp: (n) => `+${n}% max HP`,
  foeAttack: (n) => `+${n}% ATK against every enemy`,
  foeDefense: (n) => `+${n}% DEF against every enemy`,
  foeGold: (n) => `+${n}% Gold from every kill`,
  foeSilver: (n) => `+${n}% Silver from every kill`,
  critChance: (n) => `+${n}% Crit % chance`,
  critFactor: (n) => `+${n}% Crit x factor`,
  killXp: (n) => `+${n}% XP from every kill`,
  surpriseAttack: (n) => `${n}% chance the first strike of a fight right after a Dash deals twice your ATK`,
  foeAttackCut: (n) => `−${n}% ATK for every enemy`,
  stealOverheal: (n) => `Lifesteal heals up to ${n}% above max HP`,
  moreEnemies: (n) => `+${n}% more enemies on each floor`,
  attackShard: (n) => `+${n}% from each ATK shard`,
  defenseShard: (n) => `+${n}% from each DEF shard`,
  attackShardGold: (n) => `+${n}% Gold from each ATK shard`,
  defenseShardGold: (n) => `+${n}% Gold from each DEF shard`,
  attackShardSilver: (n) => `+${n} Silver from each ATK shard taken`,
  defenseShardSilver: (n) => `+${n} Silver from each DEF shard taken`,
  powerStrike: (n) => `${n}% chance an ATK shard taken charges your next fight with twice your ATK`,
  takedown: (n) => `A boss loses ${n}% of its max HP as a fight with it begins`,
  tangle: (n) => `A boss loses ${n}% of its ATK as a fight with it begins`,
  greaterTakedown: (n) => `A Greater Boss loses ${n}% of its max HP as a fight with it begins`,
  greaterTangle: (n) => `A Greater Boss loses ${n}% of its ATK as a fight with it begins`,
  reviveChance: (n) => `+${n}% Revive chance`,
  bossAttack: (n) => `+${n}% ATK against a Greater Boss`,
  bossDefense: (n) => `+${n}% DEF against a Greater Boss`,
  bossShroud: (n) => `+${n}% shroud against a Greater Boss`,
  bossGold: (n) => `+${n}% Gold from a Greater Boss`,
  bossCells: (n) => `+${n} Cell${n === "1" ? "" : "s"} from each Greater Boss`,
  chestGold: (n) => `+${n}% Gold from treasure chests`,
  chestSilver: (n) => `+${n} Silver from each treasure chest opened`,
  chestCells: (n) => `${n}% chance a treasure chest holds a Greater Boss's Cells`,
  treasureFloor: (n) => `${n}% chance each floor is a Treasure Floor: its shards and potions are treasure chests`,
  rarityUp: (n) => `${n}% chance an Equipment Chest's piece is a rarity higher`,
  chestDouble: (n) => `${n}% chance a treasure chest pays twice over`,
  chestTriple: (n) => `${n}% chance a treasure chest pays three times over`,
  supplyChance: (n) => `+${n}% Supply Chest chance`,
  equipmentChance: (n) => `+${n}% Equipment Chest chance`,
  shotAttack: (n) => `+${n}% Shot ATK`,
  bossShotAttack: (n) => `+${n}% Shot ATK against bosses and Greater Bosses`,
  shotSpeed: (n) => `+${n}% Attack Speed`,
  shotRange: (n) => `+${n}% Attack Range for your arrows`,
  chargeShot: (n) => `+${n}% Charged Shot`,
  gemBank: (n) => `+${n} reward${n === "1" ? "" : "s"} the Gem button banks: unclaimed, it goes on banking one each cooldown until full, a claim taking them all`,
  gemBankSpeed: (n) => `−${n} seconds off the Gem button's cooldown`,
  adGems: (n) => `+${n} Gem${n === "1" ? "" : "s"} each reward the Gem button pays`,
  goldenGem: (n) => `${n}% chance a Gem appearing in a climb is a Golden Gem, worth 5 Gems and 5 card XP`,
  stellarGem: (n) => `${n}% chance a Golden Gem is a Stellar Gem instead, worth 25 Gems and 25 card XP`,
  chestGem: (n) => `${n}% chance a treasure chest holds a Gem`,
  gemChance: (n) => `${n}% chance of a Gem of its own on each new floor, in a side room where there is one; missed, it is gone`,
  bossGem: (n) => `${n}% chance a boss or Greater Boss drops a Gem`,
  gemXp: (n) => `+${n}% card XP from each Gem collected`,
  floorRuby: (n) => `${n}% chance each new floor pays the Rubies a boss of its tower drops`,
  bossRubies: (n) => `+${n} Rubies from each boss and Greater Boss (a fraction is the chance of one more)`,
  levelSkipBoost: (n) => `+${n}% Enemy HP and Combat Level Skip chance, each up to 80%`,
  torchGold: (n) => `+${n} Gold from each torch put out`,
  torchSilver: (n) => `+${n} Silver from each torch put out`,
  yellowToWood: (n) => `${n}% chance each Gold Door is a Wooden Door instead, still paying a Gold Door's Gold (from the next climb)`,
};

/** How a stat's amount reads: a bonus added (`+%`, or `+` for a count),
 * a cut (`−%`), or a chance or share (`%`). */
type Unit = "+%" | "−%" | "%" | "+";
/** What each stat raises, in a few words, and how its amount reads: the
 * one line a node's details give it (how and when it works is behind the
 * details' ? button, in `STAT_TEXT`'s words). */
const STAT_LINES: Record<PowerStat, [string, Unit]> = {
  floorGold: ["Spare Change", "+%"], floorSilver: ["Wishing Well", "+%"], goldBonus: ["Gold Bonus", "+%"], silverBonus: ["Silver Bonus", "+%"],
  freeOffense: ["Free Offense Upgrade chance", "+%"], freeDefense: ["Free Defense Upgrade chance", "+%"], freeUtility: ["Free Utility Upgrade chance", "+%"],
  freeOffenseChance: ["Free Offense Upgrade chance", "+%"], freeDefenseChance: ["Free Defense Upgrade chance", "+%"], freeUtilityChance: ["Free Utility Upgrade chance", "+%"],
  floorHeal: ["Floor Heal", "%"], overhealMax: ["Overheal ceiling", "+%"], stairSkip: ["Stair Skip chance", "%"], percentPotions: ["Percent potion chance", "+%"],
  potionHeal: ["Potion healing", "+%"], potionMaxHp: ["Max HP per potion", "+%"], potionSilver: ["Silver per potion", "+"],
  regen: ["Regen", "+%"], shroud: ["Shroud", "+%"], parry: ["Parry", "+%"], reviveChance: ["Revive chance", "+%"],
  doorCost: ["Door key cost", "−%"], doorGold: ["Door Gold", "+%"], doorSilver: ["Silver per door", "+"], doorHeal: ["Door Heal", "%"],
  skeletonKey: ["Skeleton Key chance", "%"], lockPick: ["Lock Pick chance", "%"], secretKnock: ["Secret Knock chance", "%"], doorChest: ["Door Chest chance", "%"],
  ...byDoorLock((kind, { one, word }): Record<DoorLockPart, [string, Unit]> => ({
    Gold: [`${word} Door Gold`, "+%"], Silver: [`Silver per ${one}`, "+"], Chest: [`${word} Door Chest chance`, "%"],
    Knock: [`${{ yellow: "Gold Knock", heart: "Heart Knock", wood: "Wooden Lock Pick" }[kind]} chance`, "%"],
  })),
  yellowLockHeal: ["Gold Door Heal", "%"], yellowTransmute: ["Gold Door Transmute chance", "%"], woodTransmute: ["Wooden Door Transmute chance", "%"],
  heartLockCost: ["Heart Door drain", "−%"], heartLockPick: ["Heart Lock Pick chance", "%"], heartShroud: ["Shroud per Heart Door", "+%"],
  woodKeyCost: ["Wooden Door key cost", "−%"], woodDurability: ["Wooden Door durability", "−%"], druidKey: ["Druidic Talent chance", "%"],
  keyChest: ["Key Chest chance", "%"], keyFind: ["Keys found", "+%"], keyGold: ["Key Gold", "+%"], keyHeal: ["Key Heal", "%"], keyOverheal: ["Key Overheal", "%"], keySilver: ["Silver per key", "+"],
  plainDoorCost: ["Wooden Door cost", "−%"], heartDoorCost: ["Heart Door cost", "−%"], doubleKey: ["Locksmith chance", "%"], masterKey: ["Master Key chance", "%"],
  ...byKeyColor((_, word): Record<ColorKeyPart, [string, Unit]> => ({
    KeyHeal: [`${word} Key Heal`, "%"], KeyOverheal: [`${word} Key Overheal`, "%"], KeyGold: [`${word} Key Gold`, "+%"], KeyFind: [`${word} keys found`, "+%"],
    KeySilver: [`Silver per ${word.toLowerCase()} key`, "+"], KeyChest: [`${word} Key Chest chance`, "%"], DoorCost: [`${word} key cost`, "−%"],
    DoubleKey: [`Locksmith ${word} chance`, "%"], MasterKey: [`Master ${word} Key chance`, "%"], FloorKey: [`Extra ${word.toLowerCase()} key chance`, "%"],
  })),
  ...byTrade((_, word): Record<TradePart, [string, Unit]> => ({
    TradeCost: ["Keys per trade", "−%"], TradeFreeUtility: ["Free Utility chance per trade", "%"],
    Forge: [`${word} Forge chance`, "%"], Smelter: [`Master ${word} Smelter chance`, "%"],
  })),
  ...bySmelt((_, word, free): Record<SmeltPart, [string, Unit]> => ({
    SmeltGold: ["Gold per smelt", "+"], SmeltHeal: ["Max HP healed per smelt", "+%"], SmeltSilver: ["Silver per smelt", "+"],
    SmeltFree: [`${free.name} chance per smelt`, "%"], SmeltCost: ["Key per smelt", "−%"], SmeltMaster: [`Master ${word} Smelter chance`, "%"],
  })),
  keySmelter: ["Key Smelter chance", "%"],
  ...byFoeCard(({ one, many }): Record<FoePart, [string, Unit]> => ({
    Gold: [`Gold from ${many}`, "+%"], InstakillGold: ["Instakill Gold", "+%"], Silver: [`Silver per ${one}`, "+"],
    Attack: [`ATK vs ${many}`, "+%"], Defense: [`DEF vs ${many}`, "+%"], Shroud: [`Shroud vs ${many}`, "+%"], CritChance: [`Crit % vs ${many}`, "+%"], CritFactor: [`Crit x vs ${many}`, "+%"],
    KillXp: [`XP from ${many}`, "+%"], SpawnRate: [`${many[0]!.toUpperCase()}${many.slice(1)} per floor`, "+%"], Material: ["Salvage chance", "%"], InstakillMaterial: ["Instakill Salvage chance", "%"],
    Equipment: ["Equipment drop chance", "%"], InstakillMaxHp: ["Max HP per Instakill", "+%"], StealOverheal: ["Lifesteal Overheal", "%"], SurpriseAttack: ["Surprise Attack chance", "%"],
    Cells: [`Cells per ${one}`, "+"], Takedown: ["Takedown", "%"], Tangle: ["Tangle", "%"], FirstStrike: ["First Strike chance", "%"], ChargeShot: [`Charged Shot vs ${many}`, "+%"],
  })),
  maxHp: ["Max HP", "+%"],
  foeAttack: ["ATK vs enemies", "+%"], foeDefense: ["DEF vs enemies", "+%"], foeGold: ["Kill Gold", "+%"], foeSilver: ["Kill Silver", "+%"], moreEnemies: ["Enemies per floor", "+%"],
  critChance: ["Crit %", "+%"], critFactor: ["Crit x", "+%"], killXp: ["Kill XP", "+%"], surpriseAttack: ["Surprise Attack chance", "%"], foeAttackCut: ["Enemy ATK", "−%"], stealOverheal: ["Lifesteal Overheal", "%"],
  attackShard: ["ATK shards", "+%"], defenseShard: ["DEF shards", "+%"], attackShardGold: ["ATK shard Gold", "+%"], defenseShardGold: ["DEF shard Gold", "+%"],
  attackShardSilver: ["Silver per ATK shard", "+"], defenseShardSilver: ["Silver per DEF shard", "+"], powerStrike: ["Power Strike chance", "%"],
  takedown: ["Boss Takedown", "%"], tangle: ["Boss Tangle", "%"], greaterTakedown: ["Greater Boss Takedown", "%"], greaterTangle: ["Greater Boss Tangle", "%"],
  bossAttack: ["ATK vs Greater Bosses", "+%"], bossDefense: ["DEF vs Greater Bosses", "+%"], bossShroud: ["Shroud vs Greater Bosses", "+%"], bossGold: ["Greater Boss Gold", "+%"], bossCells: ["Greater Boss Cells", "+"],
  chestGold: ["Chest Gold", "+%"], chestSilver: ["Silver per chest", "+"], chestCells: ["Chest Cells chance", "%"], supplyChance: ["Supply Chest chance", "+%"], equipmentChance: ["Equipment Chest chance", "+%"],
  treasureFloor: ["Treasure Floor chance", "%"], rarityUp: ["Rarity Up chance", "%"], chestDouble: ["Double chance", "%"], chestTriple: ["Triple chance", "%"],
  shotAttack: ["Shot ATK", "+%"], bossShotAttack: ["Shot ATK vs bosses", "+%"], shotSpeed: ["Attack Speed", "+%"], shotRange: ["Attack Range", "+%"], chargeShot: ["Charged Shot", "+%"],
  gemBank: ["Gem rewards banked", "+"], gemBankSpeed: ["Seconds off the Gem cooldown", "+"], adGems: ["Gems a reward", "+"], goldenGem: ["Golden Gem chance", "%"], stellarGem: ["Stellar Gem chance", "%"],
  chestGem: ["Gem in a chest chance", "%"], gemChance: ["Gem a floor chance", "%"], bossGem: ["Boss Gem chance", "%"], gemXp: ["Card XP a Gem", "+%"],
  floorRuby: ["Ruby chance a floor", "%"], bossRubies: ["Rubies a boss", "+"], levelSkipBoost: ["Enemy Level Skip chance", "+%"],
  torchGold: ["Gold a torch", "+"], torchSilver: ["Silver a torch", "+"], yellowToWood: ["Gold Door to Wooden Door chance", "%"],
};

/** Each stat's icon on its node. */
const ui = (name: UiSprite) => () => uiSprite(name);
const silver = () => uiSprite("gold", "ui-sprite silver-sprite");
const STAT_ICONS: Record<PowerStat, () => string> = {
  floorGold: ui("gold"), floorSilver: silver, goldBonus: ui("gold"), silverBonus: silver,
  freeOffense: ui("attack"), freeDefense: ui("defense"), freeUtility: ui("arrow-up"), freeOffenseChance: ui("attack"), freeDefenseChance: ui("defense"), freeUtilityChance: ui("arrow-up"),
  potionSilver: silver, regen: ui("health"), shroud: ui("log"), parry: ui("defense"), reviveChance: ui("revive"),
  floorHeal: ui("health"), overhealMax: ui("health"), stairSkip: ui("arrow-up"), percentPotions: () => itemSprite("potion_percent"), potionHeal: () => itemSprite("potion_flat"), potionMaxHp: ui("health"),
  doorCost: () => itemSprite("key_red"), doorGold: ui("gold"), doorSilver: silver, doorHeal: ui("health"),
  skeletonKey: () => itemSprite("key_yellow"), lockPick: () => itemSprite("key_blue"), secretKnock: () => itemSprite("key_red"), doorChest: () => itemSprite("chest_treasure_open"),
  ...byDoorLock((kind) => ({ Gold: ui("gold"), Silver: silver, Chest: () => itemSprite("chest_treasure_open"), Knock: kind === "heart" ? ui("health") : () => itemSprite(kind === "yellow" ? "key_yellow" : "key_red") })),
  yellowLockHeal: ui("health"), yellowTransmute: () => itemSprite("key_yellow"), woodTransmute: () => itemSprite("key_blue"),
  heartLockCost: ui("health"), heartLockPick: ui("health"), heartShroud: ui("log"), woodKeyCost: () => itemSprite("key_yellow"), woodDurability: ui("defense"), druidKey: () => itemSprite("key_yellow"), keyChest: () => itemSprite("chest_treasure_open"), keyFind: () => itemSprite("key_yellow"), keyGold: ui("gold"),
  keyHeal: ui("health"), keyOverheal: ui("health"), keySilver: silver, plainDoorCost: () => itemSprite("key_yellow"), heartDoorCost: ui("health"), doubleKey: () => itemSprite("key_blue"), masterKey: () => itemSprite("key_red"),
  ...byKeyColor((color) => {
    const key = () => itemSprite(`key_${color}`);
    return { KeyHeal: ui("health"), KeyOverheal: ui("health"), KeyGold: ui("gold"), KeyFind: key, KeySilver: silver, KeyChest: () => itemSprite("chest_treasure_open"), DoorCost: key, DoubleKey: key, MasterKey: key, FloorKey: key };
  }),
  ...byTrade((color) => {
    const key = () => itemSprite(`key_${color}`);
    return { TradeCost: key, TradeFreeUtility: ui("arrow-up"), Forge: key, Smelter: key };
  }),
  ...bySmelt((color) => ({ SmeltGold: ui("gold"), SmeltHeal: ui("health"), SmeltSilver: silver, SmeltFree: ui(({ yellow: "defense", blue: "attack", red: "arrow-up" } as const)[color]),
    SmeltCost: () => itemSprite(`key_${color}`), SmeltMaster: ui("gold") })),
  keySmelter: ui("gold"),
  ...byFoeCard(() => ({ Gold: ui("gold"), InstakillGold: ui("gold"), Silver: silver, Attack: ui("attack"), Defense: ui("defense"), Shroud: ui("log"), CritChance: ui("attack"), CritFactor: ui("attack"),
    KillXp: ui("arrow-up"), SpawnRate: ui("upgrades"), Material: () => itemSprite("chest_silver"), InstakillMaterial: () => itemSprite("chest_silver"), Equipment: () => itemSprite("chest_gold"),
    InstakillMaxHp: ui("health"), StealOverheal: ui("health"), SurpriseAttack: ui("attack"), Cells: () => cellIcon(), Takedown: ui("attack"), Tangle: ui("defense"),
    FirstStrike: ui("attack"), ChargeShot: ui("attack") })),
  maxHp: ui("health"),
  foeAttack: ui("attack"), foeDefense: ui("defense"), foeGold: ui("gold"), foeSilver: silver, moreEnemies: ui("upgrades"),
  critChance: ui("attack"), critFactor: ui("attack"), killXp: ui("arrow-up"), surpriseAttack: ui("attack"), foeAttackCut: ui("defense"), stealOverheal: ui("health"),
  attackShard: () => itemSprite("upgrade_attack"), defenseShard: () => itemSprite("upgrade_defense"), attackShardGold: ui("gold"), defenseShardGold: ui("gold"),
  attackShardSilver: silver, defenseShardSilver: silver, powerStrike: () => itemSprite("upgrade_attack"),
  takedown: ui("attack"), tangle: ui("defense"), greaterTakedown: ui("attack"), greaterTangle: ui("defense"),
  bossAttack: ui("attack"), bossDefense: ui("defense"), bossShroud: ui("log"), bossGold: ui("gold"), bossCells: () => cellIcon(),
  chestGold: () => itemSprite("chest_treasure"), supplyChance: () => itemSprite("chest_silver"), equipmentChance: () => itemSprite("chest_gold"),
  chestSilver: silver, chestCells: () => cellIcon(), treasureFloor: () => itemSprite("chest_treasure"), rarityUp: () => itemSprite("chest_gold"),
  chestDouble: () => itemSprite("chest_treasure_open"), chestTriple: () => itemSprite("chest_treasure_open"),
  shotAttack: ui("attack"), bossShotAttack: ui("attack"), shotSpeed: ui("arrow-right"), shotRange: ui("arrow-right"), chargeShot: ui("attack"),
  gemBank: () => gemIcon("ui-sprite"), gemBankSpeed: ui("arrow-up"), adGems: () => gemIcon("ui-sprite"), goldenGem: () => goldenGemIcon("ui-sprite"), stellarGem: () => stellarGemIcon("ui-sprite"),
  chestGem: () => itemSprite("chest_treasure"), gemChance: () => gemIcon("ui-sprite"), bossGem: ui("attack"), gemXp: ui("inspiration"),
  floorRuby: () => rubyIcon("ui-sprite"), bossRubies: () => rubyIcon("ui-sprite"), levelSkipBoost: ui("arrow-up"),
  torchGold: ui("gold"), torchSilver: silver, yellowToWood: () => itemSprite("key_yellow"),
};

/** A number as a power shows it: whole, or to two places at most. */
const amount = (n: number) => snap(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
/** Amount `n` as unit `unit` reads it (0 unsigned). */
const shownIn = (unit: Unit, n: number) => `${n && unit[0] !== "%" ? unit[0] : ""}${amount(n)}${unit.endsWith("%") ? "%" : ""}`;

/** What `power` gives at `levels`, a stat a part: its few words and amount ("Silver Bonus +3%"). */
export const powerValueText = (power: CardPower, levels: number) =>
  powerAmounts(power, levels).map(([stat, n]) => `${STAT_LINES[stat][0]} ${shownIn(STAT_LINES[stat][1], n)}`).join(", ");

/** What one level of `power` adds, a stat a part, with each stat's icon:
 * "+0.1 (Silver) / level", as an ascension names its new power. */
export const powerStepHtml = (power: CardPower) =>
  (Object.entries(power.stats) as [PowerStat, number][]).map(([stat, each]) =>
    `<span class="cp-step">${shownIn(STAT_LINES[stat][1], each)} ${STAT_ICONS[stat]()} <small>${STAT_LINES[stat][0]}</small> / level</span>`).join("");

/** What every level of `power` does, in full words, a stat a line. */
export const powerText = (power: CardPower, levels: number) => powerAmounts(power, levels).map(([stat, n]) => STAT_TEXT[stat](amount(n)));

/** A card's powers at `level`, a row each: its icon, name and rarity, and
 * what it gives now. A power the card hasn't reached yet stays in its row,
 * dimmed, naming the rarity that opens it (the base power, level 1). */
export function cardPowersHtml(card: CardId, level: number, upTo: number) {
  const powers = powersOf(card).filter((power) => rarityRank(power.rarity) <= upTo);
  if (!powers.length) return `<p class="card-powers-none">No powers yet: this card still levels and ascends.</p>`;
  const rows = powers.map((power) => {
    const n = powerLevel(power, level), open = n > 0, first = Object.keys(power.stats)[0] as PowerStat;
    const value = open ? powerValueText(power, n) : power.rarity === "base" ? "Opens at level 1" : `Opens at ${CARD_RARITY_NAMES[power.rarity]}`;
    const title = open ? powerText(power, n).join("; ") : `${CARD_RARITY_NAMES[power.rarity]} power: ${powerText(power, 1).join("; ")} a level`;
    return `<li class="card-power r-${power.rarity}${open ? "" : " locked"}" title="${title}"><span class="card-power-icon" aria-hidden="true">${STAT_ICONS[first]()}</span>`
      + `<span class="card-power-name">${power.name}</span><span class="card-power-value">${value}</span></li>`;
  }).join("");
  return `<ul class="card-powers" aria-label="${CARDS[card].name}'s powers">${rows}</ul>`;
}
