import { CHUNK, WIDTH, START_X } from './config.ts';
import { point, type Tile } from './entities.ts';
export function random(seed:number) { let n=seed>>>0; return () => { n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296; }; }
export function generate(seed:number,index:number):Map<string,Tile> {
 const rng=random(seed^Math.imul(index+1,2654435761));const cells=new Map<string,Tile>();const base=index*CHUNK;
 const set=(x:number,y:number,t:Tile)=>cells.set(point(x,base+y),t);
 for(let y=0;y<CHUNK;y++) for(let x=0;x<WIDTH;x++) set(x,y,{kind:'wall'});
 // A connected, three-wide central passage is independent of viewport density.
 for(let y=0;y<CHUNK;y++) for(let x=START_X-1;x<=START_X+1;x++) set(x,y,{kind:'floor'});
 for(let r=0;r<4;r++) {
  const y=2+r*4; const left=3+Math.floor(rng()*4),right=23+Math.floor(rng()*4);
  for(let yy=y;yy<Math.min(y+3,CHUNK);yy++) for(let x=left;x<=right;x++) set(x,yy,{kind:'floor'});
  for(const side of [-1,1]) {
   const x=START_X+side*(4+Math.floor(rng()*4));
   const tier=Math.min(3,Math.floor((base+y)/35));
   const types=['Cinder slime','Bone sentinel','Dusk wing','Ash warden'];
   set(x,y,{kind:'enemy',enemy:{name:types[tier],hp:12+tier*16+Math.floor((base+y)*.5),attack:6+tier*4+Math.floor((base+y)/12),defense:1+tier*2,tier}});
   const color=(['yellow','blue','red'] as const)[Math.floor(rng()*3)];
   set(START_X+side*2,y,{kind:'key',color});
   set(x,y+1,{kind:rng()<.5?'potion':rng()<.5?'attack':'defense'});
   set(x+side,y+2,{kind:'treasure'});
   set(x+side,y,{kind:'door',color});
  }
 }
 // Mandatory encounters remain approachable early; later runs benefit from upgrades.
 if(index>0) for(let x=START_X-1;x<=START_X+1;x++) set(x,0,{kind:'enemy',enemy:{name:'Gate sentinel',hp:20+index*9,attack:7+index*2,defense:2+Math.floor(index/2),tier:1}});
 set(START_X,CHUNK-1,{kind:'stairs'});
 if(index===0) set(START_X,0,{kind:'stairs'});
 if(!validate(cells,base)) throw new Error('Disconnected tower chunk');
 return cells;
}
export function validate(cells:Map<string,Tile>,base:number) {
 const seen=new Set<string>();const q=[[START_X,base]];
 for(let i=0;i<q.length;i++) {const [x,y]=q[i],k=point(x,y);if(seen.has(k)||!cells.has(k)||cells.get(k)!.kind==='wall')continue;seen.add(k);if(y===base+CHUNK-1&&x===START_X)return true;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])q.push([x+dx,y+dy]);}return false;
}
export class World {
 chunks=new Map<number,Map<string,Tile>>();
 constructor(public seed:number,public changes:Record<string,Tile>,public floor=0){}
 tile(x:number,y:number):Tile {
  if(x<0||x>=WIDTH||y<this.floor)return {kind:'wall'};
  const index=Math.floor(y/CHUNK);if(!this.chunks.has(index))this.chunks.set(index,generate(this.seed,index));
  return this.changes[point(x,y)]??this.chunks.get(index)!.get(point(x,y))??{kind:'wall'};
 }
 clear(x:number,y:number){this.changes[point(x,y)]={kind:'floor'};}
 maintain(y:number){const index=Math.floor(y/CHUNK);this.tile(START_X,(index+2)*CHUNK);this.floor=Math.max(this.floor,(index-3)*CHUNK);for(const i of this.chunks.keys())if(i*CHUNK<this.floor)this.chunks.delete(i);for(const k of Object.keys(this.changes))if(Number(k.split(',')[1])<this.floor)delete this.changes[k];}
}
