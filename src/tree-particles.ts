import type { SkillNode } from './skill-trees.ts';
import { stream } from './random.ts';

const fx = stream('effects');

type Point = { x: number; y: number };
/** A size in CSS pixels. */
type Size = { w: number; h: number };
type Particle = Point & { radius: number; alpha: number };
type Pulse = Point & { age: number };
/** Shimmering rays around a node the player has just unlocked. */
type Rays = Point & { age: number };
/** How long an unlock's rays shine, in seconds. */
const RAYS_LIFE = 1.8;
/** How many rays, long and short in turn. */
const RAY_COUNT = 16;
type Edge = { from: SkillNode; to: SkillNode };
/** What one frame shows: the tree (a new id reseeds the particles), its
 * nodes, the node whose tooltip is open, and whether motion is reduced. */
export type TreeScene = { tree: string; nodes: SkillNode[]; selected: string | null; reduced: boolean };
/** What drives the fluid: the map's size, its nodes, and the selected one. */
type Forcing = Size & { nodes: SkillNode[]; selected: string | null };

// A small forced incompressible Euler approximation: advect velocity, apply
// node/edge forces, then project out divergence. No explicit viscosity.
// Inspired by the Euler 2D fluid-flow effect; original implementation here.
export class TreeParticles {
  private readonly size = 40;
  private u = new Float32Array(1600);
  private v = new Float32Array(1600);
  private pressure = new Float32Array(1600);
  private particles: Particle[] = [];
  private pulses: Pulse[] = [];
  private rays: Rays[] = [];
  private tree = '';
  private last = 0;
  private elapsed = 0;

  /** A purchase's burst, from `at` (a fraction of the map; the node's own
   * point unless given, such as the centre of its circle). */
  purchase(node: SkillNode, at: Point = { x: node.x / 100, y: node.y / 100 }) {
    this.pulses.push({ ...at, age: 0 });
  }

  /** A node's first rank: the purchase burst, and shimmering rays around it. */
  unlock(node: SkillNode, at: Point = { x: node.x / 100, y: node.y / 100 }) {
    this.purchase(node, at);
    this.rays.push({ ...at, age: 0 });
  }

  private sample(field: Float32Array, x: number, y: number) {
    const n = this.size;
    x = Math.max(0, Math.min(n - 1.001, x));
    y = Math.max(0, Math.min(n - 1.001, y));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    return (field[iy*n+ix]*(1-fx)+field[iy*n+ix+1]*fx)*(1-fy)
      + (field[(iy+1)*n+ix]*(1-fx)+field[(iy+1)*n+ix+1]*fx)*fy;
  }

