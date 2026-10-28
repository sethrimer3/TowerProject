const smooth = (v: number) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };

/** Normalized nested light layers: adding layers softens the edge without
 * increasing peak opacity. Distance/width use the caller's field units. */
export function layeredFeather(distance: number, width: number, layers: number, outerWidth: number) {
  let light = 0, total = 0;
  for (let i = 0; i < layers; i++) {
    const t = layers > 1 ? i / (layers - 1) : 0, weight = (1 - t) * (1 - t);
    light += smooth(1 - Math.abs(distance) / (width * (1 + t * (outerWidth - 1)))) * weight;
    total += weight;
  }
  return total ? light / total : 0;
}

/** Separable sliding-window box passes approximate a soft Gaussian field
 * in O(width*height*passes), independently of the blur radius. Bake once
 * into a cached low-resolution light/fog/glow texture, not each frame.
 * Wrapping keeps moving tiled fields seamless; clamping suits local glows. */
export function softenField(source: Float32Array, width: number, height: number, radius = 2, passes = 2, edge: "wrap" | "clamp" = "wrap") {
  const result = new Float32Array(source), scratch = new Float32Array(source.length);
  radius = Math.max(0, Math.floor(radius));
  if (!radius || passes < 1) return result;
  const at = (n: number, size: number) => edge === "wrap" ? ((n % size) + size) % size : Math.max(0, Math.min(size - 1, n));
  const diameter = radius * 2 + 1;
  const blur = (input: Float32Array, output: Float32Array, horizontal: boolean) => {
    const length = horizontal ? width : height, lines = horizontal ? height : width;
    const index = (line: number, position: number) => horizontal ? line * width + at(position, length) : at(position, length) * width + line;
    for (let line = 0; line < lines; line++) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset++) sum += input[index(line, offset)];
      for (let position = 0; position < length; position++) {
        output[index(line, position)] = sum / diameter;
        sum += input[index(line, position + radius + 1)] - input[index(line, position - radius)];
      }
    }
  };
  for (let pass = 0; pass < passes; pass++) { blur(result, scratch, true); blur(scratch, result, false); }
  return result;
}
