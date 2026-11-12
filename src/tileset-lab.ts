import type { Tile } from "./entities.ts";
import type { DungeonTileset } from "./sprites/dungeon.ts";

export type TilesetExample = { id: string; name: string; description: string; tier: number; experimental: boolean; material?: DungeonTileset };
const references = [
  ["I", "Weathered Keep", "The original fitted masonry and mixed flagstones."],
  ["II", "Limestone Hall", "Warm ashlar blocks and rectangular paving."],
  ["III", "Basalt Gallery", "Cool basalt and octagonal paving."],
  ["IV", "Overgrown Ruins", "Green polygon cobbles and broad weathered blocks."],
  ["V", "Crimson Brick", "Wine-red brick and herringbone floors."],
  ["VI", "Azure Vault", "Blue diamond paving and long stone courses."],
  ["VII", "Marble Court", "Pale marble squares and monumental blocks."],
  ["VIII", "Brass Bastion", "Umber geometric paving and brass-inlaid stone."],
  ["IX", "Violet Geode", "Triangular crystal paving and faceted masonry."],
] as const;
export const TILESET_EXAMPLES: readonly TilesetExample[] = [
  ...references.map(([numeral, name, description],i)=>({id:`T-${numeral}`,name,description,tier:i+1,experimental:false})),
  ...[
    ["A","iron","Iron Citadel","Riveted iron plates, deep bevels and restrained brass joints."],
    ["B","tideglass","Tideglass Mosaic","Blue-green diamond mosaics and carved wave-stone blocks."],
    ["C","reliquary","Bone Reliquary","Ivory hexagonal paving and pointed arches with wine-red recesses."],
  ].map(([letter,key,name,description])=>({id:`EXP-${letter}`,name,description,tier:1,experimental:true,
    material:{floor:`dungeon-lab-${key}-floor`,walls:`dungeon-lab-${key}-walls`}})),
];
export const DEFAULT_TILESET_EXAMPLE = 9;
export const exampleIndex = (index: number) => ((Math.trunc(index) % TILESET_EXAMPLES.length) + TILESET_EXAMPLES.length) % TILESET_EXAMPLES.length;
export const LAB_SIZE = 13;
export const LAB_SEED = 1103;
/** A presentation fixture, never a generated or saved run. Rows face screen south. */
export const LAB_ROOM = [
  "#############", "#############", "##.........##", "##..##.....##", "##..##.##..##", "##.....##..##",
  "##.........##", "##.##......##", "##.##......##", "##.........##", "##.........##", "######.######", "######.######",
] as const;
export const LAB_HERO = {x:6,y:2};
export const LAB_TORCHES = [{x:2,y:5},{x:10,y:8}] as const;
const props: Record<string, Tile> = {
  "10,10":{kind:"stairs"}, "3,3":{kind:"treasure"}, "9,7":{kind:"potion"}, "8,2":{kind:"key",color:"yellow"},
  "6,3":{kind:"door",color:"blue"}, "3,8":{kind:"enemy",enemy:{name:"Skeleton",hp:20,attack:5,defense:1,tier:0,strength:"normal"}},
};
export function labTile(x:number,y:number): Tile {
  if(LAB_ROOM[LAB_SIZE-1-y]?.[x]!==".")return {kind:"wall"};
  return props[`${x},${y}`] ?? {kind:"floor"};
}
