// Browser test: weird and unexpected situations (edge pass 2026-10-20). WebKit (Safari's engine).
//   node tests/edge.test.mjs [--shots <dir>]     (needs Playwright in ~/.claude/tools)
// Each check sets up a saved game in localStorage, opens the page and does what a messy real player would do:
// double taps, Back with a box open, two tabs, blocked storage, every ending, tiny and huge screens.
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
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const I = D.IDX;
const KEY = 'pandemic-lab-v1';

// ------------------------------------------------------------------ states
function base(o) {
  o = o || {};
  const n = o.players || 2;
  const names = o.names || ['You'].concat(Array.from({ length: n - 1 }, (_, i) => 'Computer ' + (i + 1)));
  let s = E.newGame({ players: n, epidemics: o.epidemics || 5, seed: o.seed || 777, roles: o.roles || [D.ROLE_IDX.researcher], names,
    human: names.map((_, i) => i === 0), openHands: o.open, eventPause: true });
  s = JSON.parse(JSON.stringify(s));
  s.cur = 0; s.phase = 'actions'; s.left = 4; s.pend = null;
  return s;
}
const clean = s => { s.cubes.fill(0); s.supply = [24, 24, 24, 24]; return s; };
const without = (s, card) => { s.hands.forEach(h => { const i = h.indexOf(card); if (i >= 0) h.splice(i, 1); }); const j = s.pdeck.indexOf(card); if (j >= 0) s.pdeck.splice(j, 1); };
function overState(why) {
  const s = base();
  if (why === 'cured') { s.cured = [1, 1, 1, 1]; s.over = { win: true, why }; }
  else s.over = { win: false, why };
  if (why === 'outbreaks') s.outbreaks = 8;
  if (why === 'cards') s.pdeck = s.pdeck.slice(-1);
  s.phase = 'over'; s.turn = 23;
  return s;
}

// ------------------------------------------------------------------ server + helpers
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

// a page with this saved store (written once, before the app reads it; later loads keep what the app saved)
async function open(store, o) {
  o = o || {};
  const ctx = o.ctx || await browser.newContext({ viewport: o.vp || { width: 393, height: 659 }, deviceScaleFactor: o.dpr || 1, hasTouch: false });
  if (!o.ctx && store) await ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, [KEY, JSON.stringify(store)]);
  if (o.init) await ctx.addInitScript(o.init);
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errs.push('console: ' + m.text()); });
  await page.goto(url + (o.hash || ''));
  if (o.wait !== false) await page.waitForSelector(o.wait || '#game', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(o.settle || 500);
  return { ctx, page };
}
const saved = page => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, KEY);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
const center = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
// a real finger double tap: two taps on the same spot 90 ms apart (the second lands on whatever is there by then)
async function doubleTap(page, sel) {
  const p = await center(page, sel);
  if (!p) return false;
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(90); await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);
  return true;
}
const layoutIssues = page => page.evaluate(() => {
  const out = [];
  const se = document.scrollingElement;
  if (se.scrollWidth > innerWidth + 1) out.push('page scrolls sideways (' + se.scrollWidth + ' > ' + innerWidth + ')');
  if (se.scrollHeight > innerHeight + 1) out.push('page scrolls down (' + se.scrollHeight + ' > ' + innerHeight + ')');
  const tabs = document.querySelector('nav.tabs').getBoundingClientRect();
  const phone = innerWidth < 900;
  document.querySelectorAll('#g-acts .btn, #g-fan > .tbl-card, #g-me .rc, #g-status .stat, #g-players .pchip').forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    if (r.right > innerWidth + 1 && !el.closest('#g-acts')) out.push('off the right edge: ' + (el.id || el.className).toString().slice(0, 40));
    if (phone && r.bottom > tabs.top + 1) out.push('under the tab bar: ' + el.className.toString().slice(0, 40));
  });
  return out;
});

