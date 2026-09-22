const fs = require('fs');
let code = fs.readFileSync('src/generation.ts', 'utf8');

const bspCode = `
export function bspRooms(x: number, y: number, w: number, h: number, rng: () => number, minSize = 4) {
  const regions = [{ x, y, w, h }];
  const rooms: any[] = [];
  while (regions.length > 0) {
    const r = regions.pop()!;
    const canSplitH = r.h > minSize * 2;
    const canSplitV = r.w > minSize * 2;
    if (canSplitH && canSplitV) {
      if (rng() < 0.5) splitH(r); else splitV(r);
    } else if (canSplitH) {
      splitH(r);
    } else if (canSplitV) {
      splitV(r);
    } else {
      rooms.push(r);
    }
    function splitH(r: any) {
      const wallThick = rng() < 0.25 ? 2 : 1; 
      const split = Math.floor(rng() * (r.h - minSize * 2 - wallThick + 1)) + minSize;
      regions.push({ x: r.x, y: r.y, w: r.w, h: split });
      regions.push({ x: r.x, y: r.y + split + wallThick, w: r.w, h: r.h - split - wallThick });
    }
    function splitV(r: any) {
      const wallThick = rng() < 0.25 ? 2 : 1; 
      const split = Math.floor(rng() * (r.w - minSize * 2 - wallThick + 1)) + minSize;
      regions.push({ x: r.x, y: r.y, w: split, h: r.h });
      regions.push({ x: r.x + split + wallThick, y: r.y, w: r.w - split - wallThick, h: r.h });
    }
  }
  return rooms;
}

export function carvePath(cells: Map<string, Tile>, pointFn: (x: number, y: number) => string, x1: number, y1: number, x2: number, y2: number, rng: () => number) {
  let cx = x1, cy = y1;
  while(cx !== x2 || cy !== y2) {
    cells.set(pointFn(cx, cy), { kind: 'floor' });
    if (cx === x2) { cy += Math.sign(y2 - cy); continue; }
    if (cy === y2) { cx += Math.sign(x2 - cx); continue; }
    if (rng() < 0.5) cx += Math.sign(x2 - cx); else cy += Math.sign(y2 - cy);
  }
  cells.set(pointFn(x2, y2), { kind: 'floor' });
}
`;

code = code.replace('export function validate(', bspCode + '\nexport function validate(');

let searchStr = 'sculptRoom(cells, bounds, 0, rng, reserved);';
let replaceStr = `
  const rooms = bspRooms(bounds.x1, bounds.y1, bounds.x2 - bounds.x1 + 1, bounds.y2 - bounds.y1 + 1, rng, 4);
  for (let r of rooms) {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        floor(xx, yy);
      }
    }
  }
  for (let i = 0; i < rooms.length - 1; i++) {
    const r1 = rooms[i];
    const r2 = rooms[i + 1];
    const cx1 = Math.floor(r1.x + r1.w / 2);
    const cy1 = Math.floor(r1.y + r1.h / 2);
    const cx2 = Math.floor(r2.x + r2.w / 2);
    const cy2 = Math.floor(r2.y + r2.h / 2);
    carvePath(cells, point, cx1, cy1, cx2, cy2, rng);
  }
  carvePath(cells, point, TOWER_START_X, 1, Math.floor(rooms[0].x + rooms[0].w / 2), Math.floor(rooms[0].y + rooms[0].h / 2), rng);
`;
code = code.replace(searchStr, replaceStr);

fs.writeFileSync('src/generation.ts', code);
