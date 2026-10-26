// Native currency icons from the generated source, with deliberately different
// footprints on the same 24-pixel canvas so Breakthrough reads more strongly.
import {spawn} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
import {INSPIRATION_SPRITE,BREAKTHROUGH_SPRITE} from "../src/sprites/kit.ts";

const root=fileURLToPath(new URL("../",import.meta.url)),out=join(root,"public/assets/style");
const source=join(root,"assets/game-sprites/currencies.png"),palette=join(root,"assets/ui-sprites/palette.ppm");
const run=args=>new Promise((resolve,reject)=> {
  const p=spawn("magick",["-limit","thread","1",...args],{stdio:"inherit",timeout:60000});
  p.on("error",reject);p.on("exit",code=>code===0?resolve():reject(Error(`ImageMagick exit ${code}`)));
});
const manifest=JSON.parse(readFileSync(join(out,"manifest.json"),"utf8"));
for(const [id,crop,footprint] of [
  [INSPIRATION_SPRITE,"991x793+0+0","16x18"],
  [BREAKTHROUGH_SPRITE,"992x793+991+0","22x22"],
]) {
  await run([source,"-crop",crop,"+repage","-channel","A","-threshold","85%","+channel",
    "-trim","+repage","-filter","point","-resize",footprint,
    "-background","none","-gravity","center","-extent","24x24",
    "-write","mpr:original","+dither","-remap",palette,"mpr:original","-geometry","+0+0",
    "-compose","CopyAlpha","-composite","-strip",`PNG32:${join(out,`${id}.png`)}`]);
  manifest.assets[id]={file:`${id}.png`,width:24,height:24};
}
writeFileSync(join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("Prepared Inspiration and Breakthrough currency sprites.");
