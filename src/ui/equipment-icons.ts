import type { CategoryId, EquipMaterialId } from "../equipment/catalog.ts";

// Pixel icons for Equipment, drawn as inline SVG from 12×12 rows so they
// stay crisp at any size: one per category and one per upgrade material, in
// a shared palette with a dark outline. A row of six is the left half of a
// symmetric icon, mirrored to twelve.

/** Shared colours, by letter: `#` the outline, the rest by material. */
const PALETTE: Record<string, string> = {
  "#": "#241a12",
  w: "#e3e6e8", s: "#9aa3ab", d: "#5d6670",
  g: "#e8b84a", y: "#ffe08a",
  b: "#7a4a28", l: "#b07a44", t: "#d9a868",
  r: "#a83a30", p: "#d8645a",
  c: "#7fc8ff", m: "#d6dcf2", n: "#a9b2d6",
  a: "#f08c1e", o: "#ffd27a",
  e: "#6fa86a", k: "#3c3c44",
};

/** Mirrors each six-letter half-row into twelve. */
const mirrored = (rows: string[]) => rows.map((r) => r + [...r].reverse().join(""));

const CATEGORY_ROWS: Record<CategoryId, string[]> = {
  weapon: [
    ".....##.....", "....#ws#....", "....#ws#....", "....#ws#....", "....#ws#....", "....#ws#....",
    "..########..", "..#gyggyg#..", "..########..", "....#bb#....", "....#gg#....", ".....##.....",
  ],
  chestplate: mirrored([
    ".##...", "#ws#..", "#wws##", ".#wwww", ".#wwws", ".#wwws", "..#wws", "..#wws", "..#wws", "...#ws", "...###", "......",
  ]),
  helmet: mirrored([
    "......", "..####", ".#wwww", "#swwww", "#swwww", "#swwww", "#s####", "#s#..#", "#s#..#", "#s#..#", ".##...", "......",
  ]),
  gloves: [
    "....#.#.#...", "...#t#t#t#..", "...#t#t#t#..", ".#.#t#t#t#..", "#t##tttttt#.", "#tt#tttttt#.",
    ".#tttttttt#.", "..#tttttt#..", "..#llllll#..", "..#bbbbbb#..", "..########..", "............",
  ],
  boots: [
    "............", "...######...", "...#llll#...", "...#ltll#...", "...#ltll#...", "...#llll#...",
    "...#llll###.", "...#lllllll#", "..#llllllll#", "..#bbbbbbbb#", "..#k#k##k#k#", "............",
  ],
  cape: mirrored([
    "...###", "..#rrr", "..#gyg", ".#rrrr", ".#rrpr", ".#rrpr", "#rrrpr", "#rrrpr", "#rrprr", "#rrprr", "######", "......",
  ]),
  belt: [
    "............", "............", "............", "############", "#bbb#gggg#b#", "#lll#g##g#l#",
    "#bbb#gggg#b#", "############", "............", "............", "............", "............",
  ],
  ring: mirrored([
    "......", "....##", "...#cc", "...#cw", "..####", ".#gg##", ".#g#..", ".#g#..", ".#g#..", ".#gg##", "..#ggg", "...###",
  ]),
  amulet: mirrored([
    ".#....", "..#...", "...#..", "....#.", "....##", "...#aa", "..#aao", "..#aaa", "..#aaa", "...#aa", "....##", "......",
  ]),
};

const MATERIAL_ROWS: Record<EquipMaterialId, string[]> = {
  whetstone: [
    "............", "............", "............", "..########..", ".#wwwwwwww#.", "#sssssssssd#",
    "#sssssssssd#", "#dddddddddd#", ".##########.", "............", "............", "............",
  ],
  rivets: [
    "............", "..##....##..", ".#ws#..#ws#.", ".#sd#..#sd#.", "..##....##..", "............",
    ".....##.....", "....#ws#....", "....#sd#....", ".....##.....", "............", "............",
  ],
  padding: [
    "............", ".##########.", ".#tlttlttl#.", ".#lltllltl#.", ".#tlttlttl#.", ".#lltllltl#.",
    ".#tlttlttl#.", ".#lltllltl#.", ".#tlttlttl#.", ".##########.", "............", "............",
  ],
  leather: [
    "............", "...######...", "..#tttttl#..", ".#tttttttl#.", ".#ttlttttl#.", ".#tttttltl#.",
    ".#ttttttll#.", "..#ttltll#..", "..#tttlll#..", "...#llll#...", "....####....", "............",
  ],
  hobnails: [
    "............", ".###....###.", "#wsd#..#wsd#", ".#s#....#s#.", ".#s#....#s#.", "..#......#..",
    "....###.....", "...#wsd#....", "....#s#.....", "....#s#.....", ".....#......", "............",
  ],
  silk: [
    "............", "..########..", "..#bbbbbb#..", "...#mmmm#...", "...#mnmn#...", "...#nmnm#...",
    "...#mnmn#...", "...#nmnm#...", "..#bbbbbb#..", "..########..", "........#m#.", ".........##.",
  ],
  buckles: [
    "............", "............", "..########..", "..#gyyyyg#..", "..#g####g#..", "..#g#..#g#..",
    "..#g#..#g#..", "..#g####g#..", "..#ggggggg#.", "..#########.", "............", "............",
  ],
  moonstone: mirrored([
    "......", "......", "...###", "..#mmm", ".#mwmm", ".#mmmn", ".#mmnn", "..#mnn", "...#nn", "....##", "......", "......",
  ]),
  amber: [
    "............", ".....##.....", "....#aa#....", "....#aa#....", "...#aaao#...", "..#aaoyaa#..",
    "..#aayoaa#..", "..#aaaaaa#..", "..#aaaaaa#..", "...#aaaa#...", "....####....", "............",
  ],
};

/** A 12×12 pixel icon as an inline SVG. */
function pixelSvg(rows: string[], className: string) {
  let rects = "";
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const fill = PALETTE[ch];
    if (fill) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
  }));
  return `<svg class="${className}" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

/** A category's icon (the shape of its piece). */
export const categoryIcon = (id: CategoryId, className = "equip-icon") => pixelSvg(CATEGORY_ROWS[id], className);
/** The rows of every icon, for tests. */
export const ICON_ROWS = { ...CATEGORY_ROWS, ...MATERIAL_ROWS };
/** An upgrade material's icon. */
export const materialIcon = (id: EquipMaterialId, className = "mat-icon") => pixelSvg(MATERIAL_ROWS[id], className);

/** The action icons: a hammer (dismantle), three arrows into one (merge), an
 * arrow up (level up), a padlock (locked). */
export const ACTION_ICONS = {
  dismantle: `<svg class="act-icon" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="2" width="7" height="3" fill="#9aa3ab"/><rect x="1" y="2" width="7" height="1" fill="#e3e6e8"/><rect x="4" y="5" width="2" height="6" fill="#7a4a28"/></svg>`,
  merge: `<svg class="act-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l4 4M10 2L6 6M6 1v5M6 6v5" stroke="#e8b84a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3.5 8.5L6 11l2.5-2.5" stroke="#e8b84a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  upgrade: `<svg class="act-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5L10.5 6.5H7.6V10.5H4.4V6.5H1.5z" fill="#ffc94a" stroke="#5a3200" stroke-width="0.8" stroke-linejoin="round"/></svg>`,
  lock: `<svg class="act-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" stroke="#e3e6e8" stroke-width="1.4" fill="none"/><rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="#e8b84a"/></svg>`,
};
