export type Spot = { x: number; y: number };
export const ARENA_SIZE = 25;
export const ELEMENTAL = { x: 12, y: 12 };
export const key = ({ x, y }: Spot) => `${x},${y}`;
export const same = (a: Spot, b: Spot) => a.x === b.x && a.y === b.y;
export const directions = [[1,0],[-1,0],[0,1],[0,-1]];

/** A six-sided room, including its walls, inside a 25×25 tile square. */
export function arenaFloor(x: number, y: number) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 1 && x <= 23 && y >= 1 && y <= 23
    && Math.abs(x - ELEMENTAL.x) + Math.abs(y - ELEMENTAL.y) / 2 <= 11;
}
/** Fixed cover keeps door approaches, the entrance and the boss's center clear. */
export const KEYMASTER_WALL_BLOCKS = [
  {x:6,y:7,size:2}, {x:16,y:7,size:3}, {x:6,y:16,size:3},
  {x:17,y:17,size:2}, {x:4,y:11,size:2}, {x:19,y:12,size:2},
] as const;
export const keymasterArenaFloor = (x:number,y:number) => arenaFloor(x,y)
  && !KEYMASTER_WALL_BLOCKS.some(p=>x>=p.x && x<p.x+p.size && y>=p.y && y<p.y+p.size);
export const arenaFloorFor = (trialId:string,x:number,y:number) => trialId==="keymaster" ? keymasterArenaFloor(x,y) : arenaFloor(x,y);
export const floorAt = (room: "staging" | "arena", x: number, y: number, trialId="light-elemental") => room === "staging"
  ? Number.isInteger(x) && Number.isInteger(y) && x >= 1 && x <= 7 && y >= 1 && y <= 7
  : arenaFloorFor(trialId,x,y);
export const wallEdge = (x: number, y: number) => !arenaFloor(x, y)
  && [...directions,[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx,dy]) => arenaFloor(x+dx,y+dy));

export const ARENA_TORCHES: Spot[] = [];
export const ARENA_POTIONS: Spot[] = [];
export const ARENA_CRATES: Spot[] = [];
for (let y = 0; y < ARENA_SIZE; y++) for (let x = 0; x < ARENA_SIZE; x++) {
  if (!arenaFloor(x,y) || !directions.some(([dx,dy]) => !arenaFloor(x+dx,y+dy))) continue;
  const variant=(x+y*3)%5;
  if(variant===0)ARENA_TORCHES.push({x,y});
  if(variant===2)ARENA_POTIONS.push({x,y});
  if(variant===4)ARENA_CRATES.push({x,y});
}