  draw(canvas: HTMLCanvasElement, time: number, scene: TreeScene) {
    const view = fit(canvas);
    if (!view) return;
    const { ctx, size } = view;
    if (scene.tree !== this.tree) this.reset(scene.tree, size);
    const dt = this.frameTime(time);
    ctx.clearRect(0, 0, size.w, size.h);
    if (scene.reduced) { this.pulses = []; this.rays = []; return; }
    this.advance(dt, { ...size, nodes: scene.nodes, selected: scene.selected });
    for (const p of this.particles) {
      this.move(p, dt, size);
      drawParticle(ctx, p, size);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    if (!this.rays.length) return;
    for (const rays of this.rays) drawRays(ctx, rays, size);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /** A still fluid and fresh particles for a new tree. */
  private reset(tree: string, { w, h }: Size) {
    this.tree = tree; this.u.fill(0); this.v.fill(0); this.pulses = []; this.rays = [];
    this.particles = Array.from({ length: Math.min(360, Math.max(150, Math.round(w*h/850))) }, () => ({
      x: fx(), y: fx(), radius: .65 + fx()*.8, alpha: .2 + fx()*.35,
    }));
  }

  /** Seconds since the last frame, or 0 after a pause. */
  private frameTime(time: number) {
    const dt = this.last && time-this.last < 150 ? Math.min((time-this.last)/1000, 1/30) : 0;
    this.last = time;
    return dt;
  }

  /** Steps the fluid (at most 30 Hz) and ages the purchase pulses. */
  private advance(dt: number, forcing: Forcing) {
    // Limit fluid work to 30 Hz while drawing smoothly at the display rate.
    this.elapsed += dt;
    if (this.elapsed >= 1/30) {
      this.step(Math.min(this.elapsed, 1/15), forcing);
      this.elapsed = 0;
    }
    for (const pulse of this.pulses) pulse.age += dt;
    this.pulses = this.pulses.filter(p => p.age < 1.2);
    for (const rays of this.rays) rays.age += dt;
    this.rays = this.rays.filter(r => r.age < RAYS_LIFE);
  }

  /** Carries a particle along the fluid and the purchase bursts, wrapping
   * at the edges. */
  private move(p: Particle, dt: number, size: Size) {
    let vx = this.sample(this.u, p.x*39, p.y*39), vy = this.sample(this.v, p.x*39, p.y*39);
    // Purchase is a transient tracer impulse, separate from the solenoidal
    // fluid: projecting a purely radial source would remove the burst.
    for (const pulse of this.pulses) {
      const [px, py] = burst(p, pulse, size);
      vx += px; vy += py;
    }
    p.x = (p.x+vx*dt+1)%1; p.y = (p.y+vy*dt+1)%1;
  }

  private step(dt: number, forcing: Forcing) {
    const n = this.size, nextU = new Float32Array(n*n), nextV = new Float32Array(n*n);
    const { w, h } = forcing, edges = edgesOf(forcing.nodes);
    // Bounded forcing relaxes toward the current interactive field.
    const blend = 1-Math.exp(-dt*2);
    for (let y=0; y<n; y++) for (let x=0; x<n; x++) {
      const i=y*n+x;
      const [fx, fy] = forceAt({ x: x/(n-1)*w, y: y/(n-1)*h }, forcing, edges);
      const bx=x-this.u[i]*dt*(n-1), by=y-this.v[i]*dt*(n-1);
      nextU[i]=this.sample(this.u,bx,by)*(1-blend)+fx/w*blend;
      nextV[i]=this.sample(this.v,bx,by)*(1-blend)+fy/h*blend;
    }
    this.project(nextU, nextV, w, h);
    this.u=nextU; this.v=nextV;
  }

  /** Anisotropic pressure projection respects the actual map aspect ratio. */
  private project(u: Float32Array, v: Float32Array, w: number, h: number) {
    const n = this.size, hx=w/(n-1), hy=h/(n-1), p = this.pressure;
    const div = new Float32Array(n*n);
    p.fill(0);
    eachInterior(n, (i) => {
      div[i]=(u[i+1]-u[i-1])*w/(2*hx)+(v[i+n]-v[i-n])*h/(2*hy);
    });
    const a=1/(hx*hx), b=1/(hy*hy);
    for (let k=0;k<32;k++) eachInterior(n, (i) => {
      p[i]=((p[i-1]+p[i+1])*a+(p[i-n]+p[i+n])*b-div[i])/(2*(a+b));
    });
    eachInterior(n, (i) => {
      u[i]-=(p[i+1]-p[i-1])/(2*hx*w);
      v[i]-=(p[i+n]-p[i-n])/(2*hy*h);
    });
  }
}

/** The canvas's 2D context, sized to its CSS box at up to 2x pixel ratio
 * and scaled to CSS pixels; null when it has no context or no size. */
function fit(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  const size: Size = { w: canvas.clientWidth, h: canvas.clientHeight };
  if (!ctx || !hasArea(size)) return null;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(size.w*dpr), height = Math.round(size.h*dpr);
  // Resizing clears the canvas, so only do it when the size changed.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, size };
}

const hasArea = ({ w, h }: Size) => Boolean(w && h);

/** A glowing mote, fading out near the edges it wraps across. */
function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, { w, h }: Size) {
  const edge = Math.min(1, p.x*30, (1-p.x)*30, p.y*30, (1-p.y)*30);
  ctx.globalAlpha = p.alpha*edge;
  ctx.shadowColor = '#edbe63'; ctx.shadowBlur = 5;
  ctx.fillStyle = '#f3cf82';
  ctx.beginPath(); ctx.arc(p.x*w, p.y*h, p.radius, 0, Math.PI*2); ctx.fill();
}

/** An unlock's rays: a soft halo and a wheel of thin golden rays, long and
 * short in turn, that grow out from the node, turn slowly and shimmer, each
 * at its own beat, fading in quickly and out over most of their life. */
function drawRays(ctx: CanvasRenderingContext2D, rays: Rays, { w, h }: Size) {
  const t = rays.age / RAYS_LIFE;
  const fade = Math.min(1, rays.age / .15) * (t < .4 ? 1 : 1 - (t - .4) / .6);
  if (fade <= 0) return;
  const cx = rays.x*w, cy = rays.y*h, grow = 1 - (1 - t) ** 3;
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 34 + 16*grow);
  halo.addColorStop(0, `rgba(255, 236, 170, ${.5*fade})`);
  halo.addColorStop(1, 'rgba(255, 220, 140, 0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(cx, cy, 34 + 16*grow, 0, Math.PI*2); ctx.fill();
  const inner = 14, turn = rays.age * .5;
  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = turn + i * Math.PI*2 / RAY_COUNT;
    const shimmer = .7 + .3*Math.sin(rays.age*11 + i*2.4);
    const length = inner + (i % 2 ? 39 : 72) * (.35 + .65*grow) * shimmer;
    const spread = i % 2 ? .05 : .075;
    const ray = ctx.createRadialGradient(cx, cy, inner, cx, cy, length);
    ray.addColorStop(0, `rgba(255, 244, 200, ${.85*fade*shimmer})`);
    ray.addColorStop(1, 'rgba(255, 210, 120, 0)');
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle - spread)*inner, cy + Math.sin(angle - spread)*inner);
    ctx.lineTo(cx + Math.cos(angle)*length, cy + Math.sin(angle)*length);
    ctx.lineTo(cx + Math.cos(angle + spread)*inner, cy + Math.sin(angle + spread)*inner);
    ctx.closePath(); ctx.fill();
  }
}