try {
  // ---------------------------------------------------------------- odd taps
  {
    const s = base();
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    await doubleTap(page, '#g-acts [data-g="end"]');
    const n = await page.locator('.confirm-back').count();
    check(n === 1, 'double tap End turn: one confirm box stays open (' + n + ')');
    await ctx.close();
  }
  {
    const s = clean(base());
    s.cubes[I['Atlanta'] * 4 + 0] = 3; s.supply[0] = 21;
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    await doubleTap(page, '#g-acts [data-act]');
    const st = (await saved(page)).game.state;
    check(st.left === 3 && st.cubes[I['Atlanta'] * 4] === 2, 'double tap Treat spends one action (left ' + st.left + ', cubes ' + st.cubes[I['Atlanta'] * 4] + ')');
    await ctx.close();
  }
  {
    // Back with a confirm box open closes only the box
    const s = base();
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    await page.click('#tabs [data-tab="study"]'); await page.click('#tabs [data-tab="play"]'); await page.waitForTimeout(300);
    await page.click('#g-acts [data-g="end"]');
    await page.goBack(); await page.waitForTimeout(400);
    const n = await page.locator('.confirm-back').count();
    const tab = await page.evaluate(() => document.querySelector('.view.on').id);
    check(n === 0 && tab === 'v-play', 'Back with a confirm box open: box closes, Play stays (' + n + ', ' + tab + ')');
    check(page.errs.length === 0, 'no page errors (Back + confirm)' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await ctx.close();
  }
  {
    // the game is over: tapping the hand, the board and stale buttons does nothing bad
    const s = overState('outbreaks');
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    const ban = await page.locator('.banner').count();
    check(ban === 1, 'game over: the end box shows (' + ban + ')');
    await page.mouse.click(5, 5); await page.waitForTimeout(200); // close it
    await page.locator('#g-fan .tbl-card').first().click({ force: true }).catch(() => {});
    const m = await center(page, '#g-map');
    await page.mouse.click(m.x, m.y); await page.waitForTimeout(300);
    check(page.errs.length === 0 && (await page.locator('#sheet').count()) === 0, 'game over: taps on hand and board do nothing' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await ctx.close();
  }
  {
    // the last infection ends the game while its cards are still flipping: New game clears the flips
    const s = base(); s.outbreaks = 7; D.CITIES.forEach((c, i) => { s.cubes[i * 4 + c.color] = 3; }); s.left = 1;
    s.hands[0] = s.hands[0].filter(D.isCity); s.hands[1] = s.hands[1].filter(D.isCity);
    s.pdeck = s.pdeck.filter(D.isCity); // no event drawn, so nothing waits before the infections
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    await page.click('#g-acts [data-g="end"]'); await page.click('.confirm-back [data-c="yes"]');
    await page.waitForSelector('.banner', { timeout: 5000 }).catch(() => {});
    await page.click('.banner [data-end="new"]').catch(() => {});
    await page.waitForTimeout(150);
    const strips = await page.locator('.flipstrip').count();
    check(strips === 0 && (await page.locator('.setup').count()) === 1, 'New game while cards flip: setup shows, no flying cards left (' + strips + ')');
    await ctx.close();
  }

  // ---------------------------------------------------------------- rules oddities in the browser
  {
    // an Epidemic with no infection cards left to flip
    const s = base(); s.idisc = s.idisc.concat(s.ideck); s.ideck = []; s.layers = [];
    without(s, D.EPIDEMIC); s.pdeck.push(I['Lima'], D.EPIDEMIC); s.left = 1;
    s.hands = s.hands.map(h => h.filter(D.isCity));
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    await page.click('#g-acts [data-g="end"]'); await page.click('.confirm-back [data-c="yes"]');
    await page.waitForTimeout(1500);
    const st = (await saved(page)).game.state;
    check(st.epiDrawn === s.epiDrawn + 1 && st.rate === 1 && !st.over, 'Epidemic with an empty infection deck: rate goes up, the game goes on (epi ' + st.epiDrawn + ', rate ' + st.rate + ')');
    check(page.errs.length === 0, 'no page errors (empty infection deck)' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await ctx.close();
  }
  {
    // Forecast with no infection cards left: a clear message, not "Illegal move"
    const s = base(); s.idisc = s.idisc.concat(s.ideck); s.ideck = []; s.layers = [];
    without(s, 49); s.hands[0].push(49);
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    await page.click('#g-fan [data-card="49"]'); await page.click('.confirm-back [data-c="yes"]').catch(() => {});
    await page.waitForTimeout(200);
    const t = await page.locator('.toast').textContent().catch(() => '');
    check(/infection deck is empty/i.test(t), 'Forecast with an empty infection deck says why (' + t + ')');
    await ctx.close();
  }
  {
    // reload during the discard prompt and during Forecast: the same decision is waiting
    const s = base(); s.hands[0] = D.CITIES.slice(0, 8).map(c => c.i); without(s, 49);
    s.phase = 'discard'; s.pend = { seat: 0, back: 'actions' };
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    await page.reload(); await page.waitForSelector('#game'); await page.waitForTimeout(400);
    const t = await page.locator('#g-info').textContent();
    check(/Too many cards/.test(t), 'reload during the discard prompt: still asks to discard');
    await ctx.close();
  }

  // ---------------------------------------------------------------- two tabs, blocked storage
  {
    const s = clean(base()); s.cubes[I['Atlanta'] * 4] = 2; s.supply[0] = 22;
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    const p2 = await ctx.newPage(); p2.errs = []; p2.on('pageerror', e => p2.errs.push(e.message));
    await p2.goto(url); await p2.waitForSelector('#game'); await p2.waitForTimeout(400);
    await page.click('#g-acts [data-act]'); await page.waitForTimeout(500);
    const t2 = await p2.locator('#g-info').textContent();
    check(/3 actions left/.test(t2), 'two tabs: the other tab follows the move (' + t2.slice(0, 40) + ')');
    await p2.click('#g-acts [data-act]').catch(() => {}); await p2.waitForTimeout(400);
    const st = (await saved(p2)).game.state;
    check(st.left === 2 && st.cubes[I['Atlanta'] * 4] === 0, 'two tabs: a move in the second tab keeps the first tab\'s move (left ' + st.left + ')');
    await ctx.close();
  }
  {
    // a second game that ends the same way on the same turn still gets its end card (the other tab ends it here)
    const over = overState('outbreaks');
    const { ctx, page } = await open({ game: { state: over, me: 0, checks: [] } });
    await page.click('.banner [data-end="new"]'); await page.waitForTimeout(200);
    await page.click('[data-start]'); await page.waitForTimeout(400);
    const p2 = await ctx.newPage();
    await p2.goto(url); await p2.waitForSelector('#game');
    await p2.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify({ game: { state: over, me: 0, checks: [] } })]);
    await page.waitForTimeout(600);
    check((await page.locator('.banner').count()) === 1, 'a second game ending on the same turn the same way shows its end card');
    await ctx.close();
  }
  {
    const init = () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError: storage blocked'); } }); };
    const { ctx, page } = await open(null, { init, wait: '.setup' });
    await page.click('[data-start]'); await page.waitForTimeout(600);
    check((await page.locator('#game').count()) === 1 && page.errs.length === 0, 'storage blocked: a game still starts' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await ctx.close();
  }

  // ---------------------------------------------------------------- every ending, at the smallest and a laptop screen
  for (const why of ['cured', 'outbreaks', 'cubes', 'cards']) {
    for (const vp of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
      const { ctx, page } = await open({ game: { state: overState(why), me: 0, checks: [] } }, { vp });
      const b = await page.locator('.banner').boundingBox();
      const ok = b && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height;
      const btns = await page.locator('.banner button').evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
      check(ok && btns.length === 2 && btns.every(h => h >= 40), 'end box (' + why + ', ' + vp.width + '): on screen, two buttons ≥ 40 px');
      if (why === 'outbreaks' && vp.width === 320) {
        await page.click('.banner [data-end="study"]');
        await page.waitForTimeout(300);
        check(await page.evaluate(() => document.querySelector('.view.on').id) === 'v-study', 'end box: Review opens Study');
        await page.goBack(); await page.waitForTimeout(300);
        check(await page.evaluate(() => document.querySelector('.view.on').id) === 'v-play' && (await page.locator('.banner').count()) === 0, 'end box: Back from Review goes to the board');
      }
      await shot(page, 'end-' + why + '-' + vp.width);
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- crowded tables on every screen size
  {
    const s = base({ players: 4, names: ['You', 'Bartholomew Longname', '🦠🦠 Pandemic 🦠🦠', 'Bartholomew Longname'], open: true, roles: [D.ROLE_IDX.planner] });
    // every teammate holds 7 cards, you hold 8 (discard prompt) plus a stored event
    const pool = D.CITIES.map(c => c.i);
    s.hands = [pool.slice(0, 8), pool.slice(8, 15), pool.slice(15, 22), pool.slice(22, 29)];
    s.cp = 50; s.phase = 'discard'; s.pend = { seat: 0, back: 'actions' };
    s.human = [true, true, true, false];
    s.log = Array.from({ length: 120 }, (_, i) => ({ t: 1 + (i >> 3), m: 'Bartholomew Longname chartered 🦠🦠 Pandemic 🦠🦠 to Ho Chi Minh City, then something long happened ' + i + '.' }));
    for (const [w, h, dpr] of [[320, 568, 2], [393, 659, 3], [659, 393, 3], [1280, 800, 1], [1920, 1080, 1], [640, 400, 2]]) {
      const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } }, { vp: { width: w, height: h }, dpr });
      const issues = await layoutIssues(page);
      check(issues.length === 0 && page.errs.length === 0, 'crowded 4-player table at ' + w + 'x' + h + ': fits' + (issues.length ? ': ' + issues.join('; ') : '') + (page.errs.length ? ' errors: ' + page.errs.join(' | ') : ''));
      await shot(page, 'crowded-' + w + 'x' + h);
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- settings mid-game, events off-turn, tracker, study
  {
    const s = base();
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } });
    await page.click('#tabs [data-tab="settings"]');
    await page.click('label:has([data-sw="hints"])'); // Hint button off, in the middle of your turn
    await page.click('#tabs [data-tab="play"]'); await page.waitForTimeout(300);
    check((await page.locator('#g-acts [data-g="hint"]').count()) === 0 && (await page.locator('#g-acts [data-g="end"]').count()) === 1, 'Settings mid-turn: Hint off takes effect, the turn carries on');
    await ctx.close();
  }
  {
    // your Airlift while a computer teammate is moving (local games allow it, like a real table)
    const s = base(); s.cur = 1; without(s, 48); s.hands[0].push(48);
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } }, { settle: 150 });
    await page.click('#g-fan [data-card="48"]'); await page.waitForTimeout(200);
    check((await page.locator('#sheet').count()) === 1 && page.errs.length === 0, 'an event tapped during a computer turn opens its picker');
    await ctx.close();
  }
  {
    // tracker: the 8th outbreak, and every card already flipped
    const t = { players: 2, epidemics: 5, piles: [10, 10, 10, 10, 10], drawn: 0, epiDrawn: 0, layers: [], idisc: [], iremoved: [], cubes: new Array(192).fill(0),
      outbreaks: 7, rate: 0, setup: 0, after: false, mode: 'draw', undo: [], fq: [] };
    const c = I['Atlanta']; t.cubes[c * 4] = 3;
    const { ctx, page } = await open({ table: t }, { hash: '#table', wait: '.tt' });
    await page.click('.tc[data-tc="' + c + '"]'); await page.waitForTimeout(150);
    const msg = await page.locator('.toast').textContent().catch(() => '');
    check(/8 outbreaks: the team loses/.test(msg), 'tracker: the 8th outbreak says the team lost (' + msg + ')');
    await ctx.close();
    const t2 = Object.assign({}, t, { outbreaks: 0, cubes: new Array(192).fill(0), idisc: D.CITIES.map(x => x.i) });
    const r = await open({ table: t2 }, { hash: '#table', wait: '.tt' });
    await r.page.click('.tc[data-tc="' + c + '"]'); await r.page.waitForTimeout(150);
    const m2 = await r.page.locator('.toast').textContent().catch(() => '');
    check(/already in the discard pile/.test(m2) && r.page.errs.length === 0, 'tracker: a tap after every card is flipped explains itself');
    await r.ctx.close();
  }
  {
    const { ctx, page } = await open({}, { hash: '#study', wait: '.study' });
    const t = await page.locator('.study').textContent();
    check(/Play a game and it shows up here/.test(t) && page.errs.length === 0, 'Study with no game yet: an empty-state line, no errors');
    await ctx.close();
    const last = { win: false, why: 'cards', turns: 1, epidemics: 5, players: 2, roles: [0, 1], names: ['You', 'C'], me: 0, hist: [{ turn: 1, out: 0, cubes: 18, cured: 0, epi: 0 }], checks: [], outs: {}, cured: [0, 0, 0, 0] };
    const r = await open({ last }, { hash: '#study', wait: '.study' });
    check(/Too short to chart/.test(await r.page.locator('.study').textContent()) && r.page.errs.length === 0, 'Study after a 1-turn game: no chart, no errors');
    await r.ctx.close();
  }
  {
    // a whole 4-player game played by the computers (test hook): it ends with its end card and no errors
    const s = base({ players: 4 });
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } }, { hash: '?autoplay' });
    await page.waitForSelector('.banner', { timeout: 90000 }).catch(() => {});
    check((await page.locator('.banner').count()) === 1 && page.errs.length === 0, 'all-computer 4-player game ends with its end card' + (page.errs.length ? ': ' + page.errs.slice(0, 3).join(' | ') : ''));
    await shot(page, 'autoplay-4p-end');
    await ctx.close();
  }

  // ---------------------------------------------------------------- city names on the board at phone size
  {
    const s = base();
    const { ctx, page } = await open({ game: { state: s, me: 0, checks: [] } }, { settle: 900 });
    const vis = await page.evaluate(() => {
      const ls = Array.from(document.querySelectorAll('#g-map text.lbl')).filter(t => t.getAttribute('visibility') !== 'hidden');
      const rs = ls.map(t => t.getBoundingClientRect());
      let overlap = 0;
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++;
      }
      return { n: ls.length, overlap, h: rs.length ? Math.min(...rs.map(r => r.height)) : 0 };
    });
    check(vis.n >= 20 && vis.overlap === 0 && vis.h >= 6, 'phone board shows city names (' + vis.n + ' names, ' + vis.overlap + ' overlaps, ' + vis.h.toFixed(1) + ' px tall)');
    await shot(page, 'names-393');
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
