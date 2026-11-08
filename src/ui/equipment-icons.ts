import { kitIcon } from "../sprites/kit.ts";
import { itemDef, type CategoryId, type EquipMaterialId } from "../equipment/catalog.ts";

// Pixel icons for Equipment, drawn as inline SVG from 12×12 rows so they
// stay crisp at any size: one per category, one per piece but each
// starting category's first Standard (which wears its category's), and one
// per upgrade material, in
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
/** Also used by the offline PNG exporter; gameplay never changes it. */
export const ICON_PALETTE = PALETTE;

/** Mirrors each six-letter half-row into twelve. */
const mirrored = (rows: string[]) => rows.map((r) => r + [...r].reverse().join(""));

const CATEGORY_ROWS: Record<CategoryId, string[]> = {
  weapon: [
    ".....##.....", "....#ws#....", "....#ws#....", "....#ws#....", "....#ws#....", "....#ws#....",
    "..########..", "..#gyggyg#..", "..########..", "....#bb#....", "....#gg#....", ".....##.....",
  ],
  shield: mirrored([
    "......", ".#####", "#sssss", "#swwww", "#swggg", "#swgww", ".#wgwg", ".#wggg", "..#www", "...#ww", "....#w", ".....#",
  ]),
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
  amulet: mirrored([
    ".#....", "..#...", "...#..", "....#.", "....##", "...#aa", "..#aao", "..#aaa", "..#aaa", "...#aa", "....##", "......",
  ]),
};

/** Drawn pieces the catalogue's icons are made from: the future corners'
 * Uniques as they are, and the pieces the starting categories' new
 * Uniques are recoloured from. */
const DRAWN: Record<string, string[]> = {
  wardensShield: mirrored([
    ".#####", "#ygggg", "#gssss", "#gswww", "#gswgg", "#gswgw", "#gswgw", ".#swgg", ".#swww", "..#sww", "...#sw", "....##",
  ]),
  bulwarkShield: mirrored([
    "...###", "..#sss", ".#swww", "#swwws", "#swsss", "#swsww", "#swsww", "#swsss", "#swwws", ".#swww", "..#sss", "...###",
  ]),
  dawnShield: mirrored([
    "......", "..####", ".#gyyy", "#gywww", "#gwwoo", "#gwwoy", "#gyooo", ".#wwoy", ".#wwoo", "..#www", "...#ww", "....##",
  ]),
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
  hobnails: [
    "............", ".###....###.", "#wsd#..#wsd#", ".#s#....#s#.", ".#s#....#s#.", "..#......#..",
    "....###.....", "...#wsd#....", "....#s#.....", "....#s#.....", ".....#......", "............",
  ],
};

/** `rows` with each letter of `map` swapped for its colour letter. */
const recolor = (rows: string[], map: Record<string, string>) => rows.map((r) => [...r].map((c) => map[c] ?? c).join(""));
/** A hammer, for the Kinetic Mallet. */
const MALLET = [
  "............", ".##########.", "#sswwwwwwss#", "#sdwccccwds#", "#sswwwwwwss#", ".####lb####.",
  "....#bl#....", "....#bl#....", "....#lb#....", "....#bl#....", "...#gggg#...", "...######...",
];
const C = CATEGORY_ROWS, D = DRAWN;
/** Each piece's own icon, by definition id: every Unique's, and in the
 * starting categories every Standard's but the first, which wears its
 * category's; the new pieces are recoloured from drawn ones. */
