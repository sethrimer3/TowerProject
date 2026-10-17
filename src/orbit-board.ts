import type { KeyColor } from "./config.ts";
import type { EnemyStrength, Tile, Torch } from "./entities.ts";
import type { Facing } from "./shown.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { tileHash } from "./ascii-glyphs.ts";
import { rankChevrons } from "./rank-chevrons.ts";

/** The Orbit Game theme's dungeon board: a space station adrift among the
 * stars. The rock is open space, a few stars to a tile, the walls along
 * open ground riveted hull plates with a cyan running light on the side
 * that faces it, open ground deck plating. Its creatures are our own: weak
 * spores, drifting jellies, hovering one-eyed sentinels, and a boss a hive
 * core ringed in spines. Keys are keycards, doors airlocks with a stripe
 * per key, chests supply pods, torches beacons, and the hero a little
 * astronaut. */

export const ORBIT = {
  space: "#04060f",
  hull: "#4a5c86",
  hullLight: "#7d92bd",
  hullDark: "#27324f",
  deck: "#0a1020",
  seam: "#141d33",
  cyan: "#7fe3ff",
  amber: "#ffab3d",
  red: "#ff5a4e",
  green: "#6dffb0",
  violet: "#b48cff",
  magenta: "#ff6fd8",
  white: "#eef6ff",
  visor: "#ffb85c",
  crate: "#c08a4a",
  keys: { yellow: "#ffd84a", blue: "#5ab8ff", red: "#ff5a4e" } as Record<KeyColor, string>,
} as const;
const keyColor = (k: KeyColor | undefined) => (k ? ORBIT.keys[k] ?? ORBIT.white : ORBIT.white);

function glow(c: CanvasRenderingContext2D, color: string, blur: number) {
  c.shadowColor = color;
  c.shadowBlur = blur;
}
function noGlow(c: CanvasRenderingContext2D) {
  c.shadowBlur = 0;
}
function fill(c: CanvasRenderingContext2D, draw: () => void, color: string) {
  c.beginPath();
  draw();
  c.fillStyle = color;
  c.fill();
}
function stroke(c: CanvasRenderingContext2D, draw: () => void, color: string, width = 1.2) {
  c.beginPath();
  draw();
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = width;
  c.strokeStyle = color;
  c.stroke();
}
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Space over the whole board with its stars, deck plating on open ground,
 * and a hull plate wherever rock touches it. */
function ground(f: FrameContext) {
  const c = f.c;
  c.fillStyle = ORBIT.space;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  forEachViewTile(f, (x, y) => {
    const wall = isWall(x, y);
    const h = tileHash(x, y);
    c.save();
    toTileSpace(c, f, x, y);
    if (wall && [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)))) {
      stars(c, f, h);
      c.restore();
      return;
    }
    if (wall) hullPlate(c, (dx, dy) => !isWall(x + dx, y + dy), h);
    else deckPlate(c, h);
    c.restore();
  });
}

/** Up to three stars in a tile of open space, by its number; one in a few
 * tiles twinkles. */
function stars(c: CanvasRenderingContext2D, f: FrameContext, h: number) {
  const n = h % 4 === 0 ? 0 : (h >>> 3) % 3 + (h % 9 === 0 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const k = h >>> (5 + i * 7);
    const sx = 2 + (k % 20), sy = 2 + ((k >>> 5) % 20);
    const big = (k >>> 10) % 7 === 0;
    const twinkle = big && !f.look.reduceMotion ? 0.55 + 0.45 * Math.sin(f.now / 500 + (h % 97)) : 1;
    c.globalAlpha = (0.35 + ((k >>> 13) % 5) * 0.13) * twinkle;
    c.fillStyle = (k >>> 16) % 5 === 0 ? "#ffe2b8" : (k >>> 16) % 5 === 1 ? "#bfe8ff" : ORBIT.white;
    if (big) {
      c.fillRect(sx - 0.4, sy - 2, 0.8, 4);
      c.fillRect(sx - 2, sy - 0.4, 4, 0.8);
    } else c.fillRect(sx - 0.5, sy - 0.5, 1, 1);
  }
  c.globalAlpha = 1;
}

