/** The Codex (docs/agents/codex.md): the player's reference to the game,
 * a category a tab. This module holds what each category shows, as plain
 * data read from the save and the game's own catalogs; `ui/codex-page.ts`
 * draws it. What the player hasn't reached shows as ??? (`hidden`), and a
 * category not yet open can't be chosen; Access to Everything shows all.
 *
 * A future major game experience that doesn't break down into a category
 * of its own gets a topic in `GENERAL_TOPICS`. */
import type { Save } from "../save/shape.ts";
import { seesAll } from "../access.ts";
import { CARDS, CARD_IDS, deckCards, type CardId } from "../cards/cards.ts";
import { levelIn, nextAscension, powersShownTo, readyToAscend } from "../cards/levels.ts";
import { CARD_RARITY_NAMES, rarityAt } from "../cards/rarity.ts";
import { BADGES, BADGE_IDS, badgeDef, badgeValue, levelProgress, ownedLevel, type BadgeId } from "../cards/badges.ts";
import { TREES, skillAvailable, skillHidden, treeOpen, type TreeId } from "../progression/skill-trees.ts";
import { UPGRADES, cost, type UpgradeId } from "../progression/upgrades.ts";
import { upgradeText, researchOpen, trainedBoost, trainingPoints, trainingShown } from "../progression/loadout.ts";
import { whole } from "../whole.ts";
import { TRAINING, TRAINING_GROUPS, type TrainingGroup } from "../progression/training.ts";
import { ARCANA, ARCANUM_IDS, arcanaOpen, levelsOf, valuesAt, type ArcanumId } from "../arcana/arcana.ts";
import { CATEGORIES, CATEGORY_IDS, EQUIP_MATERIALS, EQUIP_MATERIAL_IDS, STARTER_CATEGORIES, uniquesOf, type CategoryId } from "../equipment/catalog.ts";
import { ROSTER_STRENGTHS, ROSTER_PROFILES } from "../enemies/roster.ts";
import { traitOdds, type Trait } from "../enemies/odds.ts";
import { enemyShare } from "../enemies/schedule.ts";
import { TIERS } from "../tiers.ts";
import { goalCheck, goalUnlocked } from "../goals.ts";
import { levelForXp } from "../progression/xp.ts";
import { TRIALS, TRIAL_IDS } from "../proving-grounds/catalog.ts";
import { BOONS, BOON_IDS, boonLabel, shrinesOpen, type BoonDef } from "../shrines.ts";
import { ENVIRONMENTS, ENVIRONMENT_IDS, type EnvironmentId } from "../environments.ts";
import { RESEARCH, RESEARCH_IDS, describe, researchBoost, researchLevel, researched, status } from "../progression/archives.ts";
import { firstLevelOf } from "../cards/rarity.ts";
import { FAMILIARS, FAMILIAR_IDS, statAt, statValue } from "../familiars/catalog.ts";
import { isChampion } from "../shop/champion.ts";
import { ARCANUM_BRIEFS, CARD_BRIEFS, FAMILIAR_BRIEFS, PROFILE_BRIEFS, STRENGTH_BRIEFS, TRAIT_BRIEFS, UNDEAD_BRIEFS } from "./briefs.ts";
import { catacombsOpen } from "../catacombs/open.ts";
import { INGOTS, SPIRIT_RARITIES, UNDEAD, UNDEAD_IDS } from "../catacombs/catalog.ts";
import type { EnemyStrength } from "../entities.ts";

/** The doors the Codex pictures, each as its coloured tile. */
export type CodexDoor = "yellow" | "blue" | "red" | "wood" | "triune" | "heart";
/** What an entry's icon is, for the page to draw: a kind and its id. */
export type CodexIcon =
  | { kind: "kit" | "ui" | "item" | "currency" | "mark" | "card" | "badge" | "skill" | "arcanum" | "equip" | "equipCategory" | "material" | "strength" | "trait" | "training" | "boon" | "research" | "trial" | "environment" | "familiar" | "undead"; id: string }
  | { kind: "door"; id: CodexDoor }
  | null;
/** Where a link leads: a page, and what to open on it. */
export type CodexTarget =
  | { page: "shop"; offer?: string }
  | { page: "goals" | "tournament" | "missions" | "events" | "relics" | "shrines" }
  | { page: "deck"; card?: CardId }
  | { page: "upgrades"; tree: TreeId; skill?: UpgradeId }
  | { page: "research"; tab: "training" | "archives" }
  | { page: "gear"; screen: "equipment" | "arcana" };
/** A button to another page: its words, where it leads, and whether it can
 * be followed now (a forest-only page can't from inside a climb). */
export type CodexLink = { label: string; to: CodexTarget; open: boolean; note?: string; rubies?: number };
/** One entry: its icon, name and brief; `hidden` draws it as ???. `facts`
 * are its details as label and value rows, `lines` free lines, shown
 * when the entry is expanded (`expand`); `card` asks the page for that
 * card's powers at its level too, up to rarity rank `upTo`. A single stat
 * or rank is `status`, after the name, with nothing to expand. `beside`
 * is a second icon, `tips` a list under the brief and `closing` the line
 * after it. */
export type CodexEntry = {
  id: string;
  icon: CodexIcon;
  name: string;
  brief: string;
  hidden?: boolean;
  facts?: readonly (readonly [string, string])[];
  lines?: readonly string[];
  card?: { id: CardId; level: number; upTo: number };
  status?: string;
  beside?: CodexIcon;
  tips?: readonly string[];
  closing?: string;
  link?: CodexLink;
  /** Called out (a card ready to ascend). */
  ready?: boolean;
};
/** A collapsible group of entries; `table` draws them as rows of the run's
 * enemy table instead of a list, and `prose` is a passage of paragraphs in
 * their place (the Story's chapters). */
export type CodexSection = { id: string; title: string; entries: CodexEntry[]; hint?: string; collapsed?: boolean; table?: boolean; prose?: readonly string[] };
export type CodexCategoryId =
  | "general" | "story" | "currencies" | "elements" | "cards" | "badges" | "inspiration" | "breakthrough" | "training"
  | "arcana" | "familiars" | "equipment" | "enemies" | "combat" | "shrines" | "environments" | "catacombs" | "archives";
export type CodexCategory = { id: CodexCategoryId; name: string; icon: CodexIcon; open: boolean; summary: string; links: CodexLink[]; sections: CodexSection[] };

/** What the Codex reads: the save, whether a climb is under way (forest-only
 * pages can't open from it), and the run's arcana, lent ones too. */
export type CodexSource = {
  save: Save;
  inside: boolean;
  tournament: boolean;
  events: boolean;
  held: readonly ArcanumId[];
  /** The Silver the climb under way holds. */
  silver?: number;
};

