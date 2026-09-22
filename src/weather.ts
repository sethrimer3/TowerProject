import { outsideWeather, type Weather } from "./outside.ts";
import { tileRandom } from "./themes.ts";

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
  draw(c: CanvasRenderingContext2D, size: number, seed: number, dt: number, reduceMotion: boolean, active: boolean, sound: boolean) {
    if (seed !== this.seed) {
      this.silence(); this.seed = seed; this.elapsed = 0;
      this.lightningStart = -100; this.nextThunder = 45 + tileRandom(4, 1, seed) * 30;
    }
    const weather: Weather = outsideWeather(seed);
    if (active && !reduceMotion) this.elapsed += dt;
    if (!active || !sound || reduceMotion) this.silence();
    if (weather === "storm" && active && !reduceMotion && this.elapsed >= this.nextThunder) {
      this.lightningStart = this.elapsed; this.sounded = false;
      this.nextThunder = this.elapsed + 45 + tileRandom(Math.floor(this.elapsed), 1, seed) * 35;
    }
    const since = this.elapsed - this.lightningStart;
    if (weather === "storm" && active && !reduceMotion && !this.sounded && since >= 2 && since < 5) {
      this.sounded = true;
      if (sound) this.rumble(seed ^ Math.floor(this.elapsed));
    }
    c.save();
    if (weather === "sunny") {
      const sun = c.createLinearGradient(0, 0, size, size);
      sun.addColorStop(0, "#ffe8a321"); sun.addColorStop(1, "#ffe8a300");
      c.fillStyle = sun; c.fillRect(0, 0, size, size);
      c.fillStyle = "#ffeaba09";
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(size * (0.1 + i * 0.2), 0); c.lineTo(size * (0.35 + i * 0.2), size); c.lineTo(size * (0.48 + i * 0.2), size); c.lineTo(size * (0.17 + i * 0.2), 0); c.fill(); }
    } else {
      c.fillStyle = weather === "storm" ? "#14213550" : weather === "rain" ? "#26394730" : "#36414c18";
      c.fillRect(0, 0, size, size);
      // Broad cloud shadows drift slowly across the clearing.
      for (let i = 0; i < 5; i++) {
        const x = ((tileRandom(i, 5, seed) + this.elapsed / 250) % 1.6 - 0.3) * size;
        const y = tileRandom(i, 9, seed) * size;
        const cloud = c.createRadialGradient(x, y, 0, x, y, size * 0.4);
        cloud.addColorStop(0, "#121e2b22"); cloud.addColorStop(1, "#121e2b00");
        c.fillStyle = cloud; c.fillRect(0, 0, size, size);
      }
    }
    if (weather === "rain" || weather === "storm") {
      c.strokeStyle = weather === "storm" ? "#b4cbd33d" : "#b4cbd330";
      c.lineWidth = Math.max(0.6, size / 700); c.beginPath();
      for (let i = 0; i < (weather === "storm" ? 100 : 65); i++) {
        const x = ((tileRandom(i, 11, seed) - this.elapsed * 0.07) % 1 + 1) % 1 * size;
        const y = ((tileRandom(i, 12, seed) + this.elapsed * 0.65) % 1) * size;
        c.moveTo(x, y); c.lineTo(x - size * 0.006, y + size * 0.023);
      }
      c.stroke();
    }
    if (weather === "storm" && !reduceMotion && active) {
      const glow = c.createRadialGradient(size * 0.72, 0, 0, size * 0.72, 0, size * 0.6);
      glow.addColorStop(0, `rgba(205,220,230,${lightningOpacity(since)})`);
      glow.addColorStop(1, "rgba(205,220,230,0)"); c.fillStyle = glow; c.fillRect(0, 0, size, size);
    }
    c.restore();
  }
}
