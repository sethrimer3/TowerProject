import { START_X, TOWER_START_X, TOWER_WIDTH, WIDTH } from "./config.ts";
import type { Mode, Tile } from "./entities.ts";
import type { Board } from "./generation.ts";
import { tileRandom } from "./themes.ts";

export const OUTSIDE_SIZE = 20;
export const ENTRANCE_Y = 12;
export type Weather = "cloudy" | "sunny" | "rain" | "storm";
export function weatherForRoll(roll: number): Weather {
  return roll < 0.4 ? "cloudy" : roll < 0.7 ? "sunny" : roll < 0.9 ? "rain" : "storm";
}
export const outsideWeather = (seed: number) => weatherForRoll(tileRandom(81, 37, seed));

export class OutsideWorld implements Board {
  width: number;
  floor = 0;
  entranceX: number;
  constructor(public seed: number, public mode: Mode) {
    this.width = mode === "tower" ? TOWER_WIDTH : WIDTH;
    this.entranceX = mode === "tower" ? TOWER_START_X : START_X;
  }
  tile(x: number, y: number): Tile {
    const d = Math.abs(x - this.entranceX);
    if (x < 0 || x >= this.width || y < 0 || y >= OUTSIDE_SIZE) return { kind: "wall" };
    if (x === this.entranceX && y === ENTRANCE_Y) return { kind: "stairs" };
    if (y >= ENTRANCE_Y || d >= 9 || (d > 2 && tileRandom(x, y, this.seed) < 0.26)) return { kind: "wall" };
    return { kind: "floor" };
  }
  step(x: number, y: number, dx: number, dy: number) {
    const xx = x + dx, yy = y + dy;
    return xx < 0 || xx >= this.width || yy < 0 || yy >= OUTSIDE_SIZE ? null : { x: xx, y: yy };
  }
  clear() {}
}

