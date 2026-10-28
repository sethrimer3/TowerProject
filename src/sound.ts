import { stream } from "./random.ts";
import { oneShot, preloadOneShots, type OneShot } from "./sound-files.ts";

/** The keep's sounds. Most are made here with Web Audio; a few cues play a
 * recording from `sound-files.ts` instead (`SAMPLED`), falling back to their
 * made voice while it loads (those with no made voice stay silent). Each cue
 * is built from a few voices (a wooden knock is a burst of filtered noise on
 * a low thump; a bell is a handful of inharmonic sine partials; a horn is a
 * sawtooth through a closing low-pass) and everything rings into a short
 * generated stone-hall echo. Nothing plays until the player's first press,
 * which is when browsers let a page make sound. */
export type Cue =
  /** Pressing an oak button. */
  | "knock"
  /** A card refused by a full hand: two low, descending notes. */
  | "error"
  /** Choosing a page on the stone tab row. */
  | "stone"
  /** Spending at the Armory or on Training: coins on a counter. */
  | "coin"
  /** A skill-tree rank: a glass phial chiming. */
  | "chime"
  /** A skill-tree node's first rank: the chime, and a rising shimmer. */
  | "unlock"
  /** A wave held: a short brass call. */
  | "wave"
  /** A wave held past the best: a fanfare and a bell. */
  | "record"
  /** A Commander level gained: bells climbing a chord. */
  | "levelUp"
  /** A Training rank completed: one bright hand bell. */
  | "trained"
  /** A boss wave: a low war horn. */
  | "horn"
  /** The keep falls: a tolling bell. */
  | "fallen"
  /** A blow landing in a fight (a recording only). */
  | "punch"
  /** An arrow or a Ranged enemy's shot striking (a recording only). */
  | "arrowHit"
  /** An enemy or the hero falling (a recording only). */
  | "bodyFall"
  /** A Bomb going off (a recording only). */
  | "blast";

const rand = stream("effects");
let enabled: () => boolean = () => true;
let ctx: AudioContext | null = null;
let out: GainNode, hall: GainNode, noiseBuf: AudioBuffer;
/** When each cue last played, so a burst of the same event stays one sound. */
const lastAt = new Map<Cue, number>();

/** Which setting turns sound off; checked at every cue. */
export function soundEnabledBy(isOn: () => boolean) {
  enabled = isOn;
}

/** The audio graph, built on first use: voices → dry out and a hall send →
 * a gentle compressor → the speakers. */
function audio(): AudioContext | null {
  if (!ctx) {
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(comp);
    const verb = ctx.createConvolver();
    verb.buffer = hallImpulse(ctx);
    hall = ctx.createGain();
    hall.gain.value = 0.28;
    hall.connect(verb);
    verb.connect(out);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
    preloadOneShots(ctx);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A stone hall's echo: two channels of noise dying away over a second and
 * a half, darker as it fades. */
function hallImpulse(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 1.6), buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len, k = 0.6 - 0.5 * t;
      lp += k * (rand() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - t, 3.2);
    }
  }
  return buf;
}

/** Sends a voice's output to the dry mix and, by `wet`, into the hall. */
function route(node: AudioNode, wet = 1) {
  node.connect(out);
  if (wet > 0) {
    const send = ctx!.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(hall);
  }
}

/** A gain that rises over `attack` to `peak` and decays to silence by `end`. */
function envelope(at: number, peak: number, attack: number, end: number) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + end);
  return g;
}

type Tone = { type?: OscillatorType; freq: number; to?: number; at: number; peak: number; attack?: number; end: number; wet?: number; lowpass?: number; lowpassTo?: number; vibrato?: number };
/** One oscillator voice, optionally gliding to `to` and through a low-pass. */
function tone({ type = "sine", freq, to, at, peak, attack = 0.005, end, wet = 1, lowpass, lowpassTo, vibrato }: Tone) {
  const osc = ctx!.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + end);
  if (vibrato) {
    const lfo = ctx!.createOscillator(), depth = ctx!.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + end + 0.05);
  }
  let node: AudioNode = osc;
  if (lowpass) {
    const f = ctx!.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(lowpass, at);
    if (lowpassTo) f.frequency.exponentialRampToValueAtTime(lowpassTo, at + end);
    node = node.connect(f);
  }
  route(node.connect(envelope(at, peak, attack, end)), wet);
  osc.start(at);
  osc.stop(at + end + 0.05);
}

