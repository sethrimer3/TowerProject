import type { ArcanumId } from "../arcana/arcana.ts";
import { ARCANA_LAB_CENTER as C, ARCANA_LAB_RADIUS as R, ARCANA_LAB_SIZE as SIZE, ARCANA_LAB_TARGET as TARGET, arcanaBurstAge } from "../arcana-lab.ts";
import type { Tile } from "../entities.ts";
import { drawDungeonGround, dungeonDiagonals } from "../sprites/dungeon.ts";
import { kitImage } from "../sprites/kit.ts";
import { dungeonWallProfile } from "../render/wall-depth.ts";
import { paintContents, paintHero, paintTorch } from "../render/tile-painters.ts";
import type { FrameContext } from "../render/render-frame.ts";
import { drawVolley } from "../render/volley-art.ts";
import { paintVortex } from "../render/effects/voidwell.ts";
import { paintFrostField } from "../render/effects/necrotic-frost.ts";
import { paintLifespring } from "../render/effects/lifespring.ts";
import { paintDilationField } from "../render/effects/time-dilation.ts";
import { paintOverseerBeams } from "../render/effects/overseer-beams.ts";
import { ghostBob, paintGhost } from "../render/effects/phantasm.ts";
import { paintThunderbolt, paintThunderlight } from "../render/effects/thunderbolt.ts";
import { paintPixelArcana } from "../render/effects/arcana-pixel-preview.ts";

const SEED = 1103, N = SIZE / 24;
const floor = (x: number, y: number): Tile => ({ kind: x <= 0 || y <= 0 || x >= N - 1 || y >= N - 1 ? "wall" : "floor" });
const underActors = (id: ArcanumId) => id === "voidwell" || id === "necroticFrost" || id === "timeDilation";

/** The before view uses the real current effect painters at the shared fixture coordinates. */
export function paintCurrentArcana(c: CanvasRenderingContext2D, id: ArcanumId, time: number) {
  const age = arcanaBurstAge(time);
  c.save();
  if (id === "voidwell") paintVortex(c, C, C, R, 1, time, false);
  else if (id === "necroticFrost") paintFrostField(c, C, C, R, 1, 24, time, 1, false);
  else if (id === "lifespring") paintLifespring(c, C, C, R, time, false);
  else if (id === "timeDilation") paintDilationField(c, C, C, R, 1);
  else if (id === "overseer") paintOverseerBeams(c, C, C, SIZE * 2, { count: 3, width: 24 }, time / 12000 * 360);
  else if (id === "phantasm") {
    for (let i = 0; i < 3; i++) {
      const a = time / 12000 * Math.PI * 2 + i / 3 * Math.PI * 2;
      c.save(); c.translate(C + Math.cos(a) * 48 - 12, C + Math.sin(a) * 48 - 12);
      paintGhost(c, ghostBob(time, i)); c.restore();
    }
  } else if (id === "thunderbolt" && age < 330) {
    paintThunderbolt(c, TARGET.x, TARGET.y, age / 90, 8, 6, 1, 24);
    if (age >= 90) { c.translate(TARGET.x - 12, TARGET.y - 12); paintThunderlight(c, age); }
  } else if (id === "ricochetShot") {
    // tick 0 lands at zero with this presentation offset, preserving the real 100 ms flash.
    const f = { c, now: age, dt: 0, n: N, s: 24, left: 0, bottom: 0 } as FrameContext;
    drawVolley(f, [{ at: -500, ms: 1000, shots: [{ by: "hero", from: { x: 3, y: 3 }, to: { x: 8, y: 6 }, tick: 0, damage: 0, ricochet: true }] }]);
  }
  // Aurum Bloom has no dedicated current board animation.
  c.restore();
}

/** Cache the common room and actors once; only the effects are redrawn while playing. */
export class ArcanaLabScene {
  private ground = document.createElement("canvas");
  private actors = document.createElement("canvas");
  private loaded = false;
  private prepare() {
    if (this.loaded) return true;
    this.ground.width = this.ground.height = this.actors.width = this.actors.height = SIZE;
    const c = this.ground.getContext("2d")!, a = this.actors.getContext("2d")!;
    c.imageSmoothingEnabled = a.imageSmoothingEnabled = false;
    c.fillStyle = "#0c1016"; c.fillRect(0, 0, SIZE, SIZE);
    let ready = ["hero-down", "enemy-skeleton", "torch", "chest-wood", "potion-red"].map(kitImage).every(Boolean);
    const world = { tile: floor };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      c.save(); c.translate(x * 24, (N - 1 - y) * 24);
      ready = drawDungeonGround(c, { mode: "tower", tier: 1, height: 0, seed: SEED, x, y, wall: floor(x, y).kind === "wall", empty: true,
        neighbors: { northWall: floor(x, y + 1).kind === "wall", eastWall: floor(x + 1, y).kind === "wall", southWall: floor(x, y - 1).kind === "wall", westWall: floor(x - 1, y).kind === "wall" } },
        dungeonDiagonals(world, "tower", x, y, SEED), floor(x, y).kind === "wall" ? dungeonWallProfile(world, x, y) : undefined) && ready;
      c.restore();
    }
    const actor = (x: number, y: number, paint: () => void) => { a.save(); a.translate(x * 24, (N - 1 - y) * 24); paint(); a.restore(); };
    actor(5, 5, () => paintHero(a));
    for (const [x, y] of [[8, 6], [3, 3], [3, 8]]) actor(x, y, () => paintContents(a, { kind: "enemy", enemy: { name: "Skeleton", hp: 20, attack: 5, defense: 1, tier: 0, strength: "normal" } }, { x, y, time: 0, styledSprites: true, reduceMotion: true }));
    actor(7, 2, () => paintContents(a, { kind: "treasure" }, { x: 7, y: 2, time: 0, styledSprites: true, reduceMotion: true }));
    actor(2, 5, () => paintContents(a, { kind: "potion" }, { x: 2, y: 5, time: 0, styledSprites: true, reduceMotion: true }));
    for (const y of [3, 7]) actor(1, y, () => paintTorch(a, { x: 1, y, active: true, baseIntensity: 1, lightRadius: 4 }, 0, true));
    this.loaded = ready;
    return ready;
  }
  draw(before: HTMLCanvasElement, after: HTMLCanvasElement, id: ArcanumId, time: number) {
    const ready = this.prepare();
    for (const [canvas, paint] of [[before, paintCurrentArcana], [after, paintPixelArcana]] as const) {
      if (canvas.width !== SIZE * 2 || canvas.height !== SIZE * 2) canvas.width = canvas.height = SIZE * 2;
      const c = canvas.getContext("2d")!;
      c.setTransform(2, 0, 0, 2, 0, 0); c.imageSmoothingEnabled = false;
      c.drawImage(this.ground, 0, 0);
      if (underActors(id)) paint(c, id, time);
      c.drawImage(this.actors, 0, 0);
      if (!underActors(id)) paint(c, id, time);
    }
    return ready;
  }
}
