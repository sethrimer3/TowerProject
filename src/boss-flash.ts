import { forEachViewTile, type FrameContext } from "./render-frame.ts";

// A boss flashes briefly the first time it comes into view in a run (on
// arriving on its Tower floor, or as the Delve's climb brings its gate into
// view), so the player notices they have reached a boss floor. Presentation
// only: it reads the board and never touches the game.

/** How long a boss's flash lasts. */
export const BOSS_FLASH_MS = 1400;

export class BossFlash {
  private seed: number | null = null;
  /** The bosses already flashed this run, by floor and tile, and when each started. */
  private started = new Map<string, number>();

  /** Starts a flash for each boss newly in view, then draws the flashes
   * under way over the board (above the darkness, so they always read). */
  draw(f: FrameContext, seed: number, height: number, reduceMotion: boolean) {
    if (this.seed !== seed) [this.seed, this.started] = [seed, new Map()];
    forEachViewTile(f, (x, y) => {
      const t = f.world.tile(x, y);
      if (t.kind !== "enemy" || t.enemy?.strength !== "boss") return;
      const key = `${height}|${x}|${y}`;
      if (!this.started.has(key)) this.started.set(key, f.now);
    });
    const c = f.c, s = f.s;
    for (const [key, at] of this.started) {
      const age = f.now - at;
      if (age < 0 || age >= BOSS_FLASH_MS) continue;
      const [, wx, wy] = key.split("|").map(Number) as [number, number, number];
      const x = (wx - f.left + 0.5) * s, y = (f.n - 0.5 - (wy - f.bottom)) * s;
      const life = age / BOSS_FLASH_MS, fade = 1 - life;
      // Two soft pulses over the fade; reduced motion keeps a steady glow.
      const pulse = reduceMotion ? 1 : 0.65 + 0.35 * Math.cos(life * Math.PI * 4);
      const alpha = fade * pulse;
      const radius = s * (1.1 + 1.6 * life);
      const glow = c.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(255, 240, 200, ${0.85 * alpha})`);
      glow.addColorStop(0.4, `rgba(255, 90, 60, ${0.6 * alpha})`);
      glow.addColorStop(1, "rgba(255, 60, 40, 0)");
      c.save();
      c.fillStyle = glow;
      c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      c.strokeStyle = `rgba(255, 210, 120, ${0.9 * fade})`;
      c.lineWidth = Math.max(2, s * 0.08);
      c.strokeRect(x - s / 2, y - s / 2, s, s);
      c.restore();
    }
  }
}
