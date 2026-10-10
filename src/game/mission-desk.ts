import type { Mode } from "../entities.ts";
import { snap } from "../exact.ts";
import { random, stream } from "../random.ts";
import { estimatedServerTime } from "../shop/clock.ts";
import {
  MISSION_CAPACITY, MISSION_TYPES, MISSIONS, MISSIONS_PER_GRANT, WEEKLY_REWARDS,
  missionReward, randomMaterial, weeklyReward, type MissionType,
} from "../missions/catalog.ts";
import { COUNTED_KEPT, MARKS_KEPT, isComplete, missionPeriod, missionWeek, type Mission, type MissionsSave } from "../missions/progress.ts";
import type { DeskHost } from "./desk.ts";

/** mulberry32's step: each draw moves the state on by this much. */
const STEP = 0x6d2b79f5;

/** What claiming a daily mission or a weekly reward paid. */
export type MissionPayout = { gold: number; gems: number; medals: number; shards: number; material?: { id: string; amount: number } };

/** The daily and weekly missions' commands (the game's `missions`):
 * giving new missions every 8 hours, counting what the player does toward
 * them, and paying them and the week's rewards when claimed. Missions go
 * by the server's GMT clock as estimated (the Shop's), like the Shop's day. */
export class MissionDesk {
  constructor(private host: DeskHost) {}

  private get m(): MissionsSave {
    return this.host.save.missions;
  }

  /** The server time now, estimated from the last confirmed. */
  get now() {
    return estimatedServerTime(this.host.save.shop.clock, this.host.clock());
  }

  /** The player's missions, oldest first. */
  get list(): readonly Mission[] {
    return this.m.list;
  }

  /** The missions not yet complete. */
  get open() {
    return this.m.list.filter((x) => !isComplete(x)).length;
  }

  /** The week's tally of daily missions claimed, and the rewards claimed. */
  get week() {
    this.rollWeek();
    return this.m.week;
  }

  /** Whether weekly reward `i` can be claimed: reached and not yet claimed. */
  weeklyReady(i: number) {
    const w = this.week;
    return w.missions >= WEEKLY_REWARDS[i]!.missions && !w.claimed.includes(i);
  }

  /** Whether anything waits to be claimed (the Missions button's dot). */
  get waiting() {
    return this.m.list.some(isComplete) || WEEKLY_REWARDS.some((_, i) => this.weeklyReady(i));
  }

  /** Whether the list is full: 8 missions, complete ones waiting to be
   * claimed counting too. */
  get full() {
    return this.m.list.length >= MISSION_CAPACITY;
  }

  /** Starts the week over once it has turned (Monday 00:00 GMT). */
  private rollWeek() {
    const id = missionWeek(this.now);
    if (this.m.week.id !== id) this.m.week = { id, missions: 0, claimed: [] };
  }

  /** Brings the missions up to date: a new week's tally, and two new
   * missions for each 8-hour period begun since the last were given (the
   * first time, two at once), while the list holds fewer than 8 (complete
   * ones waiting to be claimed counting too). Returns
   * whether any came. */
  refresh() {
    this.rollWeek();
    const m = this.m, period = missionPeriod(this.now);
    if (m.period !== null && period <= m.period) return false;
    const grants = m.period === null ? 1 : Math.min(period - m.period, MISSION_CAPACITY);
    m.period = period;
    let added = 0;
    this.drawing((rng) => {
      for (let i = 0; i < grants * MISSIONS_PER_GRANT; i++) if (this.give(rng)) added++;
    });
    return added > 0;
  }

  /** Adds one mission of a type the player can work on and has no
   * incomplete mission of, while there is room; false when there is none. */
  private give(rng: () => number) {
    const m = this.m, open = m.list.filter((x) => !isComplete(x));
    if (this.full) return false;
    const taken = new Set(open.map((x) => x.type));
    const types = MISSION_TYPES.filter((t) => !taken.has(t) && MISSIONS[t].offered(this.host.save));
    if (!types.length) return false;
    const type = types[Math.min(types.length - 1, Math.floor(rng() * types.length))]!;
    m.list.push({ id: m.nextId++, type, progress: 0, material: randomMaterial(rng) });
    return true;
  }

  /** Runs `draw` on the missions' saved stream (seeded once from
   * `stream("missions")`) and saves where it stopped. */
  private drawing(draw: (rng: () => number) => void) {
    const m = this.m, state = m.rng ?? Math.floor(stream("missions")() * 4294967296);
    const rng = random(state);
    let used = 0;
    draw(() => (used++, rng()));
    m.rng = (state + Math.imul(used, STEP)) >>> 0;
  }

  /** Counts `amount` toward the incomplete mission of `type`, if the player
   * has one. A `key` (a kill or pickup's `mode:loot key`) counts only once,
   * so undo bringing the tile back can't count it again. */
  record(type: MissionType, amount = 1, key?: string) {
    const m = this.m, mission = m.list.find((x) => x.type === type && !isComplete(x));
    if (!mission || amount <= 0) return;
    if (key !== undefined) {
      const k = `${type}:${key}`;
      if (m.counted.includes(k)) return;
      m.counted.push(k);
      if (m.counted.length > COUNTED_KEPT) m.counted.splice(0, m.counted.length - COUNTED_KEPT);
    }
    mission.progress = Math.min(MISSIONS[type].target, mission.progress + amount);
  }

  /** Counts what a run has done in all (`total`: run training ranks bought,
   * Focus used) toward `type`: only the rise past the most it has counted
   * for the run (`mode` and `seed`), since undo takes such things back. */
  mark(type: MissionType, mode: Mode, seed: number, total: number) {
    const m = this.m, key = `${type}:${mode}:${seed}`, before = m.marks[key] ?? 0;
    if (total <= before) return;
    delete m.marks[key];
    m.marks[key] = total;
    const keys = Object.keys(m.marks);
    for (const k of keys.slice(0, Math.max(0, keys.length - MARKS_KEPT))) delete m.marks[k];
    this.record(type, total - before);
  }

  /** Claims completed mission `id`: pays its Gems, Gold by the highest
   * tower open, and its material, removes it, and counts it in the week's
   * tally. Null when it can't be. */
  claim(id: number): MissionPayout | null {
    const m = this.m, mission = m.list.find((x) => x.id === id);
    if (!mission || !isComplete(mission)) return null;
    const save = this.host.save, r = missionReward(save, mission.material);
    m.list = m.list.filter((x) => x !== mission);
    this.rollWeek();
    m.week.missions++;
    save.gems += r.gems;
    save.gold = snap(save.gold + r.gold);
    if (r.materials) save.equipment.materials[r.material] += r.materials;
    this.host.message = `Mission complete · +${r.gems} Gems · +${r.gold.toLocaleString("en-US")} Gold`;
    return { gold: r.gold, gems: r.gems, medals: 0, shards: 0, material: r.materials ? { id: r.material, amount: r.materials } : undefined };
  }

  /** Claims weekly reward `i`, once a week: Gold (a daily mission's, times
   * its multiplier), Gems, Medals and Ascension Shards. */
  claimWeekly(i: number): MissionPayout | null {
    if (!WEEKLY_REWARDS[i] || !this.weeklyReady(i)) return null;
    const save = this.host.save, r = weeklyReward(save, i);
    this.m.week.claimed = [...this.m.week.claimed, i].sort((a, b) => a - b);
    save.gold = snap(save.gold + r.gold);
    save.gems += r.gems;
    save.medals += r.medals;
    save.ascensionShards += r.shards;
    this.host.message = `Weekly reward · ${WEEKLY_REWARDS[i]!.missions} missions`;
    return { ...r };
  }
}