const HIDDEN = "???";
const capitalized = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const n = (v: number) => Math.round(v).toLocaleString("en-US");
const hidden = (id: string, icon: CodexIcon = null): CodexEntry => ({ id, icon, name: HIDDEN, brief: "", hidden: true });
/** Entries shown as themselves when `known`, as ??? otherwise (all with Access to Everything). */
const shownIf = (src: CodexSource, known: boolean, entry: CodexEntry): CodexEntry =>
  known || seesAll(src.save) ? entry : hidden(entry.id);
/** A link to a page only the forest opens. */
const forestLink = (src: CodexSource, label: string, to: CodexTarget, extra: Partial<CodexLink> = {}): CodexLink =>
  ({ label, to, open: !src.inside, ...(src.inside ? { note: "Open it from the forest." } : {}), ...extra });
const anywhereLink = (label: string, to: CodexTarget): CodexLink => ({ label, to, open: true });

/** The highest floor completed in tower `tier`. */
function towerBest(save: Save, tier: number) {
  const slice = save.tower;
  return tier === slice.tier ? slice.best : slice.tierRecords[tier]?.best ?? 0;
}
/** Whether any tower opened has climbed past floor `floor(tier)`. */
const towerReached = (save: Save, floor: (tier: number) => number) => {
  for (let t = 1; t <= save.tower.tiersOpen; t++) if (towerBest(save, t) >= floor(t)) return true;
  return false;
};

// —— General ——————————————————————————————————————————————————————————

/** A General topic: shown once `open`, ??? before. */
type Topic = { id: string; icon: CodexIcon; name: string; text: string; tips?: readonly string[]; closing?: string; open: (src: CodexSource) => boolean; link?: (src: CodexSource) => CodexLink };
const always = () => true;
/** The game's broad ideas, in the order the Codex tells them. Add each new
 * major game experience here. */
export const GENERAL_TOPICS: readonly Topic[] = [
  { id: "tower", icon: { kind: "kit", id: "tower" }, name: "The Tower", open: always,
    text: "Climb as high as you can to gain inspiration and resources: Gold, Gems, Equipment, and upgrade Materials." },
  { id: "floors", icon: { kind: "kit", id: "stairs" }, name: "Tower Floors", open: always,
    text: "Each floor is a self-contained area and a unique challenge. Each floor contains enemies, loot, and power-ups to help you keep climbing." },
  { id: "cards", icon: { kind: "kit", id: "deck" }, name: "Cards", open: (s) => s.save.upgrades.combatStance > 0,
    text: "Deck out your hero build with cards, which determine and prioritize how your hero approaches each floor. Cards enable your hero to target specific floor elements. Cards gain XP the more they are used, and they level up at specific XP values. Cards become more powerful at higher levels and can initially increase to level 10.",
    link: (s) => forestLink(s, "Deck", { page: "deck" }) },
  { id: "ascension", icon: { kind: "currency", id: "rubies" }, name: "Card Ascension", open: (s) => s.save.upgrades.breakthrough > 0 || s.save.profile.earned.rubies > 0,
    text: "Unlock ways to break through your card level limits. Once a card is ready to grow beyond its tenth level, spend rubies gained from boss enemies to ascend your cards to a higher rarity version. Higher card rarities become more powerful and even unlock exclusive new abilities!" },
  { id: "keys", icon: { kind: "item", id: "key_yellow" }, name: "Keys and Doors", open: always,
    text: "Pick up keys to unlock doors. Make sure you have enough keys, or your hero might eventually become blocked by a door they can't open." },
  { id: "goals", icon: { kind: "kit", id: "trophy" }, name: "Tower Goals", open: always,
    text: "Reach goal checkpoints to unlock bonuses. Climb high enough to unlock new towers!",
    link: (s) => forestLink(s, "Goals", { page: "goals" }) },
  { id: "towers", icon: { kind: "kit", id: "tower" }, name: "New Towers", open: (s) => s.save.tower.tiersOpen > 1,
    text: "New towers provide a higher level of challenge and greater rewards. Enemies, gold, and loot scale with each new tower. New enemies, game elements, and exclusive goal rewards become available." },
  { id: "delve", icon: { kind: "kit", id: "cave" }, name: "Tournament: The Delve", open: (s) => s.tournament,
    text: "While a tournament is open, take the forest sign into the Delve, an endless labyrinth where you race other players to get deepest. Climb the leagues for Arcanite and prizes.",
    link: () => anywhereLink("Tournament", { page: "tournament" }) },
  { id: "proving", icon: { kind: "trial", id: "light-elemental" }, name: "Proving Grounds", open: (s) => levelForXp(s.save.xp) >= 10,
    text: "Sail from the fisherman's dock by the lake to face legendary guardians in tactical trials. Each boss gets harder every time you beat it, and pays Trial Points you keep." },
  { id: "missions", icon: { kind: "kit", id: "mission" }, name: "Missions", open: always,
    text: "Daily and weekly missions pay Gold, Medals and Training Points. Check back each day.",
    link: () => anywhereLink("Missions", { page: "missions" }) },
  { id: "events", icon: { kind: "kit", id: "event" }, name: "Events", open: (s) => s.events,
    text: "Seasonal events provide missions that give special rewards. Don't miss them!",
    link: () => anywhereLink("Events", { page: "events" }) },
  { id: "relics", icon: { kind: "kit", id: "relic-epic" }, name: "Relics", open: (s) => s.events || s.save.relics.length > 0,
    text: "Unique artifacts that permanently boost your hero's stats. Seek them out; some even provide new powers! Events provide limited access relics, so watch carefully for these.",
    link: (s) => forestLink(s, "Relics", { page: "relics" }) },
  { id: "shop", icon: { kind: "kit", id: "cart" }, name: "Shop", open: always,
    text: "Get free gems and buy powerful game unlocks to speed your ascent to being the most powerful.",
    link: () => anywhereLink("Shop", { page: "shop" }) },
  { id: "dailyGems", icon: { kind: "currency", id: "gems" }, name: "Free Daily Gems", open: always,
    text: "Enjoy free gems daily at your convenience.",
    link: () => anywhereLink("Free Gems", { page: "shop", offer: "dailyGems" }) },
  { id: "progress", icon: { kind: "kit", id: "ui-codex-help" }, name: "How to progress", open: always,
    text: "Stuck? Here are some general tips:",
    tips: [
      "Keep upgrading your hero to reach higher floors. There are multiple ways to do this that you might not have unlocked yet, such as Training, Research, Card and Equipment upgrades, and powerful Arcana.",
      "The higher you climb, the more resources you gain.",
      "Do more tower runs to gain gold, gems, and XP for permanent progression.",
      "Try to reach the next tower goal for a new ability or bonus.",
      "Think of how to rearrange your deck to become more powerful in a run or avoid obstacles that are thwarting your progress.",
      "Powerful shop offers are also available to speed your progress if you choose to take this route.",
    ],
    closing: "We want to make the best game possible for you to enjoy, and we appreciate your support and feedback!" },
];

