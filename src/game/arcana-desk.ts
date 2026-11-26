import { relicAmount, relicCut, relicFactor } from "../economy/relic-effects.ts";
import {
  arcanum, arcanumBoost, arcanumPrice, augmentedValues, chargeBolts, chargeZap, drawOptions, FROST_AUGMENT, GOLDEN_AUGMENT, investedIn, LENT_LEVELS, levelsOf, nextDraw, nextStep, OFFER_SIZE, ownedArcana, redrawOptions, rerollOpen, rerollPrice, RUN_TOGGLES, settleBolts, settleZap, tickCooldowns, unownedArcana, valuesAt,
  type ArcanumId, type AttributeLevels, type AttributeValues,
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
import { arcanaWithGear, wornEffects } from "../equipment/effects.ts";
import { powerOf } from "../equipment/powers.ts";
import { boostLifespringHealth } from "../progression/hero-stats.ts";
import { researched, RESEARCH_TARGETS } from "../progression/archives.ts";
import { stream } from "../random.ts";
import type { TowerRun } from "../runs.ts";
import { CURRENCIES } from "../shop/currency.ts";
import { augmentOf } from "../shrines.ts";
import { snap } from "../exact.ts";
import { ARCANUM_RESPEC_GEMS } from "../economy/gems.ts";
import { eventAt } from "../events/catalog.ts";
import { estimatedServerTime } from "../shop/clock.ts";
import { affordsGems, type DeskHost } from "./desk.ts";
import { seesAll } from "../access.ts";

/** What the Arcana desk needs from the game beyond any desk's: the mode, and
 * the hero's crits, which Arcanum Damage averages. */
export interface ArcanaHost extends DeskHost {
  readonly mode: Mode;
  readonly crit: CritRule | undefined;
  /** Where Challenger's Defiance turns Overseer's first beam, in hundredths of a degree, while it does. */
  readonly bossAim?: number;
}

/** An arcanum as a run holds it: bought, or lent by a Shrine boon (`lent`, at
 * `LENT_LEVELS`, for this climb alone). */
export type HeldArcanum = { id: ArcanumId; levels: AttributeLevels; lent: boolean };
/** What a purchase answers: done, or short of Arcanite, or refused. */
export type ArcanaAnswer = "done" | "short" | "refused";
/** Why a respec was refused (`ArcanaDesk.respecRefusal`). */
export type RespecRefusal = "locked" | "inside" | "used" | "none" | "short";

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

  /** Whether Respec shows: once the Breakthrough skill Arcana Respec is owned, or with Access to Everything. */
  get respecUnlocked() {
    return !!this.save.upgrades.arcanaRespec || seesAll(this.save);
  }
  /** The running event's number, on the Shop's estimated server time. */
  private get event() {
    return eventAt(estimatedServerTime(this.save.shop.clock, this.host.clock()));
  }
  /** Whether this event's respec is spent. */
  get respecUsed() {
    return this.arcana.respecEvent === this.event;
  }
  /** The Arcanite a respec of `id` returns. */
  invested(id: ArcanumId) {
    const levels = this.arcana.owned[id];
    return levels ? investedIn(id, levels) : 0;
  }
  /** Why `id` can't be respecced now, or null when it can: `locked` before
   * Arcana Respec, `inside` a run (a run's arcana are only ever raised),
   * `used` once this event's respec is spent, `none` with nothing invested,
   * `short` of `ARCANUM_RESPEC_GEMS`. */
  respecRefusal(id: ArcanumId): RespecRefusal | null {
    if (!this.respecUnlocked) return "locked";
    if (!this.host.run.outside) return "inside";
    if (this.respecUsed) return "used";
    if (!this.invested(id)) return "none";
    return affordsGems(this.host, ARCANUM_RESPEC_GEMS) ? null : "short";
  }
  /** Respecs `id` for `ARCANUM_RESPEC_GEMS` (none with Dev free purchases):
   * its attributes go back to their first levels and every Arcanite spent
   * on them comes back. The arcanum stays owned, and the event's respec is spent. */
  respec(id: ArcanumId): RespecRefusal | null {
    const refusal = this.respecRefusal(id);
    if (refusal) return refusal;
    if (!this.host.free) this.save.gems -= ARCANUM_RESPEC_GEMS;
    this.save.arcanite += this.invested(id);
    this.arcana.owned[id] = [0, 0, 0];
    this.arcana.respecEvent = this.event;
    return null;
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
  /** `held`'s attribute values as the run has them: its levels', its augment
   * boon's, its research's and the worn Helmet substats'. */
  valuesOf({ id, levels }: Pick<HeldArcanum, "id" | "levels">) {
    return this.withGear(id, this.withResearch(id, this.augmented(id) ? augmentedValues(id, valuesAt(id, levels)) : valuesAt(id, levels)));
  }
  /** `values` raised by the Archives: Aurum Bloom Bonus adds to Aurum Bloom's
   * Bonus (in hundredths) and Aurum Bloom Chance to its Golden Chance. */
  private withResearch(id: ArcanumId, values: AttributeValues): AttributeValues {
    if (id !== "aurumBloom") return values;
    const [bonus, chance, stellar] = values, archives = this.save.archives;
    return [snap(bonus + researched(archives, "aurumBloomBonus") / 100), snap(chance + researched(archives, "aurumBloomChance")), stellar];
  }
  /** `values` raised by the Helmet substats the mode's hero wears. */
  private withGear<T extends readonly number[]>(id: ArcanumId, values: T): T {
    return arcanaWithGear(wornEffects(this.save, this.host.mode), id, values);
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
      if (id === "overseer") delete r.zap;
      if (id === "lifespring") clearLifespring(this.host.run.lifespring);
      if (id === "timeDilation") clearDilation(this.host.run.timeDilation);
      if (id === "phantasm") clearPhantasm(this.host.run.phantasm);
      if (id === "necroticFrost") clearFrost(this.host.run.necroticFrost);
      if (id === "voidwell") clearVoidwell(this.host.run.voidwell);
    } else r.off = r.off.filter((o) => o !== id);
    return true;
  }
  /** What an arcanum's damage `multiplier` multiplies the hero's ATK by:
   * raised by crits, by the worn Helmet's Arcanum Damage and by relics'. */
  private boost(multiplier: number) {
    const worn = wornEffects(this.save, this.host.mode).arcanumDamage;
    return arcanumBoost(multiplier, this.host.crit, (100 + worn) / 100) * relicFactor(this.save, "arcanumDamage");
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
    const values = this.withGear(id, valuesAt(id, levels)), turns = id === "phantasm" ? phantasmCooldown(values[2], this.phantasmEffects()) : trigger.turns(values);
    const timer = id === "lifespring" ? this.host.run.lifespring?.timer : id === "timeDilation" ? this.host.run.timeDilation?.timer : id === "phantasm" ? this.host.run.phantasm?.timer : id === "necroticFrost" ? this.host.run.necroticFrost?.timer : id === "voidwell" ? this.host.run.voidwell?.timer : this.runState.timers[id];
    return { left: Math.min(timer ?? turns, turns), turns };
  }
  /** What Ricochet Shot gives this turn's arrows (`VolleyTurn.ricochet`), if it is held and on. */
  ricochet() {
    const held = this.held.find((h) => h.id === "ricochetShot" && this.isOn(h.id));
    if (!held) return undefined;
    const [multiplier, rebounds, chance] = this.valuesOf(held), self = powerOf(wornEffects(this.save, this.host.mode), "psionicTempest", "chance");
    const shock = this.shock;
    return { boost: this.boost(multiplier), rebounds: rebounds + relicAmount(this.save, "ricochet"), chance, ...(self ? { self } : {}), ...(shock ? { shock: shock.chance } : {}) };
  }
  /** Ricochet Shock, once researched (read as used, so a level done mid-run
   * counts at once): the chance a Ricochet Shot strike shocks its enemy, in
   * hundredths of a percent (Shock Chance), and what the hero's ATK is then
   * multiplied by on it (Shock Multiplier). A shocked enemy stays shocked
   * whether or not Ricochet Shot is still held or on. */
  get shock(): { chance: number; factor: number } | undefined {
    const archives = this.save.archives;
    if (!researched(archives, "ricochetShock")) return undefined;
    return { chance: researched(archives, "shockChance"), factor: researched(archives, "shockMultiplier") / 100 };
  }
  /** What Aurum Bloom gives the floors' environments, if it is held and on. */
  aurumBloom(): FloorBloom | undefined {
    const held = this.held.find((h) => h.id === "aurumBloom" && this.isOn(h.id));
    if (!held) return undefined;
    const [base, chance, stellar] = this.valuesOf(held);
    // Relics raise the whole factor it makes.
    const bonus = snap(base * relicFactor(this.save, "aurumBloom"));
    return { bonus, chance, stellar, ...(this.augmented(held.id) ? { golden: GOLDEN_AUGMENT } : {}) };
  }
  /** Overseer's beams (arcana/overseer.ts), if it is held and on. */
  get beams(): Beams | undefined {
    const held = this.held.find((h) => h.id === "overseer" && this.isOn(h.id));
    if (!held) return undefined;
    const [bonus, width, count] = this.valuesOf(held), aim = this.host.bossAim;
    return { bonus, width, count, turns: this.host.run.beamTurns ?? 0, ...(aim === undefined ? {} : { aim }) };
  }
  /** What Lich King's Crown's ghosts multiply the hero's ATK by: Phantasm's
   * ATK Mult at its first level, raised as an arcanum's damage is, owned or not. */
  ghostBoost() {
    return this.boost(valuesAt("phantasm", [0, 0, 0])[0]!);
  }
  /** Thunderbolt, if it is held and on: what its strikes multiply the hero's
   * ATK by, the bolts of one trigger, its cooldown, and what research adds,
   * read as it strikes: Thunderbolt Amplifier's factor a hit (`amplify`, in
   * tenths) and Thunderbolt Expansion's radius (`radius`, tenths of a tile). */
  thunderbolt() {
    const held = this.held.find((h) => h.id === "thunderbolt" && this.isOn(h.id));
    if (!held) return undefined;
    const [multiplier, bolts, turns] = this.valuesOf(held), archives = this.save.archives;
    const amplify = researched(archives, "thunderboltAmplify"), radius = researched(archives, "thunderboltExpansion");
    return { boost: this.boost(multiplier) * relicFactor(this.save, "thunderbolt"), bolts, turns, ...(amplify ? { amplify } : {}), ...(radius ? { radius } : {}) };
  }
  /** The bolts this turn strikes with (`fired`: what `turn` says ran out), if any. */
  chargeBolts(fired: readonly ArcanumId[]) {
    const rule = this.thunderbolt();
    if (!rule) return undefined;
    const { bolts, strike } = chargeBolts(this.runState, rule.bolts, fired.includes("thunderbolt"));
    return bolts ? { ...rule, bolts, strike } : undefined;
  }
  /** Keeps the bolts a strike left for the next turn. */
  settleBolts(left: number) {
    settleBolts(this.runState, left);
  }
  /** Overseer Zap, once researched while Overseer is held and on: the turns
   * between strikes, and what a strike multiplies the hero's ATK by before the
   * beam's Bonus: Thunderbolt's, as the run holds it (on or off), or its first
   * level's without it. */
  zapRule() {
    if (!this.beams) return undefined;
    const turns = researched(this.save.archives, "overseerZapTurns");
    if (turns >= RESEARCH_TARGETS.overseerZapTurns.base) return undefined;
    const bolt = this.held.find((h) => h.id === "thunderbolt");
    const [multiplier] = this.valuesOf({ id: "thunderbolt", levels: bolt?.levels ?? [0, 0, 0] });
    return { turns: Math.max(1, turns), boost: this.boost(multiplier) * relicFactor(this.save, "thunderbolt") };
  }
  /** Overseer Zap's cooldown one turn on: the strike it calls for once ready (`strike` fixes its target), if any. */
  chargeZap() {
    const rule = this.zapRule();
    return rule && chargeZap(this.runState, rule.turns) ? { boost: rule.boost, strike: (this.runState.zaps ?? 0) + 1 } : undefined;
  }
  /** After a turn Overseer Zap was ready: whether its strike landed. */
  settleZap(struck: boolean) {
    settleZap(this.runState, struck);
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
  /** Time Dilation, if it is held and on: its attributes, Slowdown with what raises it,
   * Time Dilation Duration's turns added before relics multiply its Duration, Time
   * Dilation Range's reach, and once Damage Reduction is researched the percent it
   * cuts what strikes the hero by (`guard`), all read from the Archives as it acts. */
  timeDilationRule() {
    const held = this.held.find((h) => h.id === "timeDilation" && this.isOn(h.id));
    if (!held) return undefined;
    const archives = this.save.archives, [base, slowdown, turns] = this.valuesOf(held), effects = dilationEffects({ range: researched(archives, "dilationRange") });
    const duration = Math.round((base + researched(archives, "dilationDuration")) * relicFactor(this.save, "timeDilation"));
    const guard = researched(archives, "dilationGuard") ? { guard: researched(archives, "dilationGuardPercent") / 10 } : {};
    return { duration, slow: fieldSlowdown(slowdown, effects), turns, effects, ...guard };
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
    const [multiplier, quantity, cooldown] = this.valuesOf(held), effects = this.phantasmEffects();
    return { boost: this.boost(multiplier), quantity, turns: Math.max(1, Math.round(phantasmCooldown(cooldown, effects) * relicCut(this.save, "phantasm"))), blast: effects.blast, spin: effects.spin, ...(effects.drain ? { drain: effects.drain } : {}), ...(effects.stun ? { stun: effects.stun } : {}), ...(this.augmented(held.id) ? { outer: OUTER_GHOSTS } : {}) };
  }
  /** What Phantasm's research gives it, read as it strikes, never copied into the run. */
  private phantasmEffects() {
    const archives = this.save.archives;
    return phantasmEffects({ drain: researched(archives, "phantasmBlast"), spin: researched(archives, "phantasmSpin"), stun: researched(archives, "phantasmStun") });
  }
  /** Phantasm's turn: the ring turning, its cooldown and the ghosts it brings back, if it is held and on. */
  phantasmTurn() {
    const rule = this.phantasmRule();
    if (rule) stepPhantasm((this.host.run.phantasm ??= {}), rule);
  }
  /** Necrotic Frost, if it is held and on: what a step of its decay multiplies the
   * hero's ATK by, its Duration and cooldown, its field with what raises it (Frost
   * Radius, then its augment boon), and Necrotic Freeze (`freeze`) once researched, all
   * read from the Archives as it strikes, never copied into the run. */
  frostRule() {
    const held = this.held.find((h) => h.id === "necroticFrost" && this.isOn(h.id));
    if (!held) return undefined;
    const archives = this.save.archives, [multiplier, base, turns] = this.valuesOf(held), effects = frostEffects({ radius: researched(archives, "frostRadius") });
    const duration = Math.round(base * relicFactor(this.save, "frostDuration"));
    const freeze = researched(archives, "necroFreeze") ? { freeze: { chance: researched(archives, "necroFreezeChance"), turns: researched(archives, "necroFreezeTurns") } } : {};
    return { boost: this.boost(multiplier), duration, turns, effects: this.augmented(held.id) ? { ...effects, radius: effects.radius * FROST_AUGMENT } : effects, ...freeze };
  }
  /** Necrotic Frost's turn: the fields' turns and its cooldown, if it is held and on. */
  frostTurn() {
    const rule = this.frostRule(), run = this.host.run;
    if (rule) stepFrost((run.necroticFrost ??= {}), rule, run.seed);
  }
  /** Voidwell, if it is held and on: its vortex's radius in tiles, its Duration and
   * cooldown, whether Extra Voidwell opens a twin with each (`twin`), and what Voidwell
   * Damage (`damage`, hundredths of a percent) and Gold Bonus (`gold`, tenths) have reached. */
  voidwellRule() {
    const held = this.held.find((h) => h.id === "voidwell" && this.isOn(h.id));
    if (!held) return undefined;
    const [base, duration, turns] = this.valuesOf(held);
    return { radius: snap(base * relicFactor(this.save, "voidwell")), duration, turns, twin: researched(this.save.archives, "extraVoidwell") > 0,
      damage: researched(this.save.archives, "voidwellDamage"), gold: researched(this.save.archives, "voidwellGold") };
  }
  /** An enemy Lifespring touched (an Effect Wave or the field) fell, by whatever
   * means, while it is on: it pays Health Bonus, and what its Gold and Lore are
   * raised by is returned. */
  lifespringKill(enemy: Enemy) {
    const rule = enemy.sprung === undefined ? undefined : this.lifespringRule();
    if (!rule) return undefined;
    const { healthPerKill, healthLimit, gold, cells } = rule.effects;
    boostLifespringHealth(this.host.run, healthPerKill, healthLimit);
    return { gold, cells };
  }
  /** Chrono Strider's potion: every cooldown of the arcana held and on, but
   * Necrotic Frost's, `turns` nearer running out, down to its last turn. */
  cutCooldowns(turns: number) {
    const run = this.host.run, cut = (timer: number | undefined, full: number) => Math.max(1, Math.min(timer ?? full, full) - turns);
    for (const held of this.held) {
      const shown = this.cooldown(held);
      if (!shown || held.id === "necroticFrost" || !this.isOn(held.id)) continue;
      const left = cut(shown.left, shown.turns);
      if (held.id === "lifespring") { if (run.lifespring) run.lifespring.timer = left; }
      else if (held.id === "timeDilation") (run.timeDilation ??= {}).timer = left;
      else if (held.id === "phantasm") (run.phantasm ??= {}).timer = left;
      else if (held.id === "voidwell") (run.voidwell ??= {}).timer = left;
      else this.runState.timers[held.id] = left;
    }
  }
  /** A turn ends: Overseer's beams turn on, on or off, and each cooldown on
   * its way, restarting the moment it runs out. */
  turn() {
    const run = this.host.run;
    if (this.held.some((h) => h.id === "overseer")) run.beamTurns = (run.beamTurns ?? 0) + 1;
    const active = this.held.flatMap(({ id, levels }) => {
      const trigger = arcanum(id).trigger;
      // Lifespring, Time Dilation, Phantasm, Necrotic Frost and Voidwell run their own, in the run: `lifespringTurn`, `timeDilationTurn`, `phantasmTurn`, `frostTurn`, `Game.voidwellTurn`.
      return trigger.on === "cooldown" && id !== "lifespring" && id !== "timeDilation" && id !== "phantasm" && id !== "necroticFrost" && id !== "voidwell" && this.isOn(id) ? [{ id, turns: trigger.turns(this.withGear(id, valuesAt(id, levels))) }] : [];
    });
    return tickCooldowns(active, this.runState.timers);
  }
}
