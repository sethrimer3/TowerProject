import { VIEWPORT_TILES } from "../config.ts";
import type { Board } from "../board.ts";
import type { Mode } from "../entities.ts";
import type { Run } from "../runs.ts";
import { MODES } from "../modes.ts";
import { random } from "../random.ts";
import { gemSpot } from "../economy/gems.ts";
import { collectedDrop, isNewFloor, reachTimedFloor, spotOn, type FloorAt, type FloorSpot } from "../economy/timed-drop.ts";
import { SCARAB_MISSED_FLOORS, type BoostId } from "../boosts/catalog.ts";
import { scarabDraw } from "../boosts/scarabs.ts";
import { addBoost, boostDuration, boostStrength, rollBoost, scarabCooldown } from "../boosts/boosts.ts";
import { repaceResearch, researchPace } from "../progression/archives.ts";
import type { GameCue } from "../shown.ts";
import type { DeskHost } from "./desk.ts";

/** What the scarab finder reads from the game: the board the hero stands
 * on, the Gems lying on it (a scarab never shares their tiles), and what
 * to tell when a boost starts. */
export interface ScarabHost extends DeskHost {
  readonly mode: Mode;
  readonly run: Run;
  readonly world: Board;
  /** Inside a run the hero is still standing in. */
  readonly playing: boolean;
  /** The tiles the Gems on the board lie on. */
  readonly gemTiles: readonly { x: number; y: number }[];
  cue(cue: GameCue): void;
  /** Boost `id` is about to get more time (`start` adds it): the game
   * retimes what it speeds up (ranks in training). */
  boostStarting(id: BoostId, start: () => void): void;
}

/** A Golden Scarab claimed: the boost it gave, its value then and the
 * time it added, and the tile it lay on, for the board's drop animation. */
export type ScarabClaim = { id: BoostId; value: number; ms: number; x: number; y: number };

/** Salts the run seed for where a Golden Scarab lies on a floor. */
const SCARAB_SALT = 0x5ca7ab;
/** A floor's part of a roll's seed (as the Gems' rolls take it). */
const floorPart = (floor: number) => Math.imul(floor + 1, 0x9e3779b1);

/** Golden Scarabs on the floors (`save.scarab`, never part of a run): one
 * appears on a floor new to the run once its cooldown is over, out of the
 * way like the floor Gem, and gives a boost when the hero walks onto it or
 * it is tapped. */
export class ScarabFinder {
  /** Where and when (performance.now()) the latest scarab was claimed, for the board's sparkle. */
  sparkle: { x: number; y: number; at: number } | null = null;
  /** Scarabs claimed and not yet shown: the HUD takes them for the drop animation. */
  claims: ScarabClaim[] = [];

  constructor(private readonly host: ScarabHost) {}

  /** The floor a scarab belongs to: the Tower floor the hero stands on, or
   * in the Delve the furthest equivalent floor reached (as a Gem's). */
  private get at(): FloorAt {
    const { mode, run } = this.host;
    return { mode, seed: run.seed, floor: mode === "tower" ? run.height : MODES[mode].equivalentFloor(run.maxHeight ?? run.height) };
  }

  /** The scarab lying on the floor the board shows, if any. */
  get scarab(): FloorSpot | null {
    return this.host.run.outside ? null : spotOn(this.host.save.scarab, this.at);
  }

  /** Whether a scarab lies at (x, y) on the floor the board shows. */
  scarabAt(x: number, y: number) {
    const s = this.scarab;
    return !!s && s.x === x && s.y === y;
  }

  /** The hero stands somewhere new inside a run: it claims a scarab on its
   * tile, a scarab left on another floor is missed (another owed
   * `SCARAB_MISSED_FLOORS` new floors on), and on a new floor (once the
   * cooldown is over) one may appear, after the Gems are laid. */
  step() {
    const { run, save, playing } = this.host;
    if (!playing) return;
    const p = run.player;
    if (this.scarabAt(p.x, p.y)) this.claim();
    // The very first scarab waits out a whole cooldown from the first floor reached.
    if (!save.scarab.readyAt) save.scarab.readyAt = this.host.clock() + scarabCooldown(save);
    const at = this.at, fresh = isNewFloor(save.scarab, at);
    if (reachTimedFloor(save.scarab, at, this.host.clock(), SCARAB_MISSED_FLOORS) && fresh) this.lay(at);
  }

  /** The scarab of floor `at`, out of the way where the hero can walk to
   * it, never on a Gem's tile; where it lies is fixed for the run and floor. */
  private lay(at: FloorAt) {
    const { run, world } = this.host, view = Math.floor(VIEWPORT_TILES / 2), y = run.player.y;
    const rows = this.host.mode === "tower" ? { minY: 0, maxY: Infinity } : { minY: y - view, maxY: y + view };
    const spot = gemSpot(world, run.player, rows, random(run.seed ^ SCARAB_SALT ^ floorPart(at.floor)), this.host.gemTiles);
    if (spot) this.host.save.scarab.out = { ...at, ...spot };
  }

  /** Claims the scarab at (x, y), tapped from anywhere: what it gave, or
   * null when none lies there. */
  collectAt(x: number, y: number) {
    return this.scarabAt(x, y) && this.host.playing ? this.claim() : null;
  }

  /** Claims the scarab lying out: a boost picked among those open now,
   * from the scarabs' saved stream, gets its time on top of any left; the
   * next waits out the cooldown. */
  private claim(): ScarabClaim | null {
    const { save } = this.host, now = this.host.clock(), out = save.scarab.out;
    if (!out) return null;
    collectedDrop(save.scarab, now, scarabCooldown(save));
    this.sparkle = { x: out.x, y: out.y, at: performance.now() };
    this.host.cue("gemGolden");
    const id = rollBoost(save, () => scarabDraw(save.scarab));
    if (!id) return null;
    const ms = boostDuration(save), research = researchPace(save);
    this.host.boostStarting(id, () => addBoost(save, id, ms, now));
    // Research under way speeds up from now, keeping its share done.
    if (id === "research") repaceResearch(save, research, now);
    const claim = { id, value: boostStrength(save, id), ms, x: out.x, y: out.y };
    this.claims.push(claim);
    return claim;
  }
}