function general(src: CodexSource): CodexCategory {
  const entries = GENERAL_TOPICS.map((t): CodexEntry => {
    const open = t.open(src) || seesAll(src.save);
    return open ? { id: t.id, icon: t.icon, name: t.name, brief: t.text, tips: t.tips, closing: t.closing, ...(t.link ? { link: t.link(src) } : {}) } : hidden(t.id);
  });
  return { id: "general", name: "General", icon: { kind: "ui", id: "tower" }, open: true, links: [],
    summary: "The big ideas of the game, and where to find them.", sections: [{ id: "topics", title: "Topics", entries }] };
}

// —— Story ———————————————————————————————————————————————————————————

/** The Story's Intro, told once the first Tower climb has ended. */
export const STORY_INTRO: readonly string[] = [
  "This is a land of magical adventure and dangerous dungeons. Dungeons that descend deep into the earth and mighty towers that stretch high into the sky.",
  "They have been present since the earliest history books, and nobody has reached the top of one of the towers, nor have they seen the bottom of one of the dungeons.",
  "They are full of magic, treasure, and unspeakable danger. Adventurers climb the towers and descend into the depths in search of magic and wonders, which become more potent the further they go.",
  "Our story begins with one young adventurer, turning to delving out of necessity to support their family and raise them out of debt.",
  "In an unprecedented stroke of luck, the adventurer obtained the Chrono Anchor, a unique divine gift. Looking at the tower, they wonder if it was all just a vision or a dream.",
];

/** The story so far, a chapter a collapsible section: the Intro once the
 * first Tower climb has ended (`tutorials.chamber`), which opens the tab. */
function story(src: CodexSource): CodexCategory {
  const told = src.save.tutorials.chamber || seesAll(src.save);
  return { id: "story", name: "Story", icon: { kind: "kit", id: "relic-divine-chrono-anchor" }, open: told, links: [],
    summary: "The tale of the tower, and of the adventurer who climbs it.",
    sections: told ? [{ id: "intro", title: "Intro", entries: [], prose: STORY_INTRO }] : [] };
}

// —— Currencies ———————————————————————————————————————————————————————

function currencies(src: CodexSource): CodexCategory {
  const s = src.save, have = (v: number) => `(Have ${n(whole(v))})`;
  const row = (open: boolean, id: string, name: string, brief: string, v?: number): CodexEntry =>
    shownIf(src, open, { id, icon: { kind: "currency", id }, name, brief, ...(v === undefined ? {} : { status: have(v) }) });
  const entries = [
    row(true, "gold", "Gold", "Earned everywhere. Pays for training, research and upgrades.", s.gold),
    row(true, "gems", "Gems", "Premium currency. Used to purchase equipment and rush upgrades.", s.gems),
    row(true, "silver", "Silver", "Found in a climb and spent only inside it, on climb training.", src.inside ? src.silver : undefined),
    row(true, "training", "Training Points", "Earned as your hero levels up. Buy Training ranks.", trainingPoints(s).left),
    row(true, "inspiration", "Inspiration", "Earned by beating your best climb. Unlocks Inspiration skills.", s.tower.inspiration),
    row(s.upgrades.breakthrough > 0, "breakthrough", "Breakthrough", "One for each Goal reward claimed. Unlocks Breakthrough skills.", s.breakthrough),
    row(s.profile.earned.rubies > 0 || s.upgrades.breakthrough > 0, "rubies", "Rubies", "Dropped by bosses. Ascend your cards to higher rarities.", s.rubies),
    row(s.profile.earned.arcanite > 0 || s.arcanite > 0, "arcanite", "Arcanite", "Rare crystals that buy and strengthen Arcana.", s.arcanite),
    row(s.profile.earned.medals > 0 || src.events, "medals", "Medals", "Paid by missions. Spent in Event stores.", s.medals),
    row(s.profile.earned.cells > 0, "cells", "Lore Fragments", "Dropped by Greater Bosses and found in the Catacombs. Speed up research.", s.cells),
    ...SPIRIT_RARITIES.map((r) => row(catacombsOpen(s), `spirit-${r}`, `${capitalized(r)} Spirit`, "Dropped by the Catacombs' undead, by rarity.", s.catacombs.spirit[r])),
    ...INGOTS.map((i) => row(catacombsOpen(s), `ingot-${i}`, `${capitalized(i)} Ingots`, "Found in the Catacombs' treasure rooms.", s.catacombs.ingots[i])),
    row(src.tournament, "tickets", "Tournament Tickets", "Enter tournaments in the Delve.", s.tournament.tickets),
    row(s.equipment.unlocked, "equip-tickets", "Equipment Tickets", "Each pays for one equipment pull.", s.equipment.tickets),
    row(isChampion(s), "vip", "VIP Points", "Earned with every Shop purchase.", s.vip),
    ...EQUIP_MATERIAL_IDS.map((m) => shownIf(src, s.equipment.unlocked,
      { id: `material-${m}`, icon: { kind: "material", id: m }, name: EQUIP_MATERIALS[m].name, brief: EQUIP_MATERIALS[m].description, status: have(s.equipment.materials[m]) })),
  ];
  return { id: "currencies", name: "Currencies", icon: { kind: "currency", id: "gold" }, open: true, links: [],
    summary: "What you earn, and what each currency is for.", sections: [{ id: "held", title: "Currencies", entries }] };
}

// —— Tower elements ———————————————————————————————————————————————————

/** The first floor of tower `tier` each later door colour shows on (docs/gameplay/floors.md). */
const BLUE_FROM = (tier: number) => 51 - 5 * (tier - 1), RED_FROM = (tier: number) => 101 - 10 * (tier - 1), HEART_FROM = (tier: number) => 201 - 10 * (tier - 1);

