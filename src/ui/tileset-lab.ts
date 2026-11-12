import { DEFAULT_TILESET_EXAMPLE, TILESET_EXAMPLES, exampleIndex, LAB_SIZE, LAB_SEED, LAB_HERO, LAB_TORCHES, labTile } from "../tileset-lab.ts";
import { drawDungeonGround, dungeonDiagonals } from "../sprites/dungeon.ts";
import { paintContents, paintHero, paintTorch } from "../render/tile-painters.ts";
import { dungeonWallProfile } from "../render/wall-depth.ts";
import { controlIcon } from "./control-icon.ts";
import { copyText } from "./run-notes-dialog.ts";

let selected = DEFAULT_TILESET_EXAMPLE;
/** Draw the same room and actors for every slide, without reading or mutating a Game. */
export function drawTilesetExample(canvas:HTMLCanvasElement,index:number):boolean {
  const example=TILESET_EXAMPLES[exampleIndex(index)];
  canvas.width=canvas.height=LAB_SIZE*24;
  const c=canvas.getContext("2d");if(!c)return false;
  c.imageSmoothingEnabled=false;c.fillStyle="#0c1016";c.fillRect(0,0,canvas.width,canvas.height);
  const world={tile:labTile};let ready=true;
  for(let y=LAB_SIZE-1;y>=0;y--)for(let x=0;x<LAB_SIZE;x++) {
    const t=labTile(x,y),wallAt=(dx:number,dy:number)=>labTile(x+dx,y+dy).kind==="wall";
    c.save();c.translate(x*24,(LAB_SIZE-1-y)*24);
    ready=drawDungeonGround(c,{mode:"tower",tier:example.tier,height:0,seed:LAB_SEED,x,y,wall:t.kind==="wall",empty:t.kind==="floor",
      neighbors:{northWall:wallAt(0,1),eastWall:wallAt(1,0),southWall:wallAt(0,-1),westWall:wallAt(-1,0)}},
      dungeonDiagonals(world,"tower",x,y,LAB_SEED),t.kind==="wall"?dungeonWallProfile(world,x,y):undefined,undefined,example.material)&&ready;
    c.restore();
  }
  if(!ready)return false;
  for(let y=LAB_SIZE-1;y>=0;y--)for(let x=0;x<LAB_SIZE;x++) {
    c.save();c.translate(x*24,(LAB_SIZE-1-y)*24);
    paintContents(c,labTile(x,y),{x,y,time:0,reduceMotion:true,styledSprites:true,seed:LAB_SEED});
    if(LAB_TORCHES.some(t=>t.x===x&&t.y===y))paintTorch(c,{x,y,active:true,lightRadius:4,baseIntensity:1},0,true);
    if(x===LAB_HERO.x&&y===LAB_HERO.y)paintHero(c,{dx:0,dy:-1});
    c.restore();
  }
  return true;
}

/** Accessible, static presentation: settings-page navigation already pauses gameplay. */
export function renderTilesetLab(root:HTMLElement,back:()=>void) {
  root.innerHTML=`<button class="back" id="tileset-lab-back">${controlIcon("back")} Visual Settings</button>
    <div class="page-title"><small>DEVELOPMENT SHOWCASE</small><h2>Tileset Lab</h2></div>
    <div class="tileset-lab"><div class="tileset-lab-heading" aria-live="polite" aria-atomic="true"><small id="tileset-kind"></small><h3 id="tileset-name"></h3><p id="tileset-description"></p></div>
    <div class="tileset-stage"><canvas id="tileset-room" width="312" height="312" role="img"></canvas><p id="tileset-loading" hidden>Loading artwork…</p></div>
    <div class="tileset-navigation" role="group" aria-label="Tileset slides"><button id="tileset-prev" aria-label="Previous tileset">${controlIcon("back")}</button><span id="tileset-counter"></span><button id="tileset-next" aria-label="Next tileset">${controlIcon("forward")}</button></div>
    <button id="tileset-copy" class="wide">Copy example name</button>
    <p class="hint">Same room, hero and props on every slide. Use the arrows or ← / → to compare. Share the example ID and name through Discord or text.</p></div>`;
  const find=(id:string)=>root.querySelector<HTMLElement>(`#${id}`)!;
  const canvas=find("tileset-room") as HTMLCanvasElement;
  let frame=0;
  const draw=()=> {
    cancelAnimationFrame(frame);
    const ready=drawTilesetExample(canvas,selected);find("tileset-loading").hidden=ready;
    if(!ready && canvas.isConnected && root.getClientRects().length)frame=requestAnimationFrame(draw);
  };
  const show=(index:number)=> {
    selected=exampleIndex(index);const ex=TILESET_EXAMPLES[selected];
    find("tileset-kind").textContent=`${ex.experimental?"EXPERIMENTAL":"CURRENT TOWER"} · ${ex.id}`;
    find("tileset-name").textContent=ex.name;find("tileset-description").textContent=ex.description;
    find("tileset-counter").textContent=`${selected+1} / ${TILESET_EXAMPLES.length}`;
    canvas.setAttribute("aria-label",`${ex.id}: ${ex.name}. Fixed example dungeon room.`);canvas.dataset.example=ex.id;
    draw();
  };
  find("tileset-prev").onclick=()=>show(selected-1);find("tileset-next").onclick=()=>show(selected+1);
  find("tileset-copy").onclick=e=>{const ex=TILESET_EXAMPLES[selected];copyText(e.currentTarget as HTMLButtonElement,`Tower Delve Tileset Lab — ${ex.id}: ${ex.name}`);};
  const close=()=>{cancelAnimationFrame(frame);root.onkeydown=null;back();};
  find("tileset-lab-back").onclick=close;
  root.onkeydown=e=> {
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.key==="ArrowLeft"||e.key==="ArrowRight") {e.preventDefault();show(selected+(e.key==="ArrowLeft"?-1:1));}
    else if(e.key==="Home"||e.key==="End") {e.preventDefault();show(e.key==="Home"?0:TILESET_EXAMPLES.length-1);}
    else if(e.key==="Escape"){e.preventDefault();close();}
  };
  show(selected);find("tileset-next").focus({preventScroll:true});
}
