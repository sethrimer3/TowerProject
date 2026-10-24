import {ARENA_SIZE,ARENA_POTIONS,ARENA_CRATES,ARENA_TORCHES,arenaFloor,directions,key,same,type Spot} from "./arena.ts";
import {tileRandom} from "../random.ts";
import type {TrialState} from "./trial.ts";
const breakable=new Set([...ARENA_TORCHES,...ARENA_CRATES].map(key));
const propDestroyed=(s:TrialState,p:Spot)=>Object.hasOwn(s.destroyed,key(p));

/** A hit scatters the elemental to a different, unoccupied interior tile. */
export function teleportBoss(s: TrialState, step=s.steps+1) {
  const from = {x:s.elemental.x,y:s.elemental.y}, choices: Spot[] = [], fallback:Spot[]=[];
  for(let y=1;y<ARENA_SIZE-1;y++) for(let x=1;x<ARENA_SIZE-1;x++) {
    const p={x,y};
    if (!arenaFloor(x,y) || same(p,s.player) || s.slimes.some(q=>same(p,q))
      || s.keymaster?.mimics.some(q=>same(p,q))
      || ARENA_POTIONS.some(q=>same(p,q)) || !directions.every(([dx,dy])=>arenaFloor(x+dx,y+dy))) continue;
    if(Math.abs(x-from.x)+Math.abs(y-from.y)>=6 && Math.abs(x-s.player.x)+Math.abs(y-s.player.y)>=3) {
      if(s.keymaster?.drops.some(q=>same(p,q)))fallback.push(p);else choices.push(p);
    }
  }
  const destinations=choices.length?choices:fallback;
  const target=destinations[Math.floor(tileRandom(step,from.x+from.y*ARENA_SIZE,s.seed^0x11a7)*destinations.length)];
  s.elemental={...target,incorporeal:true,teleport:{from,step}};
}

/** A ghost is walkable. If the hero occupies its tile when it reforms,
 * materialize in the closest free tile before becoming vulnerable. */
export function materializeBoss(s: TrialState) {
  const boss=s.elemental;
  if(same(boss,s.player)) {
    const choices: Spot[]=[],fallback:Spot[]=[];
    for(let y=1;y<ARENA_SIZE-1;y++) for(let x=1;x<ARENA_SIZE-1;x++) {
      const p={x,y};
      if(arenaFloor(x,y) && !same(p,s.player) && !s.slimes.some(q=>same(p,q)) && !s.keymaster?.mimics.some(q=>same(p,q)) && !ARENA_POTIONS.some(q=>same(p,q))
        && (!breakable.has(key(p)) || propDestroyed(s,p))) {
        if(s.keymaster?.drops.some(q=>same(p,q)))fallback.push(p);else choices.push(p);
      }
    }
    const destinations=choices.length?choices:fallback;
    destinations.sort((a,b)=>(Math.abs(a.x-boss.x)+Math.abs(a.y-boss.y))-(Math.abs(b.x-boss.x)+Math.abs(b.y-boss.y)));
    const target=destinations[0];
    boss.x=target.x; boss.y=target.y;
  }
  boss.incorporeal=false;
}