function elements(src: CodexSource): CodexCategory {
  const s = src.save, blue = towerReached(s, BLUE_FROM), red = towerReached(s, RED_FROM), heart = towerReached(s, HEART_FROM);
  const e = (known: boolean, id: string, icon: CodexIcon, name: string, brief: string, beside?: CodexIcon) =>
    shownIf(src, known, { id, icon, name, brief, ...(beside ? { beside } : {}) });
  const door = (id: CodexDoor): CodexIcon => ({ kind: "door", id });
  // The Greater Boss stays a secret until the Torch card can put every torch out.
  const torches = s.upgrades.cardTorch > 0 || seesAll(s) ? "Light the floor. Put them all out to call a Greater Boss." : "Light the floor.";
  const entries = [
    e(true, "stairs", { kind: "kit", id: "stairs" }, "Stairs", "The way up. Climb them to finish the floor."),
    e(true, "goldKey", { kind: "item", id: "key_yellow" }, "Gold Keys and Doors", "Each Gold Key opens one Gold Door.", door("yellow")),
    e(blue, "blueKey", { kind: "item", id: "key_blue" }, "Blue Keys and Doors", "Each Blue Key opens one Blue Door.", door("blue")),
    e(red, "redKey", { kind: "item", id: "key_red" }, "Red Keys and Doors", "Each Red Key opens one Red Door.", door("red")),
    e(true, "woodenDoor", door("wood"), "Wooden Doors", "Take any one key, or break them down by spending some HP."),
    // Pictured as a Triune Door, so shown once red keys are known.
    e(red, "multiDoor", door("triune"), "Multi Doors", "Some doors require multiple key types to open."),
    e(true, "potion", { kind: "item", id: "potion_flat" }, "Health Potions", "Restore HP. Some heal a share of your max HP."),
    e(true, "attack", { kind: "item", id: "upgrade_attack" }, "ATK Shards", "Raise your ATK for the rest of the climb."),
    e(true, "defense", { kind: "item", id: "upgrade_defense" }, "DEF Shards", "Raise your DEF for the rest of the climb."),
    e(true, "chest", { kind: "item", id: "chest_treasure" }, "Treasure Chests", "Hold Gold, and sometimes supplies or equipment."),
    e(true, "torch", { kind: "kit", id: "torch" }, "Torches", torches),
    e(true, "gem", { kind: "currency", id: "gems" }, "Gems", "Sometimes they appear on the floor. Tap to collect them quickly, before the hero moves on."),
    // Known once the first has been claimed (its boost picked).
    e(s.scarab.rng !== undefined, "scarab", { kind: "kit", id: "scarab" }, "Golden Scarabs", "Every so often one appears on the floor. Tap it for a boost to your progress for a while: more Gold or XP, faster research or training, and more."),
    e(heart, "heartDoor", door("heart"), "Heart Doors", "Need no key, but drain your HP to 1."),
  ];
  return { id: "elements", name: "Tower Elements", icon: { kind: "kit", id: "stairs" }, open: true, links: [],
    summary: "What you'll find on the floors of the Tower.", sections: [{ id: "elements", title: "On the floors", entries }] };
}

// —— Cards ————————————————————————————————————————————————————————————

function cards(src: CodexSource): CodexCategory {
  const s = src.save, owned = new Set(deckCards(s.upgrades, s.goals));
  const deck = CARD_IDS.filter((id) => owned.has(id)).map((id): CodexEntry => {
    const lvl = levelIn(s, id), next = nextAscension(s, id), ready = readyToAscend(s, id);
    const facts: [string, string][] = [
      ["Level", `${lvl.level} (${CARD_RARITY_NAMES[rarityAt(lvl.level)]})`],
      lvl.needed ? ["XP", `${n(Math.min(lvl.into, lvl.needed))} / ${n(lvl.needed)}`] : ["XP", "Max"],
    ];
    if (lvl.needed && !lvl.capped) facts.push(["XP to next level", n(lvl.needed - lvl.into)]);
    if (lvl.capped && lvl.needed && !ready) facts.push(["Level cap", "Ascend to level further"]);
    const entry: CodexEntry = { id, icon: { kind: "card", id }, name: CARDS[id].name, brief: CARD_BRIEFS[id], facts, card: { id, level: lvl.level, upTo: powersShownTo(s, id) } };
    if (ready && next) {
      entry.ready = true;
      entry.link = forestLink(src, `Ascend to ${CARD_RARITY_NAMES[next.rarity]}`, { page: "deck", card: id }, { rubies: next.rubies });
    }
    return entry;
  });
  const others = CARD_IDS.filter((id) => !owned.has(id)).map((id) =>
    seesAll(s) ? { id, icon: { kind: "card", id } as CodexIcon, name: CARDS[id].name, brief: CARD_BRIEFS[id] } : hidden(id));
  return {
    id: "cards", name: "Card Deck", icon: { kind: "kit", id: "deck" }, open: true,
    summary: "Arrange your deck and tap on cards during a climb to direct your hero. Cards can target game elements in the tower, such as enemies, health potions, doors, keys, and loot. The hero needs an open path to target a card element.",
    links: [forestLink(src, "Deck", { page: "deck" })],
    sections: [
      { id: "deck", title: "Your deck", entries: deck },
      ...(others.length ? [{ id: "more", title: "Still to find", entries: others, collapsed: true }] : []),
    ],
  };
}

// —— Badges ———————————————————————————————————————————————————————————

function badges(src: CodexSource): CodexCategory {
  const s = src.save, m = s.badges;
  const entry = (id: BadgeId): CodexEntry => {
    const def = BADGES[id], level = ownedLevel(m, id), pick = m.owned[id]?.pick ?? 0, copies = m.owned[id]?.copies ?? 0;
    const base = { id, icon: { kind: "badge", id } as CodexIcon, name: def.name };
    if (!level) return { ...base, brief: def.text(badgeValue(id, 1)) };
    const progress = levelProgress(copies);
    const facts: [string, string][] = [["Level", `${level}`], ["Copies to next level", progress ? `${progress.have} / ${progress.need}` : "Max"]];
    if (progress) facts.push(["Next level", def.text(badgeValue(id, level + 1, pick))]);
    return { ...base, brief: def.text(badgeValue(id, level, pick)), facts };
  };
  const pooled = (id: BadgeId) => { const unlock = badgeDef(id).unlock; return !unlock || s.upgrades[unlock] > 0; };
  const owned = BADGE_IDS.filter((id) => ownedLevel(m, id) > 0).map(entry);
  const drawable = BADGE_IDS.filter((id) => !ownedLevel(m, id) && pooled(id)).map(entry);
  const locked = BADGE_IDS.filter((id) => !ownedLevel(m, id) && !pooled(id)).map((id) => seesAll(s) ? entry(id) : hidden(id));
  return {
    id: "badges", name: "Card Badges", icon: { kind: "kit", id: "badge-star" }, open: s.upgrades.cardBadges > 0 || seesAll(s),
    summary: "Buy and place badges on your cards to grant them special powers, such as managing how they are triggered and what effect they produce.",
    links: [forestLink(src, "Deck", { page: "deck" })],
    sections: [
      { id: "owned", title: "Owned", entries: owned, hint: "None yet: draw badges on the Deck page." },
      ...(drawable.length ? [{ id: "drawable", title: "Still to draw", entries: drawable }] : []),
      ...(locked.length ? [{ id: "locked", title: "Not yet discovered", entries: locked, collapsed: true }] : []),
    ],
  };
}

