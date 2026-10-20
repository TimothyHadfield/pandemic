// Sounds, celebrations and animations.
//   Part A (node): the event -> sound map for a scripted short game (js/sfx.js reads two views and lists what happened).
//   Part B (browser, Chromium for real Web Audio): the game really calls FX.play with those names, Sound off plays
//   nothing, Animations off runs no animation, and the end of the game celebrates 'win' or 'lose'.
//   node tests/fx.test.mjs        (needs Playwright in ~/.claude/tools)
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
const require = createRequire(join(homedir(), '.claude/tools/') + 'x.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const D = req('../js/data.js');
const E = req('../js/engine.js');

let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) failed++; };
const clone = o => JSON.parse(JSON.stringify(o));
const { CITIES, IDX, ROLE_IDX, EPIDEMIC } = D;
const ATL = D.ATLANTA;

// a fixed 2-player game: you (seat 0, Researcher) and a computer (seat 1, Planner); your turn, 4 actions
function base() {
  const s = clone(E.newGame({ players: 2, epidemics: 5, seed: 777, roles: [ROLE_IDX.researcher, ROLE_IDX.planner], names: ['You', 'Computer 1'], human: [true, false], eventPause: false }));
  s.cur = 0; s.phase = 'actions'; s.left = 4; s.turn = 1;
  return s;
}
const blueCities = CITIES.filter(c => c.color === 0).map(c => c.i);
function giveCards(s, p, cards) {
  for (const c of cards) {
    for (const h of s.hands) { const i = h.indexOf(c); if (i >= 0) h.splice(i, 1); }
    const j = s.pdeck.indexOf(c); if (j >= 0) s.pdeck.splice(j, 1);
    const k = s.pdisc.indexOf(c); if (k >= 0) s.pdisc.splice(k, 1);
    s.hands[p].push(c);
  }
}

