import { ARCANA_LAB_CENTER as C, ARCANA_LAB_RADIUS as R, ARCANA_LAB_TARGET as TARGET, ARCANA_LAB_SPLASH as SPLASH, ARCANA_LAB_TWINS, arcanaBurstAge, type ArcanaExampleId } from "../../arcana-lab.ts";
import { paintShockStatus, paintDilationGuard } from "../../sprites/spell-art.ts";

// Opaque shared-palette pixels, integer geometry, no gradients or smoothing.
const P = { dark: "#10151c", slate: "#1b2430", blueDark: "#16303d", blue: "#315363", cyan: "#54879a", ice: "#88c5db",
  pale: "#eee0b7", gold: "#e1bb78", brass: "#b28a52", green: "#668348", lime: "#a7bd75", purple: "#80608e" };
const TAU = Math.PI * 2;
type Point = { x: number; y: number };
const at = (angle: number, radius: number, x = C, y = C): Point => ({ x: Math.round(x + Math.cos(angle) * radius), y: Math.round(y + Math.sin(angle) * radius) });
function dot(c: CanvasRenderingContext2D, p: Point, color: string, size = 1) {
  c.fillStyle = color; c.fillRect(Math.round(p.x), Math.round(p.y), size, size);
}
function line(c: CanvasRenderingContext2D, from: Point, to: Point, color: string, size = 1) {
  const count = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
  for (let i = 0; i <= count; i++) dot(c, { x: from.x + (to.x - from.x) * i / count, y: from.y + (to.y - from.y) * i / count }, color, size);
}
function ring(c: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, width = 1, gap = 0) {
  const count = Math.ceil(TAU * radius * 2);
  for (let i = 0; i < count; i++) {
    const angle = i / count * TAU;
    if (gap && (angle + gap + TAU * 4) % (TAU / 3) < .17) continue;
    dot(c, at(angle, radius, x, y), color, width);
  }
}
function disc(c: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  c.fillStyle = color;
  for (let dy = -Math.floor(radius); dy <= radius; dy++) {
    const dx = Math.floor(Math.sqrt(radius * radius - dy * dy));
    c.fillRect(Math.round(x) - dx, Math.round(y) + dy, dx * 2 + 1, 1);
  }
}
function spark(c: CanvasRenderingContext2D, x: number, y: number, color: string, size = 3) {
  line(c, { x: x - size, y }, { x: x + size, y }, color);
  line(c, { x, y: y - size }, { x, y: y + size }, color);
  dot(c, { x, y }, P.pale);
}
function ghost(c: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const rows = ["...aaaa...", "..abbbba..", ".abccccba.", "abccbccbba", "abccbccbba", "abcccccbba", "abcccccbba", "abcccccbba", ".abbbbbba.", frame % 2 ? ".aa.aa.aa." : ".a.aaa..a."];
  const colors: Record<string, string> = { a: P.blue, b: P.cyan, c: P.ice };
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => { if (colors[ch]) dot(c, { x: x - 5 + dx, y: y - 5 + dy }, colors[ch]); }));
  dot(c, { x: x - 2, y: y - 1 }, P.dark); dot(c, { x: x + 2, y: y - 1 }, P.dark);
}

function vortex(c: CanvasRenderingContext2D, R: number, time: number) {
  const spin = Math.floor(time / 100) * 100 / 9000 * TAU;
    disc(c, C, C, R, P.blue); disc(c, C, C, R - 2, P.blueDark);
    disc(c, C, C, R * .67, P.slate); disc(c, C, C, R * .32, P.dark);
    ring(c, C, C, R, P.cyan);
    for (let arm = 0; arm < 5; arm++) {
      let previous = at(arm / 5 * TAU - spin, R);
      for (let i = 1; i <= 140; i++) {
        const k = i / 140, angle = arm / 5 * TAU - spin + k * Math.PI * 1.6;
        const next = at(angle, R * (1 - k * .92));
        line(c, previous, next, P.cyan, 2); previous = next;
      }
    }
}

