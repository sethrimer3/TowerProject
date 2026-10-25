import { SIPHONS, SMELTS, TRADERS, isSiphon, isSmelt, isTrader, type CardId, type SiphonCard, type SmeltCard, type TraderCard } from "../cards/cards.ts";
import { BADGES, badgesOn, badgeValue, type BadgeId, type RunBadge } from "../cards/badges.ts";
import { TRAINING, type StatTrainingRow } from "../progression/training.ts";
import { xpBase } from "../progression/xp.ts";
import { FREE_GROUPS, type FreeGroup } from "../progression/free-training.ts";
import { MODES, type ModeProfile } from "../modes.ts";
import { drawAt } from "../random.ts";
import type { Mode, KeyColor } from "../entities.ts";
import { snap } from "../exact.ts";
import { healUpTo } from "../combat.ts";
import { boostMaxHp, shiftHero } from "../progression/hero-stats.ts";
import { smeltStat, tradeStat, treeBonus } from "../cards/trees.ts";
import { rankShift } from "../progression/loadout.ts";
import { noteKey } from "../run-notes.ts";
import type { HandRules } from "../cards/hand-rules.ts";
import type { GainArt } from "../shown.ts";
import { keyCount, wholeChange } from "../whole.ts";
import { KEY_NAMES, keyWord } from "../doors.ts";
import type { RunPurse } from "./run-purse.ts";
import type { DeskHost } from "./desk.ts";
import type { Finds } from "./finds.ts";

/** What a card's activation reads from the game and reports back to it:
 * the hand, its rules and the purse the run is paid through, where its
 * coins rise (`finds`), and the gains, heals and XP the board records. */
export interface ActivationHost extends DeskHost {
  readonly mode: Mode;
  readonly hand: readonly CardId[];
  /** The hand's cards, then the Manual hand's (`Game.held`): a card's slot
   * in it is what activates. */
  readonly held: readonly CardId[];
  readonly handRules: HandRules;
  /** Inside a run the hero is still standing in. */
  readonly playing: boolean;
  readonly purse: RunPurse;
  /** Where Silver and Gold Touch raise the coins they pay. */
  readonly finds: Pick<Finds, "coins">;
  gain(x: number, y: number, text: string, art?: GainArt | null, drop?: undefined, kind?: "combo" | "xp"): void;
  addXp(xp: number): void;
  recordHeal(n: number): void;
  /** Card `id` gains `xp` toward its levels. */
  gainCardXp(id: CardId, xp: number): void;
  /** Free levels for the run, each of a group, its pick (in [0, 1))
   * choosing its row (`Game.trainFree`). */
  trainFree(levels: readonly (readonly [FreeGroup, number])[]): void;
  /** A turn of its own begins: undo can take it back. */
  rememberTurn(): void;
  /** The step being taken pays out, so it is a turn undo stops at. */
  eventful(): void;
}

/** Salt the run seed for a trader's rolls on each trade: its Forge, its
 * Smelter, its free Utility level and the row that level goes to. */
const FORGE_SALT = 0xf0e6e, SMELTER_SALT = 0x5e17e, TRADE_FREE_SALT = 0x7f4ee, TRADE_PICK_SALT = 0x7f1c4;
/** Salt the run seed for a smelt's rolls on each smelt: by its colour, then
 * for Key Smelter, its Master Smelter, and each group's free level (a
 * salt and the next ones up) and the row that level goes to. */
const SMELT_SALT: Record<KeyColor, number> = { yellow: 0x5e170, blue: 0x5eb10, red: 0x5e4ed };
const KEY_SMELTER_SALT = 0x2c5e1, MASTER_SMELTER_SALT = 0x3a57e, SMELT_FREE_SALT = 0x5f4e0, SMELT_PICK_SALT = 0x5f1c0;
/** The groups a smelt's Smelt Free gives a free level of: Defense for Smelt
 * GK, Offense for Smelt BK, and each for Smelt RK, each rolled apart. */
const SMELT_FREE: Record<SmeltCard, readonly FreeGroup[]> = { keyToHp: ["defense"], smeltBlue: ["offense"], smeltRed: FREE_GROUPS };

/** A card of the hand activating: a card that acts in place doing what it
 * does (a siphon, a trader, a smelt), and every card's badges paying
 * what they give. The hand's turn (`Game.handTurn`) decides when. */
export class CardActivation {
  constructor(private readonly host: ActivationHost) {}