const ITEM_ROWS: Record<string, string[]> = {
  // Swords
  squiresBlade: recolor(C.weapon, { w: "t", s: "l" }),
  steelBroadsword: recolor(C.weapon, { w: "m", s: "n", g: "s", y: "w" }),
  raptorBlade: D.bloodpriceBlade,
  kineticMallet: MALLET,
  soulReaper: D.reapersScythe,
  // Shields
  oakenBuckler: recolor(C.shield, { s: "b", w: "l", g: "t" }),
  kiteShield: recolor(C.shield, { w: "p", s: "r", g: "y" }),
  zenithGuard: D.dawnShield,
  cradleOfLife: recolor(D.bulwarkShield, { s: "f", w: "i" }),
  amberPrison: recolor(D.wardensShield, { s: "a", w: "o" }),
  // Chestplates
  scaleMail: recolor(C.chestplate, { w: "t", s: "l" }),
  ringmailVest: recolor(C.chestplate, { w: "s", s: "d" }),
  equilibriumTether: D.bastionPlate,
  mobiusCipher: recolor(D.verdantMail, { i: "c", e: "u", f: "z" }),
  mirrorVault: recolor(D.giantsHauberk, { s: "m", d: "n" }),
  // Helmets
  acolytesHood: recolor(C.helmet, { w: "v", s: "q" }),
  greatHelm: recolor(C.helmet, { w: "s", s: "d" }),
  lichKingsCrown: recolor(D.scholarsCirclet, { g: "v", y: "i", c: "i", w: "x" }),
  psionicTempest: recolor(D.sentinelVisor, { w: "c", s: "u", p: "m", r: "n", k: "z" }),
  challengersDefiance: recolor(D.minersHelm, { g: "r", y: "p", w: "o", l: "d" }),
  // Boots
  rangersBoots: recolor(C.boots, { l: "e", t: "i", b: "f" }),
  ridingBoots: recolor(C.boots, { l: "k", t: "s", b: "d" }),
  chronoStrider: D.fleetstepBoots,
  jackpotSpurs: recolor(D.delversGreaves, { w: "y", s: "g", d: "l", a: "r" }),
  hoarderGreaves: recolor(D.pathfinderTreads, { x: "y", e: "g", f: "l" }),
  // The future corners' Uniques
  ...Object.fromEntries(["brawlersWraps", "locksmithsGloves", "alchemistsGloves", "magpieMantle", "gatherersShroud", "pilgrimsCape",
    "provisionersBelt", "championsGirdle", "merchantsSash", "heartOfTheGrove", "sagesLocket", "phoenixTalisman"].map((id) => [id, D[id]!])),
};

/** A piece's rows, by definition id: its own, or its category's. */
export const pieceRows = (def: string) => ITEM_ROWS[def] ?? CATEGORY_ROWS[itemDef(def)?.category ?? "weapon"];
/** Only request PNGs that were exported, including category fallbacks for
 * Standard pieces that intentionally share their category's silhouette. */
export const pieceSpriteId = (def: string) => `equip-${ITEM_ROWS[def] ? def : itemDef(def)?.category ?? "weapon"}`;
/** Icon rows as coloured pixels on their 12×12 grid, for drawing on a canvas. */
const pixels = (rows: string[]) => rows.flatMap((row, y) => [...row].flatMap((ch, x) => (PALETTE[ch] ? [{ x, y, color: PALETTE[ch] }] : [])));
/** A piece's icon as coloured pixels (the slag of an assemble, a boss's
 * drop rising off the board). */
export const iconPixels = (def: string) => pixels(pieceRows(def));
/** An upgrade material's icon as coloured pixels (a kill's materials rising
 * off the board). */
export const materialPixels = (id: EquipMaterialId) => pixels(MATERIAL_ROWS[id]);
/** A category's icon (the shape of its piece), for filters and empty places. */
export const categoryIcon = (id: CategoryId, className = "equip-icon") => kitIcon(`equip-${id}`, "", className);
/** A piece's own icon, by its definition id. */
export const itemIcon = (def: string, className = "equip-icon") => kitIcon(pieceSpriteId(def), "", className);
/** The rows of every icon, for tests. */
export const ICON_ROWS = { ...CATEGORY_ROWS, ...ITEM_ROWS, ...MATERIAL_ROWS };
/** An upgrade material's icon. */
export const materialIcon = (id: EquipMaterialId, className = "mat-icon") => kitIcon(`equip-${id}`, "", className);

/** The action icons: a hammer (dismantle), three arrows into one (merge), an
 * arrow up (level up), a padlock (locked). */
export const ACTION_ICONS = {
  dismantle: kitIcon("hammer", "", "act-icon"),
  merge: kitIcon("merge", "", "act-icon"),
  upgrade: kitIcon("arrow-up", "", "act-icon"),
  lock: kitIcon("lock", "", "act-icon"),
};
