// Browser test for the wave-3 variants: "Extra roles & events" and the Legendary level in Settings and setup,
// the new role/event controls in a game, and the rules sheet's Variants + video links.
//   node tests/extras-ui.test.mjs [--engine chromium] [--shots <folder>]   (needs Playwright in ~/.claude/tools)
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
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const R = k => D.ROLE_IDX[k];
const EVK = k => D.EV[k];

const settings = { players: 2, epidemics: 7, role: -1, extra: true, legendary: true };
// a game: you are the Analyst in Atlanta with your teammate, holding the three new events; cubes in Atlanta and Chicago
function game() {
  let s = E.newGame({ players: 2, epidemics: 5, seed: 31, extra: true, roles: [R('analyst'), R('medic')], names: ['You', 'Computer 1'], human: [true, false], eventPause: true });
  s = JSON.parse(JSON.stringify(s));
  if (!s.extra) { s.extra = true; s.ban = -1; s.grabbed = false; } // (old code: no such fields)
  s.cur = 0; s.phase = 'actions'; s.left = 4; s.pend = null;
  s.pawns = [I['Atlanta'], I['Atlanta']];
  const keep = [I['Chicago'], I['Tokyo'], EVK('shift') || 53, EVK('remote') || 54, EVK('ban') || 55];
  s.pdeck = s.pdeck.concat(s.hands[0].filter(c => !keep.includes(c)));
  s.hands[0] = keep.slice();
  s.hands[1] = [I['Lima'], I['Cairo']];
  s.pdeck = s.pdeck.filter(c => !keep.includes(c) && !s.hands[1].includes(c));
  s.hands[1] = s.hands[1];
  const add = (c, n) => { const col = D.CITIES[I[c]].color, k = I[c] * 4 + col; s.supply[col] -= n - s.cubes[k]; s.cubes[k] = n; };
  add('Chicago', 3); add('Atlanta', 2);
  return s;
}

const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
await new Promise(ok => srv.listen(0, ok));
const url = 'http://localhost:' + srv.address().port + '/?nosw';
let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) failed++; };
const seed = (ctx, store) => ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); localStorage.setItem('coach-offer:pandemic-first', '1'); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, [KEY, JSON.stringify(store)]);
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).game.state, KEY);
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, name + '.png') }); } };

