import type { Mode } from "../entities.ts";
import type { TowerRun } from "../runs.ts";
import {
  appliedNow, appliedOf, autoChoice, autoPickOpen, boonEffects, boonsEarned, lastBoonFloor, nextBoonFloor, ranked, rescaleHero, rollOffer, sameFoes, shrinesOpen,
  type BoonId, type ShrineRun,
} from "../shrines.ts";
import type { DeskHost } from "./desk.ts";
import { RunTimeline } from "../run-timeline.ts";

/** What the Shrine desk needs from the game beyond any desk's: the mode,
 * and word that the run's boons changed its enemies or hero, so the board
 * reads them afresh and the hand plans again. */
export interface ShrineHost extends DeskHost {
  readonly mode: Mode;
  boonsChanged(): void;
}

/** The Shrines' commands (shrines.ts): a Tower run's boons earned, offered
 * and picked, Auto Pick, and the Shrine Boons page's choices.
 *
 * A pick is kept by the run and by every undo snapshot of it (and a fall's),
 * as Training bought mid-run is, so undo takes back steps but never a boon;
 * and each of them has its hero's stats moved to what the boons now apply
 * (`sync`), research completed mid-run included. */
export class ShrineDesk {
  constructor(private readonly host: ShrineHost) {}

  private get save() {
    return this.host.save;
  }

  /** Whether the run is a Tower run inside with Shrines researched. */
  get open() {
    return this.host.mode === "tower" && !this.host.run.outside && shrinesOpen(this.save);
  }

  private get run() {
    return this.host.run as TowerRun;
  }

  /** The highest floor the run has reached, by its number (from 1). */
  get floor() {
    return (this.run.maxHeight ?? this.run.height) + 1;
  }

  /** The boons the run has picked. */
  get picked(): readonly BoonId[] {
    return this.run.shrine?.picked ?? [];
  }

  /** Boons earned and not yet picked. */
  get unspent() {
    return this.open ? Math.max(0, boonsEarned(this.floor, this.picked, this.save) - this.picked.length) : 0;
  }

  /** Floors left to climb to the next boon, or null with none left to earn. */
  get floorsToNext() {
    const at = this.open ? nextBoonFloor(this.floor, this.picked, this.save) : null;
    return at === null ? null : at - this.floor;
  }

  /** How far the run has climbed from its latest boon's floor toward the
   * next's, from 0 to 1 (1 with none left to earn). */
  get progress() {
    if (!this.open) return 0;
    const next = nextBoonFloor(this.floor, this.picked, this.save);
    if (next === null) return 1;
    const last = lastBoonFloor(this.floor, this.picked, this.save);
    return (this.floor - last) / (next - last);
  }

  /** The boons offered now: the offer waiting, or a new one rolled while a
   * boon is unspent. Empty with none to pick. */
  offer(): BoonId[] {
    if (!this.unspent) return [];
    const now = this.run.shrine ?? { picked: [], rolls: 0 };
    if (now.offer?.length) return now.offer;
    const next = { picked: now.picked, rolls: now.rolls };
    const offer = rollOffer(this.run.seed, next, this.save);
    this.share({ ...next, offer });
    return offer;
  }

  /** Picks `id` from the offer; false when it isn't offered. Auto Pick
   * then takes any boons still unspent. */
  pick(id: BoonId) {
    const offer = this.offer();
    if (!offer.includes(id)) return false;
    const now = this.run.shrine!;
    this.share({ picked: [...now.picked, id], rolls: now.rolls });
    this.sync();
    this.autoPick();
    return true;
  }

  /** Whether Auto Pick takes the run's boons: researched and turned on. */
  get autoPicks() {
    return autoPickOpen(this.save) && this.save.shrines.autoPick;
  }

  /** Turns Auto Pick on or off (kept between runs); turned on, it takes
   * the boons waiting at once. */
  setAutoPick(on: boolean) {
    if (!autoPickOpen(this.save)) return false;
    this.save.shrines.autoPick = on;
    this.autoPick();
    return true;
  }

  /** With Auto Pick on, picks every boon unspent: the best ranked offered,
   * or the top one. */
  autoPick() {
    while (this.autoPicks && this.unspent) {
      const offer = this.offer();
      if (!offer.length || !this.pick(autoChoice(offer, this.save))) break;
    }
  }

  /** The run, and each undo snapshot of it and a fall's, takes the boons
   * and draws `core` holds. */
  private share(core: Omit<ShrineRun, "applied">) {
    for (const run of this.runs()) run.shrine = { ...core, ...(core.offer ? { offer: [...core.offer] } : {}), picked: [...core.picked], ...(run.shrine?.applied ? { applied: run.shrine.applied } : {}) };
  }

  /** The live Tower run and every copy of it undo or a fall may restore. */
  private runs(): TowerRun[] {
    return new RunTimeline<TowerRun>(this.save, "tower").runs();
  }

  /** Moves the run's hero (and each undo snapshot's) to what its boons
   * apply with the research done now, and tells the game when its enemies
   * or hero changed. Nothing outside a Tower run or before a boon. */
  sync() {
    if (this.host.mode !== "tower" || this.host.run.outside || !this.run.shrine) return;
    const before = appliedNow(this.run), after = appliedOf(boonEffects(this.run.shrine.picked, this.save));
    const changed = !sameFoes(before.foes, after.foes) || (["attack", "maxHp", "shroud", "regen", "lifesteal", "parry", "parryBonus"] as const).some((k) => before[k] !== after[k]);
    if (!changed) return;
    for (const run of this.runs()) {
      if (!run.shrine) continue;
      const was = appliedNow(run);
      rescaleHero(run.player, was, after);
      if (run.loadout) rescaleHero(run.loadout, was, after);
      run.shrine.applied = after;
    }
    this.host.boonsChanged();
  }

  // --- The Shrine Boons page: only in the forest ---

  private get inForest() {
    return !!this.host.run.outside;
  }

  /** Sets the First Boon Choice (a standard boon), or clears it. */
  setFirstChoice(id: BoonId | undefined) {
    if (!this.inForest) return false;
    if (id) this.save.shrines.firstChoice = id;
    else delete this.save.shrines.firstChoice;
    return true;
  }

  /** Bans `id`, or lifts its ban; false when no more can be banned. */
  toggleBan(id: BoonId, max: number) {
    if (!this.inForest) return false;
    const banned = this.save.shrines.banned;
    if (banned.includes(id)) this.save.shrines.banned = banned.filter((b) => b !== id);
    else if (banned.length < max) banned.push(id);
    else return false;
    return true;
  }

  /** Sets Auto Pick's ranking, best first. */
  setRanking(order: BoonId[]) {
    if (!this.inForest) return false;
    this.save.shrines.ranking = [...new Set(order)];
    return true;
  }

  /** The ranking as Auto Pick reads it now. */
  get ranked() {
    return ranked(this.save);
  }
}
