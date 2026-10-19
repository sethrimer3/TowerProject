import type { Tile } from "./entities.ts";
import { enemyOf, landsAt, leavesAt, SHOT_FLIGHT, volleyOver, type Shot, type Volley } from "./volley.ts";
import { tileCenter, type BoardTiles, type FrameContext } from "./render-frame.ts";

/** A Ranged enemy's shot: a small glowing ball, its radius in tiles. */
const SHOT_COLOR = "#ffb347";
const SHOT_GLOW = "#ff6a1a";
const SHOT_RADIUS = 0.09;
/** The Archer's arrow: a shaft, a head and fletching, its length in tiles. */
const ARROW_COLOR = "#e9edf4";
const ARROW_HEAD = "#ffd34d";
const FLETCH_COLOR = "#e86d7a";
const ARROW_LENGTH = 0.42;
/** A Charged Shot's arrow flies in a blue glow. */
const CHARGED_GLOW = "#4da6ff";
/** Volleys kept in flight at once; at high speed older ones are dropped. */
const MAX_IN_FLIGHT = 8;

/** The shots in flight at `f.now` (ranged.ts): each leaves on the frame
 * nearest its tick of the turn (`shotFlight`) and flies `SHOT_FLIGHT` of a
 * turn, an arrow from where the hero stood as it fired to its target, an
 * enemy's shot from its tile to the hero as drawn, so it lands on the hero
 * wherever its step has taken it. `wrap`, the board's width where it wraps
 * (the Delve), sends a shot the short way round. */
export function drawVolley(f: FrameContext, volleys: readonly Volley[], wrap = 0) {
  const early = (f.dt * 1000) / 2;
  for (const volley of volleys)
    for (const shot of volley.shots) {
      const t = shotFlight(volley, shot, f.now, early);
      if (t === undefined) continue;
      const to = shot.by === "enemy" ? { x: f.playerX, y: f.playerY } : shot.to;
      let dx = to.x - shot.from.x;
      if (wrap && Math.abs(dx) > wrap / 2) dx -= Math.sign(dx) * wrap;
      const dy = to.y - shot.from.y;
      const at = tileCenter(f, shot.from.x + dx * t, shot.from.y + dy * t);
      if (shot.by === "enemy") drawShot(f, at);
      // World y grows upward, the screen's downward.
      else drawArrow(f, at, Math.atan2(-dy, dx), !!shot.charge);
    }
}

/** How far along its path `shot` of `volley` is at `now`: 0 as it leaves,
 * 1 as it lands, undefined before it leaves or once it has landed. It
 * leaves on the frame nearest its moment, so up to `early` ms (half a
 * frame) before it, a tie going to the later frame, and counts its flight
 * from the moment itself. */
export function shotFlight(volley: Volley, shot: Shot, now: number, early = 0) {
  const ahead = leavesAt(volley, shot) - now;
  if ((ahead > 0 && ahead >= early) || now >= landsAt(volley, shot)) return undefined;
  return Math.max(0, -ahead / (volley.ms * SHOT_FLIGHT));
}

/** The volleys still in flight, oldest first (a turn's last shots may land
 * as the next turn's leave), and the board as they show it: an enemy an
 * arrow felled stands on its tile until that arrow lands. */
export class ShotsInFlight {
  volleys: Volley[] = [];
  private seen: Volley | null = null;
  private ghosts = new Map<string, Tile>();
  private wrap = 0;
  private boards = new WeakMap<BoardTiles, BoardTiles>();
  /** Takes the game's latest volley (none: undo or a new board drops them
   * all) and lets go of those landed by `now`. */
  update(latest: Volley | null, now: number, wrap: number) {
    if (latest !== this.seen) {
      this.seen = latest;
      this.volleys = latest ? [...this.volleys, latest].slice(-MAX_IN_FLIGHT) : [];
    }
    this.volleys = this.volleys.filter((v) => !volleyOver(v, now));
    this.wrap = wrap;
    this.ghosts.clear();
    for (const v of this.volleys)
      for (const s of v.shots) if (s.fell && now < landsAt(v, s)) this.ghosts.set(`${enemyOf(s).x},${enemyOf(s).y}`, s.fell.flying ? { kind: "floor", flyer: s.fell } : { kind: "enemy", enemy: s.fell });
  }
  /** Whether every shot it holds has landed by `now`. */
  over(now: number) {
    return this.volleys.every((v) => volleyOver(v, now));
  }
  /** `world` with the felled enemies still standing: one object per board,
   * as the drawing passes expect. */
  board(world: BoardTiles): BoardTiles {
    let shown = this.boards.get(world);
    if (!shown) {
      shown = {
        tile: (x, y) => {
          const t = world.tile(x, y);
          if (!this.ghosts.size || t.kind !== "floor" || t.flyer) return t;
          const ghost = this.ghosts.get(`${this.wrap ? ((x % this.wrap) + this.wrap) % this.wrap : x},${y}`);
          return ghost ? { ...t, ...ghost } : t;
        },
      };
      this.boards.set(world, shown);
    }
    return shown;
  }
}

function drawShot(f: FrameContext, at: { x: number; y: number }) {
  const c = f.c, r = Math.max(2, f.s * SHOT_RADIUS);
  c.save();
  c.shadowColor = SHOT_GLOW;
  c.shadowBlur = Math.max(4, f.s * 0.3);
  c.fillStyle = SHOT_COLOR;
  c.beginPath();
  c.arc(at.x, at.y, r, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawArrow(f: FrameContext, at: { x: number; y: number }, angle: number, charged = false) {
  const c = f.c, len = f.s * ARROW_LENGTH, w = Math.max(1.5, f.s * 0.05);
  c.save();
  if (charged) {
    c.shadowColor = CHARGED_GLOW;
    c.shadowBlur = Math.max(6, f.s * 0.4);
  }
  c.translate(at.x, at.y);
  c.rotate(angle);
  c.lineCap = "round";
  c.strokeStyle = "#000";
  c.lineWidth = w + 2;
  c.beginPath();
  c.moveTo(-len / 2, 0);
  c.lineTo(len / 2, 0);
  c.stroke();
  c.strokeStyle = ARROW_COLOR;
  c.lineWidth = w;
  c.stroke();
  // The head at the front, the fletching at the back.
  c.fillStyle = ARROW_HEAD;
  c.beginPath();
  c.moveTo(len / 2 + w * 2.5, 0);
  c.lineTo(len / 2 - w, -w * 1.8);
  c.lineTo(len / 2 - w, w * 1.8);
  c.closePath();
  c.fill();
  c.strokeStyle = FLETCH_COLOR;
  c.lineWidth = w * 0.9;
  c.beginPath();
  c.moveTo(-len / 2, 0);
  c.lineTo(-len / 2 - w * 1.5, -w * 1.8);
  c.moveTo(-len / 2, 0);
  c.lineTo(-len / 2 - w * 1.5, w * 1.8);
  c.stroke();
  c.restore();
}