/** A burst of noise through a band-pass: the grain of wood or stone. */
function noise(at: number, end: number, peak: number, freq: number, q: number, wet = 1) {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx!.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  route(src.connect(f).connect(envelope(at, peak, 0.002, end)), wet);
  src.start(at, rand() * 0.5);
  src.stop(at + end + 0.05);
}

/** A struck bell: inharmonic partials, the higher ones dying first. */
function bell(freq: number, at: number, peak: number, length: number, wet = 1) {
  const partials: [number, number, number][] = [[0.5, 0.5, 1.3], [1, 1, 1], [2, 0.55, 0.6], [2.76, 0.35, 0.45], [5.4, 0.18, 0.25], [8.9, 0.08, 0.15]];
  for (const [ratio, amp, life] of partials) tone({ freq: freq * ratio, at, peak: peak * amp, attack: 0.003, end: length * life, wet });
}

/** Up to ±`cents` of pitch, so repeats never sound stamped from one mould. */
const vary = (cents: number) => Math.pow(2, ((rand() * 2 - 1) * cents) / 1200);

/** The made voices; a cue missing here is only ever a recording. */
const CUES: Partial<Record<Cue, (t: number) => void>> = {
  error(t) {
    tone({ type: "triangle", freq: 190, to: 145, at: t, peak: 0.18, end: 0.1, wet: 0.15 });
    tone({ type: "triangle", freq: 145, to: 100, at: t + 0.11, peak: 0.18, end: 0.15, wet: 0.15 });
  },
  knock(t) {
    const v = vary(60);
    noise(t, 0.05, 0.5, 1400 * v, 4, 0.4);
    tone({ type: "triangle", freq: 220 * v, to: 120 * v, at: t, peak: 0.35, end: 0.09, wet: 0.4 });
  },
  stone(t) {
    const v = vary(50);
    noise(t, 0.09, 0.45, 520 * v, 1.6, 0.7);
    noise(t + 0.012, 0.05, 0.2, 2600 * v, 3, 0.5);
    tone({ freq: 95 * v, to: 70 * v, at: t, peak: 0.4, end: 0.14, wet: 0.5 });
  },
  coin(t) {
    for (const [dt, f] of [[0, 2350], [0.07, 2960], [0.13, 2620]] as const) {
      const v = vary(40);
      tone({ freq: f * v, at: t + dt, peak: 0.16, end: 0.35, wet: 0.6 });
      tone({ freq: f * 2.71 * v, at: t + dt, peak: 0.07, end: 0.12, wet: 0.6 });
      noise(t + dt, 0.025, 0.12, 6000, 2, 0.3);
    }
  },
  chime(t) {
    const v = vary(20);
    bell(1318 * v, t, 0.12, 1.1);
    bell(1975 * v, t + 0.06, 0.07, 0.9);
  },
  unlock(t) {
    CUES.chime!(t);
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone({ freq: f, at: t + 0.08 + i * 0.05, peak: 0.06, attack: 0.02, end: 0.8, wet: 1.4 }));
    tone({ type: "triangle", freq: 196, at: t, peak: 0.08, attack: 0.2, end: 1.4, wet: 1 });
  },
  wave(t) {
    // A fourth and a fifth on a brass horn: G, C, then D over G.
    const horn = (f: number, at: number, len: number, peak = 0.13) =>
      tone({ type: "sawtooth", freq: f, at, peak, attack: 0.03, end: len, lowpass: 2400, lowpassTo: 700, wet: 0.8, vibrato: 3 });
    horn(392, t, 0.18);
    horn(523, t + 0.16, 0.18);
    horn(392, t + 0.34, 0.6, 0.09);
    horn(587, t + 0.34, 0.6, 0.11);
  },
  record(t) {
    const horn = (f: number, at: number, len: number, peak = 0.12) =>
      tone({ type: "sawtooth", freq: f, at, peak, attack: 0.03, end: len, lowpass: 2800, lowpassTo: 800, wet: 0.9, vibrato: 3 });
    horn(392, t, 0.14);
    horn(392, t + 0.13, 0.14);
    horn(523, t + 0.26, 0.2);
    for (const f of [523, 659, 784]) horn(f, t + 0.46, 1, 0.08);
    bell(1046, t + 0.46, 0.1, 2);
  },
  levelUp(t) {
    [659, 784, 988, 1318].forEach((f, i) => bell(f, t + i * 0.09, 0.08, 1.2 + i * 0.2));
  },
  trained(t) {
    bell(1568 * vary(10), t, 0.09, 1.4);
  },
  horn(t) {
    const horn = (f: number, at: number, len: number) =>
      tone({ type: "sawtooth", freq: f, to: f * 0.97, at, peak: 0.16, attack: 0.12, end: len, lowpass: 900, lowpassTo: 300, wet: 1.2, vibrato: 2 });
    horn(147, t, 0.9);
    horn(110, t + 0.75, 1.5);
    tone({ type: "sawtooth", freq: 73.5, at: t + 0.75, peak: 0.08, attack: 0.2, end: 1.5, lowpass: 500, wet: 1 });
  },
  fallen(t) {
    bell(165, t, 0.2, 3.2, 1.4);
    bell(147, t + 1.1, 0.16, 3.6, 1.4);
  },
};

