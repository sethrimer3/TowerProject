import { RARITY_TIERS, type EquipRarity } from "../equipment/balance.ts";
import { stream } from "../random.ts";
import { iconPixels } from "./equipment-icons.ts";

// The assemble's melt: the pieces going in fall apart into pixels of
// glowing slag, pool under each piece, flow together in the middle and rise
// into the piece that comes out, at its new rarity. Drawn on a canvas over
// the whole screen, outside #app; a press skips to the end.

/** When each stage ends, in ms from the start. */
const SHOW = 450, MELT = 1650, FLOW = 2650, FORM = 3550, HOLD = 4300;
/** Slag's colours, from cooling red to white-hot. */
const SLAG = ["#7a1606", "#c2380c", "#ff6a14", "#ffa53a", "#ffe08a"];

/** A piece by its definition id and rarity. */
type Spec = { def: string; rarity: EquipRarity };
type Bit = {
  color: string;
  /** Where it starts (the piece going in), pools, gathers and ends (the piece made). */
  home: [number, number]; pool: [number, number]; mid: [number, number]; end: [number, number];
  endColor: string;
  /** When it starts to melt and to flow, in ms. */
  melt: number; flow: number;
  heat: number;
};

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function mix(a: string, b: string, t: number) {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], t))).join(",")})`;
}

/** Plays the melt of `inputs` into `result`, then calls `done`. With Reduce
 * motion on (or no canvas), calls `done` at once. */
export function playSlagMerge(inputs: Spec[], result: Spec, reduceMotion: boolean, done: () => void) {
  const canvas = document.createElement("canvas");
  const g = canvas.getContext?.("2d");
  if (reduceMotion || !g) return done();
  const rng = stream("effects");
  const layer = document.createElement("div");
  layer.className = "slag-merge";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "Assembling");
  const from = RARITY_TIERS[inputs[0].rarity], to = RARITY_TIERS[result.rarity];
  layer.innerHTML = `<p class="slag-caption"><b>${inputs.length} × ${from.name}</b> melt into <b style="color:${to.color}">1 × ${to.name}</b></p><span class="slag-skip">Tap to skip</span>`;
  layer.prepend(canvas);
  document.body.append(layer);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  g.scale(dpr, dpr);
  // One icon pixel's size going in, and the piece made's (half as big again).
  const p = Math.max(4, Math.floor(Math.min(w / 3.4, h / 2.6) / 14)), q = Math.floor(p * 1.5);
  const rowY = h * 0.36, poolY = rowY + 8 * p, midY = h * 0.56;
  const xs = inputs.map((_, i) => w * (0.5 + (i - (inputs.length - 1) / 2) * 0.3));
  const made = iconPixels(result.def);
  const bits: Bit[] = [];
  inputs.forEach((spec, i) => {
    for (const px of iconPixels(spec.def)) {
      const k = bits.length, target = made[k % made.length];
      bits.push({
        color: px.color,
        home: [xs[i] + (px.x - 6) * p, rowY + (px.y - 6) * p],
        pool: [xs[i] + (rng() - 0.5) * 13 * p, poolY - rng() * rng() * 3 * p],
        mid: [w / 2 + (rng() - 0.5) * 10 * p, midY + 9 * q - rng() * rng() * 4 * p],
        end: [w / 2 + (target.x - 6) * q, midY + (target.y - 6) * q],
        endColor: k < made.length ? target.color : "",
        // The bottom rows give first; the outer pieces flow in a little later.
        melt: SHOW + (11 - px.y) * 55 + rng() * 260,
        flow: MELT + Math.abs(xs[i] - w / 2) / w * 500 + rng() * 300,
        heat: rng(),
      });
    }
  });
  // The piece made needs every one of its pixels: any it has more of than
  // the slag reuses a bit already bound for another.
  for (let k = bits.length; k < made.length; k++) bits.push({ ...bits[k % bits.length], end: [w / 2 + (made[k].x - 6) * q, midY + (made[k].y - 6) * q], endColor: made[k].color });

  let start = 0, frame = 0, over = false;
  const finish = () => {
    if (over) return;
    over = true;
    cancelAnimationFrame(frame);
    layer.remove();
    done();
  };
  layer.onclick = finish;

  const slag = (b: Bit, t: number) => SLAG[Math.min(SLAG.length - 1, Math.floor((0.55 + 0.45 * Math.sin(t / 90 + b.heat * 9)) * (SLAG.length - 0.01) * (0.6 + 0.4 * b.heat)))];
  const glow = (x: number, y: number, r: number, color: string, alpha: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "transparent");
    g.globalAlpha = alpha;
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
  };

  const draw = (now: number) => {
    if (!start) start = now;
    const t = now - start;
    g.clearRect(0, 0, w, h);
    // The heat under the pools, then the gathering pool, then the new piece's light.
    const melting = clamp((t - SHOW) / (MELT - SHOW)), flowing = clamp((t - MELT) / (FLOW - MELT)), forming = clamp((t - FLOW) / (FORM - FLOW));
    xs.forEach((x) => glow(x, poolY, 9 * p, "#ff6a1499", melting * (1 - flowing)));
    glow(w / 2, midY + 8 * q, 12 * p, "#ff7a1aaa", flowing * (1 - forming));
    if (t < SHOW + 400) xs.forEach((x, i) => glow(x, rowY, 9 * p, RARITY_TIERS[inputs[i].rarity].color + "66", 1 - clamp((t - SHOW) / 400)));
    glow(w / 2, midY, 11 * q, to.color + "aa", forming);
    for (const b of bits) {
      let x: number, y: number, color: string, size = p;
      if (t < b.melt) {
        [x, y] = b.home;
        color = b.color;
      } else if (t < b.flow) {
        // Heats to slag as it falls into its pool, wobbling as it settles.
        const k = clamp((t - b.melt) / 520), fall = k * k;
        x = lerp(b.home[0], b.pool[0], ease(k));
        y = lerp(b.home[1], b.pool[1], fall) + (k >= 1 ? Math.sin(t / 120 + b.heat * 7) * p * 0.15 : 0);
        color = k < 0.35 ? mix(b.color, "#ff6a14", k / 0.35) : slag(b, t);
      } else if (t < FLOW + (b.flow - MELT) * 0.4) {
        // Runs along the floor into the middle, a little ahead of its neighbours or behind.
        const k = ease(clamp((t - b.flow) / (FLOW - b.flow + (b.flow - MELT) * 0.4)));
        x = lerp(b.pool[0], b.mid[0], k);
        y = lerp(b.pool[1], b.mid[1], k) + Math.sin(k * Math.PI) * 2 * p;
        color = slag(b, t);
      } else {
        // Rises into the piece made, cooling into its colours.
        const k = ease(clamp((t - FLOW - (b.flow - MELT) * 0.4) / (FORM - FLOW - 200)));
        x = lerp(b.mid[0], b.end[0], k);
        y = lerp(b.mid[1], b.end[1], k) - Math.sin(k * Math.PI) * 3 * q;
        size = lerp(p, q, k);
        color = b.endColor ? (k < 0.6 ? slag(b, t) : mix("#ffa53a", b.endColor, (k - 0.6) / 0.4)) : slag(b, t);
        if (!b.endColor) g.globalAlpha = 1 - k;
      }
      g.fillStyle = color;
      g.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), Math.ceil(size), Math.ceil(size));
      g.globalAlpha = 1;
    }
    // The piece made flashes in its rarity's colour as it sets.
    if (t > FORM) {
      const k = clamp((t - FORM) / 500);
      glow(w / 2, midY, 10 * q, "#ffffffcc", 1 - k);
      layer.classList.add("formed");
    }
    if (t >= HOLD) return finish();
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
}
