/** A fake DOM just big enough for half-props.ts and the decor bake to make
 * canvases: each canvas records the images drawn into it. */
export type FakeCanvas = { width: number; height: number; draws: unknown[][]; getContext: () => unknown };

export function withPropDom<T>(run: (canvases: FakeCanvas[]) => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document"), canvases: FakeCanvas[] = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement() {
    const canvas: FakeCanvas = { width: 300, height: 150, draws: [], getContext: () => ctx };
    const ctx = {
      imageSmoothingEnabled: true, save() {}, restore() {}, scale() {},
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {},
      drawImage: (img: unknown, ...args: number[]) => canvas.draws.push([img, ...args]),
    };
    canvases.push(canvas);
    return canvas;
  } } });
  try { return run(canvases); } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

/** A context that records draw calls, images as their size. */
export function recorder() {
  const calls: unknown[][] = [];
  const c = { save() {}, restore() {}, imageSmoothingEnabled: true,
    translate(...args: number[]) { calls.push(["translate", ...args]); }, rotate(angle: number) { calls.push(["rotate", angle]); },
    fillRect() {}, drawImage(img: { width: number; height: number }, ...args: number[]) { calls.push([`${img.width}x${img.height}`, ...args]); },
  } as unknown as CanvasRenderingContext2D;
  return { c, calls };
}
