import { bed, BEDS, type Bed } from "./sound-files.ts";
import { runningAudio, soundOn } from "./sound.ts";
import type { Weather } from "./outside.ts";
import { stream } from "./random.ts";

const effects = stream("effects");

/** How loud each bed plays at its full level (the loops are all
 * loudness-matched, so these set the balance between them). */
export const BED_GAIN: Readonly<Record<Bed, number>> = { windForest: 0.12, windChimes: 0.07, blacksmith: 0.22, dockWater: 0.2, meditative: 0.1, divineRelic: 0.3, evening: 0.14 };
/** Seconds a bed takes to rise or die away. */
export const BED_FADE = 1.5;

/** How loud each bed should play, from 0 (silent) to 1 (its full level). */
export type Levels = Partial<Record<Bed, number>>;

/** What the forest and the lake play, from where the hero stands. */
export type Surroundings = {
  /** Where the hero stands: the forest clearing, the lake, inside, or in
   * the builders' room on floor 999999 (`divine`). */
  place: "forest" | "lake" | "inside" | "divine";
  weather: Weather;
  /** The Weather sounds setting: the wind and its chimes. */
  weatherSound: boolean;
  hero: { x: number; y: number };
  /** The middle of the Blacksmith's forge, while it stands in the clearing. */
  blacksmith?: { x: number; y: number };
  /** Where the fisherman sits, at the lake. */
  fisherman?: { x: number; y: number };
  /** The Divine Relic's chest, in the builders' room. */
  relic?: { x: number; y: number };
};

/** Tiles within which the Blacksmith is heard, loudest beside him. */
export const BLACKSMITH_REACH = 9;
/** Tiles within which the dock's water is heard above its quietest. */
export const DOCK_REACH = 12;
/** The dock's water, as quiet as it gets anywhere at the lake. */
export const DOCK_FLOOR = 0.15;
/** Tiles within which the Divine Relic's hum rises above its quietest, and that quietest. */
export const RELIC_REACH = 10;
export const RELIC_FLOOR = 0.2;
/** The weather whose wind is strong enough to ring the chimes. */
const WINDY: ReadonlySet<Weather> = new Set(["cloudy", "storm"]);

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
/** 1 at `d` 0, down to 0 at `reach` and beyond. */
const near = (d: number, reach: number) => Math.max(0, 1 - d / reach);

/** The beds the board plays where the hero stands: outside, the wind (and
 * the chimes on a windy day, or on an evening its own ambience in place of
 * the wind) while Weather sounds is on; in the clearing,
 * the Blacksmith's forge, louder the nearer; at the lake, the dock's water,
 * louder nearer the fisherman, and the meditative music; in the builders'
 * room, only the Divine Relic's hum, louder nearer its chest. Inside, nothing. */
export function surroundingLevels(s: Surroundings): Levels {
  if (s.place === "inside") return {};
  if (s.place === "divine") return s.relic ? { divineRelic: RELIC_FLOOR + (1 - RELIC_FLOOR) * near(distance(s.hero, s.relic), RELIC_REACH) } : {};
  const levels: Levels = {};
  if (s.weatherSound) {
    // A calm evening plays its own ambience in place of the wind.
    if (s.weather === "evening") levels.evening = 1;
    else levels.windForest = 1;
    if (WINDY.has(s.weather)) levels.windChimes = 1;
  }
  if (s.place === "forest" && s.blacksmith) {
    const level = near(distance(s.hero, s.blacksmith), BLACKSMITH_REACH);
    if (level > 0) levels.blacksmith = level;
  }
  if (s.place === "lake") {
    levels.meditative = 1;
    if (s.fisherman) levels.dockWater = DOCK_FLOOR + (1 - DOCK_FLOOR) * near(distance(s.hero, s.fisherman), DOCK_REACH);
  }
  return levels;
}

/** Each bed's level, the loudest any wish asks for. */
export function mixLevels(wishes: Iterable<Levels>): Levels {
  const out: Levels = {};
  for (const levels of wishes)
    for (const name of Object.keys(levels) as Bed[]) out[name] = Math.max(out[name] ?? 0, levels[name] ?? 0);
  return out;
}

type Playing = { source: AudioBufferSourceNode; gain: GainNode; level: number };

/** The ambience: the long loops (`BEDS`) playing under everything. Each
 * part of the game says what it wants (`set`, under its own name: the
 * board where the hero stands, the voyage with the fisherman); each bed
 * plays at the loudest level any of them asks, fading between levels, so a
 * bed two of them want carries on unbroken from one to the other. All of
 * it is silent while sound is off or the page is hidden. */
class Ambience {
  private wishes = new Map<string, Levels>();
  private playing = new Map<Bed, Playing>();

  constructor() {
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => this.mix());
  }

  /** What `who` wants playing now (nothing, `{}`, lets its beds fade). */
  set(who: string, levels: Levels) {
    this.wishes.set(who, levels);
    this.mix();
  }

  private mix() {
    const a = runningAudio();
    if (!a) return;
    const on = soundOn() && !(typeof document !== "undefined" && document.hidden);
    const wanted = on ? mixLevels(this.wishes.values()) : {};
    for (const name of Object.keys(BEDS) as Bed[]) {
      const level = wanted[name] ?? 0, now = this.playing.get(name);
      if (now && Math.abs(now.level - level) < 0.005) continue;
      if (level <= 0) {
        if (now) this.fadeOut(a, name, now);
        continue;
      }
      if (now) {
        now.gain.gain.setTargetAtTime(level * BED_GAIN[name], a.currentTime, BED_FADE / 3);
        now.level = level;
        continue;
      }
      const buffer = bed(a, name);
      // Still loading: a later frame starts it.
      if (!buffer) continue;
      const source = a.createBufferSource(), gain = a.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.setValueAtTime(0, a.currentTime);
      gain.gain.linearRampToValueAtTime(level * BED_GAIN[name], a.currentTime + BED_FADE);
      source.connect(gain).connect(a.destination);
      // Each start begins somewhere in the loop, so it never sounds restarted.
      source.start(0, (effects() * buffer.duration) % buffer.duration);
      this.playing.set(name, { source, gain, level });
    }
  }

  private fadeOut(a: AudioContext, name: Bed, { source, gain }: Playing) {
    this.playing.delete(name);
    gain.gain.cancelScheduledValues(a.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, a.currentTime);
    gain.gain.linearRampToValueAtTime(0, a.currentTime + BED_FADE);
    source.stop(a.currentTime + BED_FADE);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }
}

export const ambience = new Ambience();
