// Browser test for the improvement pass (2026-10-27): the phone risk strip shows only whole chips,
// plus the pass's new pieces (Undo, My stats, rules + guided game, replay).
//   node tests/improve.test.mjs [--engine chromium]     (needs Playwright in ~/.claude/tools)
//   PAN_ROOT=<other checkout> runs it against older code.
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

// a busy mid game: many cities at risk, your turn
function busy() {
  let s = E.newGame({ players: 2, epidemics: 5, seed: 777, roles: [D.ROLE_IDX.medic], names: ['You', 'Computer 1'], human: [true, false], openHands: 'auto', eventPause: true });
  s = JSON.parse(JSON.stringify(s));
  s.cur = 0; s.phase = 'actions'; s.left = 4; s.pend = null;
  const add = (c, col, n) => { const k = I[c] * 4 + col; s.supply[col] -= n - s.cubes[k]; s.cubes[k] = n; };
  ['Paris', 'London', 'Essen', 'Milan', 'Madrid', 'Istanbul', 'Moscow', 'Hong Kong', 'Shanghai', 'Taipei', 'Tokyo', 'Santiago', 'São Paulo', 'Kinshasa'].forEach((c, i) => {
    const col = D.CITIES[I[c]].color; add(c, col, 1 + (i % 3));
  });
  return s;
}
const store = JSON.stringify({ game: { state: busy(), me: 0, checks: [] } });

const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
await new Promise(ok => srv.listen(0, ok));
const url = 'http://localhost:' + srv.address().port + '/?nosw';
let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) failed++; };