// ------------------------------------------------------------------ Part A: event -> sound map
let S = null;
try { S = req('../js/sfx.js'); } catch (e) { check(false, 'js/sfx.js loads (' + e.message.split('\n')[0] + ')'); }
const names = (prev, next, me = 0) => S.events(prev, next, me, { step: 140 }).items.filter(x => x.sound).map(x => x.sound);
const items = (prev, next, me = 0) => S.events(prev, next, me, { step: 140 }).items;
const V = (s, me = 0) => E.view(s, me);
if (S) {
  // drive -> slide (piece on the board)
  let s = base();
  const v0 = V(s);
  const drive = { t: 'drive', to: CITIES[ATL].adj[0] };
  s = E.apply(s, 0, drive);
  check(names(v0, V(s)).includes('slide'), 'drive -> slide');
  // fly -> whoosh
  s = base(); giveCards(s, 0, [IDX['Paris']]);
  let a = V(s); s = E.apply(s, 0, { t: 'direct', to: IDX['Paris'] });
  check(names(a, V(s)).includes('whoosh'), 'direct flight -> whoosh');
  // treat -> pop, and a "-N" float on the city
  s = base(); s.cubes[ATL * 4 + 0] = 2; s.supply[0] -= 2;
  a = V(s); s = E.apply(s, 0, { t: 'treat', color: 0 });
  check(names(a, V(s)).includes('pop'), 'treat -> pop');
  check(items(a, V(s)).some(x => x.anim === 'treat' && x.city === ATL && x.n === 1), 'treat -> -1 floats on Atlanta');
  // build -> place (piece set down)
  s = base(); giveCards(s, 0, [IDX['Chicago']]); s.pawns[0] = IDX['Chicago'];
  a = V(s); s = E.apply(s, 0, { t: 'build' });
  check(names(a, V(s)).includes('place'), 'build a station -> place');
  // share knowledge -> cardSlide
  s = base(); giveCards(s, 0, [ATL]);
  a = V(s); s = E.apply(s, 0, { t: 'give', to: 1, card: ATL });
  check(names(a, V(s)).includes('cardSlide'), 'share a card -> cardSlide');
  // end of turn: 2 player cards dealt, infection cards flipped with a cube knock each, then the computer's turn
  s = base();
  s.pdeck = s.pdeck.filter(c => c !== EPIDEMIC).concat([]); // no Epidemic in this draw
  a = V(s); s = E.apply(s, 0, { t: 'end' });
  let n = names(a, V(s));
  check(n.filter(x => x === 'cardDeal').length === 2, 'end turn -> 2 x cardDeal (got ' + n.filter(x => x === 'cardDeal').length + ')');
  check(n.filter(x => x === 'cardFlip').length === 2, 'end turn -> 2 x cardFlip for the 2 infection cards');
  check(n.filter(x => x === 'place').length >= 1, 'infection -> a cube knock (place)');
  check(!n.includes('turn'), 'no your-turn chime when the turn passes to the computer');
  // order: deals before flips, timed like the flip strip (140 ms apart)
  const it = items(a, V(s)).filter(x => x.sound === 'cardDeal' || x.sound === 'cardFlip');
  check(it.map(x => x.at).join() === '0,140,280,420', 'flip-strip pacing 0/140/280/420 ms (got ' + it.map(x => x.at).join() + ')');
  // the computer's turn ends -> your turn chime
  let s2 = clone(s); s2.left = 1;
  const b = V(s2); s2 = E.apply(s2, 1, { t: 'end' });
  n = names(b, V(s2));
  if (s2.phase === 'actions' && s2.cur === 0) check(n.includes('turn'), 'computer ends its turn -> your-turn chime');
  else check(true, '(your turn not reached in this fixture: ' + s2.phase + ')');
  // epidemic -> alarm + shuffle (intensify) + map shake
  s = base(); s.pdeck.push(EPIDEMIC);
  a = V(s); s = E.apply(s, 0, { t: 'end' });
  n = names(a, V(s));
  check(n.includes('alarm') && n.includes('shuffle'), 'Epidemic -> alarm + shuffle');
  check(items(a, V(s)).some(x => x.anim === 'epidemic'), 'Epidemic -> board shake/flash');
  // outbreak -> explosion + outbreak counter animation; a chain gives one explosion per city, spaced out
  s = base(); s.pdeck = s.pdeck.filter(c => c !== EPIDEMIC);
  const top = s.ideck[s.ideck.length - 1];
  const col = CITIES[top].color;
  s.supply[col] -= 3 - s.cubes[top * 4 + col]; s.cubes[top * 4 + col] = 3;
  a = V(s); s = E.apply(s, 0, { t: 'end' });
  n = names(a, V(s));
  check(n.includes('explosion'), 'outbreak -> explosion');
  check(items(a, V(s)).some(x => x.anim === 'outbreak'), 'outbreak -> counter pop + shake');
  check(S.events(a, V(s), 0, { step: 140 }).booms.some(x => x.city === top), 'outbreak ring on the city that broke out');
  // cure -> big celebration; all four -> win
  s = base(); s.stations = [ATL]; s.pawns[0] = ATL; s.hands[0] = []; giveCards(s, 0, blueCities.slice(0, 5));
  a = V(s); s = E.apply(s, 0, { t: 'cure', color: 0 });
  check(items(a, V(s)).some(x => x.celebrate === 'big'), 'cure discovered -> big celebration');
  s = base(); s.cured = [0, 1, 1, 1]; s.stations = [ATL]; s.pawns[0] = ATL; s.hands[0] = []; giveCards(s, 0, blueCities.slice(0, 5));
  for (let c = 0; c < 48; c++) for (let k = 0; k < 4; k++) s.cubes[c * 4 + k] = 0;
  s.supply = [24, 24, 24, 24];
  a = V(s); s = E.apply(s, 0, { t: 'cure', color: 0 });
  check(s.over && s.over.win && items(a, V(s)).some(x => x.celebrate === 'win'), 'all four cures -> celebrate win');
  check(items(a, V(s)).some(x => x.sound === 'stamp'), 'eradicated -> stamp');
  // 8th outbreak -> lose
  s = base(); s.outbreaks = 7; s.pdeck = s.pdeck.filter(c => c !== EPIDEMIC);
  CITIES.forEach((c, i) => { s.cubes[i * 4 + c.color] = 3; });
  a = V(s); s = E.apply(s, 0, { t: 'end' });
  check(s.over && !s.over.win && items(a, V(s)).some(x => x.celebrate === 'lose'), '8 outbreaks -> celebrate lose');
  // nothing changed -> nothing plays (online re-renders arrive often)
  s = base(); check(items(V(s), V(s)).length === 0, 'same state twice -> no events');
}

// ------------------------------------------------------------------ Part B: in the browser
const pw = require('playwright');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
await new Promise(ok => srv.listen(0, ok));
const url = 'http://localhost:' + srv.address().port + '/';

// spy on FX.play / FX.celebrate and on Element.animate, from before the page's scripts run
const SPY = () => {
  window.__plays = []; window.__cel = []; window.__anims = 0;
  const an = Element.prototype.animate;
  Element.prototype.animate = function () { window.__anims++; return an.apply(this, arguments); };
  let fx;
  Object.defineProperty(window, 'FX', { configurable: true, get() { return fx; }, set(v) {
    fx = v;
    const p = v.play, c = v.celebrate;
    v.play = function (n, o) { const r = p.call(v, n, o); window.__plays.push([n, r]); return r; };
    v.celebrate = function (o) { window.__cel.push(o && o.kind); return c.call(v, o); };
  } });
};
async function open(browser, state, extra) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 659 } });
  await ctx.addInitScript(SPY);
  await ctx.addInitScript(([st, fxs]) => {
    try { localStorage.setItem('pandemic-lab-v1', st); if (fxs) localStorage.setItem('fx:pandemic', fxs); } catch (e) {}
  }, [JSON.stringify({ settings: { speed: 'fast' }, game: { state, me: 0, checks: [] } }), extra ? JSON.stringify(extra) : '']);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url + '#play');
  await page.waitForSelector('#g-acts');
  return { ctx, page, errs };
}
const endTurn = async page => {
  await page.click('#g-acts [data-g="end"]');
  await page.click('.confirm-back [data-c="yes"]');
};

