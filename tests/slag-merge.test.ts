// Hashes the same on every OS: the melt wobbles with Math.sin.
import "./portable-math.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { random, withStream } from "../src/random.ts";

// Characterization hashes of the assemble's melt (`playSlagMerge`): every
// canvas call and property write of every frame, 16 ms apart, from the
// first to the last, for pieces going in that have fewer pixels than the
// piece made and more. Regenerate (only when a change to the melt's art is
// intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/slag-merge.golden.json", import.meta.url);

let hash: Hash = createHash("sha256");
const note = (line: string) => void hash.update(line + "\n");

/** A 2D context that logs every call and property write to `hash`. */
function recorder(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get: (_, key: string) => {
      if (key in state) return state[key];
      if (key === "createRadialGradient")
        return (...a: unknown[]) => {
          const label = `g.${key}(${a.join(",")})`;
          note(label);
          return { addColorStop: (at: number, colour: string) => note(`${label}.stop(${at},${colour})`), toString: () => label };
        };
      return (...args: unknown[]) => note(`g.${key}(${args.join(",")})`);
    },
    set: (_, key: string, value) => {
      state[key] = value;
      note(`g.${key}=${String(value)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** A stand-in element: the canvas, or the layer over the screen. */
function element(tag: string) {
  const ctx = recorder();
  return {
    tag,
    set width(v: number) { note(`canvas.width=${v}`); },
    set height(v: number) { note(`canvas.height=${v}`); },
    getContext: () => ctx,
    set className(v: string) { note(`layer.className=${v}`); },
    set innerHTML(v: string) { note(`layer.innerHTML=${v}`); },
    setAttribute: (k: string, v: string) => note(`layer.${k}=${v}`),
    prepend: () => note("layer.prepend"),
    remove: () => note("layer.remove"),
    classList: { add: (c: string) => note(`layer.add(${c})`) },
    onclick: null as null | (() => void),
  };
}

let layer: ReturnType<typeof element> | null = null;
let queued: ((now: number) => void) | null = null;
Object.assign(globalThis, {
  document: {
    createElement: (tag: string) => (tag === "canvas" ? element(tag) : (layer = element(tag))),
    body: { append: () => note("body.append") },
  },
  window: { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 },
  requestAnimationFrame: (fn: (now: number) => void) => ((queued = fn), 1),
  cancelAnimationFrame: () => void (queued = null),
});
const { playSlagMerge } = await import("../src/ui/slag-merge.ts");

type Spec = Parameters<typeof playSlagMerge>[1];
/** Plays one melt to its end (or, with `skipAt`, presses it at that frame),
 * returning its hash and the frames drawn. */
function play(inputs: Spec[], result: Spec, skipAt = Infinity) {
  hash = createHash("sha256");
  let done = 0, frames = 0;
  withStream("effects", random(7), () => playSlagMerge(inputs, result, false, () => done++));
  for (let now = 1000; queued && done === 0; now += 16, frames++) {
    if (frames === skipAt) layer!.onclick!();
    else {
      const fn = queued;
      queued = null;
      fn(now);
    }
  }
  assert.equal(done, 1, "calls done once");
  return { hash: hash.digest("hex"), frames };
}

const swords: Spec[] = Array.from({ length: 3 }, () => ({ def: "knightsSword", rarity: "uncommon" }));
const rings: Spec[] = Array.from({ length: 2 }, () => ({ def: "ringOfFury", rarity: "common" }));

test("the assemble's melt draws as its golden records", () => {
  const got = {
    swords: play(swords, { def: "knightsSword", rarity: "rare" }),
    rings: play(rings, { def: "ringOfFury", rarity: "uncommon" }),
    swordIntoPlate: play(swords.slice(0, 1), { def: "bastionPlate", rarity: "rare" }),
    skipped: play(swords, { def: "knightsSword", rarity: "rare" }, 100),
  };
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) writeFileSync(GOLDEN, JSON.stringify(got, null, 2) + "\n");
  assert.deepEqual(got, JSON.parse(readFileSync(GOLDEN, "utf8")));
});

test("with Reduce motion on, the melt ends at once without drawing", () => {
  let done = 0;
  playSlagMerge(swords, { def: "knightsSword", rarity: "rare" }, true, () => done++);
  assert.equal(done, 1);
  assert.equal(queued, null);
});
