import type { Mode } from "./entities.ts";

// Presentation only: themes never consume the generation RNG or alter tiles.
export const THEMES = [
  { name: "Weathered keep", floor: "#191e28", wall: "#485362", seam: "#242d39", accent: "#a69b83" },
  { name: "Mossbound ruins", floor: "#14291f", wall: "#3f6350", seam: "#21392a", accent: "#82b85b" },
  { name: "Amber catacombs", floor: "#30251a", wall: "#876444", seam: "#483422", accent: "#d4ad72" },
  { name: "Frozen vault", floor: "#162c3a", wall: "#56869c", seam: "#294656", accent: "#b0e8ed" },
  { name: "Ember forge", floor: "#301c20", wall: "#70423d", seam: "#40282c", accent: "#ec9255" },
  { name: "Violet geode", floor: "#271d38", wall: "#65517f", seam: "#392b4b", accent: "#c49de9" },
  { name: "Drowned temple", floor: "#122e30", wall: "#3c7775", seam: "#224748", accent: "#77c9b5" },
  { name: "Fungal hollow", floor: "#302334", wall: "#76566b", seam: "#473448", accent: "#dea5b8" },
  { name: "Obsidian crypt", floor: "#171923", wall: "#37384b", seam: "#242533", accent: "#b57687" },
  { name: "Astral sanctuary", floor: "#242b40", wall: "#626d91", seam: "#363e59", accent: "#e0ce91" },
] as const;

