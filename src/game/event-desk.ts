import type { Mode } from "../entities.ts";
import { copiesLeft } from "../badges.ts";
import { goalUnlocked } from "../goals.ts";
import { random, stream } from "../random.ts";
import { estimatedServerTime, gmtDay } from "../shop/clock.ts";
import {
  DRAWN_MISSIONS, EVENT_MISSIONS, FIXED_MISSIONS, TIER_MEDALS, TIERS,
  eventAt, nextReleaseAt, releasedBy, stubEvent, type EventInfo, type EventMissionType,
} from "../events/catalog.ts";
import {
  COUNTED_KEPT, defaultEvents, grantRelics, isBoosted, isComplete, noStreaks, relicMedals, tiersDone,
  type EventMission, type EventsSave,
} from "../events/progress.ts";
import type { DeskHost } from "./desk.ts";

/** mulberry32's step: each draw moves the state on by this much. */
const STEP = 0x6d2b79f5;

/** Events' commands (the game's `events`): starting each event as the last
 * ends, releasing its missions day by day, counting what the player does
 * toward them, and paying each tier's Medals as it is done (no claim:
 * Medals come at once). Events go by the server's GMT clock as estimated
 * (the Shop's), like the daily missions. Nothing counts before Tower I's
 * floor 70 Goal opens Events. */
export class EventDesk {
  constructor(private host: DeskHost) {}

  private get e(): EventsSave {
    return this.host.save.events;
  }

  /** Whether Events are open: Tower I's floor 70 Goal claimed, or Dev mode. */
  get unlocked() {
    return goalUnlocked(this.host.save, "events") || this.host.save.settings.devMode;
  }

  /** The server time now, estimated from the last confirmed. */
  get now() {
    return estimatedServerTime(this.host.save.shop.clock, this.host.clock());
  }

  /** The running event, as the server (for now the stand-in) describes it. */
  get info(): EventInfo {
    return stubEvent(eventAt(this.now));
  }

  /** The running event's missions, in the order released. */
  get missions(): readonly EventMission[] {
    return this.e.missions;
  }

  get boosted() {
    return isBoosted(this.e);
  }

  /** The Medals toward the event's relics (doubled once boosted). */
  get medals() {
    return relicMedals(this.e);
  }

  /** When the next missions come; null once all of the event's are out. */
  get nextRelease() {
    return nextReleaseAt(eventAt(this.now), this.now);
  }

  /** Whether the Events button wears its dot: a mission the Events page
   * hasn't shown, or one completed and not yet moved under the rest. */
  get waiting() {
    const e = this.e;
    return this.unlocked && e.missions.some((m) => !e.seen.includes(m.id) || (isComplete(m) && !e.moved.includes(m.id)));
  }

  /** The Events page has shown every mission. */
  seenAll() {
    this.e.seen = this.e.missions.map((m) => m.id);
  }

  /** The Events page has moved completed mission `id` under the rest. */
  move(id: number) {
    if (!this.e.moved.includes(id)) this.e.moved.push(id);
  }

  /** Starts the event over once the next has begun: its missions, what has
   * counted and its streaks go; the events boosted stay. */
  private roll() {
    const id = eventAt(this.now), e = this.e;
    if (e.id === id) return false;
    this.host.save.events = { ...defaultEvents(), boosted: e.boosted, rng: e.rng, nextId: e.nextId, loginDay: e.loginDay };
    this.host.save.events.id = id;
    return true;
  }

  /** Brings Events up to date: a new event once the last has ended, today's
   * login counted, the missions released so far given (the fixed ones
   * first, then drawn among those the player can work on, each kind once),
   * and Buy badges complete once no badge is left to draw. Returns whether
   * anything changed. */
  refresh() {
    if (!this.unlocked) return false;
    let changed = this.roll();
    const e = this.e, now = this.now, today = gmtDay(now);
    const due = releasedBy(e.id!, now);
    if (e.missions.length < due) changed = this.release(due) || changed;
    if (e.loginDay !== today) {
      e.loginDay = today;
      this.record("login");
      changed = true;
    }
    return this.badgesDone() || changed;
  }

