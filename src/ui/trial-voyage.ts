import { drawKit } from "../sprites/kit.ts";

export const VOYAGE_FADE_MS = 600;
export const VOYAGE_MENU_DELAY_MS = 500;

/** A transient ocean backdrop. All motion uses visual time, never game turns. */
export class TrialVoyage {
  readonly element = document.createElement("div");
  private canvas = document.createElement("canvas");
  private frame = 0;
  private started = performance.now();
  private leaving: number | null = null;
  private ready = false;
  private finish: (() => void) | null = null;
  private key = (e: KeyboardEvent) => {
    if (document.querySelector("dialog[open]")) return;
    e.preventDefault(); e.stopImmediatePropagation();
  };
  constructor(private reduceMotion: boolean, private onReady: () => void) {
    this.element.id = "trial-voyage";
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "A small wooden sailboat crossing the ocean, with the fisherman at the tiller and your hero aboard.");
    this.element.append(this.canvas);
    document.body.append(this.element);
    document.documentElement.classList.add("trial-at-sea");
    window.addEventListener("keydown", this.key, true);
    this.frame = requestAnimationFrame(this.draw);
  }
  close(done: () => void) {
    if (this.leaving !== null) return;
    this.leaving = performance.now(); this.finish = done;
  }
  private draw = (now: number) => {
    const elapsed = now - this.started;
    const c = this.canvas.getContext("2d")!;
    const width = Math.ceil(innerWidth * devicePixelRatio), height = Math.ceil(innerHeight * devicePixelRatio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const w = innerWidth, h = innerHeight;
    if (elapsed < VOYAGE_FADE_MS && this.leaving === null) {
      c.clearRect(0, 0, w, h);
      c.fillStyle = `rgba(0,0,0,${elapsed / VOYAGE_FADE_MS})`; c.fillRect(0, 0, w, h);
      this.element.dataset.phase = "departing";
      this.frame = requestAnimationFrame(this.draw); return;
    }
    const t = this.reduceMotion ? 0 : elapsed / 1000;
    const sea = c.createLinearGradient(0, 0, 0, h);
    sea.addColorStop(0, "#0b3448"); sea.addColorStop(1, "#17647b");
    c.fillStyle = sea; c.fillRect(0, 0, w, h);
    // Water streaks drift right while the camera stays fixed on the hull.
    for (let row = 0; row < h / 23 + 1; row++) {
      for (let col = -1; col < w / 110 + 1; col++) {
        const x = ((col * 110 + row * 39 + t * (22 + row % 4 * 5)) % (w + 220) + w + 220) % (w + 220) - 110;
        const y = row * 23 + Math.sin(t * 1.7 + row + col) * 3;
        c.strokeStyle = row % 3 ? "#6fa8ad44" : "#bce2d766";
        c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 14, y - 4, x + 29, y); c.stroke();
      }
    }
    c.save(); c.translate(w / 2, h * .30 + Math.sin(t * 1.6) * 3);
    const scale = Math.min(1.7, w / 300, h / 420); c.scale(scale, scale);
    c.rotate(Math.sin(t * 1.2) * .012);
    c.fillStyle = "#092c3d99"; c.beginPath(); c.ellipse(0, 27, 112, 18, 0, 0, Math.PI * 2); c.fill();
    // Stern wake trails to the right.
    c.strokeStyle = "#c4e6df88";
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(88 + i * 9, 16 + i * 6); c.lineTo(133 + i * 14, 21 + i * 9); c.stroke(); }
    c.fillStyle = "#75492d"; c.beginPath(); c.moveTo(-108, -5); c.lineTo(99, -5); c.lineTo(78, 28); c.quadraticCurveTo(-55, 46, -108, -5); c.fill();
    c.strokeStyle = "#c39a61"; c.lineWidth = 3; c.stroke();
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-81 + i * 5, 3 + i * 5); c.lineTo(91 - i * 4, 3 + i * 5); c.strokeStyle = "#392c24"; c.lineWidth = 1; c.stroke(); }
    c.fillStyle = "#b88c53"; c.fillRect(-69, -8, 143, 9);
    // Fisherman steers at the stern; the hero sits forward of the mast.
    drawKit(c, "lake-fisherman", 38, -43, 48, 40);
    drawKit(c, "hero-left", -58, -29, 26, 26);
    c.strokeStyle = "#4b3529"; c.lineWidth = 4; c.beginPath(); c.moveTo(78, -10); c.lineTo(101, 9); c.stroke();
    c.fillStyle = "#825c38"; c.fillRect(-7, -113, 5, 112);
    c.strokeStyle = "#cfb77c"; c.lineWidth = 1; c.beginPath(); c.moveTo(-5, -110); c.lineTo(-81, -7); c.moveTo(-5, -110); c.lineTo(66, -7); c.stroke();
    // A cloth mesh: the mast edge is fixed, the free edge ripples in the wind.
    for (let strip = 0; strip < 24; strip++) {
      const y = strip / 24, next = (strip + 1) / 24;
      const edge = (v: number) => -5 + 71 * v + Math.sin(t * 6 - v * 9) * 8 * v;
      c.fillStyle = strip % 5 === 0 ? "#c8c0a0" : `rgb(${224 + Math.round(Math.sin(t * 6 - y * 9) * 9)},216,185)`;
      c.beginPath(); c.moveTo(-3, -106 + y * 88); c.lineTo(edge(y), -106 + y * 88); c.lineTo(edge(next), -106 + next * 88); c.lineTo(-3, -106 + next * 88); c.fill();
    }
    c.restore();
    let black = elapsed < VOYAGE_FADE_MS ? elapsed / VOYAGE_FADE_MS : Math.max(0, 1 - (elapsed - VOYAGE_FADE_MS) / VOYAGE_FADE_MS);
    if (this.leaving !== null) black = Math.min(1, (now - this.leaving) / VOYAGE_FADE_MS);
    c.fillStyle = `rgba(0,0,0,${black})`; c.fillRect(0, 0, w, h);
    this.element.dataset.phase = elapsed < VOYAGE_FADE_MS ? "departing" : elapsed < VOYAGE_FADE_MS * 2 ? "revealing" : "ocean";
    if (this.leaving !== null && now - this.leaving >= VOYAGE_FADE_MS) {
      const done = this.finish;
      this.destroy(); done?.();
      // Fade the black curtain off the freshly restored board.
      const curtain = document.createElement("div"); curtain.className = "voyage-return";
      document.body.append(curtain);
      curtain.animate([{opacity:1},{opacity:0}], {duration:VOYAGE_FADE_MS}).finished.then(() => curtain.remove());
      return;
    }
    if (!this.ready && this.leaving === null && elapsed >= VOYAGE_FADE_MS * 2 + VOYAGE_MENU_DELAY_MS) {
      this.ready = true; this.onReady();
    }
    this.frame = requestAnimationFrame(this.draw);
  };
  destroy() {
    cancelAnimationFrame(this.frame); this.element.remove();
    document.documentElement.classList.remove("trial-at-sea");
    window.removeEventListener("keydown", this.key, true);
  }
}
