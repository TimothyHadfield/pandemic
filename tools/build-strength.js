// Measures the computer team at every player count and difficulty (fixed shuffles) and writes
// js/strength-data.js for the Study tab and the setup screen.
// Run: node tools/build-strength.js [games per box]   (default 200; a few minutes on 8 cores)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const N = Number(process.argv[2]) || 200;
const raw = execFileSync(process.execPath, [path.join(__dirname, 'measure.js'), String(N), '--json'], { maxBuffer: 64 << 20 }).toString();
const line = raw.trim().split('\n').filter(l => l.startsWith('{')).pop();
const m = JSON.parse(line);
const out = {
  games: m.games,
  measured: new Date().toISOString().slice(0, 10),
  cells: m.cells.map(c => ({ epidemics: c.epidemics, players: c.players, games: c.games, wins: c.wins, why: c.why, cured: c.cured })),
  outbreakCity: m.outbreakCity,
};
const file = path.join(__dirname, '..', 'js', 'strength-data.js');
fs.writeFileSync(file, '// Measured by tools/measure.js (all-computer teams, fixed seeds). Rebuilt with: node tools/build-strength.js ' + N + '\n' +
  'window.PanStrength = ' + JSON.stringify(out) + ';\n');
out.cells.forEach(c => console.log(c.epidemics + ' epidemics, ' + c.players + ' players: ' + c.wins + '/' + c.games + ' = ' + Math.round(100 * c.wins / c.games) + '%'));
console.log('wrote ' + file + ' (' + m.seconds + ' s)');
