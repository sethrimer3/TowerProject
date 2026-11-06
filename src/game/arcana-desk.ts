import { relicAmount, relicCut, relicFactor } from "../economy/relic-effects.ts";
import {
  arcanum, arcanumBoost, arcanumPrice, augmentedValues, chargeBolts, drawOptions, FROST_AUGMENT, GOLDEN_AUGMENT, LENT_LEVELS, levelsOf, nextDraw, nextStep, OFFER_SIZE, ownedArcana, redrawOptions, rerollOpen, rerollPrice, RUN_TOGGLES, settleBolts, tickCooldowns, unownedArcana, valuesAt,
  type ArcanumId, type AttributeLevels,
} from "../arcana/arcana.ts";
import { clearLifespring, lifespringEffects, springAmplify, stepLifespring } from "../arcana/lifespring.ts";
import type { Beams } from "../arcana/overseer.ts";
import { clearFrost, frostEffects, stepFrost } from "../arcana/necrotic-frost.ts";
import { clearPhantasm, OUTER_GHOSTS, phantasmCooldown, phantasmEffects, stepPhantasm } from "../arcana/phantasm.ts";
import { clearDilation, dilationEffects, fieldSlowdown, stepDilation } from "../arcana/time-dilation.ts";
import { clearVoidwell } from "../arcana/voidwell.ts";
import type { CritRule } from "../combat.ts";
import type { Enemy, Mode } from "../entities.ts";
import type { FloorBloom } from "../environments.ts";
import { boostLifespringHealth } from "../progression/hero-stats.ts";
import { stream } from "../random.ts";
import type { TowerRun } from "../runs.ts";
import { CURRENCIES } from "../shop/currency.ts";
import { augmentOf } from "../shrines.ts";
import { snap } from "../exact.ts";
import type { DeskHost } from "./desk.ts";

/** What the Arcana desk needs from the game beyond any desk's: the mode, and
 * the hero's crits, which Arcanum Damage averages. */
export interface ArcanaHost extends DeskHost {
  readonly mode: Mode;
  readonly crit: CritRule | undefined;
}

/** An arcanum as a run holds it: bought, or lent by a Shrine boon (`lent`, at
 * `LENT_LEVELS`, for this climb alone). */
export type HeldArcanum = { id: ArcanumId; levels: AttributeLevels; lent: boolean };
/** What a purchase answers: done, or short of Arcanite, or refused. */
export type ArcanaAnswer = "done" | "short" | "refused";

/** Arcana's commands (arcana/arcana.ts): buying and upgrading them on the Gear
 * page, and which a run holds, toggles and sets off. */
export class ArcanaDesk {
  constructor(private readonly host: ArcanaHost) {}

  private get save() {
    return this.host.save;
  }
  private get arcana() {
    return this.save.arcana;
  }
  private pays(cost: number) {
    if (!this.affords(cost)) return false;
    if (!this.host.free) CURRENCIES.arcanite.spend(this.save, cost);
    return true;
  }
  /** Whether `cost` Arcanite can be paid now (always, with Dev free purchases). */
  affords(cost: number) {
    return this.host.free || this.save.arcanite >= cost;
  }

  // --- The Gear page ---

  /** The arcana bought. */
  get owned() {
    return ownedArcana(this.arcana);
  }
  /** What the next arcanum costs, or null with none left to buy. */
  get price() {
    return unownedArcana(this.arcana).length ? arcanumPrice(this.arcana) : null;
  }
  get rerollPrice() {
    return rerollPrice(this.arcana);
  }
  /** Whether Reroll is offered: only while it could change the choice. */
  get canReroll() {
    return rerollOpen(this.arcana);
  }
  /** The choice waiting, drawn the first time it is asked for and kept until one is bought or it is rerolled. */
  offer(): ArcanumId[] {
    const a = this.arcana;
    if (!a.offer.length) a.offer = drawOptions(unownedArcana(a), OFFER_SIZE, () => nextDraw(a, stream("arcana")));
    return a.offer;
  }
  /** Buys `id` from the choice; the next choice is drawn afresh. */
  buy(id: ArcanumId): ArcanaAnswer {
    if (!this.offer().includes(id)) return "refused";
    if (!this.pays(arcanumPrice(this.arcana))) return "short";
    this.arcana.owned[id] = [0, 0, 0];
    this.arcana.offer = [];
    return "done";
  }
  /** Pays for a new choice in place of the one waiting. */
  reroll(): ArcanaAnswer {
    const a = this.arcana;
    if (!this.canReroll) return "refused";
    const now = this.offer();
    if (!this.pays(this.rerollPrice)) return "short";
    a.offer = redrawOptions(unownedArcana(a), now, OFFER_SIZE, () => nextDraw(a, stream("arcana")));
    return "done";
  }
  /** Buys `id`'s `attribute` its next level. */
  upgrade(id: ArcanumId, attribute: number): ArcanaAnswer {
    const levels = this.arcana.owned[id], next = levels && nextStep(id, attribute, levels[attribute]!);
    if (!next) return "refused";
    if (!this.pays(next.cost)) return "short";
    levels[attribute]!++;
    return "done";
  }

