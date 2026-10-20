// Browser test: once the game is over, nothing on screen still asks for a decision.
// Real case: you play Forecast on the turn that ends the game. The Forecast window used to stay
// open after the move was made and the team had lost (seen in ?autoplay runs, where the computer
// answers for your seat while the window is up).
//   node tests/over-prompts.test.mjs      (needs Playwright in ~/.claude/tools, like tools/two-browsers.mjs)
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
const require = createRequire(join(homedir(), '.claude/tools/') + 'x.js');
const pw = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const D = req('../js/data.js');
const E = req('../js/engine.js');

// a local game where you (seat 0) hold Forecast, 7 outbreaks are already out and every city has 3 cubes:
// the next infection outbreaks and the team loses
function nearLoss() {
  let s = E.newGame({ players: 2, epidemics: 5, seed: 12345, roles: [-1], names: ['You', 'Computer 1'], human: [true, false], openHands: 'auto', eventPause: true });
  s = JSON.parse(JSON.stringify(s));
  const FC = 49;
  for (const h of s.hands) { const i = h.indexOf(FC); if (i >= 0) h.splice(i, 1); }
  const j = s.pdeck.indexOf(FC); if (j >= 0) s.pdeck.splice(j, 1);
  s.hands[0].push(FC);
  s.cur = 0; s.phase = 'actions'; s.left = 4;
  s.outbreaks = 7;
  D.CITIES.forEach((c, i) => { s.cubes[i * 4 + c.color] = 3; });
  return E.apply(s, 0, { t: 'event', card: FC }); // you just played Forecast: its window is up
}

const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
await new Promise(ok => srv.listen(0, ok));
const url = 'http://localhost:' + srv.address().port + '/';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) failed++; };
const browser = await pw.webkit.launch();
try {
  const state = nearLoss();
  check(state.phase === 'forecast' && state.pend.seat === 0, 'setup: Forecast window is waiting for you');
  const ctx = await browser.newContext({ viewport: { width: 393, height: 659 } });
  await ctx.addInitScript(store => { try { localStorage.setItem('pandemic-lab-v1', store); } catch (e) {} },
    JSON.stringify({ game: { state, me: 0, checks: [] } }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url);
  await page.waitForSelector('#sheet', { timeout: 5000 }).catch(() => {});
  check(await page.$('#sheet') !== null, 'the Forecast window opens for you (and waits for you)');
  // same saved game again, now with ?autoplay (the init script restores the saved game on every load)
  await page.goto(url + '?autoplay');
  // ?autoplay: the computer answers for your seat, plays on, and the next infection ends the game
  await page.waitForFunction(() => /team lost|world is saved/i.test((document.querySelector('#g-info') || {}).textContent || ''), null, { timeout: 20000 })
    .then(() => check(true, 'the game ends'), () => check(false, 'the game ends'));
  await page.waitForTimeout(400);
  check(await page.$('#sheet') === null, 'no Forecast window (or any decision sheet) after the game is over');
  check(await page.$('.confirm-back') === null, 'no confirm box after the game is over');
  check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} finally { await browser.close(); srv.close(); }
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
