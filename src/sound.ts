import { stream } from "./random.ts";
import { oneShot, preloadOneShots, type OneShot } from "./sound-files.ts";
import type { UiLook } from "./theme-collection.ts";

/** The game's sounds, heard under every UI theme while their kind's setting
 * is on (`SoundKind`).
 * Most cues play a recording from `sound-files.ts` (`SAMPLED`); a few are
 * made here with Web Audio (a wooden knock is a burst of filtered noise on
 * a low thump; a bell is a handful of inharmonic sine partials), and the
 * button knock falls back to its made voice while its recording loads.
 * Everything rings into a short generated stone-hall echo. Nothing plays
 * until the player's first press, which is when browsers let a page make
 * sound. */
export type Cue =
  /** Pressing a button. */
  | "knock"
  /** A card refused by a full hand: two low, descending notes. */
  | "error"
  /** Choosing a page on the tab row. */
  | "stone"
  /** Spending on Training: coins on a counter. */
  | "coin"
  /** A skill-tree rank: a glass phial chiming. */
  | "chime"
  /** A skill-tree node's first rank: the chime, and a rising shimmer. */
  | "unlock"
  /** A Training rank completed: one bright hand bell. */
  | "trained"
  /** A Bomb going off (a recording only). */
  | "blast"
  /** The rest are recordings only, named as `ONE_SHOTS` names them (the
   * thunder is the weather's own, `render/weather.ts`). */
  | Exclude<OneShot, "buttonThud" | "explosionSmall" | "thunder">;

/** The kinds of sound, each turned on or off by its own setting on the
 * Settings page's Sounds section (`SOUND_SETTINGS`): notifications (what
 * finished while the player looked away), the UI's presses and pages, the
 * run's own events, the ambience's beds and the music. */
export type SoundKind = "notifications" | "ui" | "events" | "ambience" | "music";
export const SOUND_KINDS: readonly SoundKind[] = ["notifications", "ui", "events", "ambience", "music"];

/** Which kind each cue is, so its setting silences it. */
export const CUE_KIND: Readonly<Record<Cue, SoundKind>> = {
  trained: "notifications", gemBankFull: "notifications", dailyMission: "notifications", eventMission: "notifications",
  knock: "ui", stone: "ui", confirm: "ui", error: "ui", coin: "ui", chime: "ui", unlock: "ui",
  cardLevelUp: "ui", badgeDraw: "ui", equipmentTab: "ui", tournamentRewards: "ui", tutorialStart: "ui",
  shopPurchase: "ui", eggHatch: "ui", cardAscension: "ui", openGift: "ui", newTower: "ui",
  blast: "events", heroLevelUp: "events", gem: "events", gemGolden: "events", gemStellar: "events",
  attackShard: "events", defenseShard: "events", potion: "events", key: "events", chestCreak: "events",
  door1: "events", door2: "events", door3: "events", elixir: "events", provision: "events",
  phoenixSpark: "events", timeLoop: "events", warp: "events", divineRelic: "events", runStuck: "events",
  angelRevive: "events", bossAppears: "events", delveGate: "events", runSummary: "events", shrineBoon: "events",
  stoneSteps: "events", step: "events", run: "events", enterTower: "events", enterDelve: "events",
  arrowHit: "events", punch: "events", bodyFall: "events", slimeImpact: "events", lightningZap: "events",
  wolfCharge: "events", dragonFire: "events",
};

const rand = stream("effects");
let enabled: (kind: SoundKind) => boolean = () => true;
let look: () => UiLook | undefined = () => undefined;
let ctx: AudioContext | null = null;
/** Whether the player has pressed anything yet: until then nothing builds
 * the audio graph, which a browser would only leave suspended. */
let pressed = false;
let out: GainNode, hall: GainNode, noiseBuf: AudioBuffer;
/** When each cue last played, so a burst of the same event stays one sound. */
const lastAt = new Map<Cue, number>();
/** When a cue other than a press last played (`playUnlessOther`). */
let lastEvent = -Infinity;
/** The presses' sounds, which a general sound doesn't give way to. */
const PRESSES: ReadonlySet<Cue> = new Set(["knock", "stone", "confirm"]);

