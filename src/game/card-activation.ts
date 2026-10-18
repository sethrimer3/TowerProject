import { SIPHONS, TRADER_YELLOW_KEYS, isSiphon, type CardId, type SiphonCard } from "../cards.ts";
import { BADGES, badgesOn, badgeValue, type BadgeId, type RunBadge } from "../badges.ts";
import { TRAINING, xpBase, type StatTrainingRow } from "../config.ts";
import type { Mode, KeyColor } from "../entities.ts";
import { snap } from "../exact.ts";
import { healUpTo } from "../combat.ts";
import { boostMaxHp, shiftHero } from "../hero-stats.ts";
import { treeBonus } from "../card-trees.ts";
import { rankShift } from "../loadout.ts";
import { noteKey } from "../run-notes.ts";
import type { HandRules } from "../hand-rules.ts";
import type { GainArt } from "../shown.ts";
import { keyCount, wholeChange } from "../whole.ts";
import type { RunPurse } from "./run-purse.ts";
import type { DeskHost } from "./desk.ts";
import type { Finds } from "./finds.ts";

/** What a card's activation reads from the game and reports back to it:
 * the hand, its rules and the purse the run is paid through, where its
 * coins rise (`finds`), and the gains, heals and XP the board records. */
export interface ActivationHost extends DeskHost {
  readonly mode: Mode;
  readonly hand: readonly CardId[];
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
  /** A turn of its own begins: undo can take it back. */
  rememberTurn(): void;
  /** The step being taken pays out, so it is a turn undo stops at. */
  eventful(): void;
}

/** A card of the hand activating: a card that acts in place doing what it
 * does (a siphon, Blue Trader, Key to HP), and every card's badges paying
 * what they give. The hand's turn (`Game.handTurn`) decides when. */
export class CardActivation {
  constructor(private readonly host: ActivationHost) {}

  /** Card `card` of the hand activates: it gains an XP toward its level,
   * and each of its badges pays what it gives, top slot first. Gold is paid once per target (`key`, gated by
   * lootedTiles like a kill's), since undo can't take it back; HP, Silver
   * and XP are the run's or in its undo snapshot. */
  activate(card: number, key: string) {
    const { hand, run } = this.host, id = hand[card];
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
    const host = this.host, { hand, run } = host;
    const id = hand[card], v = badgeValue(badge.id, badge.level, badge.pick), p = run.player;
    switch (badge.id) {
      case "hp": return this.boostMaxHp(v, badge.id);
      case "hpPercent": return this.badgeHeal(snap((p.maxHp * v) / 100), badge.id);
      case "silverTouch": return host.finds.coins(p, 0, host.purse.silver(v));
      case "goldTouch": return host.finds.coins(p, host.purse.badgeGold(`badge:${id}:${key}`, v), 0, false);
      case "goldback":
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
    else if (card === "blueTrader") {
      p.keys.yellow = snap(p.keys.yellow - TRADER_YELLOW_KEYS);
      p.keys.blue = snap(p.keys.blue + scale);
      noteKey(run, "blue", scale);
      host.gain(p.x, p.y, `−${TRADER_YELLOW_KEYS} yellow keys`, { tile: { kind: "key", color: "yellow" } });
      host.gain(p.x, p.y, `+${keyCount(scale)} blue key`, { tile: { kind: "key", color: "blue" } });
    } else if (card === "keyToHp") {
      const healed = snap(healUpTo(p.hp, snap(host.handRules.keyHeal() * scale), host.handRules.hpCeiling) - p.hp);
      p.keys.yellow = snap(p.keys.yellow - 1);
      p.hp = snap(p.hp + healed);
      host.gain(p.x, p.y, "−1 yellow key", { tile: { kind: "key", color: "yellow" } });
      host.recordHeal(healed);
    }
    (run.cardUses ??= {})[card] = host.handRules.cardUses(card) + 1;
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
    host.gain(p.x, p.y, `+${keyCount(scale)} ${color} key`, { tile: { kind: "key", color } });
  }
}
