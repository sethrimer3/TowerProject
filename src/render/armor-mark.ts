/** An Armored enemy's mark on the Game themes' boards (enemies/armored.ts): a
 * small steel shield at the right of its tile, on a black backing, between
 * where the themes put Ranged's mark and Fast's. Every theme draws it, through
 * `contentsFrom`. Classic's baked enemies wear `COMBAT_MARKS.armored` instead. */
const PIXELS = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]] as const;
const STEEL = "#b8c2bb";

export function armorMark(c: CanvasRenderingContext2D, x = 18, y = 12) {
  for (const [fill, grow] of [["#0b0a0e", 1], [STEEL, 0]] as const) {
    c.fillStyle = fill;
    for (const [dx, dy] of PIXELS) c.fillRect(x + dx - grow, y + dy - grow, 1 + 2 * grow, 1 + 2 * grow);
  }
}
