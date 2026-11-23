import { outsideWeather, type Weather } from "../outside.ts";
import { tileRandom } from "../random.ts";
import { runningAudio, soundOn } from "../sound.ts";
import { oneShot } from "../sound-files.ts";

// No full-screen flashes: a single slow, localized glow peaks at 1.5% opacity.
export function lightningOpacity(seconds: number) {
  return seconds < 0 || seconds > 4 ? 0 : Math.sin(seconds * Math.PI / 4) ** 2 * 0.015;
}

/** How loud the recorded thunder plays. */
const THUNDER_GAIN = 0.3;

export class OutdoorWeather {
  seed = -1;
  elapsed = 0;
  nextThunder = 45;
  lightningStart = -100;
  sounded = false;
  source?: AudioBufferSourceNode;
  silence() {
    if (this.source) { this.source.stop(); this.source.disconnect(); this.source = undefined; }
  }
  /** Thunder: the recording once it has loaded, else a rumble made from
   * low noise. */
  rumble(seed: number) {
    const a = runningAudio();
    if (!a || !soundOn()) return;
    const recorded = oneShot(a, "thunder")?.[0];
    if (recorded) {
      this.silence();
      const source = a.createBufferSource(), gain = a.createGain();
      source.buffer = recorded;
      gain.gain.value = THUNDER_GAIN;
      source.connect(gain).connect(a.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); if (this.source === source) this.source = undefined; };
      this.source = source; source.start();
      return;
    }
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
  if (weather === "evening") paintSunset(sky);
  if (weather === "rain" || weather === "storm") paintRain(sky, weather === "storm");
  if (lightning !== null) paintLightning(sky, lightning);
  sky.c.restore();
}

/** An evening's sunset over the clearing: its colors warmed toward gold and
 * rose from the top left, where the sun sets, and dimmed toward dusky
 * violet at the far corner. The one weather that tints the whole scene. */
function paintSunset({ c, size }: Sky) {
  c.globalCompositeOperation = "soft-light";
  const warm = c.createLinearGradient(0, 0, size * 0.45, size);
  warm.addColorStop(0, "rgba(255,168,72,0.6)");
  warm.addColorStop(0.5, "rgba(244,116,84,0.45)");
  warm.addColorStop(1, "rgba(128,72,150,0.45)");
  c.fillStyle = warm; c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = "multiply";
  const dusk = c.createLinearGradient(0, 0, size * 0.45, size);
  dusk.addColorStop(0, "rgba(255,214,170,0.16)");
  dusk.addColorStop(1, "rgba(112,84,150,0.24)");
  c.fillStyle = dusk; c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = "source-over";
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
