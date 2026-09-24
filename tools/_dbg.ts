import { region } from '../src/delve/labyrinth.ts';
const r = region(0, 0);
for (const n of r.nodes.filter(n => n.pattern?.id === 'PotionAfterCombat')) {
  const e = r.edges.filter(e => e.a === n.id || e.b === n.id);
  console.log(n.id, n.col, n.row, n.x, n.y, 'links', n.links, 'edges', e.length, e.map(e=>JSON.stringify(e.path)));
  for (let y = n.y + 8; y >= n.y - 8; y--) { let l=''; for (let x = Math.max(0,n.x-9); x < Math.min(30,n.x+10); x++) { const t=r.cells.get(`${x},${y}`); l += t ? ({floor:'.',enemy:'E',door:'D',potion:'p',key:'k'} as any)[t.kind] ?? '?' : '#'; } console.log(y, l); }
}
