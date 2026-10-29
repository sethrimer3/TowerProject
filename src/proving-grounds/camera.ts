import {FollowCamera,GLIDE_SECONDS,FAST_GLIDE_SECONDS,pointsAhead} from "../render/camera.ts";
import {ARENA_SIZE} from "./arena.ts";
import {ART_PX} from "../config.ts";
import type {TrialState,Spot} from "./trial.ts";

export const TRIAL_VIEW_TILES=17;
export const TRIAL_TILE_SIZE=ART_PX;
export type TrialTransition="smooth"|"fast"|"instant";
type Ahead=readonly {dx:number;dy:number}[];

/** Trial presentation shares the Delve's follow spring and path framing.
 * Logical turns stay immediate; drawn movement never changes combat or input. */
export class TrialCamera {
  private follow=new FollowCamera();
  private state:TrialState|null=null;
  private room:TrialState["room"]="staging";
  private time=0;
  private enabled=false;
  private drawn:Spot={x:0,y:0};
  private target:Spot={x:0,y:0};
  private shown={left:0,bottom:0};
  private idle=true;

  update(s:TrialState,now:number,reduceMotion:boolean,transition:TrialTransition="smooth",ahead:Ahead=[]) {
    const enabled=!reduceMotion && transition!=="instant";
    const reset=this.state!==s || this.room!==s.room || this.enabled!==enabled;
    const dt=reset?0:Math.min(.1,Math.max(0,(now-this.time)/1000));
    const size=s.room==="arena"?ARENA_SIZE:9,view={n:TRIAL_VIEW_TILES,width:size,height:size,padding:4};
    this.state=s;this.room=s.room;this.time=now;this.enabled=enabled;
    const p=s.player,fast=transition==="fast";
    if(reset || !enabled) {
      this.drawn={x:p.x,y:p.y};
      this.follow.reset({x:p.x+.5,y:p.y+.5},view);
    } else if(Math.abs(p.x-this.target.x)+Math.abs(p.y-this.target.y)>1) {
      this.drawn={x:p.x,y:p.y};this.follow.leap();
    } else {
      const blend=1-Math.exp(-dt*(fast?32:14));
      for(const axis of ["x","y"] as const) {
        this.drawn[axis]+=(p[axis]-this.drawn[axis])*blend;
        if(Math.abs(p[axis]-this.drawn[axis])<.001)this.drawn[axis]=p[axis];
      }
    }
    this.target={x:p.x,y:p.y};
    if(enabled) {
      this.follow.update({x:this.drawn.x+.5,y:this.drawn.y+.5},view,dt,fast?FAST_GLIDE_SECONDS:GLIDE_SECONDS,false,pointsAhead(p,ahead));
      const pixel=(n:number)=>Math.round(n*TRIAL_TILE_SIZE)/TRIAL_TILE_SIZE;
      this.shown={left:pixel(this.follow.left(view)),bottom:pixel(this.follow.bottom(view))};
      this.idle=this.drawn.x===p.x && this.drawn.y===p.y && this.follow.settled();
    } else {
      this.shown=this.centered(s);this.idle=true;
    }
  }
  private centered(s:TrialState){return {left:s.player.x-8,bottom:s.player.y-8};}
  view(s:TrialState){return this.state===s && this.room===s.room?{...this.shown}:this.centered(s);}
  hero(s:TrialState){return this.state===s && this.room===s.room?{...this.drawn}:{x:s.player.x,y:s.player.y};}
  get settled(){return this.idle;}
  /** Coordinates of the tile actually displayed under this canvas point,
   * including fractional camera offsets and clipped edge tiles. */
  tileAt(s:TrialState,u:number,v:number):Spot|null {
    if(this.state!==s || this.room!==s.room || !Number.isFinite(u) || !Number.isFinite(v) || u<0 || v<0 || u>=1 || v>=1)return null;
    return {x:Math.floor(this.shown.left+u*TRIAL_VIEW_TILES),y:Math.ceil(this.shown.bottom+(1-v)*TRIAL_VIEW_TILES)-1};
  }
}