/** Comparison drawing; the Shock and protection entries share their live native painters. */
export function paintPixelArcana(c: CanvasRenderingContext2D, id: ArcanaExampleId, time: number) {
  const tick = Math.floor(time / 100), now = tick * 100, spin = now / 9000 * TAU, age = arcanaBurstAge(time);
  c.save(); c.imageSmoothingEnabled = false;
  if (id === "ricochetShock") {
    c.translate(TARGET.x - 12, TARGET.y - 12); paintShockStatus(c, time, true);
  } else if (id === "dilationGuard") {
    c.translate(C - 12, C - 12); paintDilationGuard(c, time, true);
  } else if (id === "extraVoidwell") {
    for (const p of ARCANA_LAB_TWINS) {
      c.save(); c.translate(p.x - C, p.y - C); vortex(c, 42, time); c.restore();
    }
  } else if (id === "phantasmStun") {
    paintPixelArcana(c, "phantasm", time);
    for (let i = 0; i < 3; i++) { const p = at(now / 900 + i / 3 * TAU, 9, TARGET.x, TARGET.y - 16); spark(c, p.x, p.y, P.purple, 2); }
  } else if (id === "necroFreeze") {
    const spread = Math.min(9, 3 + Math.floor(age / 30));
    for (const dx of [-9, 0, 9]) {
      line(c, { x: TARGET.x + dx, y: TARGET.y + 10 }, { x: TARGET.x + dx - 3, y: TARGET.y - spread }, P.blue, 3);
      line(c, { x: TARGET.x + dx - 1, y: TARGET.y + 8 }, { x: TARGET.x + dx - 3, y: TARGET.y - spread }, P.ice);
    }
    ring(c, TARGET.x, TARGET.y, 13, P.cyan, 1, tick / 4 + .1);
  } else if (id === "voidwellDamage") {
    for (let i = 0; i < 5; i++) {
      const p = at(i / 5 * TAU + .4, 18 - tick % 12, TARGET.x, TARGET.y);
      spark(c, p.x, p.y, P.purple, 2);
    }
  } else if (id === "overseerZap") {
    paintPixelArcana(c, "thunderbolt", time);
    ring(c, TARGET.x, TARGET.y, 14, P.gold, 1, tick / 6 + .1);
  } else if (id === "thunderboltExpansion") {
    paintPixelArcana(c, "thunderbolt", time);
    if (age >= 90 && age < 330) {
      ring(c, TARGET.x, TARGET.y, Math.round((age - 90) / 240 * 48), P.ice);
      spark(c, SPLASH.x, SPLASH.y, P.ice, 5);
    }
  } else if (id === "voidwell") {
    vortex(c, R, time);
  } else if (id === "necroticFrost") {
    ring(c, C, C, R, P.lime); ring(c, C, C, R - 3, P.purple);
    for (let i = 0; i < 12; i++) {
      const phase = (tick + i * 3) % 15, p = at(i * 2.4, 18 + i % 5 * 10);
      const y = p.y - Math.floor(phase / 3);
      if (phase < 11) { dot(c, { x: p.x, y }, P.purple, 3); dot(c, { x: p.x, y }, P.lime); }
      else spark(c, p.x + 1, y + 1, P.lime, phase - 9);
    }
  } else if (id === "lifespring") {
    [R * .97, R * .94, R * .91].forEach((r, i) => ring(c, C, C, r, i === 1 ? P.green : P.lime, 1, spin * (i % 2 ? -1 : 1) + i));
    for (let i = 0; i < 6; i++) { const p = at(i / 6 * TAU, R - 10); spark(c, p.x, p.y - tick % 3, P.lime, 2); }
  } else if (id === "timeDilation") {
    ring(c, C, C, R, P.ice); ring(c, C, C, R - 2, P.blue);
    for (let i = 0; i < 12; i++) line(c, at(i / 12 * TAU, R - (i % 3 ? 4 : 7)), at(i / 12 * TAU, R - 1), i % 3 ? P.cyan : P.ice);
  } else if (id === "overseer") {
    // Same three 24-degree wedges and sweep as the reference; bands keep the floor visible.
    const angle = time / 12000 * TAU - Math.PI / 2;
    for (let beam = 0; beam < 3; beam++) {
      const a = angle + beam / 3 * TAU;
      for (const edge of [-1, 1]) line(c, { x: C, y: C }, at(a + edge * Math.PI / 15, 400), P.brass);
      for (let r = 8 + tick % 8; r < 200; r += 12) line(c, at(a - Math.PI / 15, r), at(a + Math.PI / 15, r), r % 24 < 12 ? P.gold : P.brass);
    }
  } else if (id === "phantasm") {
    for (let i = 0; i < 3; i++) {
      const p = at(time / 12000 * TAU + i / 3 * TAU, 48);
      ghost(c, p.x, p.y - Math.round(Math.sin(now / 320 + i * 1.7)), tick);
    }
  } else if (id === "thunderbolt" && age < 330) {
    const reach = Math.min(1, age / 90), bottom = Math.round(TARGET.y * reach);
    const points: Point[] = [{ x: TARGET.x, y: 0 }];
    for (let y = 12; y < bottom; y += 12) points.push({ x: TARGET.x + (Math.floor(y / 12) % 2 ? -5 : 4), y });
    points.push({ x: TARGET.x, y: bottom });
    for (let i = 1; i < points.length; i++) line(c, points[i - 1], points[i], P.blue, 4);
    for (let i = 1; i < points.length; i++) line(c, points[i - 1], points[i], P.ice, 2);
    if (age >= 90) { ring(c, TARGET.x, TARGET.y, 8 + Math.floor(age / 90), P.cyan); spark(c, TARGET.x, TARGET.y, P.ice, 7); }
  } else if (id === "ricochetShot" && age < 100) {
    const from = { x: 84, y: 180 };
    line(c, from, TARGET, P.brass, 3); line(c, from, TARGET, P.gold);
    spark(c, TARGET.x, TARGET.y, P.gold, 4); spark(c, from.x, from.y, P.gold, 3);
  } else if (id === "aurumBloom" && age < 700) {
    const step = Math.floor(age / 70);
    for (let i = 0; i < 8; i++) {
      const p = at(i / 8 * TAU, 7 + step * 3, TARGET.x, TARGET.y - step);
      dot(c, p, P.brass, 3); dot(c, { x: p.x + 1, y: p.y }, P.gold); dot(c, { x: p.x + 1, y: p.y + 1 }, P.pale);
    }
  }
  c.restore();
}
