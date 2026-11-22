import { FAMILIARS, FAMILIAR_IDS, HATCH_MEDALS, familiarValues, statValue, upgradeMedals, type FamiliarId, type FamiliarLevels, type StatKey } from "../familiars/catalog.ts";
import { endEffect, type FamiliarValues } from "../familiars/rules.ts";
import { researched, type ResearchTarget } from "../progression/archives.ts";
import type { DeskHost } from "./desk.ts";
import type { EventDesk } from "./event-desk.ts";

/** Each familiar's Cooldown research, the turns it takes off. */
const COOLDOWN_RESEARCH = {
  dragon: "dragonCooldown", slime: "slimeCooldown", wolf: "wolfCooldown", falcon: "falconCooldown", wisp: "wispCooldown",
} as const satisfies Record<FamiliarId, ResearchTarget>;

/** Why a hatch or an upgrade can't be bought: Events not earned (`locked`),
 * already hatched, not hatched yet, at its last level, or short of Medals. */
export type FamiliarRefusal = "locked" | "hatched" | "unhatched" | "maxed" | "short";

const UNRAISED: Readonly<FamiliarLevels> = [0, 0, 0, 0];

/** Familiars' commands (the game's `familiars`): hatching and growing them
 * for Medals, on the Events screen's Familiars tab, and switching them on
 * and off. Levels and research are read as used, never copied into a run. */
export class FamiliarDesk {
  constructor(private host: DeskHost, private events: EventDesk) {}

  private get saved() {
    return this.host.save.familiars;
  }
  private affords(medals: number) {
    return this.host.free || this.host.save.medals >= medals;
  }
  private pay(medals: number) {
    if (!this.host.free) this.host.save.medals -= medals;
  }

  hatched(id: FamiliarId) {
    return !!this.saved[id];
  }
  /** Whether `id` is hatched and switched on. */
  isOn(id: FamiliarId) {
    const owned = this.saved[id];
    return !!owned && !owned.off;
  }
  /** `id`'s levels; none raised while it is still an egg. */
  levels(id: FamiliarId): Readonly<FamiliarLevels> {
    return this.saved[id]?.levels ?? UNRAISED;
  }

  /** What the next egg costs, whichever it is; null once all are hatched. */
  get hatchPrice(): number | null {
    return HATCH_MEDALS[Object.keys(this.saved).length] ?? null;
  }
  hatchRefusal(id: FamiliarId): FamiliarRefusal | null {
    if (this.hatched(id)) return "hatched";
    if (!this.events.earned) return "locked";
    return this.affords(this.hatchPrice!) ? null : "short";
  }
  /** Hatches `id`; false when it can't be bought. */
  hatch(id: FamiliarId) {
    if (this.hatchRefusal(id)) return false;
    this.pay(this.hatchPrice!);
    this.saved[id] = { levels: [0, 0, 0, 0] };
    return true;
  }

  /** What the next level of `id`'s stat in `slot` costs; null at its last. */
  upgradePrice(id: FamiliarId, slot: number) {
    return upgradeMedals(id, slot, this.levels(id)[slot]!);
  }
  upgradeRefusal(id: FamiliarId, slot: number): FamiliarRefusal | null {
    if (!this.hatched(id)) return "unhatched";
    const price = this.upgradePrice(id, slot);
    if (price === null) return "maxed";
    if (!this.events.earned) return "locked";
    return this.affords(price) ? null : "short";
  }
  /** Raises `id`'s stat in `slot` a level; false when it can't be bought. */
  upgrade(id: FamiliarId, slot: number) {
    if (this.upgradeRefusal(id, slot)) return false;
    this.pay(this.upgradePrice(id, slot)!);
    this.saved[id]!.levels[slot]!++;
    return true;
  }

  /** Switches a hatched familiar on or off, in or out of a run; false for an
   * egg. Off ends its effect in both modes' runs; its cooldown and path hold
   * still, so switching neither skips nor restarts a wait. */
  toggle(id: FamiliarId) {
    const owned = this.saved[id];
    if (!owned) return false;
    if (owned.off) delete owned.off;
    else {
      owned.off = true;
      for (const mode of ["tower", "delve"] as const) endEffect(this.host.save[mode].run?.familiars?.[id]);
    }
    return true;
  }
  /** `id`'s values without research, for what reads them every tile (only
   * Cooldown is researched); undefined while it is an egg or off. */
  stats<I extends FamiliarId>(id: I): Record<StatKey<I>, number> | undefined {
    return this.isOn(id) ? familiarValues(id, this.levels(id)) : undefined;
  }
  /** The values of those hatched and switched on; null with none, so a save
   * without familiars does nothing new. */
  get working(): FamiliarValues | null {
    let working: Partial<Record<FamiliarId, Record<string, number>>> | null = null;
    for (const id of FAMILIAR_IDS) if (this.isOn(id)) (working ??= {})[id] = this.values(id);
    return working as FamiliarValues | null;
  }

  /** The turns research takes off `id`'s Cooldown. */
  private quicker(id: FamiliarId) {
    return researched(this.host.save.archives, COOLDOWN_RESEARCH[id]);
  }
  /** Every value of `id` as it stands, research counted. */
  values<I extends FamiliarId>(id: I): Record<StatKey<I>, number> {
    const values: Record<string, number> = familiarValues(id, this.levels(id));
    values.cooldown = Math.max(1, values.cooldown! - this.quicker(id));
    return values as Record<StatKey<I>, number>;
  }
  /** What `id`'s stat in `slot` is worth now and a level on (null at its last), research counted. */
  preview(id: FamiliarId, slot: number): { now: number; next: number | null } {
    const level = this.levels(id)[slot]!, cut = FAMILIARS[id].order[slot] === "cooldown" ? this.quicker(id) : 0;
    const worth = (at: number) => (cut ? Math.max(1, statValue(id, slot, at) - cut) : statValue(id, slot, at));
    return { now: worth(level), next: this.upgradePrice(id, slot) === null ? null : worth(level + 1) };
  }
}
