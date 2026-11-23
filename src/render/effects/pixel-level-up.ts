import type { FrameContext } from '../render-frame.ts';

const GLYPHS: Record<string, string[]> = {
  L:['10000','10000','10000','10000','10000','10000','11111'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  V:['10001','10001','10001','10001','10001','01010','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],
  P:['11110','10001','10001','11110','10000','10000','10000'],
  '!':['00100','00100','00100','00100','00100','00000','00100'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00001','01110'],
};
const COLORS = ['#eee0b7', '#e1bb78', '#be8c48'];
const layers = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>();

/** Literal bitmap letters; no font antialiasing, rounded strokes or gradients. */
function words(c: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number) {
  const left = Math.round(x - (text.length * 6 - 1) * scale / 2);
  const cells: [number, number, number][] = [];
  [...text].forEach((letter, n) => GLYPHS[letter]?.forEach((row, j) => [...row].forEach((v, i) => {
    if(v==='1') cells.push([left+(n*6+i)*scale, Math.round(y)+j*scale, j]);
  })));
  c.fillStyle = '#242631';
  for(const [px,py] of cells)c.fillRect(px-1,py-1,scale+2,scale+2);
  for(const [px,py,row] of cells){c.fillStyle=COLORS[Math.floor(row/3)];c.fillRect(px,py,scale,scale);}
}

/** Draw the complete level-up on a native 24px-per-tile surface in every theme. */
export function drawPixelLevelUp(f: FrameContext, age: number, points: number, duration: number, pointsDuration: number) {
  if(age<0 || age>=duration+(points>0?pointsDuration:0) || typeof document==='undefined')return;
  let canvas=layers.get(f.c);
  if(!canvas){canvas=document.createElement('canvas');layers.set(f.c,canvas);}
  const width=f.n*24;
  if(canvas.width!==width || canvas.height!==width)canvas.width=canvas.height=width;
  const c=canvas.getContext('2d');if(!c)return;
  c.clearRect(0,0,width,width);
  const hx=Math.round((f.playerX-f.left+.5)*24),hy=Math.round((f.n-f.playerY+f.bottom-.5)*24);
  if(age<duration){
    const fade=Math.min(1,(duration-age)/500),step=f.look.reduceMotion?0:Math.floor(age/90)%3;
    // Three hard-edged, stepped rings around the hero.
    for(let r=26+step;r>=10;r-=8){
      c.globalAlpha=fade*.12;c.fillStyle=COLORS[(r+step)%3];
      for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(Math.abs(Math.abs(x)+Math.abs(y)-r)<=1)c.fillRect(hx+x,hy+y,1,1);
    }
    if(!f.look.reduceMotion && age<800){
      const t=Math.floor(age/50)*50/800,out=1-(1-t)**3;
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8,reach=42+(i%3)*8;
        for(let tail=2;tail>=0;tail--){
          const radius=7+Math.max(0,reach*out-tail*4),size=tail?1:2;
          c.globalAlpha=fade*(1-t)*(1-tail*.28);c.fillStyle=COLORS[tail];
          c.fillRect(Math.round(hx+Math.cos(a)*radius),Math.round(hy+Math.sin(a)*radius),size,size);
        }
      }
    }
    c.globalAlpha=fade;
    words(c,'LEVEL UP!',width/2,Math.round(width*.29),Math.max(1,Math.floor(width*.085/7)));
  }else if(points>0){
    const t=(age-duration)/pointsDuration,rise=f.look.reduceMotion?0:Math.floor(t*14);
    c.globalAlpha=Math.min(1,(age-duration)/150,(1-t)/.3);
    const text=`+${points}`,x=hx-5,y=hy-32-rise;
    words(c,text,x,y,2);
    c.fillStyle=COLORS[1];
    ['00100','01110','11111','00100','00100','00100'].forEach((row,j)=>[...row].forEach((v,i)=>{
      if(v==='1')c.fillRect(Math.round(x+(text.length*6-1)+4+i*2),y+j*2,2,2);
    }));
  }
  c.globalAlpha=1;
  f.c.save();f.c.imageSmoothingEnabled=false;
  f.c.drawImage(canvas,0,0,f.width,f.width);f.c.restore();
}