/** A hull plate: bevelled steel with a rivet at each corner, and a cyan
 * running light along each side that faces open ground. */
function hullPlate(c: CanvasRenderingContext2D, open: (dx: number, dy: number) => boolean, h: number) {
  c.fillStyle = ORBIT.hull;
  c.fillRect(-0.25, -0.25, 24.5, 24.5);
  c.fillStyle = ORBIT.hullLight;
  c.fillRect(0, 0, 24, 1);
  c.fillRect(0, 0, 1, 24);
  c.fillStyle = ORBIT.hullDark;
  c.fillRect(0, 23, 24, 1);
  c.fillRect(23, 0, 1, 24);
  // A panel line across some plates, by the tile's number.
  if (h % 3 === 0) {
    c.fillStyle = ORBIT.hullDark;
    c.fillRect(1, 11.5, 22, 1);
    c.fillStyle = ORBIT.hullLight;
    c.fillRect(1, 12.5, 22, 0.6);
  }
  c.fillStyle = ORBIT.hullLight;
  for (const [rx, ry] of [[3.5, 3.5], [20.5, 3.5], [3.5, 20.5], [20.5, 20.5]]) c.fillRect(rx - 0.8, ry - 0.8, 1.6, 1.6);
  glow(c, ORBIT.cyan, 4);
  c.fillStyle = ORBIT.cyan;
  // World y grows upward, so the tile above (+1) is this tile's top edge.
  if (open(0, 1)) c.fillRect(2, 0.5, 20, 1.2);
  if (open(0, -1)) c.fillRect(2, 22.3, 20, 1.2);
  if (open(-1, 0)) c.fillRect(0.5, 2, 1.2, 20);
  if (open(1, 0)) c.fillRect(22.3, 2, 1.2, 20);
  noGlow(c);
}

/** Deck plating: a dark plate in its seams, a bolt at each corner, and a
 * small floor light on a few. */
function deckPlate(c: CanvasRenderingContext2D, h: number) {
  c.fillStyle = ORBIT.seam;
  c.fillRect(-0.25, -0.25, 24.5, 24.5);
  c.fillStyle = ORBIT.deck;
  c.fillRect(1, 1, 22, 22);
  c.fillStyle = ORBIT.seam;
  for (const [bx, by] of [[3, 3], [21, 3], [3, 21], [21, 21]]) c.fillRect(bx - 0.6, by - 0.6, 1.2, 1.2);
  // A grille on a few plates, a floor light on fewer.
  if (h % 5 === 0) for (let i = 0; i < 4; i++) c.fillRect(8, 8.5 + i * 2.2, 8, 0.8);
  else if (h % 11 === 1) {
    glow(c, ORBIT.cyan, 3);
    c.fillStyle = "#7fe3ff99";
    c.fillRect(11, 11, 2, 2);
    noGlow(c);
  }
}

/** A weak enemy: a spore, a round green-violet puff with short spines and
 * two eyes, floating low on the tile. */
function spore(c: CanvasRenderingContext2D) {
  stroke(c, () => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.moveTo(12 + Math.cos(a) * 5.5, 15 + Math.sin(a) * 5.5);
      c.lineTo(12 + Math.cos(a) * 7.8, 15 + Math.sin(a) * 7.8);
    }
  }, ORBIT.violet, 1.1);
  fill(c, () => c.arc(12, 15, 5.6, 0, Math.PI * 2), "#6a4fb0");
  fill(c, () => c.arc(10.5, 13.5, 2.4, 0, Math.PI * 2), "#8d72d6");
  fill(c, () => { c.arc(10, 15, 1.1, 0, Math.PI * 2); c.moveTo(15, 15); c.arc(14, 15, 1.1, 0, Math.PI * 2); }, ORBIT.green);
}

/** A normal or strong enemy: a drifting jelly, a glowing dome over a frill
 * and three trailing tendrils; a strong one larger. */
