import { sprite } from "../sprites/pixel-sprite.ts";
import { tileRandom } from "../random.ts";
import type { Spot } from "./trial.ts";

export const TELEPORT_MS = 1100;
const ELEMENTAL_ART = [
  ".........g.........", ".........h.........", ".....g...h...g.....", "......g.hhh.g......",
  ".......ghhhg.......", "......gwhhhwg......", "......gwhhhwg......", ".......whhw........",
  ".....ggwwwwwgg.....", "...ggbhwwwwwhbgg...", "..gbb.hwwwwwh.bbg..", ".gbb..ghwwwhg..bbg.",
  "..b...gwhhhwg...b..", "......gwhhhwg......", ".......ghhhg.......", ".......ghhhg.......",
  "......gg.h.gg......", ".....gg..g..gg.....", "....gg.......gg....", ".....g.......g.....",
] as const;
export function drawLightElemental(c: CanvasRenderingContext2D, ghost = false, now = 0, reduceMotion = true) {
  if(ghost) {
    c.save();
    const alpha=c.globalAlpha;
    const bob=reduceMotion?0:Math.round(Math.sin(now/550)*2);
    c.translate(0,bob);
    c.globalAlpha=alpha*0.16;
    sprite(c,ELEMENTAL_ART,{g:"#6b99b0",h:"#91d3ea",w:"#d6f8ff",b:"#7893b7"},1,10,9);
    c.globalAlpha=alpha*0.35;
    sprite(c,ELEMENTAL_ART,{g:"#6b99b0",h:"#91d3ea",w:"#d6f8ff",b:"#7893b7"},1,12,11);
    c.globalAlpha=alpha*0.7;
    c.fillStyle="#d6f8ff";
    for(let i=0;i<8;i++) {
      const x=3+(i*7)%19,y=2+(i*11)%21;
      if(reduceMotion || Math.sin(now/320+i)>0) c.fillRect(x,y,1,1);
    }
    c.restore(); return;
  }
  sprite(c, ELEMENTAL_ART, { g: "#9c793d", h: "#ffe4a0", w: "#fffbe5", b: "#c6d7db" }, 1, 12, 11);
}


/** Literal body texels become individual lights; each follows a staggered,
 * smooth curved path with a short fading tail and assembles at the other end. */
const TEXELS=ELEMENTAL_ART.flatMap((row,y)=>[...row].flatMap((color,x)=>color!=="."?[{x:x-9.5,y:y-10,color}]:[]));
export function drawElementalTransit(c: CanvasRenderingContext2D, from: Spot, to: Spot, progress: number, seed: number) {
  const t=Math.max(0,Math.min(1,progress));
  const start={x:from.x+12,y:from.y+11},end={x:to.x+12,y:to.y+11};
  const dx=end.x-start.x,dy=end.y-start.y,length=Math.max(1,Math.sqrt(dx*dx+dy*dy));
  const strength=t>.78?Math.max(0,(1-t)/.22):1;
  c.save(); c.globalCompositeOperation="lighter";
  for(let i=0;i<TEXELS.length;i++) {
    const pixel=TEXELS[i],r=tileRandom(i,1,seed),r2=tileRandom(i,2,seed);
    const delay=r*.18,duration=.65+r2*.16;
    const at=(time:number)=> {
      const u=Math.max(0,Math.min(1,(time-delay)/duration)),smooth=u*u*(3-2*u);
      const arc=Math.sin(u*Math.PI)*(r2-.5)*64;
      const spread=Math.sin(u*Math.PI)*(6+r*16);
      return {x:start.x+dx*smooth+pixel.x-dy/length*arc+Math.cos(i*2.4)*spread,
        y:start.y+dy*smooth+pixel.y+dx/length*arc+Math.sin(i*2.4)*spread};
    };
    // Disintegrate from the real silhouette, then converge into that same silhouette.
    for(let trail=5;trail>=0;trail--) {
      const p=at(Math.max(0,t-trail*.018));
      c.globalAlpha=strength*(trail===0?.9:(6-trail)*.035);
      c.fillStyle=trail===0?(pixel.color==="w"?"#fffdeb":"#ffe4a0"):"#8ecfe4";
      c.fillRect(Math.round(p.x),Math.round(p.y),trail===0 && i%13===0?2:1,trail===0 && i%13===0?2:1);
    }
  }
  c.restore();
}
