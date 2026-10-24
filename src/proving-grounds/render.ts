import { drawThemedTile } from "../themed-tilesets.ts";
import { paintContents, paintHero, paintTile, paintTorch, type BoardLook } from "../tile-painters.ts";
import { drawArea1Item } from "../area1-tileset.ts";
import { sprite } from "../sprites/pixel-sprite.ts";
import { drawCrates } from "../render/decor/decor-sprites.ts";
import { drawKit } from "../sprites/kit.ts";
import { HeroIdleAnimation } from "../sprites/animations.ts";
import type { Tile } from "../entities.ts";
import { ARENA_CRATES, ARENA_POTIONS, ARENA_TORCHES, beamCount, beamDirections, rayCells, trialFloor, key, nextBeamAxis, propDestroyed, wallEdge, type TrialState } from "./trial.ts";

import {drawKeymaster,drawMimic,drawDoorSpirits} from "./keymaster-art.ts";
import {KEYMASTER_DOORS,DOOR_FLIGHT_MS} from "./keymaster.ts";
import { drawLightElemental, drawElementalTransit, TELEPORT_MS } from "./elemental-art.ts";
export { drawLightElemental } from "./elemental-art.ts";

export const TRIAL_VIEW_TILES = 17;
const N = TRIAL_VIEW_TILES, S = 24, SIZE = N * S;

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
  private lastTeleport: TrialState["elemental"]["teleport"] = null;
  private teleportAt = -Infinity;
  private lastStep = -1;
  private jumpedAt = -Infinity;
  private heroAt: {x:number;y:number;room:TrialState["room"]}|null=null;
  private facing={dx:0,dy:-1};
  private heroIdle=new HeroIdleAnimation();
  private darkness = document.createElement("canvas");
  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = canvas.height = this.darkness.width = this.darkness.height = SIZE;
  }
  view(s: TrialState) {
    return { left: s.player.x - 8, bottom: s.player.y - 8 };
  }
  draw(s: TrialState, now: number, firedAt: number, reduceMotion: boolean, spritesOff: boolean,
    options: {styledSprites?:boolean;spriteAnimations?:boolean;destination?:{x:number;y:number}|null} = {}) {
    const styled=!!options.styledSprites && !spritesOff,animated=styled && !!options.spriteAnimations;
    // Animation is presentation only; saved turns own all positions.
    if(this.lastState!==s) { this.lastState=s; this.lastStep=s.steps; this.jumpedAt=-Infinity; this.lastTeleport=s.elemental.teleport; this.teleportAt=-Infinity;this.heroAt=null;this.facing={dx:0,dy:-1}; }
    if(this.heroAt) {
      const dx=s.player.x-this.heroAt.x,dy=s.player.y-this.heroAt.y;
      if(this.heroAt.room!==s.room)this.facing={dx:0,dy:1};
      else if(Math.abs(dx)+Math.abs(dy)===1)this.facing={dx,dy};
    }
    this.heroAt={x:s.player.x,y:s.player.y,room:s.room};
    const idle=this.heroIdle.frame(now,animated && !reduceMotion && s.player.hp>0,
      `${s.seed}:${s.room}:${s.player.x},${s.player.y}:${this.facing.dx},${this.facing.dy}`);
    const world={tile:(x:number,y:number):Tile=>({kind:trialFloor(s,x,y)?"floor":"wall"})};
    const look:BoardLook={mode:"tower",tier:1,height:1,seed:s.seed,outside:false,entranceX:0,
      spritesOff,reduceMotion,area1:!spritesOff,themed:null,styledSprites:styled,spriteAnimations:animated};
    if(this.lastTeleport!==s.elemental.teleport) {
      this.lastTeleport=s.elemental.teleport; this.teleportAt=now;
    }
    const transit=reduceMotion?1:Math.max(0,Math.min(1,(now-this.teleportAt)/TELEPORT_MS));
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
      const wall = !trialFloor(s,x,y);
      if (!styled && wall && !(s.room==="arena" && wallEdge(x,y)) && ![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => trialFloor(s,x+dx,y+dy))) continue;
      tile(x,y,() => {
        const neighbors = { northWall: !trialFloor(s,x,y+1), eastWall: !trialFloor(s,x+1,y), southWall: !trialFloor(s,x,y-1), westWall: !trialFloor(s,x-1,y) };
        if(styled)paintTile(c,world,world.tile(x,y),x,y,now,0,look);
        else if (spritesOff || !drawThemedTile(c,"tower",0,wall,x,y,7391,neighbors)) {
          c.fillStyle=wall?"#52616b":"#263442"; c.fillRect(0,0,S,S);
          c.fillStyle=wall?"#8d999d":"#34424d"; c.fillRect(1,1,22,1);
        }
        if (s.room === "staging" && x===4 && y===6) {
          if(styled)paintContents(c,{kind:"stairs"},{x,y,time:now,spritesOff,reduceMotion,area1:true,styledSprites:styled});
          else {c.fillStyle="#aab1a0"; for(let i=0;i<4;i++) c.fillRect(4+i,5+i*4,16-i*2,2);}
        }
      });
    }
    if (s.room === "arena") {
      if(s.keymaster) {
        for(const p of s.keymaster.drops)tile(p.x,p.y,()=>paintContents(c,{kind:"key",color:"yellow"},{...p,time:now,spritesOff,reduceMotion,area1:true,styledSprites:styled}));
        for(const [door,p] of KEYMASTER_DOORS.entries())tile(p.x,p.y,()=> {
          if(s.keymaster!.doors.some(d=>d.door===door)) {c.fillStyle="#160e16";c.fillRect(3,2,18,22);c.fillStyle="#8b3c47";c.fillRect(3,2,2,22);c.fillRect(19,2,2,22);}
          else paintContents(c,{kind:"door",color:"yellow"},{...p,time:now,spritesOff,reduceMotion,area1:true,styledSprites:styled});
        });
      }
      for(const p of ARENA_CRATES)tile(p.x,p.y,()=> {
        const broken=propDestroyed(s,p);
        if(styled && (broken?drawKit(c,"crate-broken",6,12,12,12):drawKit(c,"crate")))return;
        drawCrates(c,0,0,[{x:4,y:6,w:16,h:16,lift:0,kind:"crate",tone:(p.x+p.y)%3}],broken);
      });
      for (const p of ARENA_TORCHES) tile(p.x,p.y,()=> {
        if(propDestroyed(s,p)) {
          c.fillStyle="#302a23";c.fillRect(8,21,9,2);c.fillRect(11,18,2,4);
        } else {
          // A floor stand anchors the torch inside the room, clear of the wall.
          c.fillStyle="#222a30";c.fillRect(7,21,10,2);c.fillRect(9,20,2,2);c.fillRect(14,20,2,2);
          paintTorch(c,{...p,active:true,baseIntensity:0.5,lightRadius:5},now,reduceMotion,spritesOff,styled,animated);
        }
      });
      for (const p of ARENA_POTIONS) if (!s.consumed.includes(key(p))) tile(p.x,p.y,()=> {
        if(styled)paintContents(c,{kind:"potion",color:"red"},{...p,time:now,spritesOff,reduceMotion,area1:true,styledSprites:styled,spriteAnimations:animated,seed:s.seed});
        else if (spritesOff || !drawArea1Item(c,{kind:"potion",color:"red"})) {
          c.fillStyle="#633040"; c.fillRect(8,9,8,11); c.fillStyle="#e7adac"; c.fillRect(10,6,4,3);
        }
      });
    }
    tile(s.player.x,s.player.y,()=>paintHero(c,spritesOff,styled,this.facing,idle));
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
      for(const p of ARENA_TORCHES) if(!propDestroyed(s,p)) light(p.x,p.y,5.5,0.92);
      if(s.keymaster) {
        for(const p of KEYMASTER_DOORS)light(p.x,p.y,3,0.8);
        for(const p of s.keymaster.drops)light(p.x,p.y,1.5,0.5);
        for(const p of s.keymaster.mimics)light(p.x,p.y,1.2,0.4);
        for(const b of s.keymaster.doors)if(!b.hit && s.status==="active") {
          const p=KEYMASTER_DOORS[b.door],t=b.elapsed/DOOR_FLIGHT_MS;
          light(p.x+(12-p.x)*t,p.y+(12-p.y)*t,3,0.8);
        }
      }
      for(const p of slimes) light(p.x,p.y,1.7,0.65);
      if(s.status!=="won") {
        light(s.elemental.x,s.elemental.y,s.elemental.incorporeal?2.4:3,s.elemental.incorporeal?0.48:0.85);
        if(transit<1 && s.elemental.teleport) {
          const from=s.elemental.teleport.from;
          light(from.x+(s.elemental.x-from.x)*transit,from.y+(s.elemental.y-from.y)*transit,2.5,0.7);
        }
      }
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
      if(flash>0 && s.beam) {
        c.save(); c.globalAlpha=flash;
        const {axis,origin,count=2}=s.beam;
        for(const direction of beamDirections(axis,count)) for(const p of rayCells(direction,origin)) tile(p.x,p.y,()=> {
          const [dx,dy]=direction;
          c.fillStyle="#ffb74f66";
          if(dx===0)c.fillRect(7,0,10,24);
          else if(dy===0)c.fillRect(0,7,24,10);
          else for(let i=0;i<24;i++)c.fillRect(i,(dx*dy>0?23-i:i)-3,1,7);
          c.fillStyle="#fff5cf";
          if(dx===0)c.fillRect(11,0,2,24);
          else if(dy===0)c.fillRect(0,11,24,2);
          else for(let i=0;i<24;i++)c.fillRect(i,dx*dy>0?23-i:i,1,2);
        });
        c.restore();
      }
      if(s.status!=="won") {
        const boss=s.elemental;
        if(transit<1 && boss.teleport) {
          drawElementalTransit(c,{x:px(boss.teleport.from.x),y:py(boss.teleport.from.y)},
            {x:px(boss.x),y:py(boss.y)},transit,s.seed^boss.teleport.step);
        }
        if(transit>.78) tile(boss.x,boss.y,()=> {
          c.save(); c.globalAlpha=transit<1?(transit-.78)/.22:1;
          if(s.keymaster)drawKeymaster(c,now,reduceMotion);else drawLightElemental(c,boss.incorporeal,now,reduceMotion);
          c.fillStyle=boss.incorporeal?"#344651":"#3b2922"; c.fillRect(1,23,22,1);
          c.fillStyle=boss.incorporeal?"#91d3ea":"#ffe4a0"; c.fillRect(1,23,22*s.bossHp/s.bossMaxHp,1);
          c.restore();
        });
      }
      for(const p of slimes) tile(p.x,p.y,()=> {
        c.fillStyle="#9c793d66"; c.fillRect(5,21,14,2);
        c.translate(0,-p.lift); drawLightSlime(c,spritesOff);
      });
      if(s.keymaster) {
        for(const p of s.keymaster.mimics)tile(p.x,p.y,()=>drawMimic(c,p.hp/p.maxHp));
        for(const b of s.keymaster.doors)if(!b.hit && s.status==="active") {
          const p=KEYMASTER_DOORS[b.door];
          drawDoorSpirits(c,{x:px(p.x),y:py(p.y)},{x:px(12),y:py(12)},b.elapsed/DOOR_FLIGHT_MS,s.seed^b.door,reduceMotion);
        }
      }
      // Telegraph only near the elemental, without revealing the unlit room.
      if(!s.keymaster && s.status==="active" && s.steps%10>=8) {
        c.fillStyle="#ffeaa8";
        for(const [dx,dy] of beamDirections(nextBeamAxis(s),beamCount(s.level))) for(let i=1;i<=3;i++) tile(s.elemental.x+dx*i,s.elemental.y+dy*i,()=>c.fillRect(11,11,2,2));
      }
    }
    if(options.destination && s.status==="active") {
      c.save();c.strokeStyle="#f3dc9c";c.lineWidth=1;
      c.strokeRect(px(options.destination.x)+2,py(options.destination.y)+2,S-4,S-4);c.restore();
    }
  }
}
