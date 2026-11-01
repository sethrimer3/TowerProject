import { paintContents, paintHero, paintTile, paintTorch, type BoardLook } from "../render/tile-painters.ts";
import { sprite } from "../sprites/pixel-sprite.ts";
import { drawCrates } from "../render/decor/decor-sprites.ts";
import { POSITION_HALOS_ENABLED } from "../render/lighting.ts";
import { drawKit } from "../sprites/kit.ts";
import { HeroIdleAnimation } from "../sprites/animations.ts";
import type { Tile } from "../entities.ts";
import { ARENA_CRATES, ARENA_POTIONS, ARENA_TORCHES, beamCount, beamDirections, rayCells, trialFloor, key, nextBeamAxis, propDestroyed, type TrialState } from "./trial.ts";

import {drawKeymaster,drawKeymasterTransit,drawMimic,drawDoorSpirits} from "./keymaster-art.ts";
import {KEYMASTER_DOORS,DOOR_FLIGHT_MS} from "./keymaster.ts";
import {drawMagicTowerBoss,drawObeliskBoss,drawBossPart,drawBossMinion,drawCombatRoundOverlay} from "./boss-variants-art.ts";
import {activeBossParts} from "./boss-variants.ts";
import { drawLightElemental, drawElementalTransit, TELEPORT_MS } from "./elemental-art.ts";
export { drawLightElemental } from "./elemental-art.ts";
import {TrialCamera,TRIAL_VIEW_TILES,TRIAL_TILE_SIZE,type TrialTransition} from "./camera.ts";
import {paintOverseerBeams} from "../render/effects/overseer-beams.ts";
import {FIELD_GROW_MS,paintEffectWave,paintLifespring} from "../render/effects/lifespring.ts";
import {paintDilationField} from "../render/effects/time-dilation.ts";
import {ghostBob,paintGhost,paintGhostBurst,GHOST_BURST_MS} from "../render/effects/phantasm.ts";
import {ghostDirection,ghostOffset} from "../arcana/phantasm.ts";
import {paintFrostField} from "../render/effects/necrotic-frost.ts";
import {frostArea} from "../arcana/necrotic-frost.ts";
import {bossClock} from "./trial-spells.ts";
import {paintThunderbolt,paintThunderlight} from "../render/effects/thunderbolt.ts";
import {beamDirection} from "../arcana/overseer.ts";
import {RICOCHET_FLASH_MS,THUNDERBOLT_FALL_MS,THUNDERBOLT_FLASH_MS} from "../volley.ts";
import type {TrialStrike} from "./trial-spells.ts";
export {TRIAL_VIEW_TILES} from "./camera.ts";

const N = TRIAL_VIEW_TILES, S = TRIAL_TILE_SIZE, SIZE = N * S;

const SLIME_ART = [
  "......gggg......", "....gghhhhgg....", "...ghwwhhhhhg...", "..ghwwhhhhhhhg..",
  "..ghhhhhhhhhhg..", ".ghhhbhhhhbhhhg.", ".ghhhbhhhhbhhhg.", ".ghhhhhhhhhhhhg.",
  "..ghhhgggghhhg..", "..gghhhhhhhhgg..", "...gggggggggg...", "....gg....gg....",
] as const;
export function drawLightSlime(c: CanvasRenderingContext2D) {
  sprite(c,SLIME_ART,{g:"#9c793d",h:"#ffe4a0",w:"#fffbe5",b:"#53453b"},1,12,15);
}