export function tileRandom(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth 2D value noise at two scales makes contiguous lobes and pockets.
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const smooth = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);
  const u = smooth(x - ix), v = smooth(y - iy);
  const a = tileRandom(ix, iy, seed), b = tileRandom(ix + 1, iy, seed);
  const c = tileRandom(ix, iy + 1, seed), d = tileRandom(ix + 1, iy + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function themeAt(mode: Mode, height: number, x: number, y: number, seed: number) {
  if (mode === "tower") {
    const index = Math.floor(Math.max(0, height) / 10) % 10;
    return { from: index, to: index, mix: 0, decor: index };
  }
  const warped = Math.max(0, y + (noise(x / 11, y / 23, seed) - 0.5) * 42
    + (noise(x / 4, y / 9, seed ^ 0x517c) - 0.5) * 14);
  // A 16-tile transition straddles each nominal hundred-depth boundary.
  const band = Math.floor((warped + 8) / 100);
  const t = Math.max(0, Math.min(1, (warped - (band * 100 - 8)) / 16));
  const mix = t * t * (3 - 2 * t);
  const from = Math.max(0, band - 1) % 10, to = band % 10;
  return { from, to, mix, decor: noise(x / 3, y / 3, seed ^ 0x713f) < mix ? to : from };
}

function color(a: string, b: string, t: number) {
  const av = parseInt(a.slice(1), 16), bv = parseInt(b.slice(1), 16);
  return `rgb(${[16, 8, 0].map(s => Math.round(((av >> s) & 255) * (1 - t) + ((bv >> s) & 255) * t)).join(",")})`;
}

export function drawTerrain(c: CanvasRenderingContext2D, wall: boolean, mode: Mode,
  height: number, x: number, y: number, seed: number, empty: boolean) {
  const region = themeAt(mode, height, x, y, seed);
  const a = THEMES[region.from], b = THEMES[region.to], id = region.decor;
  const ink = (key: "floor" | "wall" | "seam" | "accent") => color(a[key], b[key], region.mix);
  const r = tileRandom(x, y, seed);
  const line = (...points: number[]) => {
    c.beginPath(); c.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
    c.stroke();
  };
  c.fillStyle = ink(wall ? "seam" : "floor"); c.fillRect(0, 0, 24, 24);
  c.strokeStyle = ink("seam"); c.lineWidth = 0.7;
  c.strokeRect(0.4, 0.4, 23.2, 23.2);
  c.fillStyle = ink("wall");
  if (wall) {
    if ([0, 1, 2, 6].includes(id)) {
      const split = id === 2 ? 16 : 11;
      c.fillRect(1, 1, split - 1, 9); c.fillRect(split + 1, 1, 22 - split, 9);
      c.fillRect(1, 12, 6, 10); c.fillRect(9, 12, 14, 10);
    } else if (id === 4) {
      c.fillRect(2, 2, 20, 19); c.strokeStyle = ink("accent");
      c.strokeRect(4, 4, 16, 15);
      for (const xx of [5, 18]) for (const yy of [5, 18]) { c.fillStyle = ink("seam"); c.fillRect(xx, yy, 2, 2); }
    } else if (id === 9) {
      c.fillRect(2, 1, 20, 21); c.fillStyle = ink("accent");
      c.fillRect(3, 2, 18, 1); c.fillRect(3, 20, 18, 1);
      c.fillRect(5, 5, 2, 13); c.fillRect(17, 5, 2, 13);
    } else {
      c.beginPath(); c.moveTo(2, 3); c.lineTo(15, 1); c.lineTo(23, 8);
      c.lineTo(20, 21); c.lineTo(7, 23); c.lineTo(1, 15); c.closePath(); c.fill();
      c.strokeStyle = ink("seam"); line(15, 1, 11, 12, 20, 21); line(11, 12, 1, 15);
    }
    c.fillStyle = "#ffffff18"; c.fillRect(2, 2, 8, 1);
    c.fillStyle = "#00000050"; c.fillRect(0, 22, 24, 2);
  } else {
    c.globalAlpha = 0.35; c.strokeStyle = ink("wall");
    if (id === 3 || id === 5 || id === 8) line(2, 19, 9, 12, 7, 4, 18, 1);
    else if (id === 6) { line(2, 8, 7, 6, 15, 8, 22, 6); line(3, 18, 9, 16, 20, 18); }
    else if (id === 9) { c.strokeRect(4, 4, 16, 16); }
    else if (id === 4) { line(0, 12, 24, 12); line(12, 0, 12, 24); }
    else { line(2, 16, 8, 16); line(15, 5, 20, 5); }
    c.globalAlpha = 1;
  }
  // Decor is restricted to walls and empty floor, keeping every object readable.
  if (!wall && !empty || r > (wall ? 0.32 : 0.22)) return;
  c.save();
  c.translate(r > 0.15 ? 2 : 0, 0);
  c.globalAlpha = wall ? 0.85 : 0.48;
  c.strokeStyle = ink("accent"); c.fillStyle = ink("accent"); c.lineWidth = 1;
  switch (id) {
    case 0: // Rubble and cracked masonry.
      c.fillRect(3, 17, 5, 3); c.fillRect(10, 19, 3, 2); line(6, 3, 9, 7, 7, 12); break;
    case 1: // Trailing vines and leaves.
      line(4, 1, 6, 7, 4, 13, 7, 21);
      for (let i = 3; i < 20; i += 5) { c.fillRect(i % 2 ? 6 : 2, i, 4, 2); } break;
    case 2: // Fossil ribs embedded in sandstone.
      line(5, 18, 15, 8); for (let i = 0; i < 4; i++) line(5 + i * 3, 14 - i * 2, 8 + i * 3, 17 - i * 2); break;
    case 3: // Icicles / branching frost.
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(3 + i * 6, 3); c.lineTo(7 + i * 6, 3); c.lineTo(5 + i * 6, 12 + i * 3); c.fill(); } break;
    case 4: // Hot fissures and cinders.
      line(3, 21, 8, 14, 5, 10, 13, 3); c.fillRect(17, 17, 2, 2); c.fillRect(15, 7, 1, 1); break;
    case 5: // Crystal clusters.
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(4 + i * 5, 19); c.lineTo(3 + i * 5, 10 - i * 2); c.lineTo(6 + i * 5, 6 - i * 2); c.lineTo(8 + i * 5, 18); c.closePath(); c.stroke(); } break;
    case 6: // Reeds and ripples.
      line(5, 19, 4, 9, 2, 6); line(7, 19, 9, 8); c.beginPath(); c.ellipse(13, 19, 7, 2, 0, 0, Math.PI * 2); c.stroke(); break;
    case 7: // Mushroom caps and spores.
      for (const [xx, yy] of [[5, 14], [14, 9], [16, 19]]) { c.fillRect(xx, yy, 1, 5); c.beginPath(); c.ellipse(xx, yy, 4, 2, 0, Math.PI, Math.PI * 2); c.fill(); } break;
    case 8: // Carved funerary sigils.
      line(6, 4, 15, 4, 11, 9, 15, 14, 6, 14, 11, 9, 11, 20); break;
    case 9: // Star mosaics.
      line(11, 3, 13, 9, 19, 11, 13, 13, 11, 19, 9, 13, 3, 11, 9, 9, 11, 3); c.fillRect(19, 3, 1, 1); break;
  }
  c.restore();
}
