import {
  arcanum, arcanumBoost, arcanumPrice, chargeBolts, drawOptions, levelsOf, nextDraw, nextStep, OFFER_SIZE, ownedArcana, redrawOptions, rerollOpen, rerollPrice, RUN_TOGGLES, settleBolts, tickCooldowns, unownedArcana, valuesAt,
  type ArcanumId, type AttributeLevels,
} from "../arcana/arcana.ts";
import { clearLifespring, lifespringEffects, springAmplify, stepLifespring } from "../arcana/lifespring.ts";
import type { Beams } from "../arcana/overseer.ts";
import type { CritRule } from "../combat.ts";
import type { Enemy, Mode } from "../entities.ts";
import type { FloorBloom } from "../environments.ts";
import { boostLifespringHealth } from "../progression/hero-stats.ts";
import { stream } from "../random.ts";
import type { TowerRun } from "../runs.ts";
import { CURRENCIES } from "../shop/currency.ts";
import { snap } from "../exact.ts";
import type { DeskHost } from "./desk.ts";

/** What the Arcana desk needs from the game beyond any desk's: the mode, and
 * the hero's crits, which Arcanum Damage averages. */
export interface ArcanaHost extends DeskHost {
  readonly mode: Mode;
  readonly crit: CritRule | undefined;
}

/** An arcanum as a run holds it: bought, or lent by a Shrine boon (`lent`, at
 * its first levels, for this climb alone). */
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
  /** The arcana the run holds, bought and lent alike; none in the forest. */
  get held(): HeldArcanum[] {
    if (this.host.run.outside) return [];
    const lent = (this.host.run as TowerRun).shrine?.arcana ?? [];
    return [
      ...this.owned.map((id) => ({ id, levels: levelsOf(this.arcana, id), lent: false })),
      ...lent.filter((id) => !this.arcana.owned[id]).map((id) => ({ id, levels: [0, 0, 0] as AttributeLevels, lent: true })),
    ];
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
    } else r.off = r.off.filter((o) => o !== id);
    return true;
  }
  /** What the arcanum's card reads: its damage with the hero's ATK and crits, or its own effect. */
  cardValue({ id, levels }: HeldArcanum) {
    const def = arcanum(id), values = valuesAt(id, levels);
    if (def.damage) return { damage: this.host.run.player.attack * arcanumBoost(def.damage(values), this.host.crit) };
    return { text: def.effect?.(values) ?? "" };
  }
  /** An arcanum's cooldown as its card shows it: the turns left of how many,
   * full while it is off; none without a cooldown. */
  cooldown({ id, levels }: HeldArcanum) {
    const trigger = arcanum(id).trigger;
    if (trigger.on !== "cooldown") return undefined;
    const turns = trigger.turns(valuesAt(id, levels));
    const timer = id === "lifespring" ? this.host.run.lifespring?.timer : this.runState.timers[id];
    return { left: Math.min(timer ?? turns, turns), turns };
  }
  /** What Ricochet Shot gives this turn's arrows (`VolleyTurn.ricochet`), if it is held and on. */
  ricochet() {
    const held = this.held.find((h) => h.id === "ricochetShot" && this.isOn(h.id));
    if (!held) return undefined;
    const [multiplier, rebounds, chance] = valuesAt(held.id, held.levels);
    return { boost: arcanumBoost(multiplier, this.host.crit), rebounds, chance };
  }
  /** What Aurum Bloom gives the floors' environments, if it is held and on. */
  aurumBloom(): FloorBloom | undefined {
    const held = this.held.find((h) => h.id === "aurumBloom" && this.isOn(h.id));
    if (!held) return undefined;
    const [bonus, chance, stellar] = valuesAt(held.id, held.levels);
    return { bonus, chance, stellar };
  }
  /** Overseer's beams (arcana/overseer.ts), if it is held and on. */
  get beams(): Beams | undefined {
    const held = this.held.find((h) => h.id === "overseer" && this.isOn(h.id));
    if (!held) return undefined;
    const [bonus, width, count] = valuesAt(held.id, held.levels);
    return { bonus, width, count, turns: this.host.run.beamTurns ?? 0 };
  }
  /** Thunderbolt, if it is held and on: what its strikes multiply the hero's
   * ATK by, the bolts of one trigger, and its cooldown. */
  thunderbolt() {
    const held = this.held.find((h) => h.id === "thunderbolt" && this.isOn(h.id));
    if (!held) return undefined;
    const [multiplier, bolts, turns] = valuesAt(held.id, held.levels);
    return { boost: arcanumBoost(multiplier, this.host.crit), bolts, turns };
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
    const [hp, waves, turns] = valuesAt(held.id, held.levels);
    return { hp, waves, turns, effects: lifespringEffects(this.save) };
  }
  /** Lifespring's turn: its cooldown, and the Effect Wave or field it brings, if it is held and on. */
  lifespringTurn() {
    const rule = this.lifespringRule(), run = this.host.run;
    return rule && stepLifespring((run.lifespring ??= {}), { waves: rule.waves, turns: rule.turns, amount: snap(rule.hp * run.player.attack) });
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
      // Lifespring runs its own, in the run: `lifespringTurn`.
      return trigger.on === "cooldown" && id !== "lifespring" && this.isOn(id) ? [{ id, turns: trigger.turns(valuesAt(id, levels)) }] : [];
    });
    return tickCooldowns(active, this.runState.timers);
  }
}
