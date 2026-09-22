const fs = require('fs');
let code = fs.readFileSync('src/automation.ts', 'utf8');

code = code.replace(
  '(t.kind === "enemy" && !predict(p, t.enemy!).survivable)',
  '(t.kind === "enemy" && !predict(p, t.enemy!).survivable && !predict(p, t.enemy!).impervious)'
);

code = code.replace(
  't.kind === "wall" ||',
  't.kind === "wall" || (t.kind === "oneway" && dy !== 1) ||'
);

fs.writeFileSync('src/automation.ts', code);
