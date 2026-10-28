import { outsideWeather, type Weather } from "../outside.ts";
import { tileRandom } from "../random.ts";

// No full-screen flashes: a single slow, localized glow peaks at 1.5% opacity.
export function lightningOpacity(seconds: number) {
  return seconds < 0 || seconds > 4 ? 0 : Math.sin(seconds * Math.PI / 4) ** 2 * 0.015;
}

export class OutdoorWeather {
  seed = -1;
  elapsed = 0;
  nextThunder = 45;
  lightningStart = -100;
  sounded = false;
  audio?: AudioContext;
  source?: AudioBufferSourceNode;
  // Must be called directly from a user gesture for browser audio policy.
  unlock() {
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === "suspended") void this.audio.resume().catch(() => {});
    } catch { /* Audio is optional on browsers without a usable output device. */ }
  }
  silence() {
    if (this.source) { this.source.stop(); this.source.disconnect(); this.source = undefined; }
  }
  rumble(seed: number) {
    const a = this.audio;
    if (!a || a.state !== "running") return;
    const buffer = a.createBuffer(1, a.sampleRate * 4, a.sampleRate);
    const data = buffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      low = (low + (tileRandom(i, 3, seed) * 2 - 1) * 0.02) / 1.02;
      data[i] = low * 3;
    }
    this.silence();
    const source = a.createBufferSource(), gain = a.createGain(), filter = a.createBiquadFilter();
    source.buffer = buffer; filter.type = "lowpass"; filter.frequency.value = 180;
    gain.gain.setValueAtTime(0, a.currentTime);
    gain.gain.linearRampToValueAtTime(0.09, a.currentTime + 1.2);
    gain.gain.linearRampToValueAtTime(0, a.currentTime + 4);
    source.connect(filter).connect(gain).connect(a.destination);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); if (this.source === source) this.source = undefined; };
    this.source = source; source.start();
  }
  draw(c: CanvasRenderingContext2D, size: number, seed: number, frame: WeatherFrame, shadows?: (seconds: number) => void) {
    this.follow(seed);
    const weather: Weather = outsideWeather(seed);
    const live = frame.active && !frame.reduceMotion;
    if (live) this.elapsed += frame.dt;
    if (!live || !frame.sound) this.silence();
    const lightning = weather === "storm" && live ? this.thunder(seed, frame.sound) : null;
    shadows?.(this.elapsed);
    paintWeather({ c, size, seed, elapsed: this.elapsed }, weather, lightning);
  }
  /** A new seed starts its weather afresh. */
  private follow(seed: number) {
    if (seed === this.seed) return;
    this.silence(); this.seed = seed; this.elapsed = 0;
    this.lightningStart = -100; this.nextThunder = 45 + tileRandom(4, 1, seed) * 30;
  }
  /** Strikes lightning when it's due and rumbles a couple of seconds after;
   * returns the seconds since the last strike. */
  private thunder(seed: number, sound: boolean) {
    if (this.elapsed >= this.nextThunder) {
      this.lightningStart = this.elapsed; this.sounded = false;
      this.nextThunder = this.elapsed + 45 + tileRandom(Math.floor(this.elapsed), 1, seed) * 35;
    }
    const since = this.elapsed - this.lightningStart;
    if (!this.sounded && rumbleDue(since)) {
      this.sounded = true;
      if (sound) this.rumble(seed ^ Math.floor(this.elapsed));
    }
    return since;
  }
}

/** One frame's timing and settings for the weather. */
export type WeatherFrame = { dt: number; reduceMotion: boolean; active: boolean; sound: boolean };
/** Thunder follows a strike by two to five seconds. */
const rumbleDue = (since: number) => since >= 2 && since < 5;
type Sky = { c: CanvasRenderingContext2D; size: number; seed: number; elapsed: number };

/** The whole weather overlay; `lightning` is the seconds since the last
 * strike while a live storm shows it, else null. */
function paintWeather(sky: Sky, weather: Weather, lightning: number | null) {
  sky.c.save();
  if (weather === "sunny") paintSun(sky);
  else paintOvercast(sky, weather);
  if (weather === "rain" || weather === "storm") paintRain(sky, weather === "storm");
  if (lightning !== null) paintLightning(sky, lightning);
  sky.c.restore();
}

/** A warm wash; moving shafts of sunlight follow the shared cloud gaps. */
function paintSun({ c, size }: Sky) {
  const sun = c.createLinearGradient(0, 0, size, size);
  sun.addColorStop(0, "#ffe8a321"); sun.addColorStop(1, "#ffe8a300");
  c.fillStyle = sun; c.fillRect(0, 0, size, size);
}

const OVERCAST: Record<Weather, string> = { storm: "#14213550", rain: "#26394730", cloudy: "#36414c18", sunny: "#36414c18" };

/** The atmosphere's tint; surface-aware cloud shadows are drawn separately. */
function paintOvercast({ c, size }: Sky, weather: Weather) {
  c.fillStyle = OVERCAST[weather];
  c.fillRect(0, 0, size, size);
}

/** Slanting streaks of rain, heavier in a storm. */
function paintRain({ c, size, seed, elapsed }: Sky, storm: boolean) {
  c.strokeStyle = storm ? "#b4cbd33d" : "#b4cbd330";
  c.lineWidth = Math.max(0.6, size / 700); c.beginPath();
  for (let i = 0; i < (storm ? 100 : 65); i++) {
    const x = ((tileRandom(i, 11, seed) - elapsed * 0.07) % 1 + 1) % 1 * size;
    const y = ((tileRandom(i, 12, seed) + elapsed * 0.65) % 1) * size;
    c.moveTo(x, y); c.lineTo(x - size * 0.006, y + size * 0.023);
  }
  c.stroke();
}

/** The faint glow of distant lightning in the top right. */
function paintLightning({ c, size }: Sky, since: number) {
  const glow = c.createRadialGradient(size * 0.72, 0, 0, size * 0.72, 0, size * 0.6);
  glow.addColorStop(0, `rgba(205,220,230,${lightningOpacity(since)})`);
  glow.addColorStop(1, "rgba(205,220,230,0)"); c.fillStyle = glow; c.fillRect(0, 0, size, size);
}
