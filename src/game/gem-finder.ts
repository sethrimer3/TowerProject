import type { Board } from "../board.ts";
import { VIEWPORT_TILES } from "../config.ts";
import type { Mode, Run } from "../entities.ts";
import { AD_COOLDOWN_MS, AD_GEMS, collectedGem, gemOn, gemSpot, reachFloor, type GemSpot } from "../gems.ts";
import { MODES } from "../modes.ts";
import { random } from "../random.ts";
import type { GainArt } from "../state.ts";
import type { DeskHost } from "./desk.ts";

/** What the Gem finder reads from the game: the board the hero stands on
 * and the gains queue the board raises a collected Gem from. */
export interface GemHost extends DeskHost {
  readonly mode: Mode;
  readonly run: Run;
  readonly world: Board;
  /** Inside a run the hero is still standing in. */
  readonly playing: boolean;
  gain(x: number, y: number, text: string, art: GainArt | null): void;
}

/** Salts the run seed for where a Gem lies on a floor. */
const GEM_SALT = 0x6e3a1;

/** Gems found on the floors and the ad's Gems: where the Gem on the board
 * lies, collecting it, and the cooldowns between them (`save.gemDrop`,
 * never part of a run, so undo can't touch them). */
export class GemFinder {
  /** Where and when (performance.now()) the latest Gem was collected, for
   * the board's sparkle. */
  sparkle: { x: number; y: number; at: number } | null = null;

  constructor(private readonly host: GemHost) {}

  /** The floor a Gem belongs to: the Tower floor the hero stands on, or in
   * the Delve the furthest equivalent floor reached. */
  private get floor() {
    const { mode, run } = this.host;
    return mode === "tower" ? run.height : MODES[mode].equivalentFloor(run.maxHeight ?? run.height);
  }

  /** The Gem lying on the floor the board shows, if any. */
  get gem(): GemSpot | null {
    const { mode, run, save } = this.host;
    return run.outside ? null : gemOn(save.gemDrop, { mode, seed: run.seed, floor: this.floor });
  }

  /** The hero stands somewhere new inside a run: it takes a Gem lying on
   * its tile, a Gem left on another floor is missed, and on a new floor
   * (once the last Gem's cooldown is over) a new one may appear: on a plain
   * tile the hero can walk to, in the Delve within the view. */
  step() {
    const { mode, run, save, playing } = this.host;
    if (!playing) return;
    const drop = save.gemDrop, p = run.player, gem = this.gem, floor = this.floor;
    if (gem && gem.x === p.x && gem.y === p.y) this.take(gem);
    if (!reachFloor(drop, { mode, seed: run.seed, floor }, this.host.clock())) return;
    const view = Math.floor(VIEWPORT_TILES / 2);
    const rows = mode === "tower" ? { minY: 0, maxY: Infinity } : { minY: p.y - view, maxY: p.y + view };
    // Where it lies is fixed for the run and floor, like the floor itself.
    const spot = gemSpot(this.host.world, p, rows, random(run.seed ^ GEM_SALT ^ Math.imul(floor + 1, 0x9e3779b1)));
    if (spot) drop.out = { mode, seed: run.seed, floor, ...spot };
  }

  /** Pays the Gem and starts the cooldown to the next; it vanishes in a sparkle. */
  private take(gem: GemSpot) {
    const save = this.host.save;
    save.gems++;
    collectedGem(save.gemDrop, this.host.clock());
    this.sparkle = { x: gem.x, y: gem.y, at: performance.now() };
    this.host.gain(gem.x, gem.y, "+1 Gem", { gem: true });
  }

  /** Collects the Gem at (x, y) on the board, tapped from anywhere; false
   * when none lies there. */
  collectAt(x: number, y: number) {
    const gem = this.gem;
    if (!gem || gem.x !== x || gem.y !== y) return false;
    this.take(gem);
    this.host.message = "+1 Gem";
    return true;
  }

  /** Whether the ad's Gems can be claimed now. */
  get adReady() {
    return this.host.clock() >= this.host.save.gemDrop.adReadyAt;
  }

  /** Claims the ad's Gems, and the button waits out its cooldown. No ad
   * plays yet: this is where watching one will be hooked up. */
  claimAd() {
    if (!this.adReady) return false;
    const save = this.host.save;
    save.gems += AD_GEMS;
    save.gemDrop.adReadyAt = this.host.clock() + AD_COOLDOWN_MS;
    this.host.message = `+${AD_GEMS} Gems`;
    return true;
  }
}
