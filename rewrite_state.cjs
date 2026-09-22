const fs = require('fs');
let code = fs.readFileSync('src/state.ts', 'utf8');

code = code.replace(
  'if (t.kind !== "floor" && t.kind !== "stairs") this.world.clear(x, y);',
  'if (t.kind !== "floor" && t.kind !== "stairs" && t.kind !== "oneway") this.world.clear(x, y);'
);

const onewayLogic = `
    const currentTile = this.world.tile(p.x, p.y);
    if (currentTile.kind === "oneway" && dy !== 1) {
      this.feedback("A magical barrier prevents retreat");
      return false;
    }
`;

code = code.replace(
  'const target = this.world.step(p.x, p.y, dx, dy);',
  onewayLogic + 'const target = this.world.step(p.x, p.y, dx, dy);'
);

fs.writeFileSync('src/state.ts', code);