/** Which settings turn each kind of sound off; checked at every cue, and by
 * the ambience (`ambience.ts`) every frame. */
export function soundEnabledBy(isOn: (kind: SoundKind) => boolean) {
  enabled = isOn;
}
/** Whether `kind` of sound is on now; with no kind, whether any is. */
export const soundOn = (kind?: SoundKind) => (kind ? enabled(kind) : SOUND_KINDS.some(enabled));
/** Which UI theme is worn, so a theme's own recordings (`STYLE_SOUNDS`)
 * play in place of the defaults. */
export function soundStyleBy(worn: () => UiLook | undefined) {
  look = worn;
}

/** Builds the audio graph, or wakes it, from a press: browsers let a page
 * start sound only then. */
export function unlockAudio() {
  pressed = true;
  if (soundOn()) audio();
}
/** The audio context, if a press has already started it and it is
 * running; null otherwise (never builds one). */
export const runningAudio = (): AudioContext | null => (ctx && ctx.state === "running" ? ctx : null);

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
    preloadOneShots(ctx, look());
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

type Tone = { type?: OscillatorType; freq: number; to?: number; at: number; peak: number; attack?: number; end: number; wet?: number };
/** One oscillator voice, optionally gliding to `to`. */
function tone({ type = "sine", freq, to, at, peak, attack = 0.005, end, wet = 1 }: Tone) {
  const osc = ctx!.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + end);
  route(osc.connect(envelope(at, peak, attack, end)), wet);
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
  trained(t) {
    bell(1568 * vary(10), t, 0.09, 1.4);
  },
};

type Sample = { file: OneShot; gain: number; wet: number; cents: number };
/** How a pickup, a door or a chest sounds: a little pitch wander, a little hall. */
const PICKUP = { gain: 0.32, wet: 0.15, cents: 60 };
/** How a stinger sounds (a level, a reward, the loop): as recorded, at one pitch. */
const STINGER = { gain: 0.38, wet: 0.12, cents: 0 };
/** How a footstep sounds: quiet, dry, never twice the same. */
const FOOTSTEP = { gain: 0.2, wet: 0.08, cents: 120 };
/** The cues that play a recording: which, how loud (the files are all
 * peak-normalized), how much of it rings into the hall, and how far its
 * pitch may wander (in cents) so repeats differ. */
