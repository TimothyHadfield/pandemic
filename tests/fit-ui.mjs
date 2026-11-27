// Browser test: fit pass (2026-11-27). A crowded late 4-player game: can everything be read without scrolling?
// Your hand of 7 cards, teammates holding 5-7 cards, the action buttons, at 393x659, 320x568, 659x393, 1280x800, 1440x900.
//   node tests/fit-ui.mjs [--engine chromium]     (needs Playwright in ~/.claude/tools; PAN_ROOT=<folder> runs another checkout)
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
const require = createRequire(join(homedir(), '.claude/tools/') + 'x.js');
const pw = require('playwright');
const ROOT = process.env.PAN_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(join(ROOT, 'tests', 'x.js'));
const D = req('../js/data.js');
const E = req('../js/engine.js');
const I = D.IDX;
const KEY = 'pandemic-lab-v1';
const ENGINE = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : 'webkit';

// late game: cubes on 26 cities, 6 stations, 6 outbreaks, rate 3, one cure; my 7 long-named cards; teammates hold 6, 7 and 5
export function crowded() {
  let s = E.newGame({ players: 4, epidemics: 5, seed: 5151, roles: [D.ROLE_IDX.researcher], names: ['You', 'Computer 1', 'Computer 2', 'Computer 3'], human: [true, false, false, false], openHands: 'auto', eventPause: true });
  s = JSON.parse(JSON.stringify(s));
  s.cur = 0; s.phase = 'actions'; s.left = 4; s.pend = null;
  s.pawns = [I['Paris'], I['Paris'], I['Hong Kong'], I['Istanbul']];
  s.stations = ['Atlanta', 'London', 'Paris', 'Essen', 'Milan', 'Hong Kong'].map(c => I[c]);
  for (let k = 0; k < s.cubes.length; k++) { s.supply[k % 4] += s.cubes[k]; s.cubes[k] = 0; }
  const add = (c, col, n) => { s.cubes[I[c] * 4 + col] = n; s.supply[col] -= n; };
  add('Paris', 0, 3); add('Paris', 2, 1); add('London', 0, 3); add('Essen', 0, 2); add('Milan', 0, 2); add('Madrid', 0, 2); add('St. Petersburg', 0, 1);
  add('Istanbul', 2, 3); add('Moscow', 2, 2); add('Cairo', 2, 3); add('Baghdad', 2, 2); add('Riyadh', 2, 1); add('Tehran', 2, 2);
  add('Hong Kong', 3, 3); add('Shanghai', 3, 2); add('Taipei', 3, 3); add('Tokyo', 3, 2); add('Seoul', 3, 1); add('Osaka', 3, 1); add('Sydney', 3, 3);
  add('Lagos', 1, 3); add('Kinshasa', 1, 2); add('Bogota', 1, 2); add('Lima', 1, 1); add('Mexico City', 1, 3); add('Los Angeles', 1, 2);
  s.cured = [1, 0, 0, 0]; s.outbreaks = 6; s.rate = 4;
  const mine = ['St. Petersburg', 'Ho Chi Minh City', 'Johannesburg', 'Mexico City', 'San Francisco', 'Kolkata', 'Buenos Aires'].map(c => I[c]);
  const pool = s.hands.flat().concat(s.pdeck).filter(c => c < 48 && !mine.includes(c));
  s.pdeck = s.pdeck.filter(c => !mine.includes(c));
  const deal = n => { const h = pool.splice(0, n); s.pdeck = s.pdeck.filter(c => !h.includes(c)); return h; };
  s.hands = [mine, deal(6), deal(7), deal(5)];
  s.handN = s.hands.map(h => h.length);
  return s;
}

