import { relicFactor } from "../economy/relic-effects.ts";
import type { Board } from "../board.ts";
import { VIEWPORT_TILES } from "../config.ts";
import type { Enemy, Mode } from "../entities.ts";
import type { Run } from "../runs.ts";
import {
  adBank, claimAdBank, collectedGem, extraOn, gemOn, gemSpot, gemValue, isNewFloor, ofKind, reachFloor, rollGemKind, sideSpot, wholeGems,
  type GemKind, type GemSpot,
} from "../economy/gems.ts";
import { MODES } from "../modes.ts";
import { canClaimGoldBoost, claimGoldBoost, goldBoostLeft, GOLD_BOOST_FACTOR, GOLD_BOOST_MS, noteGoldBoost } from "../economy/gold-boost.ts";
import { random } from "../random.ts";
import { adsOff } from "../shop/entitlements.ts";
import type { GainArt } from "../shown.ts";
import type { DeskHost } from "./desk.ts";
import { earn } from "../save/profile.ts";
import type { CardId } from "../cards/cards.ts";
import { treeFactor, type TreeBonus } from "../cards/trees.ts";
import { adTerms, gemCardBonus } from "../cards/gem-card.ts";
import { wholeChange } from "../whole.ts";

/** What the Gem finder reads from the game: the board the hero stands on,
 * what the run's hand's card trees give (GEM's), the cards it holds, and
 * the gains queue the board raises a collected Gem from. */
export interface GemHost extends DeskHost {
  readonly mode: Mode;
  readonly run: Run;
  readonly world: Board;
  /** Inside a run the hero is still standing in. */
  readonly playing: boolean;
  /** What the run's hand's card trees give: the GEM card's chances. */
  readonly treeBonus: TreeBonus;
  /** The cards of the run's hand and Manual hand. */
  readonly held: readonly CardId[];
  gain(x: number, y: number, text: string, art: GainArt | null): void;
  /** Card `id` gains `xp` toward its levels. */
  gainCardXp(id: CardId, xp: number): void;
}

/** Salts the run seed for where a Gem lies on a floor. */
const GEM_SALT = 0x6e3a1;
/** Salts the run seed for each of the GEM card's rolls, so each is a
 * sequence of its own: a floor's Gem Chance and where its Gem lies, a
 * boss's drop, a chest's Gem, and whether a Gem is golden, and a golden
 * one stellar (each by where the Gem comes from). */
const CHANCE_SALT = 0x6c4a7, CHANCE_SPOT_SALT = 0x6c5b0, BOSS_SALT = 0xb055e, CHEST_SALT = 0xc4e57, GOLDEN_SALT = 0x901de, STELLAR_SALT = 0x57e11;
/** Salts telling apart where a Gem comes from, for its golden and stellar rolls. */
const FROM_SALT = { timer: 0x1, chance: 0x2, boss: 0x3, chest: 0x4 } as const;
type GemFrom = keyof typeof FROM_SALT;

/** A floor's part of a roll's seed. */
const floorPart = (floor: number) => Math.imul(floor + 1, 0x9e3779b1);
/** A tile's part of a roll's seed. */
const tilePart = (x: number, y: number) => Math.imul(x + 1, 0x85ebca6b) ^ Math.imul(y + 1, 0xc2b2ae35);

/** Gems found on the floors and the ad's Gems: where the Gems on the board
 * lie, collecting them, the GEM card's Gems (Gem Chance, a boss's drop, a
 * chest's, golden and stellar ones), the ad button's bank, and the
 * cooldowns between them (`save.gemDrop`, never part of a run). */
export class GemFinder {
  /** Where and when (performance.now()) the latest Gem was collected, and
   * its kind, for the board's sparkle. */
  sparkle: { x: number; y: number; at: number; kind: GemKind } | null = null;

  constructor(private readonly host: GemHost) {}

  /** The floor a Gem belongs to: the Tower floor the hero stands on, or in
   * the Delve the furthest equivalent floor reached. */
  private get floor() {
    const { mode, run } = this.host;
    return mode === "tower" ? run.height : MODES[mode].equivalentFloor(run.maxHeight ?? run.height);
  }

  private get at() {
    return { mode: this.host.mode, seed: this.host.run.seed, floor: this.floor };
  }

  /** Every Gem lying on the floor the board shows: the cooldown's, then
   * the GEM card's. */
  get gems(): GemSpot[] {
    const { run, save } = this.host;
    if (run.outside) return [];
    const at = this.at, out = gemOn(save.gemDrop, at);
    return [...(out ? [out] : []), ...extraOn(save.gemDrop, at)];
  }

  /** The Gem lying at (x, y) on the floor the board shows, if any. */
  gemAt(x: number, y: number) {
    return this.gems.find((g) => g.x === x && g.y === y) ?? null;
  }