// —— Skill trees ——————————————————————————————————————————————————————

/** What reaching skill `id` costs from here: it and every skill above it
 * not yet owned, each at its next rank's price (a skill needs all it
 * requires). */
export function costToReach(id: UpgradeId, levels: Record<UpgradeId, number>) {
  const nodes = new Map(TREES.flatMap((t) => t.nodes).map((node) => [node.id, node]));
  const needed = new Set<UpgradeId>(), walk = [id];
  while (walk.length) {
    const next = walk.pop()!;
    if (needed.has(next) || levels[next] > 0) continue;
    needed.add(next);
    walk.push(...(nodes.get(next)?.requires ?? []));
  }
  return [...needed].reduce((sum, skill) => sum + cost(skill, levels[skill]), 0);
}

function skillTree(src: CodexSource, treeId: "inspiration" | "breakthrough"): CodexCategory {
  const s = src.save, tree = TREES.find((t) => t.id === treeId)!, levels = s.upgrades, all = seesAll(s), goals = goalCheck(s);
  const currency = tree.currency === "inspiration" ? "Inspiration" : "Breakthrough";
  const entry = (id: UpgradeId, status?: string): CodexEntry =>
    ({ id, icon: { kind: "skill", id }, name: UPGRADES.find((u) => u.id === id)!.name, brief: `${upgradeText(id)}.`, ...(status ? { status } : {}),
      link: forestLink(src, "Show in tree", { page: "upgrades", tree: treeId, skill: id }) });
  const owned: CodexEntry[] = [], open: CodexEntry[] = [], locked: CodexEntry[] = [], unseen: CodexEntry[] = [];
  for (const node of tree.nodes) {
    const level = levels[node.id], reach = () => `(Cost to reach ${n(costToReach(node.id, levels))} ${currency})`;
    // Both trees' skills are bought once each, so none has a rank to show.
    if (level > 0) owned.push(entry(node.id));
    else if (skillHidden(node.id, levels, goals)) unseen.push(all ? entry(node.id, reach()) : hidden(node.id));
    else if (skillAvailable(node.id, levels, goals)) open.push(entry(node.id, `(Cost ${n(cost(node.id, level))} ${currency})`));
    else locked.push(entry(node.id, reach()));
  }
  const name = tree.name;
  return {
    id: treeId, name, icon: { kind: "ui", id: treeId },
    open: treeId === "inspiration" ? s.profile.earned.inspiration > 0 || all : treeOpen(tree, levels) || all,
    summary: treeId === "inspiration"
      ? "Gain inspiration points by reaching higher floors. Use the points to unlock new abilities."
      : "Gain a Breakthrough point for each Goal reward you claim. Use them to break through your limits.",
    links: [forestLink(src, `${name} tree`, { page: "upgrades", tree: treeId })],
    sections: [
      { id: "owned", title: "Owned", entries: owned, hint: "None yet." },
      { id: "available", title: "Available", entries: open, hint: "None right now." },
      { id: "locked", title: "Locked", entries: locked, collapsed: true, hint: "None." },
      { id: "hidden", title: "Hidden", entries: unseen, collapsed: true, hint: "None." },
    ],
  };
}

// —— Training —————————————————————————————————————————————————————————

const TRAINING_GROUP_ICONS: Record<TrainingGroup, CodexIcon> = { offense: { kind: "training", id: "offense" }, defense: { kind: "training", id: "defense" }, utility: { kind: "training", id: "utility" } };

/** How Training is used, for a new player: what Gold and Gems do, batches,
 * auto-continue, stopping, and the free points. */
const TRAINING_HOW: CodexEntry[] = [
  { id: "points", icon: { kind: "currency", id: "training" }, name: "Free training", brief: "Training points from levelling up and weekly mission rewards buy ranks instantly, for free. Spend them first!" },
  { id: "gold", icon: { kind: "currency", id: "gold" }, name: "Train with Gold", brief: "Once you have Trainers, hire one with Gems, then pay Gold to train a stat over time. Every finished rank is permanent." },
  { id: "batch", icon: { kind: "mark", id: "clock" }, name: "Train more at once", brief: "Training several ranks together goes faster than one at a time." },
  { id: "rush", icon: { kind: "currency", id: "gems" }, name: "Rush with Gems", brief: "Tap the Gem button next to a countdown to finish training instantly." },
  { id: "repeat", icon: { kind: "mark", id: "repeat" }, name: "Auto-continue", brief: "Tick the box with this icon to start the next rank as soon as one finishes, while you have the Gold." },
  { id: "stop", icon: { kind: "mark", id: "stop" }, name: "Stop any time", brief: "Tap a countdown to stop it. You get your Gold back, and the time spent is saved for later." },
];
/** How the Archives are used, likewise. */
const ARCHIVES_HOW: CodexEntry[] = [
  { id: "gold", icon: { kind: "currency", id: "gold" }, name: "Research with Gold", brief: "Each level of a project costs Gold and takes time. An archivist works on one project at a time." },
  { id: "rush", icon: { kind: "currency", id: "gems" }, name: "Rush with Gems", brief: "Tap Rush to finish research instantly." },
  { id: "repeat", icon: { kind: "mark", id: "repeat" }, name: "Auto-continue", brief: "Tick the box with this icon to start the next level as soon as one completes, while you have the Gold." },
  { id: "switch", icon: { kind: "mark", id: "stop" }, name: "Switch projects", brief: "Switch a busy archivist to another project. You get your Gold back, and the progress is saved for later." },
  { id: "archivists", icon: { kind: "kit", id: "book" }, name: "More archivists", brief: "Hire more archivists with Gems to research several projects at once." },
  { id: "cells", icon: { kind: "currency", id: "cells" }, name: "Speed Ups", brief: "Spend Lore, dropped by Greater Bosses, to make research go faster." },
];

/** An entry's rank, with what it adds once there is one. */
const rankText = (rank: number, boost: () => string) => (rank ? `Rank ${n(rank)} (${boost()})` : "Rank 0");

function training(src: CodexSource): CodexCategory {
  const s = src.save;
  const sections = (Object.keys(TRAINING_GROUPS) as TrainingGroup[]).map((group): CodexSection => ({
    id: group, title: TRAINING_GROUPS[group],
    entries: TRAINING.filter((row) => row.group === group && trainingShown(row, s)).map((row) =>
      ({ id: row.id, icon: TRAINING_GROUP_ICONS[group], name: row.name, brief: row.description, status: rankText(s.training[row.id], () => trainedBoost(s, row.id)) })),
    hint: "None open yet.",
  }));
  return {
    id: "training", name: "Training", icon: { kind: "kit", id: "hourglass" }, open: researchOpen(s),
    summary: "Pay gold to spend time training. Permanently increase your hero's power level when starting a climb.",
    links: [anywhereLink("Training", { page: "research", tab: "training" })],
    sections: [{ id: "how", title: "How it works", entries: TRAINING_HOW }, ...sections],
  };
}

