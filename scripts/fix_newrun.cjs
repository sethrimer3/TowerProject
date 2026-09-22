const fs = require('fs');
let code = fs.readFileSync('src/state.ts', 'utf8');

code = code.replace(
  /this\.newRun\([^]*?\);/g,
  `this.save[this.mode].run = null;
    this.auto = false;`
);

fs.writeFileSync('src/state.ts', code);