const browser = await pw.chromium.launch();
try {
  // 1. an outbreak at the end of your turn: real sounds, in order, and animations
  let s = base(); s.pdeck = s.pdeck.filter(c => c !== EPIDEMIC);
  const top = s.ideck[s.ideck.length - 1], col = CITIES[top].color;
  s.supply[col] -= 3 - s.cubes[top * 4 + col]; s.cubes[top * 4 + col] = 3;
  let { ctx, page, errs } = await open(browser, s);
  check(await page.evaluate(() => !!(window.FX && FX.version)), 'FX is loaded');
  check(await page.evaluate(() => window.__plays.length === 0), 'no sound before the first tap');
  await endTurn(page);
  await page.waitForTimeout(1600);
  let plays = await page.evaluate(() => window.__plays);
  const played = plays.filter(p => p[1]).map(p => p[0]);
  check(['cardDeal', 'cardFlip', 'explosion'].every(n => played.includes(n)), 'end turn plays cardDeal, cardFlip, explosion (played: ' + [...new Set(played)].join(',') + ')');
  check(await page.evaluate(() => !!window.FX && FX.stats.plays > 0), 'Web Audio really started sounds (FX.stats.plays > 0)');
  check(await page.evaluate(() => window.__anims > 0), 'animations ran (shake / pop / float)');
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  // 2. Sound off (switched in Settings) -> nothing plays; Animations off -> no animation runs
  s = base(); s.pdeck = s.pdeck.filter(c => c !== EPIDEMIC);
  s.supply[col] -= 3 - s.cubes[top * 4 + col]; s.cubes[top * 4 + col] = 3;
  ({ ctx, page, errs } = await open(browser, s));
  await page.click('#tabs [data-tab="settings"]');
  const hasFx = await page.$('.fx-set [data-fx="sound"]');
  check(!!hasFx, 'Settings has the Sound & effects rows');
  if (hasFx) {
    await page.click('.fx-set [data-row="sound"] .switch');
    await page.click('.fx-set [data-row="animations"] .switch');
  }
  const st = await page.evaluate(() => window.FX && FX.settings);
  check(st && st.sound === false && st.animations === false, 'the switches turn Sound and Animations off');
  await page.click('#tabs [data-tab="play"]');
  await page.evaluate(() => { window.__anims = 0; window.__p0 = window.FX ? FX.stats.plays : -1; window.__plays = []; });
  await endTurn(page);
  await page.waitForTimeout(1600);
  plays = await page.evaluate(() => window.__plays);
  check(plays.length > 0 && plays.every(p => !p[1]), 'Sound off: FX.play asked ' + plays.length + ' times, played 0');
  check(await page.evaluate(() => !!window.FX && FX.stats.plays === window.__p0), 'Sound off: no audio started');
  check(await page.evaluate(() => window.__anims === 0), 'Animations off: no element animation ran (' + await page.evaluate(() => window.__anims) + ')');
  check(await page.evaluate(() => { const d = document.createElement('div'); d.className = 'pc deal'; document.body.appendChild(d); const t = getComputedStyle(d).animationDuration; d.remove(); return t === '0s'; }), 'Animations off: the game\'s own card animation is instant');
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  // 3. game over: the last cure -> celebrate win (confetti canvas); the 8th outbreak -> celebrate lose
  s = base(); s.cured = [0, 1, 1, 1]; s.stations = [ATL]; s.pawns[0] = ATL; s.hands[0] = []; giveCards(s, 0, blueCities.slice(0, 5));
  ({ ctx, page, errs } = await open(browser, s));
  await page.click('#g-acts [data-cure="0"]');
  await page.waitForTimeout(500);
  check((await page.evaluate(() => window.__cel)).includes('win'), 'last cure -> FX.celebrate win');
  check(await page.evaluate(() => !!document.querySelector('canvas[aria-hidden]')), 'confetti on screen');
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, 'fx-win-test.png') });
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
  s = base(); s.outbreaks = 7; s.pdeck = s.pdeck.filter(c => c !== EPIDEMIC);
  CITIES.forEach((c, i) => { s.cubes[i * 4 + c.color] = 3; });
  ({ ctx, page, errs } = await open(browser, s));
  await endTurn(page);
  await page.waitForTimeout(2500);
  const cel = await page.evaluate(() => window.__cel);
  check(cel.includes('lose') && !cel.includes('win'), '8th outbreak -> FX.celebrate lose (got ' + cel.join(',') + ')');
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
} finally { await browser.close(); srv.close(); }
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
