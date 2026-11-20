import { kitImage } from '../sprites/kit.ts';

export const DEATH_LOOP = { width: 96, height: 40, columns: 8, frames: 48, lead: 180, draw: 1700, hold: 360, fade: 500 } as const;

/** One continuous trace, a brief completed loop, then the world underneath. */
export function deathLoopFrame(elapsed: number, reduced = false) {
  const start = reduced ? 0 : DEATH_LOOP.lead;
  const drawn = reduced ? 0 : DEATH_LOOP.draw;
  const revealAt = start + drawn + (reduced ? 240 : DEATH_LOOP.hold);
  const fade = reduced ? 160 : DEATH_LOOP.fade;
  const progress = reduced ? 1 : Math.max(0, Math.min(1, (elapsed - start) / drawn));
  return {
    frame: Math.floor(progress * (DEATH_LOOP.frames - 1)),
    phase: elapsed < start ? 'black' : elapsed < start + drawn ? 'drawing' : elapsed < revealAt ? 'hold' : 'reveal',
    reveal: elapsed >= revealAt,
    opacity: Math.max(0, 1 - Math.max(0, elapsed - revealAt) / fade),
    done: elapsed >= revealAt + fade,
  };
}

const playing = new WeakSet<HTMLDialogElement>();

/** Use the shared modal so gameplay, keyboard input and automation wait too.
 * The return is committed once, under black, before the new world fades in. */
export function playDeathLoop(modal: HTMLDialogElement, reduced: boolean, returnToWorld: () => void) {
  if (playing.has(modal)) return;
  playing.add(modal);
  const content = modal.innerHTML;
  const attributes = ['class', 'style', 'aria-label', 'aria-labelledby'].map(name => [name, modal.getAttribute(name)] as const);
  const previousFocus = document.activeElement as HTMLElement | null;
  modal.classList.add('death-loop');
  modal.setAttribute('aria-label', 'The loop begins again');
  modal.removeAttribute('aria-labelledby');
  modal.innerHTML = `<canvas class="death-loop-symbol" width="96" height="40" role="img" aria-label="A pale infinity symbol draws itself. The loop begins again."></canvas>`;
  const canvas = modal.querySelector('canvas')!, ctx = canvas.getContext('2d');
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
      modal.removeEventListener('close', finish);
      if (modal.open) modal.close();
      modal.innerHTML = content;
      for (const [name, value] of attributes) if (value === null) modal.removeAttribute(name); else modal.setAttribute(name, value);
      delete modal.dataset.deathLoopPhase;
      playing.delete(modal);
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
    }
  };
  function skip(event: Event) { event.preventDefault(); event.stopPropagation(); finish(); }
  function key(event: KeyboardEvent) { if (event.key === 'Enter' || event.key === ' ') skip(event); }
  modal.addEventListener('cancel', skip);
  modal.addEventListener('pointerdown', skip);
  modal.addEventListener('keydown', key);
  modal.addEventListener('close', finish);
  modal.showModal();
  const draw = (now: number) => {
    if (closed) return;
    const state = deathLoopFrame(now - begin, reduced);
    modal.dataset.deathLoopPhase = state.phase;
    canvas.dataset.frame = String(state.frame);
    if (ctx) {
      ctx.clearRect(0, 0, DEATH_LOOP.width, DEATH_LOOP.height);
      ctx.imageSmoothingEnabled = false;
      const image = kitImage('death-infinity');
      if (image) ctx.drawImage(image, state.frame % DEATH_LOOP.columns * DEATH_LOOP.width, Math.floor(state.frame / DEATH_LOOP.columns) * DEATH_LOOP.height, DEATH_LOOP.width, DEATH_LOOP.height, 0, 0, DEATH_LOOP.width, DEATH_LOOP.height);
    }
    if (state.reveal) reveal();
    modal.style.opacity = String(state.opacity);
    if (state.done || !ctx) finish();
    else raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
}