// —— Arcana ———————————————————————————————————————————————————————————

function arcana(src: CodexSource): CodexCategory {
  const s = src.save, known = new Set([...s.codex.arcana, ...src.held, ...s.arcana.offer]);
  const entries = ARCANUM_IDS.map((id): CodexEntry => {
    const def = ARCANA[id], owned = !!s.arcana.owned[id], lent = !owned && src.held.includes(id);
    if (!known.has(id) && !owned && !seesAll(s)) return hidden(id, null);
    const entry: CodexEntry = { id, icon: { kind: "arcanum", id }, name: def.name, brief: ARCANUM_BRIEFS[id] };
    if (owned) {
      const levels = levelsOf(s.arcana, id), values = valuesAt(id, levels);
      entry.facts = def.attributes.map((a, i) => [`${a.name} (level ${levels[i]})`, a.shown(values[i]!)] as const);
      entry.lines = [def.summary(values)];
    } else entry.lines = [lent ? "Lent to this climb by a Shrine boon." : "Not owned yet."];
    return entry;
  });
  return {
    id: "arcana", name: "Arcana", icon: { kind: "arcanum", id: "overseer" }, open: arcanaOpen(s) || src.held.length > 0 || seesAll(s),
    summary: "Arcane powers, bought with Arcanite, that act on their own in every climb. Raise their attributes to make them stronger.",
    links: [forestLink(src, "Arcana", { page: "gear", screen: "arcana" })],
    sections: [{ id: "arcana", title: "Arcana", entries }],
  };
}

// —— Familiars ————————————————————————————————————————————————————————

function familiars(src: CodexSource): CodexCategory {
  const s = src.save, open = src.events || Object.keys(s.familiars).length > 0 || seesAll(s);
  const entries = FAMILIAR_IDS.map((id): CodexEntry => {
    if (!open) return hidden(id);
    const { name, summary } = FAMILIARS[id], owned = s.familiars[id];
    const entry: CodexEntry = { id, icon: { kind: "familiar", id }, name, brief: FAMILIAR_BRIEFS[id], lines: owned ? [summary] : [summary, "Not hatched yet."] };
    if (owned) entry.facts = owned.levels.map((level, slot) => [`${statAt(id, slot).name} (level ${level})`, statAt(id, slot).shown(statValue(id, slot, level))] as const);
    return entry;
  });
  return {
    id: "familiars", name: "Familiars", icon: { kind: "familiar", id: "dragon" }, open,
    summary: "Young beasts hatched from eggs for Medals. They follow you into every climb and act by themselves. Spend more Medals to help them grow.",
    links: src.events ? [anywhereLink("Familiars", { page: "events" })] : [],
    sections: [{ id: "familiars", title: "Familiars", entries }],
  };
}

// —— Equipment ————————————————————————————————————————————————————————

function equipment(src: CodexSource): CodexCategory {
  const s = src.save, found = new Set(s.codex.uniques), all = seesAll(s);
  const shownCategories = CATEGORY_IDS.filter((c) => STARTER_CATEGORIES.includes(c) || s.equipment.categories.includes(c) || uniquesOf(c).some((d) => found.has(d.id)) || all);
  const sections = shownCategories.map((c: CategoryId): CodexSection => ({
    id: c, title: CATEGORIES[c].plural, hint: CATEGORIES[c].role,
    entries: uniquesOf(c).map((d) => found.has(d.id) || all ? { id: d.id, icon: { kind: "equip", id: d.id } as CodexIcon, name: d.name, brief: `${d.identity}.` } : hidden(d.id, { kind: "equipCategory", id: c })),
  }));
  return {
    id: "equipment", name: "Equipment", icon: { kind: "equipCategory", id: "weapon" }, open: s.equipment.unlocked || all,
    summary: "Buy and discover equipment to strengthen and protect your hero. Spend materials to permanently upgrade your equipment. Find unique pieces that provide special powers!",
    links: [forestLink(src, "Equipment", { page: "gear", screen: "equipment" })],
    sections,
  };
}

// —— Enemies ——————————————————————————————————————————————————————————

/** Floors sampled to tell whether a tower can roll an enemy kind at all. */
const SAMPLE_FLOORS = [0, 10, 20, 40, 60, 100, 200, 400, 700, 1000, 2000, 4000, 7000, 9999];
/** The strengths and attributes the towers opened can roll: an enemy kind
 * counts as discovered once the player reaches a tower that features it
 * (a Greater Boss once one has been beaten, so its secret keeps). */
export function enemiesKnown(save: Save): { strengths: Set<EnemyStrength>; traits: Set<Trait> } {
  const strengths = new Set<EnemyStrength>(["normal", "boss"]), traits = new Set<Trait>();
  for (let tier = 1; tier <= Math.min(save.tower.tiersOpen, TIERS); tier++)
    for (const floor of SAMPLE_FLOORS) {
      for (const k of ["weak", "strong", "elite"] as const) if (enemyShare(k, floor, tier) > 0) strengths.add(k);
      for (const t of traitOdds(tier, floor)) traits.add(t.trait);
    }
  if (save.profile.earned.cells > 0) strengths.add("greaterBoss");
  return { strengths, traits };
}

const TRAITS: readonly Trait[] = ["fast", "ranged", "shielded", "flying", "armored", "aggroed"];
const STRENGTH_NAMES: Record<EnemyStrength, string> = { weak: "Weak", normal: "Base", strong: "Strong", elite: "Elite", boss: "Boss", greaterBoss: "Greater Boss" };
const TRAIT_NAMES: Record<Trait, string> = { fast: "Fast", ranged: "Ranged", shielded: "Shielded", flying: "Flying", armored: "Armored", aggroed: "Aggroed" };

