import { itemDef, type CategoryId, type EquipMaterialId } from "../equipment/catalog.ts";

// Pixel icons for Equipment, drawn as inline SVG from 12×12 rows so they
// stay crisp at any size: one per category, one per Unique piece (and the
// Silver Band) and one per upgrade material, in
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
  v: "#9a5ae0", q: "#5a3290", h: "#5e1414", f: "#2e6a2e", i: "#a6dc6e",
  u: "#3a68c8", z: "#2a3a6a", x: "#efe2c0",
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

/** Each Unique piece's own icon (and the Silver Band's), by definition id;
 * every other Standard piece wears its category's. */
const ITEM_ROWS: Record<string, string[]> = {
  kingsbane: [
    ".....##.....", "....#dk#....", "....#dr#....", "....#dk#....", "....#dr#....", "....#dk#....",
    ".#.#.##.#.#.", "#y#g#rr#g#y#", "#gggggggggg#", ".####bb####.", "....#gg#....", ".....##.....",
  ],
  reapersScythe: [
    "..#######...", ".#wwwwwss##.", "#ws#####dlb#", "#s#.....#lb#", "##......#lb#", "........#lb#",
    "........#lb#", "........#ll#", "........#lb#", "........#lb#", "........#lb#", "........####",
  ],
  bloodpriceBlade: [
    "..........##", ".........#p#", "........#pr#", ".......#pr#.", "......#pr#..", ".##..#pr#...",
    ".#h##pr#....", "..#hhr#.....", "..#bhh##....", ".#b##hh#....", "#b#...##....", "y#..........",
  ],
  bastionPlate: [
    "............", "###..##..###", "#ws######sw#", "#sdg#ww#gds#", "####wwww####", "..#swwwws#..",
    "..#swwwws#..", "..#gyggyg#..", "..#swwwws#..", "..#swwwws#..", "..#sddddd#..", "..########..",
  ],
  giantsHauberk: [
    "..##....##..", ".#sd####ds#.", "#sdsdsdsdsd#", "#dsdsdsdsds#", "#sd#sdds#ds#", "##.#dssd#.##",
    "...#sdds#...", "...#dssd#...", "...#sdds#...", "...#dssd#...", "..#sdsdsds#.", "..#########.",
  ],
  verdantMail: [
    "............", ".##......##.", "#ie#....#ei#", "#iie####eii#", ".#eiiiiiiie#", ".#eiiiffiie#",
    "..#eiffffe#.", "..#eifffie#.", "..#eiifiie#.", "...#eiiie#..", "...######...", "............",
  ],
  sentinelVisor: [
    ".....##.....", "....#pr#....", "..########..", ".#wwwwwwws#.", "#swwwwwwwss#", "#s########s#",
    "#swwwwwwwss#", "#swwkwwkwss#", "#swwwwwwwss#", ".#ssssssss#.", "..########..", "............",
  ],
  scholarsCirclet: [
    "............", "............", "............", ".....##.....", "....#cw#....", "..###cc###..",
    ".#ygg##ggy#.", "#g##....##g#", "#g#......#g#", ".#g##..##g#.", "..#gggggg#..", "...######...",
  ],
  minersHelm: [
    "............", "....####....", "..##gggg##..", ".#gg#yw#gg#.", ".#gg#yy#gg#.", "#gggg##gggg#",
    "#gggggggggg#", "############", "#llllllllll#", "############", "............", "............",
  ],
  brawlersWraps: [
    "............", "............", "..#########.", ".#pxpxpxpxx#", ".#xxxxxxxxx#", ".#s#s#s#s#x#",
    ".#xxxxxxxxx#", "..#xxxxxxx#.", "..#sxsxsxs#.", "..#xsxsxsx#.", "..#########.", "............",
  ],
  locksmithsGloves: [
    "............", "....#.#.#...", "...#t#t#t#..", ".#.#n#n#n#..", "#t##nnnnnn#.", "#nn#nyyynn#.",
    ".#nnnykynn#.", "..#nnykyn#..", "..#zzzzzz#..", "..#gggggg#..", "..########..", "............",
  ],
  alchemistsGloves: [
    "....#.#.#...", "...#v#v#v#..", "...#v#v#v#..", ".#.#v#v#v#..", "#v##vvvvvv#.", "#vv#vv#w#v#.",
    ".#vvv#iie##.", "..#vv#iee#..", "..#qq#####..", "..#qqqqqq#..", "..########..", "............",
  ],
  fleetstepBoots: [
    "............", "...######...", "##.#cccc#...", "#w##cwcc#...", ".#w#cwcc#...", "##w#cccc#...",
    "#ww#cccc###.", ".###ccccccc#", "..#cccccccc#", "..#uuuuuuuu#", "..##########", "............",
  ],
  pathfinderTreads: [
    "............", "..########..", "..#xxxxxx#..", "...#efxe#...", "...#exfe#...", "...#efxe#...",
    "...#exfe###.", "...#eeeeeee#", "..#feeeeeee#", "..#ffffffff#", "..#k#k#k#k##", "............",
  ],
  delversGreaves: [
    "..########..", ".#wwwwwwss#.", ".#sddaadds#.", "..########..", "...#wwss#...", "...#wwss#...",
    "...#wwss###.", "...#wwwssss#", "..#wwwwssss#", "..#dddddddd#", "..##########", "............",
  ],
  magpieMantle: [
    "...######...", "..#kkkkkk#..", "..#gyggyg#..", ".#kkkkkkkk#.", ".#kkukkukk#.", ".#kwukkuwk#.",
    "#kkwukkuwkk#", "#kkkwkkwkkk#", "#kwkkwwkkwk#", "#wkwkwwkwkw#", "############", "............",
  ],
  gatherersShroud: [
    "....####....", "...#feef#...", "..#fkkkkf#..", "..#fkkkkf#..", ".#fekkkkef#.", ".#ffeeeeff#.",
    "#fffeeeefff#", "#ffeieeieff#", "#fefieeifef#", "#feeieeieef#", "############", "............",
  ],
  pilgrimsCape: [
    "...######...", "..#xxxxxx#..", "..#bbggbb#..", ".#xxxxxxxx#.", ".#xxxggxxx#.", ".#xxgyygxx#.",
    "#xxgyggygxx#", "#xxxggggxxx#", "#xxxxxxxxxx#", "#xtxxttxxtx#", "############", "............",
  ],
  provisionersBelt: [
    "............", "............", "############", "#llll#gg#ll#", "############", ".####...#b#.",
    "#tllt#.#prr#", "#llll#.#rrr#", "#llll#.#rrr#", ".####...###.", "............", "............",
  ],
  championsGirdle: [
    "............", "............", "...######...", "####gyyg####", "#gg#yrry#gg#", "#bb#yrry#bb#",
    "#gg#gyyg#gg#", "####gggg####", "...######...", "............", "............", "............",
  ],
  merchantsSash: [
    "............", "............", "############", "#vvvv#ww#vv#", "#qqqq#vv#qq#", "####vv#vv###",
    "...#vv#vv#..", "..#vq#.#vq#.", "..#q#...#q#.", "..##.....##.", "............", "............",
  ],
  silverBand: [
    "............", "............", "............", "...######...", "..#wsssssw#.", ".#ws####sw#.",
    ".#s#....#s#.", ".#s#....#s#.", ".#d#....#d#.", ".#dd####dd#.", "..#dddddd#..", "...######...",
  ],
  ringOfFury: [
    ".....##.....", "....#oo#....", "...#prrp#...", "...#rrrr#...", "..########..", ".#gg####gg#.",
    ".#g#....#g#.", ".#g#....#g#.", ".#g#....#g#.", ".#gg####gg#.", "..#gggggg#..", "...######...",
  ],
  ringOfWarding: [
    "...######...", "..#ucwwcu#..", "..#ucccu#...", "...#ucu#....", "..#s#u#s#...", ".#ss####ss#.",
    ".#s#....#s#.", ".#s#....#s#.", ".#d#....#d#.", ".#dd####dd#.", "..#dddddd#..", "...######...",
  ],
  spireSignet: [
    "............", ".##########.", ".#ggkggkgg#.", ".#ggkkkkgg#.", ".#ggkyykgg#.", ".##########.",
    ".#g#....#g#.", ".#g#....#g#.", ".#g#....#g#.", ".#gg####gg#.", "..#gggggg#..", "...######...",
  ],
  heartOfTheGrove: [
    ".#........#.", "..#......#..", "...#....#...", "....#..#....", ".....##.....", "..###..###..",
    ".#iie##eef#.", "#iieeeeeeef#", "#ieeeeeeeef#", ".#eeeeeeef#.", "..#eeeeef#..", "...######...",
  ],
  sagesLocket: [
    ".#........#.", "..#......#..", "...#....#...", "....#..#....", "....####....", "...#wwws#...",
    "..#wwccss#..", "..#wckkcd#..", "..#sswccd#..", "...#sddd#...", "....####....", "............",
  ],
  phoenixTalisman: [
    ".#........#.", "..#......#..", "...#....#...", "....#..#....", ".....##.....", "##..#yy#..##",
    "#a#.#oo#.#a#", "#oa##aa##ao#", ".#oaaaaaao#.", "..#aarraa#..", "...#rppr#...", "....####....",
  ],
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

/** A piece's rows, by definition id: its own, or its category's. */
export const pieceRows = (def: string) => ITEM_ROWS[def] ?? CATEGORY_ROWS[itemDef(def)?.category ?? "weapon"];
/** A piece's icon as coloured pixels on its 12×12 grid, for drawing on a
 * canvas (the slag of an assemble). */
export const iconPixels = (def: string) =>
  pieceRows(def).flatMap((row, y) => [...row].flatMap((ch, x) => (PALETTE[ch] ? [{ x, y, color: PALETTE[ch] }] : [])));
/** A category's icon (the shape of its piece), for filters and empty places. */
export const categoryIcon = (id: CategoryId, className = "equip-icon") => pixelSvg(CATEGORY_ROWS[id], className);
/** A piece's own icon, by its definition id. */
export const itemIcon = (def: string, className = "equip-icon") => pixelSvg(pieceRows(def), className);
/** The rows of every icon, for tests. */
export const ICON_ROWS = { ...CATEGORY_ROWS, ...ITEM_ROWS, ...MATERIAL_ROWS };
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