function jelly(c: CanvasRenderingContext2D, k: number) {
  c.save();
  c.translate(12, 13);
  c.scale(k, k);
  stroke(c, () => {
    for (const tx of [-4, 0, 4]) {
      c.moveTo(tx, 1);
      c.bezierCurveTo(tx - 2, 4, tx + 2, 6, tx, 9);
    }
  }, ORBIT.magenta, 1.2);
  glow(c, ORBIT.magenta, 5);
  fill(c, () => { c.moveTo(-7, 1.5); c.bezierCurveTo(-7, -9, 7, -9, 7, 1.5); c.quadraticCurveTo(3.5, 3, 0, 1.5); c.quadraticCurveTo(-3.5, 3, -7, 1.5); }, "#a8378f");
  noGlow(c);
  fill(c, () => { c.moveTo(-4.5, -2); c.bezierCurveTo(-4.5, -6.5, 1, -7, 2, -5.5); c.bezierCurveTo(-1.5, -5, -3, -4, -4.5, -2); }, "#ffb0ec");
  fill(c, () => { c.arc(-2.3, -1.2, 1, 0, Math.PI * 2); c.moveTo(3.3, -1.2); c.arc(2.3, -1.2, 1, 0, Math.PI * 2); }, ORBIT.white);
  c.restore();
}

/** An elite: a sentinel, a hovering disc with fins and one red eye, a
 * beam of thrust under it. */
function sentinel(c: CanvasRenderingContext2D) {
  fill(c, () => { c.moveTo(9.5, 19); c.lineTo(14.5, 19); c.lineTo(13, 23); c.lineTo(11, 23); c.closePath(); }, "#7fe3ff55");
  fill(c, () => { c.moveTo(3, 13); c.lineTo(6.5, 9.5); c.lineTo(6.5, 16); c.closePath(); c.moveTo(21, 13); c.lineTo(17.5, 9.5); c.lineTo(17.5, 16); c.closePath(); }, ORBIT.hullLight);
  fill(c, () => c.arc(12, 13, 6.5, 0, Math.PI * 2), "#55688f");
  fill(c, () => c.arc(12, 13, 5, 0, Math.PI * 2), ORBIT.hullDark);
  glow(c, ORBIT.red, 6);
  fill(c, () => c.arc(12, 13, 2.6, 0, Math.PI * 2), ORBIT.red);
  noGlow(c);
  fill(c, () => c.arc(11.2, 12.2, 0.9, 0, Math.PI * 2), ORBIT.white);
  fill(c, () => c.rect(7.5, 18.5, 9, 1.2), ORBIT.hullLight);
}

/** A boss: a hive core, a great amber orb ringed in spines round a dark
 * pupil; a Greater Boss's larger, inside a halo. */
function hiveCore(c: CanvasRenderingContext2D, greater: boolean) {
  c.save();
  c.translate(12, 13.5);
  if (greater) {
    c.scale(1.12, 1.12);
    stroke(c, () => c.ellipse(0, 0, 10.5, 4, -0.35, 0, Math.PI * 2), "#ff5a4e99", 1.1);
  }
  stroke(c, () => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      c.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      c.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
    }
  }, greater ? ORBIT.red : ORBIT.amber, 1.4);
  glow(c, greater ? ORBIT.red : ORBIT.amber, 8);
  fill(c, () => c.arc(0, 0, 6.6, 0, Math.PI * 2), greater ? "#c8323a" : "#d97a1e");
  noGlow(c);
  fill(c, () => c.arc(0, 0, 4.2, 0, Math.PI * 2), "#ffe0a0");
  fill(c, () => c.ellipse(0, 0, 1.4, 3.4, 0, 0, Math.PI * 2), ORBIT.space);
  c.restore();
}

/** How each strength is drawn: four creatures, which the rank chevrons
 * tell apart. */
const ENEMIES: Record<EnemyStrength, (c: CanvasRenderingContext2D) => void> = {
  weak: spore,
  normal: (c) => jelly(c, 0.9),
  strong: (c) => jelly(c, 1.08),
  elite: sentinel,
  boss: (c) => hiveCore(c, false),
  greaterBoss: (c) => hiveCore(c, true),
};

