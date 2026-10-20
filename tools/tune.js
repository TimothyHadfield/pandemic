// Runs tools/measure.js once per weight variant (PAN_W env) and prints the totals side by side.
// usage: node tools/tune.js <games> '<cells>' '{"share":200}' '{"cube":7}' ...
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const games = process.argv[2] || '60';
const cells = process.argv[3] || '4:2,5:2,5:3,5:4,6:4';
const variants = process.argv.slice(4);
if (!variants.length) variants.push('{}');
for (const v of variants) {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'measure.js'), games, '--json', '--only=' + cells],
    { env: Object.assign({}, process.env, { PAN_W: v }), maxBuffer: 1 << 26 }).toString();
  const r = JSON.parse(out.trim().split('\n').pop());
  const cellTxt = r.cells.map(c => `${c.epidemics}:${c.players} ${c.wins}`).join('  ');
  console.log(`${(100 * r.wins / r.total).toFixed(1)}%  ${r.wins}/${r.total}  [${cellTxt}]  ${r.secPerGame}s  ${v}`);
}
