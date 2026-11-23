import { play } from '../sound.ts';
import { infinityPixels, infinityPixelAt, type InfinityPixel, type PixelPoint } from './infinity-pixels.ts';
import { kitImage } from '../sprites/kit.ts';

export const DEATH_LOOP = { width: 96, height: 40, columns: 8, frames: 48, fadeIn: 450, lead: 180, draw: 1700, hold: 360, burst: 260, pull: 900, fade: 1160 } as const;

/** Trace, hold, scatter, then absorb into the hero as the world appears. */
export function deathLoopFrame(elapsed: number, reduced = false) {
  const fadeIn = reduced ? 80 : DEATH_LOOP.fadeIn;
  const start = fadeIn + (reduced ? 0 : DEATH_LOOP.lead);
  const drawn = reduced ? 0 : DEATH_LOOP.draw;
  const revealAt = start + drawn + (reduced ? 240 : DEATH_LOOP.hold);
  const burst = reduced ? 0 : DEATH_LOOP.burst;
  const fade = reduced ? 160 : DEATH_LOOP.fade;
  const burstProgress = Math.max(0, Math.min(1, (elapsed - revealAt) / (burst || 1)));
  const pullProgress = Math.max(0, Math.min(1, (elapsed - revealAt - burst) / (reduced ? fade : DEATH_LOOP.pull)));
  const progress = reduced ? 1 : Math.max(0, Math.min(1, (elapsed - start) / drawn));
  return {
    frame: elapsed < start ? 0 : Math.floor(progress * (DEATH_LOOP.frames - 1)),
    phase: elapsed < fadeIn ? 'fade-in' : elapsed < start ? 'black' : elapsed < start + drawn ? 'drawing' : elapsed < revealAt ? 'hold' : !reduced && elapsed < revealAt + burst ? 'burst' : 'absorb',
    reveal: elapsed >= revealAt,
    burst: burstProgress,
    pull: pullProgress,
    opacity: elapsed < fadeIn ? Math.max(0, elapsed / fadeIn) : 1 - pullProgress,
    done: elapsed >= revealAt + fade,
  };
}

/** Draws frame `frame` of the infinity trace on a 96×40 canvas. */
export function drawLoopFrame(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.clearRect(0, 0, DEATH_LOOP.width, DEATH_LOOP.height);
  ctx.imageSmoothingEnabled = false;
  const image = kitImage('death-infinity');
  if (image) ctx.drawImage(image, frame % DEATH_LOOP.columns * DEATH_LOOP.width, Math.floor(frame / DEATH_LOOP.columns) * DEATH_LOOP.height, DEATH_LOOP.width, DEATH_LOOP.height, 0, 0, DEATH_LOOP.width, DEATH_LOOP.height);
}

const playing = new WeakSet<HTMLDialogElement>();

/** Use the shared modal so gameplay, keyboard input and automation wait too.
 * The return is committed once, under black, before the new world fades in. */