/** One tile's contents in tile space (24x24). */
const contents = contentsFrom({
  enemy(c, t) {
    const e = t.enemy, strength = e?.strength ?? "normal";
    (ENEMIES[strength] ?? ENEMIES.normal)(c);
    rankChevrons(c, strength, ORBIT.amber, ORBIT.space);
    // A Ranged enemy's arrow at the top right, and a Fast enemy's
    // chevrons there, or below the arrow when it has both.
    if (e?.ranged) stroke(c, () => { c.moveTo(16.5, 6.5); c.lineTo(22, 1); c.moveTo(18.5, 1); c.lineTo(22, 1); c.lineTo(22, 4.5); }, ORBIT.amber, 1.2);
    const fy = e?.ranged ? 7 : 0;
    if (e?.fast) stroke(c, () => { c.moveTo(16, 1 + fy); c.lineTo(18.5, 3 + fy); c.lineTo(16, 5 + fy); c.moveTo(19.5, 1 + fy); c.lineTo(22, 3 + fy); c.lineTo(19.5, 5 + fy); }, ORBIT.cyan, 1.2);
  },
  key(c, t) {
    // A keycard in the key's colour, its chip and stripe dark.
    const color = keyColor(t.color);
    glow(c, color, 5);
    fill(c, () => roundRect(c, 5, 6, 14, 12, 2), color);
    noGlow(c);
    fill(c, () => c.rect(5, 8.5, 14, 2), "#00000066");
    fill(c, () => roundRect(c, 7, 12, 4, 3.5, 0.6), "#fff4c8");
    fill(c, () => c.rect(13, 13, 4, 1), "#00000066");
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "wood") {
      // A barricade of cargo crates.
      fill(c, () => c.rect(3, 3, 18, 18), "#6b4a26");
      for (const [bx, by] of [[3, 3], [12, 3], [3, 12], [12, 12]]) {
        fill(c, () => c.rect(bx + 0.6, by + 0.6, 7.8, 7.8), ORBIT.crate);
        stroke(c, () => { c.moveTo(bx + 1.5, by + 1.5); c.lineTo(bx + 7.5, by + 7.5); }, "#6b4a26", 1);
      }
      return;
    }
    airlock(c);
    if (rule?.type === "fullHp") {
      heart(c);
      return;
    }
    // A lit stripe across the doors per key it takes, in that key's
    // colour.
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    const n = Math.max(1, keys.length);
    glow(c, keyColor(keys[0]), 4);
    for (let i = 0; i < n; i++) {
      const y = 12 - (n - 1) * 1.8 + i * 3.6 - 1;
      fill(c, () => c.rect(4.5, y, 15, 2), keyColor(keys[i]));
    }
    noGlow(c);
    if (rule?.type === "keys" && rule.heart) fill(c, () => heartPath(c, 12, 15.5, 0.32), ORBIT.magenta);
  },
  potion(c, t) {
    // A med canister: a glass tube of glowing fluid under a steel cap,
    // teal, or rose for the red potion.
    const color = t.color === "red" ? "#ff6f9a" : "#4fe3c8";
    fill(c, () => roundRect(c, 8, 7, 8, 14, 3), "#1b2a44");
    stroke(c, () => roundRect(c, 8, 7, 8, 14, 3), ORBIT.hullLight, 1);
    glow(c, color, 5);
    fill(c, () => roundRect(c, 9, 11, 6, 9, 2.2), color);
    noGlow(c);
    fill(c, () => c.rect(10, 12, 1.2, 6), "#ffffff88");
    fill(c, () => roundRect(c, 7.5, 3.5, 9, 4, 1), ORBIT.hullLight);
    fill(c, () => c.rect(9, 4.5, 6, 1), ORBIT.white);
  },
  attack(c) {
    // A power cell's bolt, amber.
    glow(c, ORBIT.amber, 6);
    fill(c, () => { c.moveTo(14, 2.5); c.lineTo(6, 13.5); c.lineTo(11.5, 13.5); c.lineTo(9.5, 21.5); c.lineTo(18, 9.5); c.lineTo(12.5, 9.5); c.closePath(); }, ORBIT.amber);
    noGlow(c);
    fill(c, () => { c.moveTo(13, 5); c.lineTo(8.5, 12); c.lineTo(10.5, 12); c.closePath(); }, "#fff0c8");
  },
  defense(c) {
    // A shield emitter: two cyan hexagons, one inside the other.
    glow(c, ORBIT.cyan, 5);
    stroke(c, () => hexagon(c, 12, 12, 8.5), ORBIT.cyan, 1.6);
    noGlow(c);
    fill(c, () => hexagon(c, 12, 12, 4.5), "#7fe3ff55");
    stroke(c, () => hexagon(c, 12, 12, 4.5), ORBIT.cyan, 1);
  },
  reward: paintChest,
  openedChest: paintChest,
  treasure(c) {
    // A star crystal: a four-pointed golden sparkle.
    glow(c, "#ffd84a", 7);
    fill(c, () => {
      c.moveTo(12, 3); c.quadraticCurveTo(13, 11, 21, 12); c.quadraticCurveTo(13, 13, 12, 21);
      c.quadraticCurveTo(11, 13, 3, 12); c.quadraticCurveTo(11, 11, 12, 3);
    }, "#ffd84a");
    noGlow(c);
    fill(c, () => c.arc(12, 12, 1.8, 0, Math.PI * 2), "#fffbe8");
  },
  stairs(c) {
    // A lift pad: a ring of light on the deck under a beam and an arrow
    // pointing up.
    fill(c, () => c.ellipse(12, 18, 9, 3.5, 0, 0, Math.PI * 2), ORBIT.hullDark);
    fill(c, () => { c.moveTo(4.5, 18); c.lineTo(7, 4); c.lineTo(17, 4); c.lineTo(19.5, 18); c.closePath(); }, "#7fe3ff22");
    glow(c, ORBIT.cyan, 5);
    stroke(c, () => c.ellipse(12, 18, 9, 3.5, 0, 0, Math.PI * 2), ORBIT.cyan, 1.4);
    stroke(c, () => { c.moveTo(8, 11); c.lineTo(12, 6.5); c.lineTo(16, 11); c.moveTo(12, 6.5); c.lineTo(12, 15); }, ORBIT.white, 1.6);
    noGlow(c);
  },
  oneway(c) {
    // A gravity lift's chevrons, pointing the one way it goes.
    glow(c, ORBIT.cyan, 4);
    stroke(c, () => { c.moveTo(6, 12); c.lineTo(12, 6); c.lineTo(18, 12); c.moveTo(6, 18); c.lineTo(12, 12); c.lineTo(18, 18); }, ORBIT.cyan, 1.8);
    noGlow(c);
  },
});
/** A reward chest, shut or opened (`reward`, `openedChest`). */
function paintChest(c: CanvasRenderingContext2D, t: Tile) {
  // A supply pod: a rounded crate with an amber band and a status
  // light; open and dark once emptied.
  if (t.kind === "openedChest") {
    fill(c, () => roundRect(c, 4, 11, 16, 9, 2), ORBIT.hullDark);
    stroke(c, () => roundRect(c, 4, 11, 16, 9, 2), ORBIT.hullLight, 1);
    stroke(c, () => { c.moveTo(4.5, 10); c.lineTo(7, 4.5); c.lineTo(18, 4.5); c.lineTo(19.5, 10); }, ORBIT.hullLight, 1);
    return;
  }
  fill(c, () => roundRect(c, 4, 7, 16, 13, 3), ORBIT.hullLight);
  fill(c, () => c.rect(4, 12, 16, 3), ORBIT.amber);
  fill(c, () => c.rect(4, 9.5, 16, 0.8), ORBIT.hull);
  glow(c, ORBIT.green, 4);
  fill(c, () => c.arc(17, 17.5, 1.1, 0, Math.PI * 2), ORBIT.green);
  noGlow(c);
}