/** How a fight plays out and how its damage is counted (combat.ts), in the player's words. */
const FIGHT_BASICS: CodexEntry[] = [
  { id: "order", icon: { kind: "kit", id: "sword" }, name: "Taking turns", brief: "Step into an enemy to fight it. You strike first, then it strikes back, round after round, until one of you falls." },
  { id: "damage", icon: { kind: "kit", id: "shield" }, name: "Damage", brief: "Each strike deals the striker's ATK minus the target's DEF, never less than 0. A fight's damage to you is every strike the enemy lands before it falls." },
  { id: "rising", icon: { kind: "kit", id: "heart" }, name: "Rising ATK", brief: "After every round the enemy's ATK rises by 1%, so even high DEF can't hold one off forever." },
  { id: "forecast", icon: { kind: "kit", id: "scroll" }, name: "Before you fight", brief: "Tap an enemy to see its HP, ATK and DEF, and how much damage it would deal you." },
];
const FIGHT_STATS: CodexEntry[] = [
  { id: "hp", icon: { kind: "kit", id: "heart" }, name: "HP", brief: "How much damage you can take. At 0 your climb ends, unless something saves you." },
  { id: "atk", icon: { kind: "kit", id: "sword" }, name: "ATK", brief: "The damage you deal. More ATK ends fights in fewer rounds, so enemies strike you fewer times." },
  { id: "def", icon: { kind: "kit", id: "shield" }, name: "DEF", brief: "Taken off every enemy strike. Enough DEF makes weak enemies almost harmless." },
  { id: "enemy", icon: { kind: "strength", id: "normal" }, name: "Enemy HP, ATK and DEF", brief: "The same three stats on the other side. They grow as you climb and with each new tower." },
];
const FIGHT_TIPS: CodexEntry[] = [
  { id: "scratch", icon: { kind: "kit", id: "sword" }, name: "Can't hurt it?", brief: "Your ATK must beat its DEF. Raise ATK, or wear its DEF down with Armor Break." },
  { id: "tough", icon: { kind: "strength", id: "boss" }, name: "Bosses and tough enemies", brief: "Lots of HP means a long fight: ATK and critical hits shorten it most." },
  { id: "hard", icon: { kind: "trait", id: "fast" }, name: "Hard hitters", brief: "Brutes and Fast enemies hit hard: DEF cuts every blow, and Shroud blocks the first damage of each fight." },
  { id: "many", icon: { kind: "item", id: "potion_flat" }, name: "Long climbs", brief: "Many fights wear you down. Max HP, Regen, Lifesteal and potions keep you going." },
  { id: "shooters", icon: { kind: "trait", id: "ranged" }, name: "Shooters", brief: "Ranged and Flying enemies hit you from a distance. Max HP and Regen soak it up, and the Archer's arrows hit back." },
];

function enemies(src: CodexSource): CodexCategory {
  const s = src.save, known = enemiesKnown(s), all = seesAll(s);
  const strengths = ROSTER_STRENGTHS.map((k) => known.strengths.has(k) || all
    ? { id: k, icon: { kind: "strength", id: k } as CodexIcon, name: `${STRENGTH_NAMES[k]} Enemy`, brief: STRENGTH_BRIEFS[k] } : hidden(k));
  const traits = TRAITS.map((t) => known.traits.has(t) || all
    ? { id: t, icon: { kind: "trait", id: t } as CodexIcon, name: `${TRAIT_NAMES[t]} Enemy`, brief: TRAIT_BRIEFS[t] } : hidden(t));
  const builds = ROSTER_PROFILES.map((p) => ({ id: p, icon: null, name: PROFILE_BRIEFS[p].name, brief: PROFILE_BRIEFS[p].brief }));
  const trialOpen = levelForXp(s.xp) >= 10;
  const trials = TRIAL_IDS.map((id) => {
    const progress = s.trialAccess.progress[id];
    return progress || (trialOpen && id === TRIAL_IDS[0]) || all
      ? { id, icon: { kind: "trial", id } as CodexIcon, name: TRIALS[id].name, brief: `Proving Grounds trial ${TRIALS[id].number}.`, status: `(Highest difficulty beaten ${n(progress?.cleared ?? 0)})` }
      : hidden(id);
  });
  return {
    id: "enemies", name: "Enemies", icon: { kind: "strength", id: "boss" }, open: true,
    summary: "Enemies guard loot and the way up the tower. They get more powerful the higher you climb, so prepare yourself!",
    links: [],
    sections: [
      { id: "fights", title: "How fights work", entries: FIGHT_BASICS },
      { id: "stats", title: "Stats that win fights", entries: FIGHT_STATS },
      { id: "tips", title: "Which stats help most", entries: FIGHT_TIPS, collapsed: true },
      { id: "strengths", title: "By power", entries: strengths, table: true },
      { id: "traits", title: "By attribute", entries: traits, table: true, hint: "Enemies with attributes appear from Tower II on." },
      { id: "builds", title: "By build", entries: builds },
      ...(trialOpen || all || TRIAL_IDS.some((id) => s.trialAccess.progress[id]) ? [{ id: "trials", title: "Proving Grounds bosses", entries: trials }] : []),
    ],
  };
}

// —— Combat ———————————————————————————————————————————————————————————

/** Combat's terms, each opened by its skill. */
const COMBAT_TERMS: readonly { skill: UpgradeId; name: string; brief: string }[] = [
  { skill: "critical", name: "Critical Hits", brief: "Some strikes deal extra damage." },
  { skill: "superCritical", name: "Super Critical", brief: "A critical hit may become far stronger still." },
  { skill: "armorBreak", name: "Armor Break", brief: "Each hit wears down the enemy's DEF." },
  { skill: "bombs", name: "Bombs", brief: "Carried into every climb, to blast an enemy away." },
  { skill: "shroud", name: "Shroud", brief: "Blocks the first damage of every fight." },
  { skill: "regen", name: "Regen", brief: "Regain HP with every step." },
  { skill: "lifesteal", name: "Lifesteal", brief: "Heal for part of the damage you deal." },
  { skill: "thorns", name: "Thorns", brief: "Enemies hurt themselves when they strike you." },
  { skill: "parry", name: "Parry", brief: "A chance to turn aside an enemy's strike." },
  { skill: "revive", name: "Revive", brief: "A chance to rise again at full HP when felled." },
  { skill: "overheal", name: "Overheal", brief: "Lets your HP rise above your max HP." },
  { skill: "heroShield", name: "Aether Shield", brief: "A shield that takes hits before your HP, and regrows." },
  { skill: "phoenixSpark", name: "Phoenix Spark", brief: "Shrugs off a hit that would defeat you." },
  { skill: "dashCombo", name: "Dash Combo", brief: "Chain fights quickly for extra ATK." },
  { skill: "ignore", name: "Ignore", brief: "Mark a tile no card will step on." },
  { skill: "target", name: "Target", brief: "Send your hero to any tile you tap." },
  { skill: "dash", name: "Dash", brief: "Dash across empty tiles in a single step." },
];

function combat(src: CodexSource): CodexCategory {
  const s = src.save;
  const entries = [
    { id: "fights", icon: { kind: "kit", id: "sword" } as CodexIcon, name: "Fights", brief: "You and an enemy trade blows until one falls. The Enemies tab tells how." },
    ...COMBAT_TERMS.map((t) => shownIf(src, s.upgrades[t.skill] > 0, { id: t.skill, icon: { kind: "skill", id: t.skill }, name: t.name, brief: t.brief })),
  ];
  return { id: "combat", name: "Combat", icon: { kind: "kit", id: "sword" }, open: true, links: [],
    summary: "How fights work, and the powers that turn them your way.", sections: [{ id: "terms", title: "Combat", entries }] };
}