export function playDeathLoop(modal: HTMLDialogElement, reduced: boolean, returnToWorld: () => void, destination?: () => PixelPoint) {
  if (playing.has(modal)) return;
  playing.add(modal);
  play('timeLoop');
  const content = modal.innerHTML;
  const attributes = ['class', 'style', 'aria-label', 'aria-labelledby'].map(name => [name, modal.getAttribute(name)] as const);
  const previousFocus = document.activeElement as HTMLElement | null;
  modal.classList.add('death-loop');
  modal.style.opacity = '0';
  modal.setAttribute('aria-label', 'The loop begins again');
  modal.removeAttribute('aria-labelledby');
  modal.innerHTML = `<div class="death-loop-curtain" aria-hidden="true"></div><canvas class="death-loop-symbol" width="96" height="40" role="img" aria-label="A pale infinity symbol draws itself. The loop begins again."></canvas><canvas class="death-loop-pixels" aria-hidden="true"></canvas>`;
  const canvas = modal.querySelector<HTMLCanvasElement>('.death-loop-symbol')!, ctx = canvas.getContext('2d');
  const curtain = modal.querySelector<HTMLElement>('.death-loop-curtain')!;
  const cloud = modal.querySelector<HTMLCanvasElement>('.death-loop-pixels')!, cloudCtx = cloud.getContext('2d');
  let pixels: InfinityPixel[] | null = null;
  let raf = 0, returned = false, closed = false;
  const begin = performance.now();
  const reveal = () => { if (!returned) { returned = true; returnToWorld(); } };
  const finish = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    try { reveal(); } finally {
      modal.removeEventListener('cancel', skip);
      modal.removeEventListener('pointerdown', skip);
      modal.removeEventListener('keydown', key);
      modal.removeEventListener('close', onClose);
      if (modal.open) modal.close();
      modal.innerHTML = content;
      for (const [name, value] of attributes) if (value === null) modal.removeAttribute(name); else modal.setAttribute(name, value);
      delete modal.dataset.deathLoopPhase;
      playing.delete(modal);
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
    }
  };
  // A queued close from the preceding summary can arrive after this modal reopens.
  function onClose() { if (!modal.open) finish(); }
  function skip(event: Event) { event.preventDefault(); event.stopPropagation(); finish(); }
  function key(event: KeyboardEvent) { if (event.key === 'Enter' || event.key === ' ') skip(event); }
  modal.addEventListener('cancel', skip);
  modal.addEventListener('pointerdown', skip);
  modal.addEventListener('keydown', key);
  modal.addEventListener('close', onClose);
  modal.showModal();
  const draw = (now: number) => {
    if (closed) return;
    const state = deathLoopFrame(now - begin, reduced);
    modal.dataset.deathLoopPhase = state.phase;
    canvas.dataset.frame = String(state.frame);
    if (ctx && !pixels) drawLoopFrame(ctx, state.frame);
    if (state.reveal) {
      reveal();
      modal.style.opacity = '1';
      curtain.style.opacity = String(state.opacity);
      if (reduced) canvas.style.opacity = String(state.opacity);
      else if (ctx && cloudCtx) {
        if (!pixels) pixels = infinityPixels(ctx.getImageData(0, 0, DEATH_LOOP.width, DEATH_LOOP.height).data, DEATH_LOOP.width);
        canvas.style.visibility = 'hidden';
        const box = modal.getBoundingClientRect(), symbol = canvas.getBoundingClientRect();
        const width = Math.round(box.width), height = Math.round(box.height);
        if (cloud.width !== width || cloud.height !== height) { cloud.width = width; cloud.height = height; }
        cloudCtx.clearRect(0, 0, width, height);
        const board = document.getElementById('world')?.getBoundingClientRect();
        const at = destination?.() ?? { x: board ? board.left + board.width / 2 : box.left + width / 2, y: board ? board.top + board.height / 2 : box.top + height / 2 };
        const target = { x: at.x - box.left, y: at.y - box.top };
        cloud.dataset.targetX = String(target.x); cloud.dataset.targetY = String(target.y);
        cloud.dataset.particles = String(pixels.length);
        const origin = { x: symbol.left - box.left, y: symbol.top - box.top }, scale = symbol.width / DEATH_LOOP.width;
        for (const pixel of pixels) {
          const point = infinityPixelAt(pixel, origin, scale, target, state.burst, state.pull);
          cloudCtx.globalAlpha = point.alpha;
          cloudCtx.fillStyle = pixel.color;
          cloudCtx.fillRect(Math.round(point.x - scale / 2), Math.round(point.y - scale / 2), scale, scale);
        }
        cloudCtx.globalAlpha = 1;
      }
    } else {
      modal.style.opacity = String(state.opacity);
      curtain.style.opacity = '1';
    }
    if (state.done || !ctx) finish();
    else raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
}