function hexagon(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath();
}

/** An airlock: a steel frame round two doors that meet in the middle. */
function airlock(c: CanvasRenderingContext2D) {
  fill(c, () => roundRect(c, 2.5, 2, 19, 20, 3), ORBIT.hullLight);
  fill(c, () => roundRect(c, 4, 3.5, 16, 17, 2), ORBIT.hull);
  fill(c, () => c.rect(11.6, 3.5, 0.8, 17), ORBIT.hullDark);
  // Warning ticks on the sill.
  for (let i = 0; i < 4; i++) fill(c, () => c.rect(5 + i * 4, 20.5, 2, 1.5), ORBIT.amber);
}

function heartPath(c: CanvasRenderingContext2D, x: number, y: number, k: number) {
  c.moveTo(x, y + 16 * k);
  c.bezierCurveTo(x - 10 * k, y + 9 * k, x - 7 * k, y, x, y + 4 * k);
  c.bezierCurveTo(x + 7 * k, y, x + 10 * k, y + 9 * k, x, y + 16 * k);
}
/** The Heart Door's heart on its own, as its toll rises off the door: a
 * glowing magenta heart. */
function heart(c: CanvasRenderingContext2D) {
  glow(c, ORBIT.magenta, 6);
  fill(c, () => heartPath(c, 12, 5, 0.8), ORBIT.magenta);
  noGlow(c);
}