// —— Shrines ——————————————————————————————————————————————————————————

const BOON_KINDS: readonly [BoonDef["kind"], string][] = [["standard", "Standard boons"], ["tradeoff", "Trade-off boons"], ["spell", "Spell boons"], ["augment", "Augment boons"]];

function shrines(src: CodexSource): CodexCategory {
  const s = src.save;
  return {
    id: "shrines", name: "Shrines", icon: { kind: "kit", id: "shrine" }, open: shrinesOpen(s) || seesAll(s),
    summary: "As you climb, Shrines offer a choice of boons that strengthen your hero for the rest of the climb.",
    links: [forestLink(src, "Shrine Boons", { page: "shrines" })],
    sections: BOON_KINDS.map(([kind, title]) => ({
      id: kind, title, collapsed: kind !== "standard",
      entries: BOON_IDS.filter((id) => BOONS[id].kind === kind).map((id) => ({ id, icon: { kind: "boon", id } as CodexIcon, name: BOONS[id].name, brief: boonLabel(id, s) })),
    })),
  };
}

// —— Environments —————————————————————————————————————————————————————

const ENVIRONMENT_BRIEFS: Record<EnvironmentId, string> = {
  treasure: "Its shards and potions are treasure chests instead.",
  golden: "Multiplies all Gold and Silver found on it.",
  stellar: "Multiplies all Gold and Silver found on it ten times.",
};

function environments(src: CodexSource): CodexCategory {
  const s = src.save, bloom = !!s.arcana.owned.aurumBloom || src.held.includes("aurumBloom");
  const known: Record<EnvironmentId, boolean> = {
    treasure: levelIn(s, "chest").level >= firstLevelOf("epic"),
    golden: bloom || researched(s.archives, "goldenFloorChance") > 0,
    stellar: bloom,
  };
  const entries = ENVIRONMENT_IDS.map((id) => shownIf(src, known[id], { id, icon: { kind: "environment", id }, name: ENVIRONMENTS[id].name, brief: ENVIRONMENT_BRIEFS[id] }));
  return { id: "environments", name: "Environments", icon: { kind: "currency", id: "gold" }, open: ENVIRONMENT_IDS.some((id) => known[id]) || seesAll(s), links: [],
    summary: "Some floors have an environment, a rule for the whole floor that changes what it holds or pays.", sections: [{ id: "environments", title: "Environments", entries }] };
}

// —— Catacombs ————————————————————————————————————————————————————————

/** How the Catacombs work, in a line each. */
const CATACOMBS_HOW: CodexEntry[] = [
  { id: "halls", icon: { kind: "kit", id: "stairs" }, name: "Halls", brief: "Each hall is a corridor of undead, a Lore tablet and stairs down." },
  { id: "magic", icon: { kind: "kit", id: "sword" }, name: "Magic stats", brief: "Only MHP, MAtk and MDef count. Spend magic skill points on them." },
  { id: "turns", icon: { kind: "kit", id: "hourglass" }, name: "Turns and the bank", brief: "A turn a second. Time away is banked, and haste spends it." },
  { id: "treasure", icon: { kind: "kit", id: "torch" }, name: "Treasure rooms", brief: "Every 5th hall and more hold Ingots, worth more each time." },
];

/** The Catacombs (docs/CATACOMBS.md): how they work, and each undead,
 * shown once a hall it can appear on has been reached in any Catacomb. */
function catacombs(src: CodexSource): CodexCategory {
  const s = src.save, c = s.catacombs, all = seesAll(s), open = catacombsOpen(s);
  const deepest = Math.max(0, ...Object.values(c.best));
  const entries = UNDEAD_IDS.map((id): CodexEntry => {
    const u = UNDEAD[id], known = u.from !== null && deepest >= u.from;
    if (!known && !all) return hidden(id);
    return { id, icon: { kind: "undead", id }, name: u.name, brief: UNDEAD_BRIEFS[id], facts: [
      ["Rarity", capitalized(u.rarity)], ["MHP", n(u.mhp)], ["MAtk", n(u.matk)], ["MDef", n(u.mdef)], ["MXP", n(u.mxp)],
      ["First hall", u.from === null ? "Not yet" : n(u.from)],
    ] };
  });
  return { id: "catacombs", name: "Catacombs", icon: { kind: "kit", id: "torch" }, open: open || all, links: [],
    summary: "An endless crypt under the forest. The Magician fights undead there, even while you play elsewhere. Stats are Catacomb I's: each higher number multiplies them.",
    sections: [{ id: "how", title: "How it works", entries: CATACOMBS_HOW }, { id: "undead", title: "Undead", entries }] };
}

// —— Archives —————————————————————————————————————————————————————————

function archives(src: CodexSource): CodexCategory {
  const s = src.save, all = seesAll(s), done: CodexEntry[] = [], open: CodexEntry[] = [], locked: CodexEntry[] = [];
  for (const id of RESEARCH_IDS) {
    const level = researchLevel(s.archives, id), state = status(s, id);
    const entry: CodexEntry = { id, icon: { kind: "research", id }, name: RESEARCH[id].name, brief: describe(s.archives, id), status: rankText(level, () => researchBoost(s.archives, id)) };
    if (level > 0) done.push(entry);
    else if (state === "locked") locked.push(all ? entry : hidden(id));
    else open.push(entry);
  }
  return {
    id: "archives", name: "Archives", icon: { kind: "kit", id: "book" }, open: s.upgrades.archives > 0 || all,
    summary: "Pay Gold for archivists to research lasting improvements over time.",
    links: [anywhereLink("Archives", { page: "research", tab: "archives" })],
    sections: [
      { id: "how", title: "How it works", entries: ARCHIVES_HOW },
      { id: "researched", title: "Researched", entries: done, hint: "None yet." },
      { id: "available", title: "Available", entries: open, hint: "None right now." },
      { id: "locked", title: "Locked", entries: locked, collapsed: true, hint: "None." },
    ],
  };
}

/** Every category, in the order the Codex's tabs list them. */
export function codexCategories(src: CodexSource): CodexCategory[] {
  return [
    general(src), story(src), currencies(src), elements(src), cards(src), badges(src), skillTree(src, "inspiration"), skillTree(src, "breakthrough"),
    training(src), arcana(src), familiars(src), equipment(src), enemies(src), combat(src), shrines(src), environments(src), catacombs(src), archives(src),
  ];
}