// tap a city on the board like a finger (a crowded spot glides into a close-up first: tap it again there)
async function tapCity(page, c) {
  for (let i = 0; i < 2; i++) {
    const p = await page.evaluate(k => { const r = document.querySelectorAll('#g-map g.city')[k].querySelector('circle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, c);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(700);
    if (await page.$('#g-info [data-mv]')) return;
  }
}
const browser = await pw[ENGINE].launch();
try {
  for (const vp of [{ n: 'phone', w: 393, h: 659, touch: true }, { n: 'small phone', w: 320, h: 568, touch: true }, { n: 'phone on its side', w: 659, h: 393, touch: true }, { n: 'tablet', w: 820, h: 1180, touch: true }]) {
    console.log(vp.n + ' ' + vp.w + 'x' + vp.h + ' (' + ENGINE + ')');
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch && ENGINE !== 'firefox' });
    await ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); localStorage.setItem('coach-offer:pandemic-first', '1'); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, [KEY, store]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url + '#play');
    await page.waitForSelector('#g-risk .rchip');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const box = document.querySelector('#g-risk'), b = box.getBoundingClientRect();
      const vis = [...box.children].filter(c => getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().width);
      return { n: vis.length, cut: vis.filter(c => c.getBoundingClientRect().right > b.right + 0.5).map(c => c.textContent), all: box.children.length,
        more: !!box.querySelector('.more') && getComputedStyle(box.querySelector('.more')).display !== 'none' };
    });
    check(r.cut.length === 0, 'no risk chip cut off at the right edge (' + (r.cut.join(', ') || 'none') + ')');
    check(r.n >= 2, 'the strip still shows chips (' + r.n + ' of ' + r.all + ')');
    check(r.more, '"All N" chip shows when chips are hidden');
    if (r.more) {
      await page.click('#g-risk .more');
      await page.waitForSelector('#sheet table.odds');
      const rows = await page.evaluate(() => document.querySelectorAll('#sheet table.odds tr[data-rc]').length);
      check(rows >= 10, 'the full odds list opens (' + rows + ' cities)');
    }
    check(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close();
  }

  // ---- Undo, quitting = a loss in My stats, the rules sheet (phone)
  console.log('undo + stats + rules (393)');
  {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: ENGINE !== 'firefox' });
    await ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); localStorage.setItem('coach-offer:pandemic-first', '1'); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, [KEY, store]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url + '#play');
    await page.waitForSelector('#g-acts .btn');
    check(!(await page.$('#g-acts [data-g="undo"]')), 'no Undo before any action');
    const W = I['Washington'];
    await tapCity(page, W);
    await page.click('#g-info [data-mv]');
    await page.waitForTimeout(450);
    const g1 = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).game, KEY);
    check(g1.state.pawns[0] === W && g1.state.left === 3, 'drove to Washington (' + g1.state.left + ' actions left)');
    check(!!(await page.$('#g-acts [data-g="undo"]')), 'Undo shows after an action');
    await page.click('#g-acts [data-g="undo"]');
    await page.waitForTimeout(450);
    const g2 = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).game, KEY);
    check(g2.state.pawns[0] === I['Atlanta'] && g2.state.left === 4, 'Undo puts the pawn back with 4 actions');
    check(g2.helped === true, 'a game with Undo is marked "with help" (unrated)');
    // quit mid-game = a loss (a tab round trip first, so Back has somewhere to go, as on a real phone)
    await page.click('#tabs [data-tab="study"]'); await page.click('#tabs [data-tab="play"]'); await page.waitForTimeout(300);
    await page.click('#g-menu');
    await page.waitForSelector('#sheet [data-m="rules"]');
    await page.waitForTimeout(400);
    await page.click('#sheet [data-m="rules"]');
    await page.waitForSelector('.coach-rules');
    const rules = await page.evaluate(() => ({ n: document.querySelectorAll('.coach-rules-nav button, .coach-rules-nav a').length, w: document.querySelector('.coach-rules').getBoundingClientRect().width }));
    check(rules.n >= 8 && rules.w <= 393, 'rules sheet opens from the menu (' + rules.n + ' sections)');
    await page.goBack();
    await page.waitForTimeout(300);
    check(!(await page.$('.coach-rules-back')) || !(await page.isVisible('.coach-rules')), 'Back closes the rules');
    await page.click('#g-menu');
    await page.waitForSelector('#sheet [data-m="new"]');
    await page.waitForTimeout(400);
    await page.click('#sheet [data-m="new"]');
    await page.click('.confirm-back [data-c="yes"]');
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => Profile.stats());
    check(st.games === 1 && st.losses === 1, 'quitting after a move counts as a loss (' + st.games + ' games, ' + st.losses + ' lost)');
    check(!!(await page.$('#meBtn')) && !!(await page.$('.more-row [data-x="daily"]')), 'setup has My stats and Daily game');
    check(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close();
  }

  // ---- the guided first game (phone)
  console.log('guided first game (393)');
  {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: ENGINE !== 'firefox' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url + '#play');
    await page.waitForSelector('.coach-offer');
    await page.click('.coach-offer .coach-btn:last-child');
    const title = async () => { await page.waitForTimeout(500); return page.evaluate(() => { const b = document.querySelector('.coach-bubble:not(.coach-off) .coach-title'); return b ? b.textContent : ''; }); };
    const next = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('.coach-bubble .coach-btn')].find(x => /next|done|got it/i.test(x.textContent)); if (b) b.click(); }); };
    const seen = [];
    seen.push(await title()); await next();
    seen.push(await title()); await next();
    seen.push(await title());
    await page.click('#g-acts [data-g="share"]'); await page.waitForTimeout(450);
    await page.click('#sheet [data-a]'); await page.waitForTimeout(500);
    seen.push(await title());
    await page.click('#g-acts [data-cure="0"]'); await page.waitForTimeout(500);
    seen.push(await title());
    const W = I['Washington'];
    await tapCity(page, W);
    await page.click('#g-info [data-mv]'); await page.waitForTimeout(500);
    seen.push(await title());
    await page.click('#g-acts [data-act]'); await page.waitForTimeout(1500);
    seen.push(await title());
    const g = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).game, KEY);
    console.log('    steps seen: ' + seen.join(' > '));
    check(seen.join('|') === 'One team|Your hand|Share a card|Discover a cure|Move|Treat|End of the turn', 'the guided game walks through share, cure, move, treat, end of turn');
    check(g.tutorial && g.state.cured[0] === 1 && g.state.cubes[W * 4] === 0, 'blue is cured and Washington is clear');
    // leaving the guided game is never a loss
    await page.evaluate(() => { const b = document.querySelector('.coach-bubble .coach-btn'); if (b && /skip/i.test(b.textContent)) b.click(); });
    await page.click('#g-menu'); await page.waitForSelector('#sheet [data-m="new"]'); await page.waitForTimeout(400);
    await page.click('#sheet [data-m="new"]');
    if (await page.$('.confirm-back [data-c="yes"]')) await page.click('.confirm-back [data-c="yes"]');
    await page.waitForTimeout(300);
    const ts = await page.evaluate(() => Profile.stats());
    check(ts.losses === 0, 'quitting the guided game is not a loss (' + ts.losses + ' lost)');
    check(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close();
  }

  // ---- a whole game, then the replay (laptop; the computer plays your seat too)
  console.log('end of game + replay (1280)');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('coach-offer:pandemic-first', '1'); } catch (e) {}
      // count the key-moment animations (Epidemic / cure plates, outbreak rings) as they are added
      window.__moments = { epi: 0, cure: 0, shock: 0 };
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList) { if (n.classList.contains('moment')) window.__moments[n.classList.contains('epi') ? 'epi' : 'cure']++; if (n.classList.contains('shock')) window.__moments.shock++; } })))
        .observe(document, { childList: true, subtree: true });
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url.replace('?nosw', '?nosw&autoplay') + '#play');
    await page.click('[data-start]');
    await page.waitForSelector('.banner [data-end="replay"]', { timeout: 120000 });
    const mo = await page.evaluate(() => window.__moments);
    const lg = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).game.state.log.map(e => e.m).join('\n'), KEY);
    check(mo.epi >= (/Epidemic/.test(lg) ? 1 : 0) && mo.shock >= (/Outbreak/.test(lg) ? 1 : 0) && mo.cure >= 0, 'big moments play: ' + JSON.stringify(mo));
    const st = await page.evaluate(() => Profile.stats());
    check(st.games === 1, 'the finished game is counted once in My stats (' + st.games + ')');
    await page.click('.banner [data-end="replay"]');
    await page.waitForTimeout(300);
    const r0 = await page.evaluate(k => ({ info: document.querySelector('#g-info2, #g-info').textContent, n: JSON.parse(localStorage.getItem(k)).game.frames.length }), KEY);
    check(/Replay · turn 1/.test(r0.info) && r0.n > 20, 'replay starts at turn 1 (' + r0.n + ' moves recorded)');
    // the replay plays by itself: pause it, then Next turn twice = two turns on
    await page.click('#g-acts [data-g="rv-play"]'); await page.waitForTimeout(150);
    const turnNow = () => page.evaluate(() => +/turn (\d+)/.exec(document.querySelector('#g-info2 .p1').textContent)[1]);
    const t0 = await turnNow();
    await page.click('#g-acts [data-g="rv-turn"]'); await page.click('#g-acts [data-g="rv-turn"]');
    await page.waitForTimeout(200);
    const t1 = await turnNow();
    const lastT = await page.evaluate(k => { const f = JSON.parse(localStorage.getItem(k)).game.frames; return f[f.length - 1].t; }, KEY);
    check(t1 === Math.min(t0 + 2, lastT), 'Next turn steps through the turns (turn ' + t0 + ' → ' + t1 + ')');
    const at = () => page.evaluate(() => +/(\d+) \/ \d+/.exec(document.querySelector('#g-info2 .p1 span').textContent)[1]);
    const i0 = await at();
    await page.click('#g-acts [data-g="rv-play"]'); await page.waitForTimeout(2000);
    const i1 = await at();
    await page.click('#g-acts [data-g="rv-play"]');
    check(i1 > i0, 'Play moves the replay on by itself (' + i0 + ' → ' + i1 + ')');
    await page.click('#g-acts [data-g="rv-exit"]');
    await page.waitForTimeout(200);
    check(!!(await page.$('#g-acts [data-g="new"]')), 'Done returns to the finished game');
    check(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
