import type { SkillNode } from './skill-trees.ts';

type Point = { x: number; y: number };
type Particle = Point & { radius: number; alpha: number };

// A small forced incompressible Euler approximation: advect velocity, apply
// node/edge forces, then project out divergence. No explicit viscosity.
// Inspired by the Euler 2D fluid-flow effect; original implementation here.
export class TreeParticles {
  private readonly size = 40;
  private u = new Float32Array(1600);
  private v = new Float32Array(1600);
  private pressure = new Float32Array(1600);
  private particles: Particle[] = [];
  private pulses: (Point & { age: number })[] = [];
  private tree = '';
  private last = 0;
  private elapsed = 0;

  purchase(node: SkillNode) {
    this.pulses.push({ x: node.x / 100, y: node.y / 100, age: 0 });
  }

  private sample(field: Float32Array, x: number, y: number) {
    const n = this.size;
    x = Math.max(0, Math.min(n - 1.001, x));
    y = Math.max(0, Math.min(n - 1.001, y));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    return (field[iy*n+ix]*(1-fx)+field[iy*n+ix+1]*fx)*(1-fy)
      + (field[(iy+1)*n+ix]*(1-fx)+field[(iy+1)*n+ix+1]*fx)*fy;
  }

  draw(canvas: HTMLCanvasElement, time: number, tree: string, nodes: SkillNode[], selected: string | null, reduced: boolean) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)) {
      canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
    }
    if (tree !== this.tree) {
      this.tree = tree; this.u.fill(0); this.v.fill(0); this.pulses = [];
      this.particles = Array.from({ length: Math.min(360, Math.max(150, Math.round(w*h/850))) }, () => ({
        x: Math.random(), y: Math.random(), radius: .65 + Math.random()*.8, alpha: .2 + Math.random()*.35,
      }));
    }
    const dt = this.last && time-this.last < 150 ? Math.min((time-this.last)/1000, 1/30) : 0;
    this.last = time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (reduced) { this.pulses = []; return; }
    // Limit fluid work to 30 Hz while drawing smoothly at the display rate.
    this.elapsed += dt;
    if (this.elapsed >= 1/30) {
      this.step(Math.min(this.elapsed, 1/15), w, h, nodes, selected);
      this.elapsed = 0;
    }
    for (const pulse of this.pulses) pulse.age += dt;
    this.pulses = this.pulses.filter(p => p.age < 1.2);
    for (const p of this.particles) {
      let vx = this.sample(this.u, p.x*39, p.y*39), vy = this.sample(this.v, p.x*39, p.y*39);
      // Purchase is a transient tracer impulse, separate from the solenoidal
      // fluid: projecting a purely radial source would remove the burst.
      for (const pulse of this.pulses) {
        const dx = (p.x-pulse.x)*w, dy = (p.y-pulse.y)*h, r = Math.hypot(dx, dy);
        const force = 170 * Math.exp(-pulse.age*3.5) * Math.exp(-r*r/22000);
        if (r > 1) { vx += dx/r*force/w; vy += dy/r*force/h; }
      }
      p.x = (p.x+vx*dt+1)%1; p.y = (p.y+vy*dt+1)%1;
      const edge = Math.min(1, p.x*30, (1-p.x)*30, p.y*30, (1-p.y)*30);
      ctx.globalAlpha = p.alpha*edge;
      ctx.shadowColor = '#edbe63'; ctx.shadowBlur = 5;
      ctx.fillStyle = '#f3cf82';
      ctx.beginPath(); ctx.arc(p.x*w, p.y*h, p.radius, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  private step(dt: number, w: number, h: number, nodes: SkillNode[], selected: string | null) {
    const n = this.size, nextU = new Float32Array(n*n), nextV = new Float32Array(n*n);
    const edges = nodes.flatMap(to => to.requires.flatMap(id => {
      const from = nodes.find(node => node.id === id);
      return from ? [{ from, to }] : [];
    }));
    for (let y=0; y<n; y++) for (let x=0; x<n; x++) {
      const i=y*n+x, px=x/(n-1)*w, py=y/(n-1)*h;
      let fx=0, fy=0;
      for (const node of nodes) {
        const dx=px-node.x/100*w, dy=py-node.y/100*h;
        // Screen Y points down: positive rotation is clockwise.
        const strength = node.id === selected ? .85 : -.12;
        const falloff = Math.exp(-(dx*dx+dy*dy)/(2*65*65));
        fx += -dy*strength*falloff; fy += dx*strength*falloff;
      }
      for (const {from,to} of edges) {
        const ax=from.x/100*w, ay=from.y/100*h, dx=(to.x-from.x)/100*w, dy=(to.y-from.y)/100*h;
        const len=Math.hypot(dx,dy);
        if (!len) continue;
        const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(len*len)));
        const distance=Math.hypot(px-ax-t*dx, py-ay-t*dy);
        const force=12*Math.exp(-distance*distance/(2*22*22));
        fx+=dx/len*force; fy+=dy/len*force;
      }
      const bx=x-this.u[i]*dt*(n-1), by=y-this.v[i]*dt*(n-1);
      // Bounded forcing relaxes toward the current interactive field.
      const blend=1-Math.exp(-dt*2);
      nextU[i]=this.sample(this.u,bx,by)*(1-blend)+fx/w*blend;
      nextV[i]=this.sample(this.v,bx,by)*(1-blend)+fy/h*blend;
    }
    // Anisotropic pressure projection respects the actual map aspect ratio.
    const hx=w/(n-1), hy=h/(n-1), a=1/(hx*hx), b=1/(hy*hy);
    const div=new Float32Array(n*n);
    this.pressure.fill(0);
    for (let y=1;y<n-1;y++) for (let x=1;x<n-1;x++) {
      const i=y*n+x;
      div[i]=(nextU[i+1]-nextU[i-1])*w/(2*hx)+(nextV[i+n]-nextV[i-n])*h/(2*hy);
    }
    for (let k=0;k<32;k++) for (let y=1;y<n-1;y++) for (let x=1;x<n-1;x++) {
      const i=y*n+x, p=this.pressure;
      p[i]=((p[i-1]+p[i+1])*a+(p[i-n]+p[i+n])*b-div[i])/(2*(a+b));
    }
    for (let y=1;y<n-1;y++) for (let x=1;x<n-1;x++) {
      const i=y*n+x;
      nextU[i]-=(this.pressure[i+1]-this.pressure[i-1])/(2*hx*w);
      nextV[i]-=(this.pressure[i+n]-this.pressure[i-n])/(2*hy*h);
    }
    this.u=nextU; this.v=nextV;
  }
}
