// Browser test: can a player see what is happening on the board? (visibility pass 2026-10-21)
// Board size on each screen, readable city names, names never covering pawns, and crowded spots
// (Europe, East Asia) on a phone: a tap there magnifies instead of guessing a city.
//   node tests/visibility.test.mjs [--engine chromium]     (needs Playwright in ~/.claude/tools)
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
const require = createRequire(join(homedir(), '.claude/tools/') + 'x.js');
const pw = require('playwright');
const ROOT = process.env.PAN_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'); // PAN_ROOT: run against another checkout (e.g. the old code)
const req = createRequire(join(ROOT, 'tests', 'x.js'));
const D = req('../js/data.js');
const E = req('../js/engine.js');
const I = D.IDX;
const KEY = 'pandemic-lab-v1';
const ENGINE = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : 'webkit';

// a late 4-player game: every pawn in Paris, stations and cubes all over Europe and East Asia, 7 cards in hand
function crowded() {
  let s = E.newGame({ players: 4, epidemics: 5, seed: 5151, roles: [D.ROLE_IDX.researcher], names: ['You', 'Computer 1', 'Computer 2', 'Computer 3'], human: [true, false, false, false], openHands: 'auto', eventPause: true });
  s = JSON.parse(JSON.stringify(s));
  s.cur = 0; s.phase = 'actions'; s.left = 4; s.pend = null;
  s.pawns = s.pawns.map(() => I['Paris']);
  s.stations = ['Atlanta', 'London', 'Paris', 'Essen', 'Milan', 'Hong Kong'].map(c => I[c]);
  const add = (c, col, n) => { const k = I[c] * 4 + col; s.supply[col] -= n - s.cubes[k]; s.cubes[k] = n; };
  add('Paris', 0, 3); add('Paris', 2, 1); add('London', 0, 3); add('Essen', 0, 2); add('Milan', 0, 2); add('Istanbul', 2, 3); add('Moscow', 2, 2);
  add('Hong Kong', 3, 3); add('Shanghai', 3, 2); add('Taipei', 3, 3); add('Tokyo', 3, 2); add('Seoul', 3, 1); add('Osaka', 3, 1);
  return s;
}
const store = JSON.stringify({ game: { state: crowded(), me: 0, checks: [] } });

const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
await new Promise(ok => srv.listen(0, ok));
const url = 'http://localhost:' + srv.address().port + '/';
let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) failed++; };

// what is on the board right now, in screen px
const look = page => page.evaluate(() => {
  const box = document.querySelector('#g-map'), svg = box.querySelector('svg'), m = svg.getScreenCTM(), b = box.getBoundingClientRect();
  const inView = r => r.width && r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
  // a name's ink box: the text box minus the empty line space above the capitals and below the letters
  const ink = t => { const r = t.getBoundingClientRect(), h = r.height; return { l: r.left + 1, r: r.right - 1, t: r.top + h * 0.2, b: r.bottom - h * 0.22, name: t.textContent }; };
  const labels = [...svg.querySelectorAll('text.lbl')].filter(t => t.getAttribute('visibility') !== 'hidden' && inView(t.getBoundingClientRect()));
  const L = labels.map(ink);
  const hit = (a, c) => a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b;
  const overlaps = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (hit(L[i], L[j])) overlaps.push(L[i].name + '/' + L[j].name);
  const pawns = [...svg.querySelectorAll('.pawn')].map(p => { const r = p.getBoundingClientRect(); return { l: r.left + 1, r: r.right - 1, t: r.top + 1, b: r.bottom - 1 }; });
  const onPawn = L.filter(a => pawns.some(p => hit(a, p))).map(a => a.name);
  const sel = document.querySelector('#g-info .p1');
  return {
    board: { l: m.e, t: m.f, w: 1000 * m.a, h: 500 * m.d }, scale: m.a, box: { l: b.left, t: b.top, w: b.width, h: b.height },
    vw: innerWidth, vh: innerHeight,
    minFont: labels.length ? Math.min(...labels.map(t => +t.getAttribute('font-size') * m.a)) : 0, shown: labels.length,
    overlaps, onPawn, info: sel ? sel.textContent : '',
    scroll: document.scrollingElement.scrollWidth > innerWidth + 1 || document.scrollingElement.scrollHeight > innerHeight + 1,
  };
});
const settle = async (page, ok, max = 4000) => { const t0 = Date.now(); let v = await look(page); while (!ok(v) && Date.now() - t0 < max) { await page.waitForTimeout(100); v = await look(page); } return v; };
const cityAt = (v, name) => { const c = D.CITIES[I[name]]; return { x: v.board.l + c.x * v.scale, y: v.board.t + c.y * v.scale }; };

