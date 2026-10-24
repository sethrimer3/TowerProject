import {sprite} from "../sprites/pixel-sprite.ts";
import {tileRandom} from "../random.ts";
import type {Spot} from "./arena.ts";

// Native 24-pixel actors: slate robes, warm brass, upper-left highlights.
const KEYMASTER=[
  "...........gg...........",".........ggwwgg.........","........gwwhhwwg........",
  ".......ghhgggghhg.......",".......ghgddddghg.......","......ghgdwddwdghg......",
  "......ghgddddddghg......",".......ghgddddghg.......",".......gghgggghgg.......",
  ".....ggbbggggggbbgg.....","....gbbhhhhghhhhbbg....","...gbbhhhhggghhhhbbg...",
  "..gbbgbhhhggghhhbgbbg..","..gbbg.bhhggghhb.gbbg..","..gbgg.bhggggghb.ggww..",
  "...gg..bhhghghhb..wggw.",".......bhhghghhb..wggw.","......gbhhghghhbg..ww..",
  "......gbhhggghhbg..gg..",".....gbhhhggghhhbg.gg..",".....gbhhggggghhbg.gw..",
  "....gbhhgdddddghhbg.gg..","....ggggdd...ddgggg....","........dd...dd.........",
] as const;
const MIMIC=[
  "........................","........................","......gggggggggg........",
  "....ggghhhhhhhhggg......","...gghhwwhhhhhhhbgg.....","...ghhwwhhhhhhhhbbg.....",
  "..gghhhhhhhhhhhhbbgg....","..ghhhhgggggghhhhbbg....","..ghhhhgdwwdghhhhbbg....",
  "..ggggggddddgggggggg....","..gddwdwdwdwdwdwdddg....","..gdwrrrrrrrrrrrrwdg....",
  "..gddwrrrrrrrrrrwddg....","..gdddwrrrrrrrrwdddg....","..ggdddwrrrrrrwdddgg....",
  "...ghgggwwwwwwggghg.....","...ghhhhgggggghhhhg.....","...ghhhhgggggghhhhg.....",
  "...gbhhhgggggghhhbg.....","...gbbbbhhhhhbbbbg......","....ggggggggggggg.......",
  "....dd..dd..dd..dd......","...ddd..dd..dd..ddd.....","........................",
] as const;
const PALETTE={d:"#1d2633",b:"#344651",h:"#9c793d",g:"#5b4636",w:"#ffe4a0",r:"#9f3549"};
export function drawKeymaster(c:CanvasRenderingContext2D,now=0,reduceMotion=true) {
  c.save();if(!reduceMotion)c.translate(0,Math.round(Math.sin(now/700)));
  sprite(c,KEYMASTER,PALETTE,1,12,12);c.restore();
}
export function drawMimic(c:CanvasRenderingContext2D,health:number) {
  sprite(c,MIMIC,PALETTE,1,12,12);
  c.fillStyle="#3b2922";c.fillRect(2,23,20,1);c.fillStyle="#e5a465";c.fillRect(2,23,20*health,1);
}

/** The same staggered curved flight and pixel tails as elemental transit,
 * with a broad doorway source collapsing into the boss instead of a body. */
export function drawDoorSpirits(c:CanvasRenderingContext2D,from:Spot,to:Spot,progress:number,seed:number,reduceMotion=false) {
  const t=Math.max(0,Math.min(1,progress)),dx=to.x-from.x,dy=to.y-from.y,length=Math.max(1,Math.sqrt(dx*dx+dy*dy));
  c.save();c.globalCompositeOperation="lighter";
  for(let i=0;i<(reduceMotion?18:180);i++) {
    const r=tileRandom(i,1,seed),r2=tileRandom(i,2,seed),sx=(r-.5)*22,sy=(r2-.5)*24;
    const at=(time:number)=> {
      const u=Math.max(0,Math.min(1,(time-r*.16)/(.72+r2*.12))),smooth=u*u*(3-2*u);
      const arc=reduceMotion?0:Math.sin(u*Math.PI)*(r2-.5)*75;
      return {x:from.x+12+sx*(1-smooth)+dx*smooth-dy/length*arc,y:from.y+12+sy*(1-smooth)+dy*smooth+dx/length*arc};
    };
    for(let tail=reduceMotion?0:5;tail>=0;tail--) {
      const p=at(Math.max(0,t-tail*.018));c.globalAlpha=tail===0?.95:(6-tail)*.04;
      c.fillStyle=tail===0?(i%5===0?"#ffb4a5":"#f34c62"):"#9f203f";
      c.fillRect(Math.round(p.x),Math.round(p.y),i%13===0 && tail===0?2:1,i%13===0 && tail===0?2:1);
    }
  }
  c.restore();
}
