import { generate, reachable } from "./src/generation.ts";
import { point } from "./src/entities.ts";
for (let seed = 0; seed < 30; seed++) {
  const merged = new Map();
  for (let i = 0; i < 4; i++) for (const [k,v] of generate(seed,i)) merged.set(k,v);
  const all = [...merged.values()].filter(t=>t.kind!=="wall").length;
  const r = reachable(merged, "15,0").size;
  if (r !== all) { console.log("seed", seed, "reach", r, "all", all); break; }
}