const browser = await pw[ENGINE].launch();
try {
  for (const vp of [{ n: 'phone', w: 393, h: 659, touch: true }, { n: 'small phone', w: 320, h: 568, touch: true }, { n: 'phone on its side', w: 659, h: 393, touch: true }, { n: 'laptop', w: 1280, h: 800, touch: false }]) {
    console.log(vp.n + ' ' + vp.w + 'x' + vp.h + ' (' + ENGINE + ')');
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch && ENGINE !== 'firefox' });
    await ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, [KEY, store]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url + '#play');
    await page.waitForSelector('#g-map svg');
    await page.waitForTimeout(800);
    const v = await look(page);
    const phone = vp.w < 900;
    // the board as big as the screen allows
    if (phone && vp.h > vp.w) {
      check(v.board.w >= vp.w * 0.95, 'board runs (nearly) edge to edge: ' + Math.round(v.board.w) + ' of ' + vp.w + ' px');
      check(v.box.h - v.board.h <= 14, 'no empty sea band in the map box: ' + Math.round(v.box.h - v.board.h) + ' px');
    }
    if (phone && vp.w > vp.h) {
      const share = v.board.w * v.board.h / (vp.w * vp.h);
      check(share >= 0.25, 'board gets at least a quarter of the screen: ' + (share * 100).toFixed(1) + '%');
      check(v.box.h - v.board.h <= 20, 'no empty sea band in the map box: ' + Math.round(v.box.h - v.board.h) + ' px');
    }
    check(!v.scroll, 'no page scroll');
    // names that can be read, that do not pile up, that never hide a pawn
    check(v.minFont >= 9.9, 'every city name shown is at least 10 px: smallest ' + v.minFont.toFixed(1) + ' px (' + v.shown + ' shown)');
    check(v.overlaps.length === 0, 'no two names overlap' + (v.overlaps.length ? ': ' + v.overlaps.join(', ') : ''));
    check(v.onPawn.length === 0, 'no name covers a pawn' + (v.onPawn.length ? ': ' + v.onPawn.join(', ') : ''));
    if (phone) {
      // crowded Europe: a tap on Paris magnifies the spot (no guess), the next tap on Paris picks Paris
      let p = cityAt(v, 'Paris');
      await page.mouse.click(p.x, p.y);
      const z = await settle(page, x => x.scale >= 0.95);
      check(z.scale >= 0.95, 'tap in crowded Europe magnifies it (scale ' + v.scale.toFixed(2) + ' -> ' + z.scale.toFixed(2) + ')');
      check(!/Paris|London|Essen|Madrid|Milan/.test(z.info), 'that tap picks no city yet (info: ' + z.info.slice(0, 30) + ')');
      p = cityAt(z, 'Paris');
      check(p.x > z.box.l && p.x < z.box.l + z.box.w && p.y > z.box.t && p.y < z.box.t + z.box.h, 'Paris is on screen in the close-up');
      check(z.minFont >= 9.9 && z.overlaps.length === 0, 'close-up names: ' + z.shown + ' shown, smallest ' + z.minFont.toFixed(1) + ' px, overlaps ' + z.overlaps.length);
      await page.waitForTimeout(400);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(300);
      const s = await look(page);
      check(/Paris/.test(s.info), 'the next tap picks Paris (info: ' + s.info.slice(0, 30) + ')');
      // fit button: whole board again
      await page.click('#g-map [data-z="fit"]');
      const back = await settle(page, x => Math.abs(x.scale - v.scale) < 0.01);
      check(Math.abs(back.scale - v.scale) < 0.01, 'fit button returns to the whole board');
      // an uncrowded city still picks on the first tap
      await page.waitForTimeout(300);
      const q = cityAt(back, 'Sydney');
      await page.mouse.click(q.x, q.y);
      await page.waitForTimeout(400);
      const sy = await look(page);
      check(/Sydney/.test(sy.info) && Math.abs(sy.scale - v.scale) < 0.01, 'a city with room around it picks on the first tap, no zoom (info: ' + sy.info.slice(0, 20) + ')');
    } else {
      // laptop: a tap on Paris picks Paris straight away (the board is big enough)
      const p = cityAt(v, 'Paris');
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(400);
      const s = await page.evaluate(() => document.querySelector('#g-info2 .p1') ? document.querySelector('#g-info2 .p1').textContent : '');
      const z = await look(page);
      check(/Paris/.test(s) && Math.abs(z.scale - v.scale) < 0.01, 'laptop: a tap on Paris picks Paris, no zoom (' + s.slice(0, 20) + ')');
    }
    check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
