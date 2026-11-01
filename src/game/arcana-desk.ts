import {
  arcanum, arcanumBoost, arcanumPrice, drawOptions, levelsOf, nextDraw, nextStep, OFFER_SIZE, ownedArcana, redrawOptions, rerollOpen, rerollPrice, RUN_TOGGLES, tickCooldowns, unownedArcana, valuesAt,
  type ArcanumId, type AttributeLevels,
} from "../arcana/arcana.ts";
import type { Beams } from "../arcana/overseer.ts";
import type { CritRule } from "../combat.ts";
import type { Mode } from "../entities.ts";
import type { FloorBloom } from "../environments.ts";
import { stream } from "../random.ts";
import type { TowerRun } from "../runs.ts";
import { CURRENCIES } from "../shop/currency.ts";
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
   * its cooldown is forgotten, so it starts over when it comes back on. */
  toggle(id: ArcanumId) {
    if (!this.togglesLeft || !this.held.some((h) => h.id === id)) return false;
    const r = this.runState;
    r.toggles++;
    if (this.isOn(id)) {
      r.off.push(id);
      delete r.timers[id];
    } else r.off = r.off.filter((o) => o !== id);
    return true;
  }
  /** What the arcanum's card reads: its damage with the hero's ATK and crits, or its own effect. */
  cardValue({ id, levels }: HeldArcanum) {
    const def = arcanum(id), values = valuesAt(id, levels);
    if (def.damage) return { damage: this.host.run.player.attack * arcanumBoost(def.damage(values), this.host.crit) };
    return { text: def.effect?.(values) ?? "" };
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
  /** A turn ends: Overseer's beams turn on, on or off, and each cooldown on
   * its way, restarting the moment it runs out. */
  turn() {
    const run = this.host.run;
    if (this.held.some((h) => h.id === "overseer")) run.beamTurns = (run.beamTurns ?? 0) + 1;
    const active = this.held.flatMap(({ id, levels }) => {
      const trigger = arcanum(id).trigger;
      return trigger.on === "cooldown" && this.isOn(id) ? [{ id, turns: trigger.turns(valuesAt(id, levels)) }] : [];
    });
    return tickCooldowns(active, this.runState.timers);
  }
}