  // --- The run ---

  private get runState() {
    return this.save[this.host.mode].runArcana;
  }
  /** The arcana the run holds, bought and lent alike; none in the forest. One
   * bought while lent keeps the better of each attribute's levels this climb. */
  get held(): HeldArcanum[] {
    if (this.host.run.outside) return [];
    const lent = (this.host.run as TowerRun).shrine?.arcana ?? [];
    return [
      ...this.owned.map((id) => {
        const levels = levelsOf(this.arcana, id);
        return { id, levels: lent.includes(id) ? levels.map((level, i) => Math.max(level, LENT_LEVELS[id][i]!)) as AttributeLevels : levels, lent: false };
      }),
      ...lent.filter((id) => !this.arcana.owned[id]).map((id) => ({ id, levels: LENT_LEVELS[id], lent: true })),
    ];
  }
  /** Whether the run has picked `id`'s augment boon. */
  augmented(id: ArcanumId) {
    return !!(this.host.run as TowerRun).shrine?.picked.includes(augmentOf(id));
  }
  /** `held`'s attribute values as the run has them: its levels', and its augment boon's. */
  valuesOf({ id, levels }: Pick<HeldArcanum, "id" | "levels">) {
    return this.augmented(id) ? augmentedValues(id, valuesAt(id, levels)) : valuesAt(id, levels);
  }
  isOn(id: ArcanumId) {
    return !this.runState.off.includes(id);
  }
  /** The toggles the run has left. */
  get togglesLeft() {
    return RUN_TOGGLES - this.runState.toggles;
  }
  /** Switches `id` on or off for this run; false with no toggles left. Off,
   * its cooldown is forgotten, so it starts over when it comes back on, and
   * any bolts it had left are gone. */
  toggle(id: ArcanumId) {
    if (!this.togglesLeft || !this.held.some((h) => h.id === id)) return false;
    const r = this.runState;
    r.toggles++;
    if (this.isOn(id)) {
      r.off.push(id);
      delete r.timers[id];
      if (id === "thunderbolt") delete r.bolts;
      if (id === "lifespring") clearLifespring(this.host.run.lifespring);
      if (id === "timeDilation") clearDilation(this.host.run.timeDilation);
      if (id === "phantasm") clearPhantasm(this.host.run.phantasm);
      if (id === "necroticFrost") clearFrost(this.host.run.necroticFrost);
      if (id === "voidwell") clearVoidwell(this.host.run.voidwell);
    } else r.off = r.off.filter((o) => o !== id);
    return true;
  }
  /** What an arcanum's damage `multiplier` multiplies the hero's ATK by:
   * raised by crits and by relics' Arcanum Damage. */
  private boost(multiplier: number) {
    return arcanumBoost(multiplier, this.host.crit) * relicFactor(this.save, "arcanumDamage");
  }
  /** What the arcanum's card reads: its damage with the hero's ATK and crits, or its own effect. */
  cardValue({ id, levels }: HeldArcanum) {
    const def = arcanum(id), values = this.valuesOf({ id, levels });
    if (def.damage) return { damage: this.host.run.player.attack * this.boost(def.damage(values)) * (id === "thunderbolt" ? relicFactor(this.save, "thunderbolt") : 1) };
    return { text: def.effect?.(values) ?? "" };
  }
  /** An arcanum's cooldown as its card shows it: the turns left of how many,
   * full while it is off; none without a cooldown. */
  cooldown({ id, levels }: HeldArcanum) {
    const trigger = arcanum(id).trigger;
    if (trigger.on !== "cooldown") return undefined;
    const values = valuesAt(id, levels), turns = id === "phantasm" ? phantasmCooldown(values[2], phantasmEffects(this.save)) : trigger.turns(values);
    const timer = id === "lifespring" ? this.host.run.lifespring?.timer : id === "timeDilation" ? this.host.run.timeDilation?.timer : id === "phantasm" ? this.host.run.phantasm?.timer : id === "necroticFrost" ? this.host.run.necroticFrost?.timer : id === "voidwell" ? this.host.run.voidwell?.timer : this.runState.timers[id];
    return { left: Math.min(timer ?? turns, turns), turns };
  }
  /** What Ricochet Shot gives this turn's arrows (`VolleyTurn.ricochet`), if it is held and on. */
  ricochet() {
    const held = this.held.find((h) => h.id === "ricochetShot" && this.isOn(h.id));
    if (!held) return undefined;
    const [multiplier, rebounds, chance] = this.valuesOf(held);
    return { boost: this.boost(multiplier), rebounds: rebounds + relicAmount(this.save, "ricochet"), chance };
  }
  /** What Aurum Bloom gives the floors' environments, if it is held and on. */
  aurumBloom(): FloorBloom | undefined {
    const held = this.held.find((h) => h.id === "aurumBloom" && this.isOn(h.id));
    if (!held) return undefined;
    const [base, chance, stellar] = this.valuesOf(held);
    // Relics raise what it makes above ×1.
    const bonus = snap(1 + (base - 1) * relicFactor(this.save, "aurumBloom"));
    return { bonus, chance, stellar, ...(this.augmented(held.id) ? { golden: GOLDEN_AUGMENT } : {}) };
  }
  /** Overseer's beams (arcana/overseer.ts), if it is held and on. */
  get beams(): Beams | undefined {
    const held = this.held.find((h) => h.id === "overseer" && this.isOn(h.id));
    if (!held) return undefined;
    const [bonus, width, count] = this.valuesOf(held);
    return { bonus, width, count, turns: this.host.run.beamTurns ?? 0 };
  }
  /** Thunderbolt, if it is held and on: what its strikes multiply the hero's
   * ATK by, the bolts of one trigger, and its cooldown. */
  thunderbolt() {
    const held = this.held.find((h) => h.id === "thunderbolt" && this.isOn(h.id));
    if (!held) return undefined;
    const [multiplier, bolts, turns] = this.valuesOf(held);
    return { boost: this.boost(multiplier) * relicFactor(this.save, "thunderbolt"), bolts, turns };
  }
  /** The bolts this turn strikes with (`fired`: what `turn` says ran out), if any. */
  chargeBolts(fired: readonly ArcanumId[]) {
    const rule = this.thunderbolt();
    if (!rule) return undefined;
    const { bolts, strike } = chargeBolts(this.runState, rule.bolts, fired.includes("thunderbolt"));
    return bolts ? { boost: rule.boost, bolts, strike } : undefined;
  }
  /** Keeps the bolts a strike left for the next turn. */
  settleBolts(left: number) {
    settleBolts(this.runState, left);
  }
  /** Lifespring, if it is held and on: its attributes and what Effect Waves give. */
  lifespringRule() {
    const held = this.held.find((h) => h.id === "lifespring" && this.isOn(h.id));
    if (!held) return undefined;
    const [hp, waves, turns] = this.valuesOf(held);
    return { hp, waves, turns, effects: lifespringEffects(this.save) };
  }
  /** Lifespring's turn: its cooldown, and the Effect Wave or field it brings, if it is held and on. */
  lifespringTurn() {
    const rule = this.lifespringRule(), run = this.host.run;
    return rule && stepLifespring((run.lifespring ??= {}), { waves: rule.waves, turns: rule.turns, amount: snap(rule.hp * run.player.attack * relicFactor(this.save, "lifespring")) });
  }
  /** The field as the board shows it, while it is on and its pool holds. */
  get lifespringField() {
    const s = this.host.run.lifespring;
    return s?.pool && this.lifespringRule() ? { tinted: !!s.tint } : undefined;
  }
  /** What the field multiplies its damage by against an enemy `waves` Effect Waves have hit. */
  lifespringRate(waves: number) {
    return springAmplify(lifespringEffects(this.save).amplify, waves);
  }
  /** Whether the run holds Lifespring, on or off, and what its card's information shows:
   * the pool, what Effect Waves give, and the factor Health Bonus has reached on max HP. */
  get lifespringStats() {
    if (!this.held.some((h) => h.id === "lifespring")) return undefined;
    const s = this.host.run.lifespring;
    return { pool: s?.pool ?? 0, effects: lifespringEffects(this.save), health: 1 + (s?.health ?? 0) / 100 };
  }
  /** Time Dilation, if it is held and on: its attributes, Slowdown with what raises it. */
  timeDilationRule() {
    const held = this.held.find((h) => h.id === "timeDilation" && this.isOn(h.id));
    if (!held) return undefined;
    const [base, slowdown, turns] = this.valuesOf(held), effects = dilationEffects(this.save);
    const duration = Math.round(base * relicFactor(this.save, "timeDilation"));
    return { duration, slow: fieldSlowdown(slowdown, effects), turns, effects };
  }
  /** Time Dilation's turn: the field's turns and its cooldown, if it is held and on. */
  timeDilationTurn() {
    const rule = this.timeDilationRule();
    if (rule) stepDilation((this.host.run.timeDilation ??= {}), rule);
  }
  /** Phantasm, if it is held and on: what a ghost's strike multiplies the hero's
   * ATK by, its Quantity and cooldown, its blast and turning with what raises them,
   * and the outer ring its augment boon adds. */
  phantasmRule() {
    const held = this.held.find((h) => h.id === "phantasm" && this.isOn(h.id));
    if (!held) return undefined;
    const [multiplier, quantity, cooldown] = this.valuesOf(held), effects = phantasmEffects(this.save);
    return { boost: this.boost(multiplier), quantity, turns: Math.max(1, Math.round(phantasmCooldown(cooldown, effects) * relicCut(this.save, "phantasm"))), blast: effects.blast, spin: effects.spin, ...(this.augmented(held.id) ? { outer: OUTER_GHOSTS } : {}) };
  }
  /** Phantasm's turn: the ring turning, its cooldown and the ghosts it brings back, if it is held and on. */
  phantasmTurn() {
    const rule = this.phantasmRule();
    if (rule) stepPhantasm((this.host.run.phantasm ??= {}), rule);
  }
  /** Necrotic Frost, if it is held and on: what a step of its decay multiplies the
   * hero's ATK by, its Duration and cooldown, and its field with what raises it. */
  frostRule() {
    const held = this.held.find((h) => h.id === "necroticFrost" && this.isOn(h.id));
    if (!held) return undefined;
    const [multiplier, base, turns] = this.valuesOf(held), effects = frostEffects(this.save);
    const duration = Math.round(base * relicFactor(this.save, "frostDuration"));
    return { boost: this.boost(multiplier), duration, turns, effects: this.augmented(held.id) ? { ...effects, radius: effects.radius * FROST_AUGMENT } : effects };
  }
  /** Necrotic Frost's turn: the fields' turns and its cooldown, if it is held and on. */
  frostTurn() {
    const rule = this.frostRule(), run = this.host.run;
    if (rule) stepFrost((run.necroticFrost ??= {}), rule, run.seed);
  }
  /** Voidwell, if it is held and on: its vortex's radius in tiles, its Duration and cooldown. */
  voidwellRule() {
    const held = this.held.find((h) => h.id === "voidwell" && this.isOn(h.id));
    if (!held) return undefined;
    const [base, duration, turns] = this.valuesOf(held);
    return { radius: snap(base * relicFactor(this.save, "voidwell")), duration, turns };
  }
  /** An enemy Lifespring touched (an Effect Wave or the field) fell, by whatever
   * means, while it is on: it pays Health Bonus, and what its Gold and Cells are
   * raised by is returned. */
  lifespringKill(enemy: Enemy) {
    const rule = enemy.sprung === undefined ? undefined : this.lifespringRule();
    if (!rule) return undefined;
    const { healthPerKill, healthLimit, gold, cells } = rule.effects;
    boostLifespringHealth(this.host.run, healthPerKill, healthLimit);
    return { gold, cells };
  }
  /** A turn ends: Overseer's beams turn on, on or off, and each cooldown on
   * its way, restarting the moment it runs out. */
  turn() {
    const run = this.host.run;
    if (this.held.some((h) => h.id === "overseer")) run.beamTurns = (run.beamTurns ?? 0) + 1;
    const active = this.held.flatMap(({ id, levels }) => {
      const trigger = arcanum(id).trigger;
      // Lifespring, Time Dilation, Phantasm, Necrotic Frost and Voidwell run their own, in the run: `lifespringTurn`, `timeDilationTurn`, `phantasmTurn`, `frostTurn`, `Game.voidwellTurn`.
      return trigger.on === "cooldown" && id !== "lifespring" && id !== "timeDilation" && id !== "phantasm" && id !== "necroticFrost" && id !== "voidwell" && this.isOn(id) ? [{ id, turns: trigger.turns(valuesAt(id, levels)) }] : [];
    });
    return tickCooldowns(active, this.runState.timers);
  }
}
