// Plays all-computer games and reports the team win rate per difficulty and player count.
// usage: node tools/measure.js [games per cell] [--json] [--only=epi:players]
// Runs one process per CPU core. Each game's seed is fixed, so results repeat exactly.
'use strict';
const path = require('path');
const D = require('../js/data.js');
const E = require('../js/engine.js');
const B = require('../js/bots.js');

function play(players, epidemics, seed, width) {
  let s = E.newGame({ players, epidemics, seed });
  let guard = 0;
  while (!s.over && guard++ < 5000) {
    const seat = E.toAct(s)[0];
    s = E.apply(s, seat, B.decide(s, seat, { width }));
  }
  return s;
}
const seedOf = (epi, players, g) => 100000 * epi + 10000 * players + g + 1;

function runJob(job) {
  const res = [];
  for (let g = job.from; g < job.to; g++) {
    const s = play(job.players, job.epi, seedOf(job.epi, job.players, g), job.width);
    const outs = [];
    s.log.forEach(e => { const m = /^Outbreak in (.+)!$/.exec(e.m); if (m) outs.push(D.IDX[m[1]]); });
    res.push({ win: !!(s.over && s.over.win), why: s.over ? s.over.why : 'stuck', turn: s.turn, cured: s.cured.reduce((a, b) => a + b, 0), outs });
  }
  return res;
}

if (process.argv[2] === '--child') {
  process.stdout.write(JSON.stringify(runJob(JSON.parse(process.argv[3]))));
} else if (require.main === module) {
  const games = +process.argv[2] || 40;
  const json = process.argv.includes('--json');
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const width = +((process.argv.find(a => a.startsWith('--width=')) || '').split('=')[1]) || undefined;
  const cells = [];
  for (const epi of [4, 5, 6]) for (const players of [2, 3, 4]) cells.push({ epi, players });
  const want = onlyArg ? onlyArg.slice(7).split(',') : null;
  const todo = want ? cells.filter(c => want.includes(c.epi + ':' + c.players)) : cells;
  const cores = Math.max(1, require('os').cpus().length - 1);
  const jobs = [];
  const chunk = Math.max(1, Math.ceil(games / Math.max(1, Math.floor(cores * 2 / todo.length))));
  todo.forEach((c, ci) => { for (let f = 0; f < games; f += chunk) jobs.push({ ci, epi: c.epi, players: c.players, from: f, to: Math.min(games, f + chunk), width }); });
  const { spawn } = require('child_process');
  const results = todo.map(() => []);
  const t0 = Date.now();
  let next = 0, running = 0;
  function launch() {
    while (running < cores && next < jobs.length) {
      const job = jobs[next++];
      running++;
      let buf = '';
      const ch = spawn(process.execPath, [__filename, '--child', JSON.stringify(job)], { cwd: path.dirname(__filename) });
      ch.stdout.on('data', d => { buf += d; });
      ch.stderr.on('data', d => process.stderr.write(d));
      ch.on('close', () => { results[job.ci].push(...JSON.parse(buf)); running--; if (next < jobs.length) launch(); else if (!running) done(); });
    }
  }
  function done() {
    const out = { games, cells: [], outbreakCity: new Array(48).fill(0), seconds: Math.round((Date.now() - t0) / 1000) };
    todo.forEach((c, i) => {
      const r = results[i];
      const wins = r.filter(x => x.win).length;
      const why = {};
      r.forEach(x => { if (!x.win) why[x.why] = (why[x.why] || 0) + 1; x.outs.forEach(k => { out.outbreakCity[k]++; }); });
      const cured = r.reduce((a, x) => a + x.cured, 0) / r.length;
      out.cells.push({ epidemics: c.epi, players: c.players, games: r.length, wins, why, cured: +cured.toFixed(2) });
      if (!json) console.log(`epidemics ${c.epi} players ${c.players}: ${wins}/${r.length} = ${(100 * wins / r.length).toFixed(0)}%  cures ${cured.toFixed(2)}  lost by ${JSON.stringify(why)}`);
    });
    if (json) console.log(JSON.stringify(out));
    else console.log('seconds', out.seconds);
  }
  launch();
}
module.exports = { play, runJob };
