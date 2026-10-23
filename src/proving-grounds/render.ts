import { drawThemedTile } from "../themed-tilesets.ts";
import { paintHero, paintTorch } from "../tile-painters.ts";
import { drawArea1Item } from "../area1-tileset.ts";
import { sprite } from "../pixel-sprite.ts";
import { ARENA_POTIONS, ARENA_TORCHES, BEAM_AXES, ELEMENTAL, beamCells, floorAt, key, nextBeamAxis, type TrialState } from "./trial.ts";

const N = 17, S = 24, SIZE = N * S;
const ELEMENTAL_ART = [
  ".........g.........", ".........h.........", ".....g...h...g.....", "......g.hhh.g......",
  ".......ghhhg.......", "......gwhhhwg......", "......gwhhhwg......", ".......whhw........",
  ".....ggwwwwwgg.....", "...ggbhwwwwwhbgg...", "..gbb.hwwwwwh.bbg..", ".gbb..ghwwwhg..bbg.",
  "..b...gwhhhwg...b..", "......gwhhhwg......", ".......ghhhg.......", ".......ghhhg.......",
  "......gg.h.gg......", ".....gg..g..gg.....", "....gg.......gg....", ".....g.......g.....",
] as const;
export function drawLightElemental(c: CanvasRenderingContext2D) {
  sprite(c, ELEMENTAL_ART, { g: "#9c793d", h: "#ffe4a0", w: "#fffbe5", b: "#c6d7db" }, 1, 12, 11);
}

const SLIME_ART = [
  "......gggg......", "....gghhhhgg....", "...ghwwhhhhhg...", "..ghwwhhhhhhhg..",
  "..ghhhhhhhhhhg..", ".ghhhbhhhhbhhhg.", ".ghhhbhhhhbhhhg.", ".ghhhhhhhhhhhhg.",
  "..ghhhgggghhhg..", "..gghhhhhhhhgg..", "...gggggggggg...", "....gg....gg....",
] as const;
export function drawLightSlime(c: CanvasRenderingContext2D, spritesOff: boolean) {
  if (spritesOff) {
    c.fillStyle="#ffe4a0"; c.fillRect(5,10,14,10);
    c.fillStyle="#53453b"; c.fillRect(8,13,2,2); c.fillRect(15,13,2,2);
  } else sprite(c,SLIME_ART,{g:"#9c793d",h:"#ffe4a0",w:"#fffbe5",b:"#53453b"},1,12,15);
}