/** Pixel art stays sharp; only the lighting mask has soft falloff. */
export class TrialRenderer {
  private lastState: TrialState | null = null;
  private lastTeleport: TrialState["elemental"]["teleport"] = null;
  private teleportAt = -Infinity;
  private lastStep = -1;
  private jumpedAt = -Infinity;
  private lastCombatStep = -1;
  private combatAt = -Infinity;
  private heroAt: {x:number;y:number;room:TrialState["room"]}|null=null;
  private facing={dx:0,dy:-1};
  private heroIdle=new HeroIdleAnimation();
  private camera=new TrialCamera();
  private darkness = document.createElement("canvas");
  private lastStrikes: TrialStrike[]|undefined;
  private strikesAt = -Infinity;
  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = canvas.height = this.darkness.width = this.darkness.height = SIZE;
  }
  view(s: TrialState) {
    return this.camera.view(s);
  }
  hero(s:TrialState){return this.camera.hero(s);}
  get settled(){return this.camera.settled;}
  tileAt(s:TrialState,u:number,v:number){return this.camera.tileAt(s,u,v);}
  draw(s: TrialState, now: number, firedAt: number, reduceMotion: boolean,
    options: {styledSprites?:boolean;spriteAnimations?:boolean;destination?:{x:number;y:number}|null;transition?:TrialTransition;pathAhead?:readonly {dx:number;dy:number}[];hidden?:{ricochet:boolean;thunderbolt:boolean;lifespring:boolean;phantasm:boolean;necro:boolean};phantasmAlpha?:number} = {}) {
    this.camera.update(s,now,reduceMotion,options.transition,options.pathAhead);
    const styled=true,animated=!!options.spriteAnimations;
    // Animation is presentation only; saved turns own all positions.
    if(this.lastState!==s) { this.lastState=s; this.lastStep=s.steps; this.jumpedAt=-Infinity; this.lastCombatStep=s.bossVariant?.lastRound?.step??-1; this.combatAt=-Infinity; this.lastTeleport=s.elemental.teleport; this.teleportAt=-Infinity;this.heroAt=null;this.facing={dx:0,dy:-1}; this.lastStrikes=s.arcana?.strikes; this.strikesAt=-Infinity; }
    if(s.arcana?.strikes!==this.lastStrikes){this.lastStrikes=s.arcana?.strikes;this.strikesAt=now;}
    if(s.bossVariant?.lastRound && s.bossVariant.lastRound.step!==this.lastCombatStep) {
      this.lastCombatStep=s.bossVariant.lastRound.step;
      this.combatAt=now;
      const r=s.bossVariant.lastRound;
      if(Math.abs(r.to.x-r.from.x)+Math.abs(r.to.y-r.from.y)===1)this.facing={dx:r.to.x-r.from.x,dy:r.to.y-r.from.y};
    }
    if(this.heroAt) {
      const dx=s.player.x-this.heroAt.x,dy=s.player.y-this.heroAt.y;
      if(this.heroAt.room!==s.room)this.facing={dx:0,dy:1};
      else if(Math.abs(dx)+Math.abs(dy)===1)this.facing={dx,dy};
    }
    this.heroAt={x:s.player.x,y:s.player.y,room:s.room};
    const idle=this.heroIdle.frame(now,animated && !reduceMotion && s.player.hp>0,
      `${s.seed}:${s.room}:${s.player.x},${s.player.y}:${this.facing.dx},${this.facing.dy}`);
    const world={tile:(x:number,y:number):Tile=>({kind:trialFloor(s,x,y)?"floor":"wall"})};
    const look:BoardLook={mode:"tower",tier:s.trialId==="keymaster"?2:1,height:1,seed:s.seed,outside:false,entranceX:0,
      reduceMotion,themed:null,styledSprites:styled,spriteAnimations:animated};
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
    const offsetX=Math.round(left*S),offsetY=Math.round(bottom*S);
    const px = (x: number) => x*S-offsetX, py = (y: number) => (N-1-y)*S+offsetY;
    const tile = (x: number, y: number, draw: () => void) => {
      c.save(); c.translate(Math.round(px(x)), Math.round(py(y))); draw(); c.restore();
    };
    c.imageSmoothingEnabled = false; c.fillStyle = "#05080c"; c.fillRect(0,0,SIZE,SIZE);
    for (let y=Math.floor(bottom); y<Math.ceil(bottom+N); y++) for (let x=Math.floor(left); x<Math.ceil(left+N); x++) {
      tile(x,y,() => {
        paintTile(c,world,world.tile(x,y),x,y,now,0,look);
        if (s.room === "staging" && x===4 && y===6) {
          paintContents(c,{kind:"stairs"},{x,y,time:now,reduceMotion,styledSprites:styled});
        }
      });
    }
    // Time Dilation's and Necrotic Frost's fields lie on the floor, under what stands on it.
    const floorFields=() => {
      const rule=s.arcana?.spells?.timeDilation,frost=s.arcana?.spells?.necroticFrost,fields=s.arcana?.frost?.fields,at=this.camera.hero(s);
      if(rule && s.arcana?.dilation?.left)paintDilationField(c,px(at.x)+12,py(at.y)+12,S*rule.reach/100,1);
      if(frost && fields)for(const f of frostArea(fields,frost.effects).fields)paintFrostField(c,px(at.x+f.x)+12,py(at.y+f.y)+12,S*frost.effects.radius/100,1,S,now,f.id,reduceMotion);
    };
    // The Light Elemental's dark would hide it, so there it comes after the dark.
    const unlit=s.room==="arena" && !s.keymaster && !s.bossVariant;
    if(s.room==="arena" && !unlit)floorFields();
    if (s.room === "arena") {
      if(s.keymaster) {
        for(const p of s.keymaster.drops)tile(p.x,p.y,()=>paintContents(c,{kind:"key",color:"yellow"},{...p,time:now,reduceMotion,styledSprites:styled}));
        for(const [door,p] of KEYMASTER_DOORS.entries())tile(p.x,p.y,()=> {
          if(s.keymaster!.doors.some(d=>d.door===door)) {c.fillStyle="#160e16";c.fillRect(3,2,18,22);c.fillStyle="#8b3c47";c.fillRect(3,2,2,22);c.fillRect(19,2,2,22);}
          else paintContents(c,{kind:"door",color:"yellow"},{...p,time:now,reduceMotion,styledSprites:styled});
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
          paintTorch(c,{...p,active:true,baseIntensity:0.5,lightRadius:5},now,reduceMotion,animated);
        }
      });
      for (const p of ARENA_POTIONS) if (!s.consumed.includes(key(p))) tile(p.x,p.y,()=> {
        paintContents(c,{kind:"potion",color:"red"},{...p,time:now,reduceMotion,styledSprites:styled,spriteAnimations:animated,seed:s.seed});

      });
      if (s.bossVariant) {
        for (const item of s.bossVariant.pickups) {
          tile(item.x, item.y, () => {
            if (item.kind === "attack" || item.kind === "defense") {
              paintContents(c, { kind: item.kind, amount: item.amount }, { x: item.x, y: item.y, time: now, reduceMotion, styledSprites: styled, spriteAnimations: animated, seed: s.seed });
            } else if (item.kind === "potion") {
              paintContents(c, { kind: "potion", color: "red" }, { x: item.x, y: item.y, time: now, reduceMotion, styledSprites: styled, spriteAnimations: animated, seed: s.seed });
            } else {
              c.fillStyle = item.kind === "gold" ? "#ffd34d" : "#d9e6f5";
              c.beginPath();
              c.arc(12, 14, 4, 0, Math.PI * 2);
              c.fill();
              c.strokeStyle = "#1b1408";
              c.lineWidth = 1;
              c.stroke();
            }
          });
        }
      }
    }
    const hero=this.camera.hero(s);
    const combatProgress=s.bossVariant?.lastRound ? (reduceMotion ? 0.5 : Math.min(1, Math.max(0, (now - this.combatAt) / 380))) : 1;
    const roundLunge = s.bossVariant?.lastRound && s.bossVariant.lastRound.heroDamage > 0 && combatProgress < 1
      ? Math.sin(combatProgress * Math.PI) * 0.32
      : 0;
    const heroDrawX = hero.x + (s.bossVariant?.lastRound ? (s.bossVariant.lastRound.to.x - s.bossVariant.lastRound.from.x) * roundLunge : 0);
    const heroDrawY = hero.y + (s.bossVariant?.lastRound ? (s.bossVariant.lastRound.to.y - s.bossVariant.lastRound.from.y) * roundLunge : 0);
    tile(heroDrawX,heroDrawY,()=>paintHero(c,this.facing,idle));
    if (s.room === "arena") {
      if(!s.keymaster && !s.bossVariant) {
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
        // No ambient floor light; the personal foothold light is temporarily disabled.
        if(POSITION_HALOS_ENABLED) light(hero.x,hero.y,1.8,0.8);
        for(const p of ARENA_TORCHES) if(!propDestroyed(s,p)) light(p.x,p.y,5.5,0.92);
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
        if(unlit)floorFields();
        // Keep the player readable without lighting a circle of floor.
        if(!POSITION_HALOS_ENABLED) tile(hero.x,hero.y,()=>paintHero(c,this.facing,idle));
      }
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
          const drawTransit=s.keymaster?drawKeymasterTransit:drawElementalTransit;
          drawTransit(c,{x:px(boss.teleport.from.x),y:py(boss.teleport.from.y)},
            {x:px(boss.x),y:py(boss.y)},transit,s.seed^boss.teleport.step);
        }
        if(transit>.78) tile(boss.x,boss.y,()=> {
          c.save(); c.globalAlpha=transit<1?(transit-.78)/.22:1;
          if(s.keymaster)drawKeymaster(c,now,reduceMotion,boss.incorporeal);
          else if(s.trialId==="magic-tower")drawMagicTowerBoss(c,now,reduceMotion);
          else if(s.trialId==="obelisk")drawObeliskBoss(c,now,reduceMotion);
          else drawLightElemental(c,boss.incorporeal,now,reduceMotion);
          c.fillStyle=boss.incorporeal?"#344651":"#3b2922"; c.fillRect(1,23,22,1);
          c.fillStyle=boss.incorporeal?"#91d3ea":"#ffe4a0"; c.fillRect(1,23,22*s.bossHp/s.bossMaxHp,1);
          c.restore();
        });
      }
      for(const p of slimes) tile(p.x,p.y,()=> {
        c.fillStyle="#9c793d66"; c.fillRect(5,21,14,2);
        c.translate(0,-p.lift); drawLightSlime(c);
      });
      if(s.keymaster) {
        for(const p of s.keymaster.mimics)tile(p.x,p.y,()=>drawMimic(c,p.hp/p.maxHp));
        for(const b of s.keymaster.doors)if(!b.hit && s.status==="active") {
          const p=KEYMASTER_DOORS[b.door];
          drawDoorSpirits(c,{x:px(p.x),y:py(p.y)},{x:px(s.elemental.x),y:py(s.elemental.y)},b.elapsed/DOOR_FLIGHT_MS,s.seed^b.door,reduceMotion);
        }
      }
      if(s.bossVariant) {
        for(const part of activeBossParts(s.bossVariant))tile(part.x,part.y,()=>drawBossPart(c,part,now,reduceMotion));
        for(const minion of s.bossVariant.minions)tile(minion.x,minion.y,()=>drawBossMinion(c,minion,now,reduceMotion));
        if(s.bossVariant.lastRound && combatProgress < 1) {
          drawCombatRoundOverlay(c,s.bossVariant.lastRound,combatProgress,px,py);
        }
      }
      if(s.arcana?.spells?.beams){const hero=this.camera.hero(s);paintOverseerBeams(c,px(hero.x)+12,py(hero.y)+12,SIZE*2,s.arcana.spells.beams,beamDirection(s.arcana.beamTurns)/100);}
      if(s.arcana?.spells?.lifespring) {
        const hero=this.camera.hero(s),spring=s.arcana.lifespring,step=s.arcana.springStep,age=reduceMotion?Infinity:now-this.strikesAt;
        if(step?.wave)paintEffectWave(c,px(hero.x)+12,py(hero.y)+12,SIZE*1.5,age);
        if(spring?.pool)paintLifespring(c,px(hero.x)+12,py(hero.y)+12,S*s.arcana.spells.lifespring.reach/100,reduceMotion?0:now,!!spring.tint,step?.formed?Math.max(0,Math.min(1,age/FIELD_GROW_MS)):1);
      }
      const ghostAlpha=options.phantasmAlpha??0.5,ring=s.arcana?.phantasm;
      if(s.arcana?.spells?.phantasm && ring?.ghosts && ghostAlpha>0) {
        const hero=this.camera.hero(s),spin=s.arcana.spells.phantasm.spin;
        c.save();c.globalAlpha=ghostAlpha;
        for(const slot of ring.ghosts) {
          const off=ghostOffset(ghostDirection(ring.turns??1,slot,ring.ring??ring.ghosts.length,spin));
          tile(hero.x+off.x,hero.y+off.y,()=>paintGhost(c,reduceMotion?0:ghostBob(now,slot)));
        }
        c.restore();
      }
      for(const strike of this.lastStrikes??[]) {
        const age=now-this.strikesAt,to={x:px(strike.to.x)+12,y:py(strike.to.y)+12};
        if(strike.kind==="phantasm") {
          if(!reduceMotion && ghostAlpha>0 && age<GHOST_BURST_MS)tile(strike.from.x,strike.from.y,()=>paintGhostBurst(c,age/GHOST_BURST_MS,ghostAlpha));
          if(options.hidden?.phantasm || age>=RICOCHET_FLASH_MS+200)continue;
        } else if(strike.kind==="necro") {
          if(options.hidden?.necro || age>=RICOCHET_FLASH_MS+200)continue;
        } else if(strike.kind==="lifespring") {
          if(options.hidden?.lifespring || age>=RICOCHET_FLASH_MS+200)continue;
        } else if(strike.kind==="ricochet") {
          if(options.hidden?.ricochet || age>=RICOCHET_FLASH_MS+200)continue;
          if(age<RICOCHET_FLASH_MS){c.save();c.strokeStyle="#fff";c.lineWidth=1.5;c.beginPath();c.moveTo(px(strike.from.x)+12,py(strike.from.y)+12);c.lineTo(to.x,to.y);c.stroke();c.restore();}
        } else {
          const delayed=age-(strike.tick/100)*160;
          if(options.hidden?.thunderbolt || delayed<0 || delayed>=THUNDERBOLT_FALL_MS+THUNDERBOLT_FLASH_MS)continue;
          c.save();
          paintThunderbolt(c,to.x,to.y,reduceMotion?1:delayed/THUNDERBOLT_FALL_MS,strike.to.x,strike.to.y,strike.tick,S);
          if(delayed>=THUNDERBOLT_FALL_MS || reduceMotion){c.translate(to.x-12,to.y-12);paintThunderlight(c,reduceMotion?0:delayed);}
          c.restore();
        }
        c.save();c.font="bold 9px sans-serif";c.textAlign="center";
        c.fillStyle="#000";c.fillText(`-${Math.round(strike.damage)}`,to.x+1,to.y-11);
        c.fillStyle="#fff";c.fillText(`-${Math.round(strike.damage)}`,to.x,to.y-12);c.restore();
      }
      // Telegraph only near the elemental, without revealing the unlit room.
      if(!s.keymaster && !s.bossVariant && s.status==="active" && (bossClock(s)/100)%10>=8) {
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