export function drawForestTile(c: CanvasRenderingContext2D, t: Tile, x: number, y: number, seed: number, center: number) {
  const r = tileRandom(x, y, seed), path = Math.abs(x - center) <= (y % 5 === 2 ? 1 : 0);
  c.fillStyle = path ? "#625d42" : r < 0.5 ? "#294d35" : "#30543a";
  c.fillRect(0, 0, 24, 24);
  c.fillStyle = path ? "#8d856033" : "#69985555";
  for (let i = 0; i < 4; i++) {
    const xx = tileRandom(x * 5 + i, y, seed) * 21;
    const yy = tileRandom(x, y * 5 + i, seed) * 21;
    c.fillRect(xx, yy, 1, path ? 1 : 3);
    if (!path) c.fillRect(xx - 1, yy - 1, 1, 2);
  }
  if (t.kind === "stairs") return;
  if (t.kind === "wall") {
    if (r > 0.2) {
      c.fillStyle = "#162c2566"; c.beginPath(); c.ellipse(12, 18, 11, 5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#64513b"; c.fillRect(10, 11, 4, 12);
      for (let i = 0; i < 3; i++) {
        c.fillStyle = ["#1b392b", "#24503a", "#356548"][i];
        c.beginPath(); c.moveTo(12, i * 4); c.lineTo(2 + i, 14 + i * 3); c.lineTo(22 - i, 14 + i * 3); c.closePath(); c.fill();
      }
    } else {
      c.fillStyle = "#606e65"; c.beginPath(); c.moveTo(3, 17); c.lineTo(5, 8); c.lineTo(15, 5); c.lineTo(21, 13); c.lineTo(18, 21); c.lineTo(7, 21); c.fill();
      c.fillStyle = "#94a08a"; c.fillRect(7, 8, 8, 2);
      c.fillStyle = "#55724b"; c.fillRect(4, 18, 9, 3);
    }
  } else if (!path && r > 0.8) {
    c.fillStyle = "#82927b"; c.fillRect(5, 17, 4, 2); c.fillRect(14, 8, 3, 2);
  }
}

// World-space landmark: its doorway meets the actual interactive stairs tile.
export function drawEntrance(c: CanvasRenderingContext2D, mode: Mode, center: number) {
  const x = center * 24 + 12, top = 0, base = (OUTSIDE_SIZE - 1 - ENTRANCE_Y) * 24;
  c.save();
  if (mode === "tower") {
    c.fillStyle = "#263333"; c.fillRect(x - 100, top, 200, base + 6);
    c.fillStyle = "#66716c"; c.fillRect(x - 83, top, 166, base);
    for (let row = 0; row < 9; row++) for (let col = -4; col < 4; col++) {
      c.fillStyle = (row + col) % 3 ? "#748078" : "#818b7e";
      c.fillRect(x + col * 24 + (row % 2) * 12, row * 19, 22, 17);
    }
    c.fillStyle = "#3e4c49"; c.fillRect(x - 100, 0, 20, base + 2); c.fillRect(x + 80, 0, 20, base + 2);
    c.fillStyle = "#9ba38c"; c.fillRect(x - 102, 0, 24, 8); c.fillRect(x + 78, 0, 24, 8);
    for (const dx of [-55, 55]) { c.fillStyle = "#243333"; c.fillRect(x + dx - 5, 35, 10, 30); c.fillStyle = "#a3a184"; c.fillRect(x + dx - 7, 65, 14, 3); }
    c.fillStyle = "#b1b49a"; c.beginPath(); c.arc(x, base - 22, 28, Math.PI, 0); c.lineTo(x + 28, base + 3); c.lineTo(x - 28, base + 3); c.fill();
    c.fillStyle = "#131f20"; c.beginPath(); c.arc(x, base - 22, 20, Math.PI, 0); c.lineTo(x + 20, base + 3); c.lineTo(x - 20, base + 3); c.fill();
    for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? "#909888" : "#717d72"; c.fillRect(x - 22 - i * 2, base + i * 6, 44 + i * 4, 5); }
    c.fillStyle = "#416648"; c.fillRect(x - 78, 80, 3, 53); c.fillRect(x + 72, 13, 3, 68);
  } else {
    c.fillStyle = "#59665f";
    c.beginPath(); c.moveTo(x - 160, base + 5); c.lineTo(x - 146, 70); c.lineTo(x - 103, 19); c.lineTo(x - 74, 33); c.lineTo(x - 25, -16); c.lineTo(x + 48, 8); c.lineTo(x + 89, 3); c.lineTo(x + 139, 69); c.lineTo(x + 161, base + 9); c.closePath(); c.fill();
    c.fillStyle = "#758278"; c.beginPath(); c.moveTo(x - 103, 19); c.lineTo(x - 74, 33); c.lineTo(x - 48, 116); c.lineTo(x - 133, 93); c.fill();
    c.fillStyle = "#414f4c"; c.beginPath(); c.moveTo(x + 48, 8); c.lineTo(x + 26, 101); c.lineTo(x + 151, base); c.lineTo(x + 89, 3); c.fill();
    c.fillStyle = "#314d39"; c.beginPath(); c.moveTo(x - 146, 70); c.lineTo(x - 107, 90); c.lineTo(x - 111, 140); c.lineTo(x - 159, base); c.fill();
    c.fillStyle = "#182725"; c.beginPath(); c.moveTo(x - 35, base + 9); c.lineTo(x - 29, base - 34); c.lineTo(x - 9, base - 57); c.lineTo(x + 21, base - 46); c.lineTo(x + 38, base + 9); c.closePath(); c.fill();
    c.fillStyle = "#0e191a"; c.beginPath(); c.moveTo(x - 22, base + 8); c.lineTo(x - 16, base - 26); c.lineTo(x + 10, base - 36); c.lineTo(x + 23, base + 8); c.fill();
    c.fillStyle = "#828c75"; c.fillRect(x - 14, base + 6, 28, 4); c.fillRect(x - 18, base + 15, 36, 4);
  }
  c.restore();
}
