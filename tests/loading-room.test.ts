// The loading screen's little tower room (src/ui/loading-room.ts): every
// seed builds a whole 13 × 13 room with a key for every door, the same each time.
import test from "node:test";
import assert from "node:assert/strict";
import { EASE, SIZE, loadingRoom } from "../src/ui/loading-room.ts";

const at = (x: number, y: number) => `${x},${y}`;

test("every room is whole, walled and solvable", () => {
  for (let seed = 0; seed < 400; seed++) {
    const room = loadingRoom(seed);
    const floors = room.pieces.filter(p => p.kind === "floor");
    assert.equal(floors.length, SIZE * SIZE, "a floor tile under every cell");
    const blocks = new Map(room.pieces.filter(p => p.kind === "wall" || p.kind === "door" || p.kind === "stairs").map(p => [at(p.x, p.y), p]));
    assert.equal(blocks.size, room.pieces.filter(p => p.kind === "wall" || p.kind === "door" || p.kind === "stairs").length, "no cell built twice");
    for (let s = 0; s < SIZE; s++)
      for (const [x, y] of [[s, 0], [0, s], [SIZE - 1, s], [s, SIZE - 1]])
        if (x !== room.entrance[0] || y !== room.entrance[1]) assert.ok(blocks.has(at(x, y)), `outer wall at ${x},${y}`);
    assert.ok(!blocks.has(at(...room.entrance)), "the entrance is open");
    const stairs = room.pieces.filter(p => p.kind === "stairs");
    assert.equal(stairs.length, 1);
    // Every door has a key of its colour, and with them all open the stairs are in reach.
    const count = (kind: string) => {
      const n: Record<string, number> = {};
      for (const p of room.pieces) if (p.kind === kind) n[p.color!] = (n[p.color!] ?? 0) + 1;
      return n;
    };
    const keys = count("key");
    for (const [color, n] of Object.entries(count("door"))) assert.equal(keys[color], n, `seed ${seed}: a ${color} key a ${color} door`);
    const seen = new Set([at(...room.entrance)]), queue = [room.entrance];
    let reachedStairs = false;
    for (let q = 0; q < queue.length; q++) {
      const [x, y] = queue[q];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = at(nx, ny);
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || seen.has(k)) continue;
        const b = blocks.get(k);
        if (b?.kind === "stairs") reachedStairs = true;
        if (b?.kind === "wall" || b?.kind === "stairs") continue;
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
    assert.ok(reachedStairs, `seed ${seed}: the stairs can be reached`);
    for (const p of room.pieces) assert.ok(p.at >= 0 && p.at + EASE <= 1, "every piece settles by the end of the build");
    assert.equal(room.pieces.find(p => p.kind === "hero")?.x, room.entrance[0]);
  }
});

test("a seed always builds the same room", () => {
  assert.deepEqual(loadingRoom(1234), loadingRoom(1234));
  assert.notDeepEqual(loadingRoom(1), loadingRoom(2));
});