/** A purchase's outward push on a particle, in map units per second. */
function burst(p: Point, pulse: Pulse, { w, h }: Size): [number, number] {
  const dx = (p.x-pulse.x)*w, dy = (p.y-pulse.y)*h, r = Math.hypot(dx, dy);
  const force = 170 * Math.exp(-pulse.age*3.5) * Math.exp(-r*r/22000);
  return r > 1 ? [dx/r*force/w, dy/r*force/h] : [0, 0];
}

/** Each prerequisite link, from the prerequisite to the node needing it. */
function edgesOf(nodes: SkillNode[]): Edge[] {
  return nodes.flatMap(to => to.requires.flatMap(id => {
    const from = nodes.find(node => node.id === id);
    return from ? [{ from, to }] : [];
  }));
}

/** The force at a point (CSS pixels): a swirl around every node, and a
 * current along every link. */
function forceAt(at: Point, f: Forcing, edges: Edge[]): [number, number] {
  const force: [number, number] = [0, 0];
  for (const node of f.nodes) swirl(force, at, node, f);
  for (const edge of edges) current(force, at, edge, f);
  return force;
}

function swirl(force: [number, number], { x: px, y: py }: Point, node: SkillNode, { w, h, selected }: Forcing) {
  const dx=px-node.x/100*w, dy=py-node.y/100*h;
  // Screen Y points down: positive rotation is clockwise.
  const strength = node.id === selected ? .85 : -.12;
  const falloff = Math.exp(-(dx*dx+dy*dy)/(2*65*65));
  force[0] += -dy*strength*falloff; force[1] += dx*strength*falloff;
}

function current(force: [number, number], { x: px, y: py }: Point, { from, to }: Edge, { w, h }: Forcing) {
  const ax=from.x/100*w, ay=from.y/100*h, dx=(to.x-from.x)/100*w, dy=(to.y-from.y)/100*h;
  const len=Math.hypot(dx,dy);
  if (!len) return;
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(len*len)));
  const distance=Math.hypot(px-ax-t*dx, py-ay-t*dy);
  const strength=12*Math.exp(-distance*distance/(2*22*22));
  force[0]+=dx/len*strength; force[1]+=dy/len*strength;
}

/** Visits every cell of an n-by-n grid but its border, row by row. */
function eachInterior(n: number, fn: (i: number) => void) {
  for (let y=1;y<n-1;y++) for (let x=1;x<n-1;x++) fn(y*n+x);
}