  /** The hero stands somewhere new inside a run: it takes a Gem lying on
   * its tile (`scale`, a badge's Effective or Dampen on GEM's last step,
   * scaling what it pays), a Gem left on another floor is missed, and on a
   * new floor (once the last Gem's cooldown is over) a new one may appear:
   * on a plain tile the hero can walk to, in the Delve within the view.
   * There, too, Gem Chance may lay a Gem of its own, in a side room. */
  step(scale = 1) {
    const { run, save, playing } = this.host;
    if (!playing) return;
    const drop = save.gemDrop, p = run.player, at = this.at;
    for (const gem of this.gems) if (gem.x === p.x && gem.y === p.y) this.take(gem, scale);
    const fresh = isNewFloor(drop, at), appears = reachFloor(drop, at, this.host.clock());
    if (!fresh) return;
    if (appears) this.layTimerGem();
    this.layChanceGem();
  }

  /** The rows a Gem may lie in: the whole Tower floor, or the Delve's view. */
  private get rows() {
    const view = Math.floor(VIEWPORT_TILES / 2), y = this.host.run.player.y;
    return this.host.mode === "tower" ? { minY: 0, maxY: Infinity } : { minY: y - view, maxY: y + view };
  }

  /** The cooldown's Gem, out of the way where the hero can walk to it. */
  private layTimerGem() {
    const { run, save } = this.host, at = this.at;
    // Where it lies is fixed for the run and floor, like the floor itself.
    const spot = gemSpot(this.host.world, run.player, this.rows, random(run.seed ^ GEM_SALT ^ floorPart(at.floor)));
    if (spot) save.gemDrop.out = ofKind({ ...at, ...spot }, this.kindOf("timer", spot.x, spot.y));
  }

  /** Gem Chance: on a floor new to the run, its percent chance of a Gem of
   * its own, in a side room where there is one; missed, it is gone. */
  private layChanceGem() {
    const chance = this.host.treeBonus.gemChance, { run, save } = this.host, at = this.at;
    if (!chance || random(run.seed ^ CHANCE_SALT ^ floorPart(at.floor))() * 100 >= chance) return;
    const spot = sideSpot(this.host.world, run.player, this.rows, random(run.seed ^ CHANCE_SPOT_SALT ^ floorPart(at.floor)), this.gems);
    if (spot) save.gemDrop.extra.push(ofKind({ ...at, ...spot }, this.kindOf("chance", spot.x, spot.y)));
  }

  /** A Gem's kind as it appears at (x, y) from `from`: Golden Gem's chance
   * of golden, then Stellar Gem Chance's of stellar, each its own roll. */
  private kindOf(from: GemFrom, x: number, y: number): GemKind {
    const { run } = this.host, bonus = this.host.treeBonus, salt = FROM_SALT[from] ^ floorPart(this.floor) ^ tilePart(x, y);
    return rollGemKind(bonus.goldenGem, bonus.stellarGem, random(run.seed ^ GOLDEN_SALT ^ salt), random(run.seed ^ STELLAR_SALT ^ salt));
  }

  /** Whether the once-only roll `key` (in the mode's looted tiles) is
   * still to come, marking it rolled. */
  private firstRoll(key: string) {
    const looted = this.host.save[this.host.mode].lootedTiles;
    if (looted[key]) return false;
    looted[key] = true;
    return true;
  }

  /** Boss Gem Drop: a boss or Greater Boss killed at `at` (its loot key
   * `killKey`) may drop a Gem on its tile, once a boss. */
  bossDrop(enemy: Enemy, at: { x: number; y: number }, killKey: string) {
    const chance = this.host.treeBonus.bossGem, { run, save } = this.host;
    if (!chance || (enemy.strength !== "boss" && enemy.strength !== "greaterBoss") || !this.host.playing) return;
    // A loot key ends in one suffix at most: a spawned enemy's runs on into it.
    if (!this.firstRoll(`${killKey}${/:s\d+$/.test(killKey) ? "" : ":"}gem`)) return;
    if (random(run.seed ^ BOSS_SALT ^ floorPart(this.floor) ^ tilePart(at.x, at.y))() * 100 >= chance) return;
    if (this.gemAt(at.x, at.y)) return;
    // A fight won steps the hero onto it, taking it; an arrow's kill leaves it lying.
    save.gemDrop.extra.push(ofKind({ ...this.at, x: at.x, y: at.y }, this.kindOf("boss", at.x, at.y)));
  }

  /** Gems in Chests: the treasure chest at (x, y) may hold a Gem, once a
   * chest, taken as it opens. */
  chestDrop(x: number, y: number) {
    const chance = this.host.treeBonus.chestGem, { run, mode } = this.host;
    if (!chance || !this.host.playing || !this.firstRoll(`${MODES[mode].lootKey(run as never, x, y)}:gemchest`)) return;
    if (random(run.seed ^ CHEST_SALT ^ floorPart(this.floor) ^ tilePart(x, y))() * 100 >= chance) return;
    this.pay(this.kindOf("chest", x, y), x, y, 1);
  }

