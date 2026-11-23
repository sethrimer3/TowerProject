export type PixelPoint = { x: number; y: number };
export type InfinityPixel = PixelPoint & { dx: number; dy: number; curl: number; delay: number; color: string };

/** One particle per pair of visible native texels; its motion never draws gameplay randomness. */
export function infinityPixels(rgba: ArrayLike<number>, width: number): InfinityPixel[] {
  const pixels: InfinityPixel[] = [], height = rgba.length / 4 / width;
  let visible = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) continue;
    if (visible++ % 2) continue;
    const x = i / 4 % width, y = Math.floor(i / 4 / width);
    const seed = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0;
    const angle = Math.atan2(y + 0.5 - height / 2, x + 0.5 - width / 2) + ((seed % 1000) / 999 - 0.5) * 1.3;
    const speed = 14 + (seed >>> 10) % 27;
    pixels.push({ x: x + 0.5, y: y + 0.5, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed,
      curl: ((seed >>> 17) % 41) - 20, delay: ((seed >>> 23) % 13) / 100,
      color: `rgb(${rgba[i]}, ${rgba[i + 1]}, ${rgba[i + 2]})` });
  }
  return pixels;
}

/** First scatter outward, then accelerate along a bowed path into the hero. */
export function infinityPixelAt(pixel: InfinityPixel, origin: PixelPoint, scale: number, target: PixelPoint, burst: number, pull: number) {
  const start = { x: origin.x + pixel.x * scale, y: origin.y + pixel.y * scale };
  const scattered = { x: start.x + pixel.dx * scale, y: start.y + pixel.dy * scale };
  if (burst < 1) {
    const t = 1 - (1 - Math.max(0, burst)) ** 3;
    return { x: start.x + (scattered.x - start.x) * t, y: start.y + (scattered.y - start.y) * t, alpha: 1 };
  }
  const q = Math.max(0, Math.min(1, (pull - pixel.delay) / (1 - pixel.delay))), t = q * q;
  const vx = target.x - scattered.x, vy = target.y - scattered.y, length = Math.hypot(vx, vy) || 1;
  const bend = pixel.curl * scale;
  const control = { x: (scattered.x + target.x) / 2 - vy / length * bend, y: (scattered.y + target.y) / 2 + vx / length * bend };
  const x = (1 - t) ** 2 * scattered.x + 2 * (1 - t) * t * control.x + t * t * target.x;
  const y = (1 - t) ** 2 * scattered.y + 2 * (1 - t) * t * control.y + t * t * target.y;
  // Fade by actual remaining distance. Squaring keeps overlapping heads,
  // halos and trails from accumulating into a bright spot at the hero.
  const remaining = Math.min(1, Math.hypot(target.x - x, target.y - y) / length);
  return { x, y, alpha: remaining * remaining };
}

/** Warm ivory becomes luminous gold during absorption, with a crisp square halo. */
export function infinityPixelLight(pull: number) {
  const warmth = Math.max(0, Math.min(1, pull));
  return { color: `rgb(${Math.round(238 + 17 * warmth)}, ${Math.round(224 - 28 * warmth)}, ${Math.round(183 - 119 * warmth)})`, glow: warmth };
}

/** Rasterize a thin trail on the CSS-pixel grid instead of blurring a stroked line. */
export function drawInfinityTrail(ctx: CanvasRenderingContext2D, points: PixelPoint[], width: number) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));
    for (let j = 0; j <= steps; j++) {
      const t = steps ? j / steps : 0;
      ctx.fillRect(Math.round(a.x + (b.x - a.x) * t - width / 2), Math.round(a.y + (b.y - a.y) * t - width / 2), width, width);
    }
  }
}