/** A torch: a beacon on a short mast, its amber light blinking slowly
 * while lit; dark once put out. */
function torch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  fill(c, () => c.rect(11, 12, 2, 9), ORBIT.hullLight);
  fill(c, () => roundRect(c, 8, 19.5, 8, 2.5, 1), ORBIT.hullLight);
  fill(c, () => roundRect(c, 9, 7, 6, 6, 1.5), ORBIT.hull);
  if (!t.active) return;
  const pulse = f.look.reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(f.now / 260 + t.x * 1.7 + t.y);
  c.globalAlpha = pulse;
  glow(c, ORBIT.amber, 10);
  fill(c, () => c.arc(12, 9.5, 2.4, 0, Math.PI * 2), ORBIT.amber);
  noGlow(c);
  c.globalAlpha = 1;
  fill(c, () => c.arc(11.4, 8.9, 0.8, 0, Math.PI * 2), "#fff0c8");
}

/** The hero: a little astronaut, a round white helmet with an amber visor
 * over a suit and its pack, turned the way it last stepped sideways. */
function hero(c: CanvasRenderingContext2D, facing: Facing) {
  c.save();
  if (facing.dx < 0) {
    c.translate(24, 0);
    c.scale(-1, 1);
  }
  // The pack, then the suit and boots.
  fill(c, () => roundRect(c, 4.5, 10, 4.5, 8, 1.2), "#9fb2d0");
  fill(c, () => roundRect(c, 7, 11, 10, 9, 3), ORBIT.white);
  fill(c, () => { c.rect(8, 19.5, 3, 2.5); c.rect(13, 19.5, 3, 2.5); }, "#9fb2d0");
  fill(c, () => c.rect(10, 14, 4, 2.5), ORBIT.cyan);
  // The helmet and its visor.
  fill(c, () => c.arc(12.5, 8, 6, 0, Math.PI * 2), ORBIT.white);
  fill(c, () => roundRect(c, 11, 5, 7, 5.5, 2.5), ORBIT.visor);
  fill(c, () => roundRect(c, 12.3, 5.8, 2.2, 1.6, 0.8), "#fff4dc");
  c.restore();
}

/** A soft dark rim round the board, as through a viewport. */
function over(f: FrameContext) {
  const c = f.c, w = f.width;
  if (typeof c.createRadialGradient !== "function") return;
  const g = c.createRadialGradient(w / 2, w / 2, w * 0.38, w / 2, w / 2, w * 0.75);
  g.addColorStop(0, "#04060f00");
  g.addColorStop(1, "#04060f99");
  c.fillStyle = g;
  c.fillRect(0, 0, w, w);
}

export const ORBIT_BOARD: ThemedBoard = { ground, contents, heart, torch, hero, over };