const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const store = JSON.stringify({ game: { state: crowded(), me: 0, checks: [] } });
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); } });
  });
  await new Promise(ok => srv.listen(0, ok));
  const url = 'http://localhost:' + srv.address().port + '/';
  let failed = 0;
  const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) failed++; };

  const measure = page => page.evaluate(() => {
    const fsz = e => parseFloat(getComputedStyle(e).fontSize);
    const shown = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.display !== 'none' && c.visibility !== 'hidden'; };
    // a name's visible strip: from its left edge to the left edge of the card laid over it (if any)
    const strips = cards => cards.map((c, i) => {
      const nm = c.querySelector('.pc-nm'); if (!nm || !shown(nm)) return null;
      // walk along the first line of the name and count how far this card stays on top (cards are slightly rotated)
      const rg = document.createRange(); rg.selectNodeContents(nm); const line = rg.getClientRects()[0] || nm.getBoundingClientRect();
      const y = line.top + line.height / 2;
      let x = line.left + 1; while (x < line.left + 120) { const e = document.elementFromPoint(x, y); if (!e || e.closest('.pc') !== c) break; x += 1; }
      return { name: c.textContent.trim().replace(/­/g, '').slice(0, 18), font: fsz(nm), strip: Math.round(x - line.left), cut: nm.scrollHeight > nm.clientHeight + 1 };
    }).filter(Boolean);
    const acts = document.getElementById('g-acts'), ab = acts.getBoundingClientRect();
    const btns = [...acts.querySelectorAll('button')].filter(shown).map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), l: r.left, r: r.right, w: r.width, h: r.height, out: r.left < ab.left - 1 || r.right > ab.right + 1 || r.bottom > innerHeight || r.right > innerWidth }; });
    const fan = [...document.querySelectorAll('#g-fan > .pc')];
    const seats = [...document.querySelectorAll('#g-players .pchip')].map(p => strips([...p.querySelectorAll('.sh > .pc')]));
    return {
      scroll: document.scrollingElement.scrollWidth > innerWidth + 1 || document.scrollingElement.scrollHeight > innerHeight + 1,
      hand: strips(fan), btns, seats, desk: innerWidth >= 900,
      fanBottom: fan.length ? Math.max(...fan.map(c => c.getBoundingClientRect().bottom)) : 0, actsTop: ab.top,
      fanTop: fan.length ? Math.min(...fan.map(c => c.getBoundingClientRect().top)) : 0,
    };
  });

  const browser = await pw[ENGINE].launch();
  try {
    for (const vp of [{ w: 393, h: 659, t: true }, { w: 320, h: 568, t: true }, { w: 659, h: 393, t: true }, { w: 1280, h: 800, t: false }, { w: 1440, h: 900, t: false }]) {
      console.log(vp.w + 'x' + vp.h + ' (' + ENGINE + ')');
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.t, isMobile: vp.t && ENGINE !== 'firefox' });
      await ctx.addInitScript(([k, v]) => { try { localStorage.setItem('coach-offer:pandemic-first', '1'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, [KEY, store]);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.goto(url + '#play');
      await page.waitForSelector('#g-fan > .pc');
      await page.waitForTimeout(900);
      const m = await measure(page);
      check(!m.scroll, 'no page scroll');
      // my hand: 7 cards, names at least 10 px, never cut off at the bottom, each overlapped card keeps a strip of at least 24 px (4+ letters) of its name
      check(m.hand.length === 7, 'my 7 cards are shown (' + m.hand.length + ')');
      const small = m.hand.filter(h => h.font < 9.95);
      check(!small.length, 'my card names are at least 10 px' + (small.length ? ': ' + small[0].font.toFixed(1) + ' px' : ' (' + Math.min(...m.hand.map(h => h.font)).toFixed(1) + ')'));
      const cut = m.hand.filter(h => h.cut);
      check(!cut.length, 'no card name is cut off' + (cut.length ? ': ' + cut.map(h => h.name).join(', ') : ''));
      const thin = m.hand.filter(h => h.strip < 24);
      check(!thin.length, 'each card shows a name strip of at least 24 px, 4+ letters (smallest ' + Math.min(...m.hand.map(h => h.strip)) + ')');
      if (m.actsTop > m.fanTop) check(m.fanBottom <= m.actsTop + 2,'my cards do not run into the buttons (' + Math.round(m.fanBottom) + ' vs ' + Math.round(m.actsTop) + ')');
      // every action button fully on screen (no hidden End turn), a real tap size
      const out = m.btns.filter(b => b.out);
      check(m.btns.length >= 4 && !out.length, 'all ' + m.btns.length + ' action buttons are fully on screen' + (out.length ? ' (cut: ' + out.map(b => b.t).join(', ') + ')' : ''));
      const tiny = m.btns.filter(b => b.w < 36 || b.h < 36);
      check(!tiny.length, 'action buttons at least 36 px' + (tiny.length ? ': ' + tiny.map(b => b.t + ' ' + Math.round(b.w) + 'x' + Math.round(b.h)).join(', ') : ''));
      // laptop: teammates' held cards can be read (names >= 10 px, strips >= 24 px)
      if (m.desk) {
        const all = m.seats.flat();
        check(all.length >= 18, 'teammates’ cards show their names (' + all.length + ')');
        const sm = all.filter(h => h.font < 9.95);
        check(all.length && !sm.length, 'teammates’ card names at least 10 px' + (sm.length ? ': ' + sm[0].font.toFixed(1) + ' px' : ''));
        const th = all.filter(h => h.strip < 24);
        check(all.length && !th.length, 'teammates’ cards each show a name strip of at least 24 px (smallest ' + Math.min(...all.map(h => h.strip)) + ')');
      }
      check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(failed ? failed + ' failed' : 'all passed');
  process.exit(failed ? 1 : 0);
}