  /** Card `card` of the hand (or past it, of the Manual hand) activates: it gains an XP toward its level,
   * and each of its badges pays what it gives, top slot first. Gold is paid once per target (`key`, gated by
   * lootedTiles like a kill's), since undo can't take it back; HP, Silver
   * and XP are the run's or in its undo snapshot. */
  activate(card: number, key: string) {
    const { held, run } = this.host, id = held[card];
    if (!id || !this.host.playing) return;
    this.host.gainCardXp(id, 1);
    // HEAL's tree: each potion it reaches boosts max HP for the run, as the
    // Max HP badge does.
    const boost = id === "heal" ? treeBonus(run.cardTrees).potionMaxHp : 0;
    const badges = badgesOn(run.badges, id);
    if (!badges.length && !boost) return;
    // Paying out makes the step it ends a turn undo stops at.
    this.host.eventful();
    if (boost) this.treeMaxHp(boost);
    for (const badge of badges) this.payBadge(card, key, badge);
  }
  /** HEAL's tree's boost: the run's max HP multiplier grows by `percent`. */
  private treeMaxHp(percent: number) {
    const run = this.host.run, p = run.player;
    boostMaxHp(run, percent);
    this.host.gain(p.x, p.y, `+${percent}% max HP`, { heart: true, raised: true });
  }
  /** One of hand card `card`'s badges pays what it gives on activation. */
  private payBadge(card: number, key: string, badge: RunBadge) {
    const host = this.host, { hand, held, run } = host;
    const id = held[card], v = badgeValue(badge.id, badge.level, badge.pick), p = run.player;
    switch (badge.id) {
      case "hp": return this.boostMaxHp(v, badge.id);
      case "hpPercent": return this.badgeHeal(snap((p.maxHp * v) / 100), badge.id);
      case "silverTouch": return host.finds.coins(p, 0, host.purse.silver(v));
      case "goldTouch": return host.finds.coins(p, host.purse.badgeGold(`badge:${id}:${key}`, v), 0, false);
      case "goldback":
        // The hand's last card only: never one of the Manual hand's.
        if (card !== hand.length - 1) return;
        // The combo is the run's, so undo takes an activation back; the
        // next Gold found spends it (RunPurse).
        run.goldCombo = (run.goldCombo ?? 0) + v;
        // Drawn as "×2" and the Gold coin.
        return host.gain(p.x, p.y, `×${run.goldCombo} Gold`, { coin: "gold" }, undefined, "combo");
      case "xp": {
        const xp = Math.round((v * xpBase(host.handRules.floor)) / xpBase(0));
        host.addXp(xp);
        return host.gain(p.x, p.y, `+${xp} XP`, null, undefined, "xp");
      }
    }
  }
  /** Max HP's badge: the run's max HP multiplier grows by `percent`
   * (`boostMaxHp`), and HP with it. */
  private boostMaxHp(percent: number, id: BadgeId) {
    const run = this.host.run, p = run.player;
    boostMaxHp(run, percent);
    this.host.gain(p.x, p.y, `+${percent}% max HP`, { heart: true, raised: true });
    this.host.message = `${BADGES[id].name} · +${percent}% max HP (+${run.maxHpBoost}% this run)`;
  }
  /** Heals up to `n` HP for badge `id`, as a potion's heal shows. */
  private badgeHeal(n: number, id: BadgeId) {
    const p = this.host.run.player, healed = snap(healUpTo(p.hp, n, this.host.handRules.hpCeiling) - p.hp);
    if (healed <= 0) return;
    p.hp = snap(p.hp + healed);
    this.host.recordHeal(healed);
    this.host.message = `${BADGES[id].name} · +${wholeChange(healed)} HP`;
  }
  /** A card that acts in place takes its turn, with no step: a turn of its
   * own, so undo takes it back. Effective and Dampen scale what it gives
   * (`scale`), never what it costs. */
  actInPlace(card: CardId, scale = 1) {
    const host = this.host, run = host.run, p = run.player;
    host.rememberTurn();
    if (isSiphon(card)) this.siphon(card, scale);
    else if (isTrader(card)) this.trade(card, scale);
    else if (isSmelt(card)) this.smelt(card, scale);
    (run.cardUses ??= {})[card] = host.handRules.cardUses(card) + 1;
  }
  /** A smelt's turn: its key (`smeltCost`) traded for its heal, and its
   * tree's Gold and Silver; the Gold twice over under Key Smelter's chance
   * and three times under its Master Smelter's (six when both hit), and
   * under its Smelt Free chance a free level of each group it gives. Each
   * rolls a fixed number per run seed, colour and use, so undo can't roll a
   * smelt again, and its Gold is paid once per use (`smeltGold`). */
  private smelt(card: SmeltCard, scale: number) {
    const host = this.host, rules = host.handRules, run = host.run, p = run.player, tree = treeBonus(run.cardTrees);
    const color = SMELTS[card].color, keys = rules.smeltCost(card), use = rules.cardUses(card);
    const roll = (salt: number) => drawAt((run.seed ^ SMELT_SALT[color] ^ salt) >>> 0, use);
    const rolls = (salt: number, chance: number) => !!chance && roll(salt) * 100 < chance;
    const healed = snap(healUpTo(p.hp, snap(rules.smeltHeal(card) * scale), rules.hpCeiling) - p.hp);
    p.keys[color] = snap(p.keys[color] - keys);
    p.hp = snap(p.hp + healed);
    host.gain(p.x, p.y, `−${keyCount(keys)} ${keyWord(color)}`, { tile: { kind: "key", color } });
    host.recordHeal(healed);
    const doubled = rolls(KEY_SMELTER_SALT, tree.keySmelter), tripled = rolls(MASTER_SMELTER_SALT, smeltStat(tree, color, "SmeltMaster"));
    const profile: ModeProfile = MODES[host.mode], key = `smelt:${profile.lootKey(run, p.x, p.y)}:${card}${use}`;
    const gold = host.purse.smeltGold(key, snap(smeltStat(tree, color, "SmeltGold") * scale), (doubled ? 2 : 1) * (tripled ? 3 : 1));
    const base = snap(smeltStat(tree, color, "SmeltSilver") * scale), silver = base ? host.purse.silver(base) : 0;
    host.finds.coins(p, gold, silver, false);
    const hits = [doubled && "Key Smelter", tripled && `Master ${KEY_NAMES[color]} Smelter`].filter(Boolean);
    if (hits.length && gold) host.message = `${hits.join(" & ")} · +${wholeChange(gold)} Gold`;
    const chance = smeltStat(tree, color, "SmeltFree");
    const free = SMELT_FREE[card].flatMap((group, i) => (rolls(SMELT_FREE_SALT + i, chance) ? [[group, roll(SMELT_PICK_SALT + i)] as const] : []));
    if (free.length) host.trainFree(free);
  }
  /** A trader's turn: its keys (`tradeCost`) traded for a key of the next
   * colour, a second under its tree's Forge chance and, when the Forge
   * gives one, a third under its Smelter's; and under its Free Utility
   * chance, a free Utility level. Each rolls a fixed number per run seed
   * and use, so undo can't roll a trade again. */
  private trade(card: TraderCard, scale: number) {
    const host = this.host, run = host.run, p = run.player, tree = treeBonus(run.cardTrees);
    const { from, to } = TRADERS[card], keys = host.handRules.tradeCost(card), use = host.handRules.cardUses(card);
    const roll = (salt: number) => drawAt((run.seed ^ salt) >>> 0, use);
    const rolls = (salt: number, chance: number) => !!chance && roll(salt) * 100 < chance;
    const forged = rolls(FORGE_SALT, tradeStat(tree, to, "Forge")), smelted = forged && rolls(SMELTER_SALT, tradeStat(tree, to, "Smelter"));
    const got = snap(scale * (1 + +forged + +smelted));
    p.keys[from] = snap(p.keys[from] - keys);
    p.keys[to] = snap(p.keys[to] + got);
    noteKey(run, to, got);
    host.gain(p.x, p.y, `−${keyCount(keys)} ${keyWord(from)}s`, { tile: { kind: "key", color: from } });
    const gained = `+${keyCount(got)} ${keyWord(to)}${got > 1 ? "s" : ""}`;
    host.gain(p.x, p.y, gained, { tile: { kind: "key", color: to } });
    if (forged) host.message = `${smelted ? `Master ${KEY_NAMES[to]} Smelter` : `${KEY_NAMES[to]} Forge`} · ${gained}`;
    if (rolls(TRADE_FREE_SALT, tradeStat(tree, to, "TradeFreeUtility"))) host.trainFree([["utility", roll(TRADE_PICK_SALT)]]);
  }
  /** A siphon's turn: the run's top levels of its training row (its
   * `siphonCost`) traded for a key of its colour. The hero and the run's
   * loadout lose what those levels add (`rankShift`), for the rest of the
   * run only (max HP: HP falls only as far as the new max). */
  private siphon(card: SiphonCard, scale: number) {
    const host = this.host, rules = host.handRules;
    const { row: id, color } = SIPHONS[card], level = rules.siphonLevel(card), levels = rules.siphonCost(card);
    const run = host.run, p = run.player;
    const row = TRAINING.find((t) => t.id === id) as StatTrainingRow;
    const stat = row.stat as "maxHp" | "attack" | "defense";
    const loss = -(shiftHero(run, { [stat]: rankShift(host.save, host.mode, row, level, level - levels) }, rules.overheal)[stat] ?? 0);
    p.keys[color] = snap(p.keys[color] + scale);
    noteKey(run, color, scale);
    const lost = stat === "maxHp" ? `−${wholeChange(loss)} max HP` : `−${wholeChange(loss)} ${stat === "attack" ? "ATK" : "DEF"}`;
    host.gain(p.x, p.y, lost, stat === "maxHp" ? { heart: true } : { tile: { kind: stat } });
    host.gain(p.x, p.y, `+${keyCount(scale)} ${keyWord(color)}`, { tile: { kind: "key", color } });
  }
}
