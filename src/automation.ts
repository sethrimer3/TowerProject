import { capabilities, chooseDelveStep } from "./delve/automove.ts";
import { predict } from "./combat.ts";
import { point, type Tile } from "./entities.ts";
import type { Game } from "./state.ts";
import type { Position } from "./board.ts";
import { doorCost } from "./doors.ts";

const BENEFIT: Partial<Record<Tile["kind"], number>> = {
  reward: 10000,
  key: 38,
  potion: 30,
  attack: 45,
  defense: 45,
  treasure: 45,
  door: 24,
  enemy: 20,
};

export function score(t: Tile, y: number, current: number, distance: number) {
  const benefit = BENEFIT[t.kind] ?? 0;
  // Score against the run high-water mark: backtracking must not create fake progress.
  return benefit + Math.max(0, y - current) * 1.8 - distance * 0.18;
}

/** Automove's next step: Delve Automove inside the labyrinth, otherwise the
 * Tower search (the Tower, and the forest outside either mode). */
export function chooseStep(game: Game) {
  if (game.mode === "delve" && !game.run.outside)
    return chooseDelveStep(game, { memory: game.save.delve.memory, plan: game.delvePlan, capabilities: capabilities(game.save.upgrades), rules: game.stepRules });
  const best = new Search(game, {
    progress: game.mode === "tower" ? game.run.player.y : game.run.height,
  }).run();
  if (!best) return null;
  const kind = game.world.tile(best.x, best.y).kind;
  return { dx: best.first[0], dy: best.first[1], label: `Seeking ${kind === "floor" ? "height " + best.y : kind}` };
}

const DIRS = [
  [0, 1],
  [-1, 0],
  [1, 0],
  [0, -1],
] as const;
const MAX_NODES = 2200;
const MAX_DEPTH = 140;
/** How far above or below the player the search looks. */
const REACH = 40;

/** A tile the search reached: how far it is and the first step toward it. */
type Node = { x: number; y: number; first: readonly number[]; d: number };
type Combat = ReturnType<typeof predict>;

/** Automove avoids known-lethal enemies outright; an impervious enemy is
 * still a candidate step so execution can bump it harmlessly and replan,
 * rather than treating it as a hard wall. */
const lethal = (c: Combat) => !c.survivable && !c.impervious;

/** What the search scores against: the run's progress mark (so
 * backtracking isn't progress). */
type SearchRules = { progress: number };

/** Breadth-first search from the player for the best-scoring tile to head
 * for. It walks only through floor and stairs, so it stops at every
 * interaction and never assumes future keys or cumulative combat HP. */
class Search {
  private queue: Node[];
  private seen: Set<string>;
  private best: Node | null = null;
  private bestScore = 0.1;

  constructor(private at: Position, private rules: SearchRules) {
    const p = at.run.player;
    this.queue = [{ x: p.x, y: p.y, first: [0, 0], d: 0 }];
    this.seen = new Set([point(p.x, p.y)]);
  }

  run() {
    for (let i = 0; i < this.queue.length && i < MAX_NODES; i++) {
      const n = this.queue[i];
      if (n.d >= MAX_DEPTH) continue;
      for (const [dx, dy] of DIRS) this.visit(n, dx, dy);
    }
    return this.best;
  }

  private visit(n: Node, dx: number, dy: number) {
    const next = this.reach(n, dx, dy);
    if (!next) return;
    const t = this.at.world.tile(next.x, next.y);
    // Cache the one prediction per enemy tile instead of re-running combat
    // math for every check below.
    const combat = t.kind === "enemy" ? predict(this.at.run.player, t.enemy!) : null;
    if (this.blocked(t, dy, combat)) return;
    const value = this.worth(t, next, combat);
    if (value > this.bestScore) {
      this.best = next;
      this.bestScore = value;
    }
    // Replan after each interaction: never assume future keys or cumulative combat HP.
    if (t.kind === "floor" || t.kind === "stairs") this.queue.push(next);
  }

  /** The unseen tile one step from `n`, within reach of the player. */
  private reach(n: Node, dx: number, dy: number): Node | null {
    const dest = this.at.world.step(n.x, n.y, dx, dy);
    if (!dest) return null;
    const k = point(dest.x, dest.y);
    if (this.seen.has(k) || !this.inReach(dest.y)) return null;
    this.seen.add(k);
    return { x: dest.x, y: dest.y, first: n.d ? n.first : [dx, dy], d: n.d + 1 };
  }

  private inReach(y: number) {
    const p = this.at.run.player;
    return y >= Math.max(this.at.world.floor, p.y - REACH) && y <= p.y + REACH;
  }

  /** Whether Automove won't step onto `t`, entered moving down by `dy`. */
  private blocked(t: Tile, dy: number, combat: Combat | null) {
    // Backtracking down floors is a future automove upgrade; for now
    // automove only climbs, never steps onto the stairs back down.
    if (t.kind === "wall" || t.kind === "stairsDown") return true;
    if (t.kind === "oneway") return dy !== 1;
    if (t.kind === "door") return doorCost(t, this.at.run.player) === null;
    return t.kind === "enemy" && lethal(combat!);
  }

  private worth(t: Tile, next: Node, combat: Combat | null) {
    const { run } = this.at;
    const p = run.player;
    let value = run.outside ? (t.kind === "stairs" ? 100 : 0) - next.d * 0.18 : score(t, next.y, this.rules.progress, next.d);
    if (t.kind === "potion" && p.hp === p.maxHp) value -= 10;
    // Impervious enemies cost nothing in expected damage (they are never
    // actually fought — game.move() rejects the bump); a real fight's
    // predicted damage still discourages picking a costly-but-survivable one.
    if (combat && !combat.impervious) value -= combat.damage * 0.5;
    return value;
  }
}