/** The cues that play a recording: which, how loud (the files are all
 * peak-normalized), how much of it rings into the hall, and how far its
 * pitch may wander (in cents) so repeats differ. */
const SAMPLED: Partial<Record<Cue, { file: OneShot; gain: number; wet: number; cents: number }>> = {
  knock: { file: "buttonThud", gain: 0.45, wet: 0.2, cents: 80 },
  punch: { file: "punch", gain: 0.3, wet: 0.15, cents: 200 },
  arrowHit: { file: "arrowHit", gain: 0.3, wet: 0.15, cents: 200 },
  bodyFall: { file: "bodyFall", gain: 0.4, wet: 0.2, cents: 150 },
  blast: { file: "explosionSmall", gain: 0.5, wet: 0.35, cents: 150 },
};

/** Recordings ringing now; past `MAX_VOICES` new ones are dropped, so a
 * burst of blows never piles up into mud. */
let voices = 0;
const MAX_VOICES = 12;

/** Plays one of `s.file`'s variants now, unless it hasn't loaded yet. */
function playSample(ac: AudioContext, s: NonNullable<(typeof SAMPLED)[Cue]>): boolean {
  const bufs = oneShot(ac, s.file);
  if (!bufs) return false;
  if (voices >= MAX_VOICES) return true;
  const src = ac.createBufferSource();
  src.buffer = bufs[Math.floor(rand() * bufs.length) % bufs.length];
  src.playbackRate.value = vary(s.cents);
  const g = ac.createGain();
  g.gain.value = s.gain;
  route(src.connect(g), s.wet);
  voices++;
  src.onended = () => {
    voices--;
    g.disconnect();
  };
  src.start(ac.currentTime + 0.01);
  return true;
}

/** Plays a cue now, unless sound is off, the browser has none, or the same
 * cue just played. */
export function play(cue: Cue) {
  if (!enabled()) return;
  const now = performance.now();
  if (now - (lastAt.get(cue) ?? -Infinity) < 60) return;
  lastAt.set(cue, now);
  const ac = audio();
  if (!ac) return;
  const sampled = SAMPLED[cue];
  if (sampled && playSample(ac, sampled)) return;
  CUES[cue]?.(ac.currentTime + 0.01);
}
