import {routeTo} from "../pathfinding.ts";
import {autoplayTrial,trialPosition,trialPlan} from "./autoplay.ts";
import {trialFloor,trialStep,type Spot,type TrialState} from "./trial.ts";

/** A click means a destination, not a direction. Replan each step because
 * enemy positions change, and keep this transient route out of saved attempts. */
export class TrialNavigation {
  target:(Spot & {room:TrialState["room"]})|null=null;
  clear(){this.target=null;}
  path(s:TrialState) {
    const t=this.target;
    return t && t.room===s.room && s.status==="active"?routeTo(trialPosition(s),t.x,t.y)??[]:[];
  }
  select(s:TrialState,x:number,y:number) {
    if(s.mode==="cards" || s.status!=="active" || !trialFloor(s,x,y))return false;
    if(!routeTo(trialPosition(s),x,y))return false;
    this.target={x,y,room:s.room};return true;
  }
  advance(s:TrialState) {
    const target=this.target,unchanged={changed:false,message:"",fired:false};
    if(!target || target.room!==s.room || s.status!=="active" || s.mode==="cards") {this.clear();return unchanged;}
    if(s.player.x===target.x && s.player.y===target.y) {this.clear();return trialStep(s,0,0);}
    const path=routeTo(trialPosition(s),target.x,target.y),next=path?.[0];
    if(!next){this.clear();return unchanged;}
    const outcome=trialStep(s,next.dx,next.dy);
    if(!outcome.changed || s.room!==target.room || s.status!=="active" || (next.x===target.x && next.y===target.y))this.clear();
    return outcome;
  }
}
/** Card planning happens first; an active player command replaces that
 * proposal in hybrid mode, spending exactly one turn rather than both turns. */
export function advanceTrial(s:TrialState,navigation:TrialNavigation) {
  const plan=trialPlan(s);
  if(navigation.target && s.mode!=="cards")return {outcome:navigation.advance(s),card:null};
  return {outcome:autoplayTrial(s,plan),card:plan?.card??null};
}
