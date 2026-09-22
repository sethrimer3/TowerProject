const fs = require('fs');
let code = fs.readFileSync('src/generation.ts', 'utf8');

if (!code.includes('validatePhysicalLayout')) {
  code = 'import { validatePhysicalLayout } from "./validation.ts";\n' + code;
}

code = code.replace(
  'if (validMapping) return cells;',
  `if (validMapping) {
      // Find exit
      let exitX = -1, exitY = -1;
      for (const [k, v] of cells.entries()) {
        if (v.kind === 'stairs') {
           const [x, y] = k.split(',').map(Number);
           exitX = x; exitY = y; break;
        }
      }
      
      const mockPlayer = { x: 0, y: 0, hp: 999999, maxHp: 999999, attack: 9999, defense: 9999, keys: { yellow: 0, blue: 0, red: 0 }, gear: [] };
      const isValid = validatePhysicalLayout(cells, TOWER_START_X, 1, exitX, exitY, mockPlayer);
      
      if (isValid) return cells;
    }`
);

fs.writeFileSync('src/generation.ts', code);