  /** Gives missions until `due` are out, while any kind is left to give. */
  private release(due: number) {
    const e = this.e, save = this.host.save;
    let added = false;
    this.drawing((rng) => {
      while (e.missions.length < due) {
        const taken = new Set(e.missions.map((m) => m.type));
        const fixed = FIXED_MISSIONS.find((t) => !taken.has(t));
        const pool = DRAWN_MISSIONS.filter((t) => !taken.has(t) && EVENT_MISSIONS[t].offered(save));
        const type = fixed ?? pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
        if (!type) break;
        e.missions.push({ id: e.nextId++, type, progress: 0 });
        added = true;
      }
    });
    // A mission given complete (Buy badges, with none left) counts at once.
    this.badgesDone();
    return added;
  }

  /** Runs `draw` on the saved stream (seeded once from `stream("events")`)
   * and saves where it stopped. */
  private drawing(draw: (rng: () => number) => void) {
    const e = this.e, state = e.rng ?? Math.floor(stream("events")() * 4294967296);
    const rng = random(state);
    let used = 0;
    draw(() => (used++, rng()));
    e.rng = (state + Math.imul(used, STEP)) >>> 0;
  }

  /** Buy badges completes once every badge is owned and maxed. */
  private badgesDone() {
    const save = this.host.save;
    if (!save.upgrades.cardBadges || copiesLeft(save.badges, save.upgrades) > 0) return false;
    return this.raise("badges", EVENT_MISSIONS.badges.targets[TIERS - 1]);
  }

  /** Counts `amount` toward the event's mission of `type`, if it has one. A
   * `key` (a kill or pickup's `mode:loot key`, a tournament's id) counts
   * only once, so undo bringing the tile back can't count it again. */
  record(type: EventMissionType, amount = 1, key?: string) {
    const m = amount > 0 ? this.current(type) : undefined;
    if (!m) return;
    if (key !== undefined) {
      const e = this.e, k = `${type}:${key}`;
      if (e.counted.includes(k)) return;
      e.counted.push(k);
      if (e.counted.length > COUNTED_KEPT) e.counted.splice(0, e.counted.length - COUNTED_KEPT);
    }
    this.raise(type, m.progress + amount);
  }

  /** Counts `value` toward a `best` mission (a floor reached, a streak),
   * when it is past the most reached. */
  best(type: EventMissionType, value: number) {
    const m = this.current(type);
    if (m && value > m.progress) this.raise(type, value);
  }

  /** The running event's incomplete mission of `type`, once Events are
   * open and the event is current. */
  private current(type: EventMissionType) {
    if (!this.unlocked) return undefined;
    if (this.roll()) this.release(releasedBy(this.e.id!, this.now));
    return this.e.missions.find((m) => m.type === type && !isComplete(m));
  }

  /** Raises mission `type`'s progress to `to` (up to its last target) and
   * pays the Medals of each tier it completes: doubled once boosted. */
  private raise(type: EventMissionType, to: number) {
    const e = this.e, m = e.missions.find((x) => x.type === type);
    if (!m || to <= m.progress) return false;
    const before = tiersDone(m);
    m.progress = Math.min(EVENT_MISSIONS[type].targets[TIERS - 1], to);
    const after = tiersDone(m);
    if (after > before) {
      const medals = TIER_MEDALS.slice(before, after).reduce((a, b) => a + b, 0) * (isBoosted(e) ? 2 : 1);
      this.host.save.medals += medals;
      grantRelics(this.host.save);
    }
    return true;
  }

  // --- Streaks: floors in a row, within a run ---

  /** The run's streaks, started afresh for a new run. */
  private streaks(mode: Mode, seed: number) {
    const run = `${mode}:${seed}`, e = this.e;
    if (e.streaks.run !== run) e.streaks = noStreaks(run);
    return e.streaks;
  }

  /** A fight cost the hero HP: the floor it stands on breaks the run's
   * floors without damage. Undo doesn't take it back. */
  hurt(mode: Mode, seed: number) {
    if (this.unlocked) this.streaks(mode, seed).hurt = true;
  }

  /** A floor climbed for the first time in the run: the floor left adds to
   * the floors without damage unless a fight cost HP on it, and one paying
   * the most Interest (`maxInterest`) to the floors of max Interest. */
  climbed(mode: Mode, seed: number, maxInterest: boolean) {
    if (!this.unlocked) return;
    const s = this.streaks(mode, seed);
    s.floors = s.hurt ? 0 : s.floors + 1;
    s.hurt = false;
    s.interest = maxInterest ? s.interest + 1 : 0;
    this.best("noDamage", s.floors);
    this.best("maxInterest", s.interest);
  }
}