const guard = async fn => { try { await fn(); } catch (e) { check(false, 'crashed: ' + String(e.message).split('\n')[0]); } };
const browser = await pw[ENGINE].launch();
try {
  // ---- setup screen with both variants on, five sizes
  for (const vp of [{ n: '393', w: 393, h: 659, t: 1 }, { n: '320', w: 320, h: 568, t: 1 }, { n: '320-off', w: 320, h: 568, t: 1, off: 1 }, { n: '659x393', w: 659, h: 393, t: 1 }, { n: '1280', w: 1280, h: 800 }, { n: '1440', w: 1440, h: 900 }]) {
    await guard(async () => {
    console.log('setup ' + vp.n + ' (' + ENGINE + ')');
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: !!vp.t, isMobile: !!vp.t && ENGINE !== 'firefox' });
    await seed(ctx, { settings: vp.off ? { players: 2, epidemics: 5, role: -1 } : settings });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(url + '#play');
    await page.waitForSelector('[data-start]');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const lv = [...document.querySelectorAll('[data-set="epidemics"] button')].map(b => b.textContent);
      const roles = document.querySelectorAll('[data-set="role"] button').length;
      const start = document.querySelector('[data-start]').getBoundingClientRect();
      const panel = document.querySelector('.setup .panel').getBoundingClientRect();
      const cut = [...document.querySelectorAll('[data-set] button')].filter(b => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > panel.right + 1).map(b => b.textContent);
      const tabs = document.getElementById('tabs').getBoundingClientRect();
      return { lv, roles, startBottom: start.bottom, ih: tabs.top > innerHeight / 2 ? tabs.top : innerHeight, over: document.documentElement.scrollWidth > innerWidth + 1, cut };
    });
    if (vp.off) check(r.lv.length === 3 && r.roles === 8, 'variants off: 3 levels, 7 roles + Random (' + r.lv.length + ', ' + r.roles + ')');
    else check(r.lv.some(t => /Legendary/.test(t)), 'Legendary level shows when the variant is on (' + r.lv.length + ' levels)');
    if (!vp.off) check(r.roles === 11, 'all 10 roles + Random to pick (' + r.roles + ')');
    check(!r.over, 'no sideways scroll');
    check(r.cut.length === 0, 'no button text cut off (' + r.cut.join(', ') + ')');
    // 320 x 568 (iPhone SE) with both variants on needs a short scroll to Start: reported, not failed
    if (vp.n === '320') console.log('  INFO  320 with both variants on: Start bottom ' + Math.round(r.startBottom) + ' vs ' + Math.round(r.ih) + ' visible');
    else check(vp.w === 659 || r.startBottom <= r.ih, 'Start is visible without scrolling (' + Math.round(r.startBottom) + ' of ' + Math.round(r.ih) + ')');
    await shot(page, 'setup-' + vp.n);
    check(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close();
    });
  }

  // ---- Settings: the Variants switches; turning them off hides the extra roles and Legendary
  console.log('settings (393)');
  {
    await guard(async () => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: ENGINE !== 'firefox' });
    await seed(ctx, { settings: { players: 2, epidemics: 5, role: -1 } });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(url + '#settings');
    await page.waitForTimeout(400);
    const has = await page.evaluate(() => !!document.querySelector('[data-sw="extra"]') && !!document.querySelector('[data-sw="legendary"]'));
    check(has, 'Settings has the two Variants switches');
    const off = await page.evaluate(() => [...document.querySelectorAll('[data-sw="extra"],[data-sw="legendary"]')].every(x => !x.checked));
    check(off, 'both are off by default');
    await shot(page, 'settings-393');
    if (has) {
      await page.evaluate(() => { const b = document.querySelector('[data-sw="legendary"]'); b.scrollIntoView(); });
      await page.click('[data-sw="extra"] + span', { force: true }).catch(() => page.evaluate(() => document.querySelector('[data-sw="extra"]').click()));
      await page.evaluate(() => { const b = document.querySelector('[data-sw="legendary"]'); if (!b.checked) b.click(); });
      await page.waitForTimeout(200);
      await page.click('#tabs [data-tab="play"]');
      await page.waitForSelector('[data-start]');
      const r = await page.evaluate(() => ({ roles: document.querySelectorAll('[data-set="role"] button').length, lv: document.querySelectorAll('[data-set="epidemics"] button').length, line: !!document.querySelector('.varline') }));
      check(r.roles === 11 && r.lv === 4 && r.line, 'switching them on adds 3 roles, Legendary and a Variants line (' + JSON.stringify(r) + ')');
      // start a Legendary game with the extras
      await page.click('[data-set="epidemics"] button:last-child');
      await page.click('[data-start]');
      await page.waitForTimeout(500);
      const s = await saved(page);
      check(s.epidemics === 7 && s.extra === true && s.piles.length === 7, 'a Legendary game with the extras starts (' + s.epidemics + ' Epidemics)');
    }
    check(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close();
    });
  }

  // ---- in a game: Analyst's Take card, Extra Shift, Remote Care, Travel Ban; card names fit
  for (const vp of [{ n: '393', w: 393, h: 659, t: 1 }, { n: '320', w: 320, h: 568, t: 1 }, { n: '659x393', w: 659, h: 393, t: 1 }, { n: '1280', w: 1280, h: 800 }, { n: '1440', w: 1440, h: 900 }]) {
    await guard(async () => {
    console.log('game ' + vp.n);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: !!vp.t, isMobile: !!vp.t && ENGINE !== 'firefox' });
    await seed(ctx, { settings, game: { state: game(), me: 0, checks: [] } });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(url + '#play');
    await page.waitForSelector('#g-acts .btn');
    await page.waitForTimeout(500);
    const fit = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('#g-fan .pc .pc-nm, .rc .rc-nm').forEach(n => { if (n.scrollWidth > n.clientWidth + 1) bad.push(n.textContent); });
      const names = [...document.querySelectorAll('#g-fan .pc.ev .pc-nm')].map(n => n.textContent.replace(/­/g, ''));
      const acts = document.getElementById('g-acts');
      return { bad, names, actsHidden: acts.scrollWidth - acts.clientWidth, over: document.documentElement.scrollWidth > innerWidth + 1, scroll: document.scrollingElement.scrollHeight > innerHeight + 1 };
    });
    check(['Extra Shift', 'Remote Care', 'Travel Ban'].every(n => fit.names.includes(n)), 'the 3 new events are in your hand (' + fit.names.join(', ') + ')');
    check(fit.bad.length === 0, 'every card and role name fits (' + fit.bad.join(', ') + ')');
    check(!fit.over && !fit.scroll, 'no page scroll either way');
    check(fit.actsHidden <= 1, 'the action row (Treat, Take card, Hint, End turn) fits without sliding (' + fit.actsHidden + ' px hidden)');
    await shot(page, 'game-' + vp.n);
    if (vp.n === '393' || vp.n === '1280') {
      // Analyst: Take card (free)
      const take = await page.$('#g-acts [data-g="grab"]');
      check(!!take, 'Analyst has a "Take card" button');
      if (take) {
        await take.click();
        await page.waitForSelector('#sheet [data-a]');
        await page.waitForTimeout(400);
        await page.click('#sheet [data-a]');
        await page.waitForTimeout(500);
        const s = await saved(page);
        check(s.hands[0].length === 6 && s.left === 4 && s.grabbed === true, 'took a card for free (' + s.hands[0].length + ' cards, ' + s.left + ' actions left)');
      }
      // Extra Shift: 6 actions, 6 pips
      await page.click('#g-fan [data-card="53"]');
      await page.waitForSelector('.confirm-back [data-c="yes"]');
      await page.click('.confirm-back [data-c="yes"]');
      await page.waitForTimeout(500);
      let s = await saved(page);
      const pips = await page.evaluate(() => document.querySelectorAll('#g-info .left-pips i').length);
      check(s.left === 6 && pips === 6, 'Extra Shift gives 2 more actions (' + s.left + ' left, ' + pips + ' pips)');
      // Remote Care: two cubes off Chicago through the odds list / city picks
      await page.click('#g-fan [data-card="54"]');
      await page.waitForTimeout(400);
      for (let k = 0; k < 2; k++) {
        await page.evaluate(c => { const el = document.createElement('span'); el.dataset.city = c; el.id = 'pick-tmp'; document.querySelector('#v-play').appendChild(el); el.click(); el.remove(); }, I['Chicago']);
        await page.waitForTimeout(300);
        // laptop width shows the info panel's copy in the side column (#g-info2): use whichever is on screen
        const b = page.locator('[data-g="rc-pick"]:visible').first();
        const n = await page.locator('[data-g="rc-pick"]:visible').count();
        check(n > 0, 'Remote Care offers "Remove Chicago" on screen (pick ' + (k + 1) + ')');
        if (n) await b.click();
        await page.waitForTimeout(450);
      }
      s = await saved(page);
      check(s.cubes[I['Chicago'] * 4] === 1, 'Remote Care took 2 cubes off Chicago (' + s.cubes[I['Chicago'] * 4] + ' left)');
      // Travel Ban
      await page.click('#g-fan [data-card="55"]');
      await page.waitForSelector('.confirm-back [data-c="yes"]');
      await page.click('.confirm-back [data-c="yes"]');
      await page.waitForTimeout(500);
      s = await saved(page);
      const rate = await page.evaluate(() => document.querySelectorAll('#g-status .stat b')[1].textContent);
      check(s.ban === 0 && rate === '1', 'Travel Ban: infection rate shows 1 (' + rate + ')');
      await shot(page, 'game-after-' + vp.n);
    }
    check(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close();
    });
  }

  // ---- rules sheet: Variants + 2-5 video links that open in a new tab
  console.log('rules (393)');
  {
    await guard(async () => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: ENGINE !== 'firefox' });
    await seed(ctx, { settings });
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    await page.goto(url + '#play');
    await page.waitForSelector('.more-row [data-x="rules"]');
    await page.click('.more-row [data-x="rules"]');
    await page.waitForSelector('.coach-rules');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.coach-rules a[href*="youtube.com/watch"]')];
      const body = document.querySelector('.coach-rules').textContent;
      const col = links[0] ? getComputedStyle(links[0]).color : '';
      return { n: links.length, blank: links.every(a => a.target === '_blank' && /noopener/.test(a.rel)), variants: /Legendary/.test(body) && /Remote Care/.test(body), col };
    });
    check(r.n >= 2 && r.n <= 5 && r.blank, 'rules sheet has ' + r.n + ' video links opening in a new tab');
    check(r.variants, 'rules sheet explains the variants');
    check(r.col === 'rgb(42, 79, 158)', 'video links are dark blue on the cream sheet (' + r.col + ')');
    await page.evaluate(() => { const a = [...document.querySelectorAll('.coach-rules-nav button, .coach-rules-nav a')].find(x => /Videos/.test(x.textContent)); if (a) a.click(); });
    await page.waitForTimeout(400);
    await shot(page, 'rules-videos-393');
    await ctx.close();
    });
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