/** Pixel art stays sharp; only the lighting mask has soft falloff. */
export class TrialRenderer {
  private lastState: TrialState | null = null;
  private lastStep = -1;
  private jumpedAt = -Infinity;
  private darkness = document.createElement("canvas");
  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = canvas.height = this.darkness.width = this.darkness.height = SIZE;
  }
  view(s: TrialState) {
    return { left: s.player.x - 8, bottom: s.player.y - 8 };
  }
  draw(s: TrialState, now: number, firedAt: number, reduceMotion: boolean, spritesOff: boolean) {
    // Animation is presentation only; saved turns own all positions.
    if(this.lastState!==s) { this.lastState=s; this.lastStep=s.steps; this.jumpedAt=-Infinity; }
    if(this.lastStep!==s.steps) {
      this.lastStep=s.steps;
      if(s.slimes.some(p=>p.jumped===s.steps)) this.jumpedAt=now;
    }
    const progress=reduceMotion?1:Math.min(1,Math.max(0,(now-this.jumpedAt)/260));
    const slimes=s.slimes.map(p=> {
      const t=p.jumped===s.steps?progress:1;
      return {x:p.from.x+(p.x-p.from.x)*t,y:p.from.y+(p.y-p.from.y)*t,lift:Math.round(Math.sin(t*Math.PI)*7)};
    });
    const c = this.canvas.getContext("2d")!, { left, bottom } = this.view(s);
    const px = (x: number) => (x - left) * S, py = (y: number) => (N - 1 - y + bottom) * S;
    const tile = (x: number, y: number, draw: () => void) => {
      c.save(); c.translate(Math.round(px(x)), Math.round(py(y))); draw(); c.restore();
    };
    c.imageSmoothingEnabled = false; c.fillStyle = "#05080c"; c.fillRect(0,0,SIZE,SIZE);
    for (let y=bottom; y<bottom+N; y++) for (let x=left; x<left+N; x++) {
      const wall = !floorAt(s.room,x,y);
      if (wall && ![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => floorAt(s.room,x+dx,y+dy))) continue;
      tile(x,y,() => {
        const neighbors = { northWall: !floorAt(s.room,x,y+1), eastWall: !floorAt(s.room,x+1,y), southWall: !floorAt(s.room,x,y-1), westWall: !floorAt(s.room,x-1,y) };
        if (spritesOff || !drawThemedTile(c,"tower",0,wall,x,y,7391,neighbors)) {
          c.fillStyle=wall?"#52616b":"#263442"; c.fillRect(0,0,S,S);
          c.fillStyle=wall?"#8d999d":"#34424d"; c.fillRect(1,1,22,1);
        }
        if (s.room === "staging" && x===4 && y===6) {
          c.fillStyle="#aab1a0"; for(let i=0;i<4;i++) c.fillRect(4+i,5+i*4,16-i*2,2);
        }
      });
    }
    if (s.room === "arena") {
      for (const p of ARENA_TORCHES) tile(p.x,p.y,()=>paintTorch(c,{...p,active:true,baseIntensity:0.5,lightRadius:5},now,reduceMotion,spritesOff));
      for (const p of ARENA_POTIONS) if (!s.consumed.includes(key(p))) tile(p.x,p.y,()=> {
        if (spritesOff || !drawArea1Item(c,{kind:"potion",color:"red"})) {
          c.fillStyle="#633040"; c.fillRect(8,9,8,11); c.fillStyle="#e7adac"; c.fillRect(10,6,4,3);
        }
      });
    }
    tile(s.player.x,s.player.y,()=>paintHero(c,spritesOff));
    if (s.room === "arena") {
      const d=this.darkness.getContext("2d")!;
      d.globalCompositeOperation="source-over"; d.fillStyle="#000"; d.fillRect(0,0,SIZE,SIZE);
      d.globalCompositeOperation="destination-out";
      const light = (x:number,y:number,radius:number,strength:number) => {
        const xx=px(x)+12, yy=py(y)+12, r=radius*S;
        if(xx+r<0||yy+r<0||xx-r>SIZE||yy-r>SIZE)return;
        const g=d.createRadialGradient(xx,yy,0,xx,yy,r);
        g.addColorStop(0,`rgba(0,0,0,${strength})`); g.addColorStop(0.35,`rgba(0,0,0,${strength*0.75})`); g.addColorStop(1,"rgba(0,0,0,0)");
        d.fillStyle=g; d.fillRect(xx-r,yy-r,r*2,r*2);
      };
      // No ambient floor light. The hero has just enough light to find their footing.
      light(s.player.x,s.player.y,1.8,0.8);
      for(const p of ARENA_TORCHES) light(p.x,p.y,5.5,0.92);
      for(const p of slimes) light(p.x,p.y,1.7,0.65);
      if(s.status!=="won") light(ELEMENTAL.x,ELEMENTAL.y,3,0.85);
      for(const [k,step] of Object.entries(s.scorches)) {
        const [x,y]=k.split(",").map(Number); const glow=Math.max(0,1-(s.steps-step)/30);
        if(glow>0) light(x,y,1.3,glow*0.45);
      }
      d.globalCompositeOperation="source-over";
      c.drawImage(this.darkness,0,0);
      // Cracks persist for the whole attempt; their heat subsides over 30 turns.
      for(const [k,step] of Object.entries(s.scorches)) {
        const [x,y]=k.split(",").map(Number);
        if(x<left||x>=left+N||y<bottom||y>=bottom+N)continue;
        const heat=Math.max(0,1-(s.steps-step)/30);
        tile(x,y,()=> {
          c.fillStyle=heat>0?`rgba(245,${90+Math.round(heat*100)},48,${0.25+heat*0.65})`:"#281d1b";
          for(const [xx,yy,w,h] of [[8,5,1,5],[9,9,3,1],[11,10,1,6],[12,15,4,1],[15,16,1,4],[12,8,4,1]]) c.fillRect(xx,yy,w,h);
        });
      }
      const flash = firedAt > 0 ? Math.max(0,1-(now-firedAt)/900) : 0;
      if(flash>0 && s.steps>=10) {
        c.save(); c.globalAlpha=flash;
        const axis=((s.steps/10-1)|0)%4, [dx,dy]=BEAM_AXES[axis];
        for(const p of beamCells(axis)) tile(p.x,p.y,()=> {
          c.fillStyle="#ffb74f66";
          if(dx===0)c.fillRect(7,0,10,24);
          else if(dy===0)c.fillRect(0,7,24,10);
          else for(let i=0;i<24;i++)c.fillRect(i,(dy>0?23-i:i)-3,1,7);
          c.fillStyle="#fff5cf";
          if(dx===0)c.fillRect(11,0,2,24);
          else if(dy===0)c.fillRect(0,11,24,2);
          else for(let i=0;i<24;i++)c.fillRect(i,dy>0?23-i:i,1,2);
        });
        c.restore();
      }
      if(s.status!=="won") tile(ELEMENTAL.x,ELEMENTAL.y,()=> {
        drawLightElemental(c);
        c.fillStyle="#3b2922"; c.fillRect(1,23,22,1);
        c.fillStyle="#ffe4a0"; c.fillRect(1,23,22*s.bossHp/s.bossMaxHp,1);
      });
      for(const p of slimes) tile(p.x,p.y,()=> {
        c.fillStyle="#9c793d66"; c.fillRect(5,21,14,2);
        c.translate(0,-p.lift); drawLightSlime(c,spritesOff);
      });
      // Telegraph only near the elemental, without revealing the unlit room.
      if(s.status==="active" && s.steps%10>=8) {
        const [dx,dy]=[[0,1],[1,1],[1,0],[1,-1]][nextBeamAxis(s)];
        c.fillStyle="#ffeaa8";
        for(const sign of [-1,1]) for(let i=1;i<=3;i++) tile(ELEMENTAL.x+dx*i*sign,ELEMENTAL.y+dy*i*sign,()=>c.fillRect(11,11,2,2));
      }
    }
  }
}
