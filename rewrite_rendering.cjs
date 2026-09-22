const fs = require('fs');
let code = fs.readFileSync('src/rendering.ts', 'utf8');

const stairsRenderIndex = code.indexOf('if (t.kind === "stairs") {');
const onewayRenderCode = `
    if (t.kind === "oneway") {
      ctx.fillStyle = "#8a7e93";
      ctx.fillRect(px, py + TILE * 0.4, TILE, TILE * 0.2);
      ctx.fillStyle = "#a89fb3";
      ctx.beginPath();
      ctx.moveTo(px + TILE * 0.2, py + TILE * 0.4);
      ctx.lineTo(px + TILE * 0.5, py + TILE * 0.8);
      ctx.lineTo(px + TILE * 0.8, py + TILE * 0.4);
      ctx.fill();
    }
`;

code = code.slice(0, stairsRenderIndex) + onewayRenderCode + code.slice(stairsRenderIndex);

fs.writeFileSync('src/rendering.ts', code);
