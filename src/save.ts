import { SAVE_KEY, UPGRADES } from './config.ts';
import type { Save } from './entities.ts';
export function defaults():Save {return {version:1,best:0,essence:0,upgrades:Object.fromEntries(UPGRADES.map(u=>[u.id,0])) as Save['upgrades'],settings:{density:20,speed:3,reduceMotion:false},run:null};}
const finite=(n:unknown,max=1e9)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
export function decode(raw:string|null):Save {
 const d=defaults();try {const s=JSON.parse(raw??'null');if(s?.version!==1)return d;
 if(finite(s.best))d.best=Math.floor(s.best);if(finite(s.essence))d.essence=Math.floor(s.essence);
 for(const u of UPGRADES)if(finite(s.upgrades?.[u.id],u.max))d.upgrades[u.id]=Math.floor(s.upgrades[u.id]);
 if([16,20,24,30].includes(s.settings?.density))d.settings.density=s.settings.density;
 if([1,3,6,10].includes(s.settings?.speed))d.settings.speed=s.settings.speed;
 d.settings.reduceMotion=s.settings?.reduceMotion===true;
 const r=s.run,p=r?.player;
 if(r&&Number.isInteger(r.seed)&&finite(r.height)&&finite(r.floor)&&r.floor<=p?.y&&finite(r.kills)&&finite(r.treasures)&&p&&Number.isInteger(p.x)&&p.x>=0&&p.x<30&&Number.isInteger(p.y)&&finite(p.y)&&finite(p.hp)&&p.hp>0&&finite(p.maxHp)&&p.hp<=p.maxHp&&finite(p.attack)&&finite(p.defense)&&['yellow','blue','red'].every(k=>finite(p.keys?.[k]))&&Array.isArray(p.gear)&&p.gear.length===2&&p.gear.every((g:any)=>['weapon','armor'].includes(g.slot)&&typeof g.name==='string'&&g.name.length<80&&finite(g.quality)&&finite(g.attack)&&finite(g.defense))&&r.changes&&typeof r.changes==='object'&&!Array.isArray(r.changes)&&Object.entries(r.changes).every(([k,v]:[string,any])=>/^\d+,\d+$/.test(k)&&v?.kind==='floor'))d.run=r;
 }catch{}return d;
}
export function load():Save {try{return decode(localStorage.getItem(SAVE_KEY));}catch{return defaults();}}
export function persist(save:Save):boolean {try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));return true;}catch{return false;}}