  /** Takes the Gem lying out at `gem`: the cooldown's starts the wait for
   * the next, a GEM card's is gone; either vanishes in a sparkle. */
  private take(gem: GemSpot, scale: number) {
    const drop = this.host.save.gemDrop;
    if (drop.out === gem) collectedGem(drop, this.host.clock(), relicFactor(this.host.save, "floorGems"));
    else drop.extra = drop.extra.filter((g) => g !== gem);
    return this.pay(gem.kind ?? "plain", gem.x, gem.y, scale);
  }

  /** Pays a Gem of `kind` found at (x, y), `scale` times its Gems (a
   * fraction kept for the next), and the GEM card held its XP. Returns
   * the whole Gems paid. */
  private pay(kind: GemKind, x: number, y: number, scale: number) {
    const save = this.host.save, value = gemValue({ kind: kind === "plain" ? undefined : kind });
    const gems = wholeGems(save.gemDrop, value * scale);
    save.gems += gems;
    earn(save, "gems", gems);
    save[this.host.mode].runFinds.gems += gems;
    this.host.eventDone("floatingGems", 1);
    // GEM gains its XP from each Gem collected, Gem XP raising it.
    if (this.host.held.includes("gem")) this.host.gainCardXp("gem", Math.round(value * treeFactor(this.host.treeBonus, "gemXp")));
    this.sparkle = { x, y, at: performance.now(), kind };
    this.host.gain(x, y, gemText(gems, kind), { gem: true, ...(kind === "plain" ? {} : { kind }) });
    return gems;
  }

  /** Collects the Gem at (x, y) on the board, tapped from anywhere: the
   * Gems it paid, or null when none lies there. */
  collectAt(x: number, y: number) {
    const gem = this.gemAt(x, y);
    if (!gem || !this.host.playing) return null;
    const gems = this.take(gem, 1);
    this.host.message = gemText(gems, gem.kind ?? "plain");
    return gems;
  }

  /** The ad button's terms now, by the GEM card in either hand. */
  get adTerms() {
    return adTerms(gemCardBonus(this.host.save));
  }

  /** The ad button's bank now (`adBank`), the Gems a claim pays, and
   * those each reward pays (`each`). */
  get adBank() {
    const terms = this.adTerms, bank = adBank(this.host.save.gemDrop, this.host.clock(), terms.cap, terms.cooldown);
    return { ...bank, gems: bank.banked * terms.gems, each: terms.gems };
  }

  /** Whether the ad's Gems can be claimed now: the bank holds a reward. */
  get adReady() {
    return this.adBank.banked > 0;
  }

  /** Claims the ad's Gems, every reward its bank holds, and the bank goes
   * on tallying toward the next. No ad plays yet: this is where watching
   * one will be hooked up, and with Ad-Disable owned (`adsOff`) none ever
   * will: the press just pays. */
  claimAd() {
    const terms = this.adTerms, save = this.host.save;
    const banked = claimAdBank(save.gemDrop, this.host.clock(), terms.cap, terms.cooldown);
    if (!banked) return false;
    const gems = banked * terms.gems;
    save.gems += gems;
    earn(save, "gems", gems);
    this.host.eventDone("adGems", 1);
    this.host.message = `+${gems} Gems`;
    return true;
  }

  /** The Gold ad's boost time left (ms). */
  get goldBoostLeft() {
    return goldBoostLeft(this.host.save, this.host.clock());
  }

  /** Whether the Gold ad can add time: its store isn't full, and there is
   * a Gold ad at all (none once Ad-Disable is owned). */
  get goldAdReady() {
    return !adsOff(this.host.save) && canClaimGoldBoost(this.host.save, this.host.clock());
  }

  /** Stores the Gold ad's time: Gold found ×1.5 for 20 more minutes, up
   * to two hours. No ad plays yet, as with the Gems'. */
  claimGoldAd() {
    const { save, mode, playing } = this.host;
    if (!this.goldAdReady || !claimGoldBoost(save, this.host.clock())) return false;
    if (playing) noteGoldBoost(save, save[mode], this.host.clock());
    this.host.message = `Gold ×${GOLD_BOOST_FACTOR} for ${GOLD_BOOST_MS / 60_000} more minutes`;
    return true;
  }
}

/** What a Gem found says as it rises: its Gems, and a golden or stellar one's kind. */
function gemText(gems: number, kind: GemKind) {
  const named = kind === "golden" ? "Golden " : kind === "stellar" ? "Stellar " : "";
  return `+${wholeChange(gems)} ${named}Gem${gems === 1 ? "" : "s"}`;
}