const SAMPLED: Partial<Record<Cue, Sample>> = {
  knock: { file: "buttonThud", gain: 0.45, wet: 0.2, cents: 80 },
  confirm: { file: "confirm", gain: 0.4, wet: 0.15, cents: 0 },
  punch: { file: "punch", gain: 0.3, wet: 0.15, cents: 200 },
  arrowHit: { file: "arrowHit", gain: 0.3, wet: 0.15, cents: 200 },
  bodyFall: { file: "bodyFall", gain: 0.4, wet: 0.2, cents: 150 },
  blast: { file: "explosionSmall", gain: 0.5, wet: 0.35, cents: 150 },
  slimeImpact: { file: "slimeImpact", gain: 0.35, wet: 0.15, cents: 150 },
  cardLevelUp: { file: "cardLevelUp", ...STINGER },
  badgeDraw: { file: "badgeDraw", ...STINGER },
  heroLevelUp: { file: "heroLevelUp", ...STINGER },
  equipmentTab: { file: "equipmentTab", gain: 0.35, wet: 0.15, cents: 0 },
  gemBankFull: { file: "gemBankFull", gain: 0.35, wet: 0.2, cents: 0 },
  tournamentRewards: { file: "tournamentRewards", ...STINGER },
  tutorialStart: { file: "tutorialStart", ...STINGER },
  gem: { file: "gem", ...PICKUP },
  gemGolden: { file: "gemGolden", ...PICKUP },
  gemStellar: { file: "gemStellar", ...PICKUP },
  attackShard: { file: "attackShard", ...PICKUP },
  defenseShard: { file: "defenseShard", ...PICKUP },
  potion: { file: "potion", ...PICKUP },
  key: { file: "key", ...PICKUP },
  chestCreak: { file: "chestCreak", ...PICKUP },
  door1: { file: "door1", ...PICKUP },
  door2: { file: "door2", ...PICKUP },
  door3: { file: "door3", ...PICKUP },
  elixir: { file: "elixir", ...PICKUP },
  provision: { file: "provision", ...PICKUP },
  phoenixSpark: { file: "phoenixSpark", ...STINGER },
  timeLoop: { file: "timeLoop", ...STINGER },
  warp: { file: "warp", ...STINGER },
  divineRelic: { file: "divineRelic", ...STINGER },
  runStuck: { file: "runStuck", ...STINGER },
  enterTower: { file: "enterTower", ...STINGER },
  enterDelve: { file: "enterDelve", ...STINGER },
  shopPurchase: { file: "shopPurchase", ...STINGER },
  shrineBoon: { file: "shrineBoon", ...STINGER },
  eggHatch: { file: "eggHatch", ...STINGER },
  cardAscension: { file: "cardAscension", ...STINGER },
  dailyMission: { file: "dailyMission", ...STINGER },
  eventMission: { file: "eventMission", ...STINGER },
  openGift: { file: "openGift", ...STINGER },
  angelRevive: { file: "angelRevive", ...STINGER },
  bossAppears: { file: "bossAppears", ...STINGER },
  delveGate: { file: "delveGate", ...STINGER },
  runSummary: { file: "runSummary", gain: 0.35, wet: 0.1, cents: 0 },
  newTower: { file: "newTower", ...STINGER },
  stoneSteps: { file: "stoneSteps", gain: 0.28, wet: 0.2, cents: 80 },
  step: { file: "step", ...FOOTSTEP },
  run: { file: "run", ...FOOTSTEP, gain: 0.16 },
  lightningZap: { file: "lightningZap", gain: 0.3, wet: 0.2, cents: 150 },
  wolfCharge: { file: "wolfCharge", gain: 0.3, wet: 0.15, cents: 100 },
  dragonFire: { file: "dragonFire", gain: 0.3, wet: 0.2, cents: 100 },
};

/** Recordings ringing now; past `MAX_VOICES` new ones are dropped, so a
 * burst of blows never piles up into mud. */
let voices = 0;
const MAX_VOICES = 12;
/** The variant each one-shot played last, which its next never repeats. */
const lastVariant = new Map<OneShot, number>();

/** Which of `count` variants plays after `last`: any at random but `last`. */
export function nextVariant(count: number, last: number | undefined, roll: number) {
  if (count < 2) return 0;
  if (last === undefined || last < 0 || last >= count) return Math.floor(roll * count) % count;
  const pick = Math.floor(roll * (count - 1)) % (count - 1);
  return pick >= last ? pick + 1 : pick;
}

/** Plays one of `s.file`'s variants now, unless it hasn't loaded yet. */
function playSample(ac: AudioContext, s: Sample): boolean {
  const bufs = oneShot(ac, s.file, look());
  if (!bufs) return false;
  if (voices >= MAX_VOICES) return true;
  const src = ac.createBufferSource();
  const variant = nextVariant(bufs.length, lastVariant.get(s.file), rand());
  lastVariant.set(s.file, variant);
  src.buffer = bufs[variant];
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

/** Plays a cue now, unless its kind of sound is off, the browser has none,
 * or the same cue just played. */
export function play(cue: Cue) {
  if (!enabled(CUE_KIND[cue])) return;
  const now = performance.now();
  if (now - (lastAt.get(cue) ?? -Infinity) < 60) return;
  lastAt.set(cue, now);
  if (!PRESSES.has(cue)) lastEvent = now;
  const ac = pressed ? audio() : null;
  if (!ac) return;
  const sampled = SAMPLED[cue];
  if (sampled && playSample(ac, sampled)) return;
  CUES[cue]?.(ac.currentTime + 0.01);
}

/** Plays `cue` a moment from now, unless another sound (not a press) began
 * just before or begins in between: a general sound giving way to a more
 * particular one, as Gems spent give way to the badges they drew. */
export function playUnlessOther(cue: Cue, wait = 150, before = 500) {
  if (!enabled(CUE_KIND[cue])) return;
  const asked = performance.now();
  if (asked - lastEvent < before) return;
  setTimeout(() => {
    if (lastEvent < asked) play(cue);
  }, wait);
}
