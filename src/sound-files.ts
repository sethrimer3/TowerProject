/** The recorded sounds in `public/assets/sounds/` (brought over from Tower
 * Defense), fetched and decoded on first use. One-shots are short clips the
 * cues in `sound.ts` play (a variant at random where there are several);
 * beds are long loops, each baked once into a buffer whose end is
 * cross-faded into its start, so a recording that wasn't cut as a clean loop
 * still repeats without a click. Nothing here plays anything: it only hands
 * out buffers once they are ready, and null until then (or for good, if a
 * file fails to load), so callers fall back to the sounds made in code. */

const BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";

/** Each short clip and its variants, by path under `assets/sounds/`. */
export const ONE_SHOTS = {
  /** An oak button pressed. */
  buttonThud: ["ui/button-thud"],
  /** An arrow or a Ranged enemy's shot striking. */
  arrowHit: ["battle/arrow-hit-flesh"],
  /** A blow landing in a fight. */
  punch: ["battle/melee-punch"],
  /** A Bomb going off. */
  explosionSmall: ["battle/explosion-small"],
  /** An enemy or the hero falling. */
  bodyFall: ["battle/body-fall-1", "battle/body-fall-2"],
} as const satisfies Record<string, readonly string[]>;
export type OneShot = keyof typeof ONE_SHOTS;

/** The long loops. */
export const BEDS = {
  /** Wind through the trees of the forest outside. */
  windForest: "ambience/wind-forest",
} as const satisfies Record<string, string>;
export type Bed = keyof typeof BEDS;

/** Seconds of each bed's end blended into its start. */
export const LOOP_FADE = 2;

type Slot<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed" };
/** Decoded audio belongs to the context that decoded it, so each context
 * keeps its own. */
const shots = new WeakMap<BaseAudioContext, Map<OneShot, Slot<AudioBuffer[]>>>();
const beds = new WeakMap<BaseAudioContext, Map<Bed, Slot<AudioBuffer>>>();

async function decode(ctx: BaseAudioContext, path: string): Promise<AudioBuffer> {
  const res = await fetch(`${BASE}assets/sounds/${path}.mp3`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

/** `ctx`'s map in `maps`, made on first use. */
function mapOf<K, T>(maps: WeakMap<BaseAudioContext, Map<K, Slot<T>>>, ctx: BaseAudioContext) {
  let map = maps.get(ctx);
  if (!map) maps.set(ctx, (map = new Map()));
  return map;
}

/** Fills `key`'s entry in `map` from `load`, once. */
function fetchInto<K, T>(map: Map<K, Slot<T>>, key: K, load: () => Promise<T>): T | null {
  const had = map.get(key);
  if (had) return had.state === "ready" ? had.value : null;
  map.set(key, { state: "loading" });
  load().then(
    (value) => map.set(key, { state: "ready", value }),
    () => map.set(key, { state: "failed" }),
  );
  return null;
}

/** One-shot `name`'s decoded variants, or null while they load (asking for
 * them starts the load). */
export function oneShot(ctx: BaseAudioContext, name: OneShot): AudioBuffer[] | null {
  return fetchInto(mapOf(shots, ctx), name, () => Promise.all(ONE_SHOTS[name].map((p) => decode(ctx, p))));
}

/** Starts loading every one-shot, so the first of each isn't missed. */
export function preloadOneShots(ctx: BaseAudioContext) {
  for (const name of Object.keys(ONE_SHOTS) as OneShot[]) oneShot(ctx, name);
}

/** Bed `name` as a seamless loop, or null while it loads. */
export function bed(ctx: BaseAudioContext, name: Bed): AudioBuffer | null {
  return fetchInto(mapOf(beds, ctx), name, async () => crossfadeLoop(ctx, await decode(ctx, BEDS[name]), LOOP_FADE));
}

/** `buf` made to loop: its last `fade` seconds blended into its first,
 * equal-power, and cut off there. Played on repeat, the end (which is the
 * original's audio just before that tail) runs straight into the start
 * (which carries on from it), so the seam falls inside a slow cross-fade
 * rather than at a cut. */
export function crossfadeLoop(ctx: BaseAudioContext, buf: AudioBuffer, fade: number): AudioBuffer {
  const f = Math.min(Math.floor(fade * buf.sampleRate), Math.floor(buf.length / 3));
  const len = buf.length - f, out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch), dst = out.getChannelData(ch);
    dst.set(src.subarray(0, len));
    blendLoop(dst, src, len, f);
  }
  return out;
}

/** The blend itself, over plain arrays: `dst[i]`, for the first `f`
 * samples, takes the head fading in and `src[len + i]` (the tail) fading
 * out. */
export function blendLoop(dst: Float32Array, src: Float32Array, len: number, f: number) {
  for (let i = 0; i < f; i++) {
    const t = (i + 0.5) / f;
    dst[i] = src[i] * Math.sin((t * Math.PI) / 2) + src[len + i] * Math.cos((t * Math.PI) / 2);
  }
}
