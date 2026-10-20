// Browser test: one auto-fit zoom on the board.
// Auto mode fits the whole board in the map box (small margin), a one-finger drag does nothing in auto,
// pinch / wheel / + zooms in and lights the fit button, the fit button glides back to the auto box,
// zooming out never goes past the fit, and going back to the Play tab is auto again.
//   node tests/zoom.test.mjs            (needs Playwright in ~/.claude/tools)
//   SHOTS=<dir> node tests/zoom.test.mjs  also saves screenshots of each state
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
const E = req('../js/engine.js');
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const T = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
await new Promise(ok => srv.listen(0, ok));
const url = 'http://localhost:' + srv.address().port + '/';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) failed++; };
const game = E.newGame({ players: 2, epidemics: 5, seed: 777, roles: [-1], names: ['You', 'Computer 1'], human: [true, false], openHands: 'auto', eventPause: true });
const store = JSON.stringify({ game: { state: game, me: 0, checks: [] } });

// the board (0..1000 x 0..500) and the map box, in screen pixels
const measure = page => page.evaluate(() => {
  const box = document.querySelector('#g-map'), svg = box.querySelector('svg');
  const m = svg.getScreenCTM();
  const b = box.getBoundingClientRect();
  const fit = box.querySelector('[data-z="fit"]');
  const cs = fit ? getComputedStyle(fit) : null;
  return {
    board: { l: m.e, t: m.f, r: m.e + 1000 * m.a, b: m.f + 500 * m.d },
    box: { l: b.left, t: b.top, r: b.right, b: b.bottom },
    fitShown: !!cs && cs.display !== 'none' && cs.visibility !== 'hidden' && fit.getBoundingClientRect().width > 0,
    fitOpacity: cs ? +cs.opacity : 0,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
});
const fits = m => {
  const inside = m.board.l >= m.box.l + 4 && m.board.r <= m.box.r - 4 && m.board.t >= m.box.t + 4 && m.board.b <= m.box.b - 4;
  const fill = Math.max((m.board.r - m.board.l) / (m.box.r - m.box.l), (m.board.b - m.board.t) / (m.box.b - m.box.t));
  const gap = Math.min((m.box.r - m.box.l) - (m.board.r - m.board.l), (m.box.b - m.box.t) - (m.board.b - m.board.t));
  return inside && (fill >= 0.92 || gap <= 24); // as big as it can be: a small margin on the tight side
};
const same = (a, b) => ['l', 't', 'r', 'b'].every(k => Math.abs(a[k] - b[k]) <= 2);
// on each axis the board either still fills the box (up to the small sea margin) or sits wholly inside it
const covers = m => [['l', 'r'], ['t', 'b']].every(([a, z]) =>
  (m.board[a] <= m.box[a] + 10 && m.board[z] >= m.box[z] - 10) || (m.board[a] >= m.box[a] - 1 && m.board[z] <= m.box[z] + 1));
const centre = m => [(m.box.l + m.box.r) / 2, (m.box.t + m.box.b) / 2];

async function pinch(page, grow) {
  await page.evaluate(g => {
    const box = document.querySelector('#g-map'), r = box.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (type, id, x) => box.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: x, clientY: cy, bubbles: true, cancelable: true }));
    ev('pointerdown', 11, cx - 30); ev('pointerdown', 12, cx + 30);
    for (let i = 1; i <= 6; i++) { ev('pointermove', 11, cx - 30 - i * g); ev('pointermove', 12, cx + 30 + i * g); }
    ev('pointerup', 11, cx - 30 - 6 * g); ev('pointerup', 12, cx + 30 + 6 * g);
  }, grow);
}
async function drag(page, m, dx, dy) {
  const [x, y] = centre(m);
  // start away from cities is not needed: a drag never taps
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + dx * i / 8, y + dy * i / 8);
  await page.mouse.up();
  await page.waitForTimeout(100);
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };

const browser = await pw.webkit.launch();
try {
  for (const vp of [{ name: 'phone', width: 393, height: 659, touch: true }, { name: 'phone-rotated', width: 659, height: 393, touch: true }, { name: 'laptop', width: 1280, height: 800, touch: false }]) {
    console.log(vp.name + ' ' + vp.width + 'x' + vp.height);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
    await ctx.addInitScript(s => { try { if (!sessionStorage.getItem('z')) { localStorage.setItem('pandemic-lab-v1', s); sessionStorage.setItem('z', 1); } } catch (e) {} }, store);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url + '#play');
    await page.waitForSelector('#g-map svg');
    await page.waitForTimeout(700);
    const auto = await measure(page);
    await shot(page, vp.name + '-1-auto');
    check(fits(auto), 'on load the whole board fits inside the map box with a margin (board ' + JSON.stringify(auto.board) + ' box ' + JSON.stringify(auto.box) + ')');
    check(auto.fitShown && auto.fitOpacity < 0.75, 'fit button is shown, dimmed in auto (opacity ' + auto.fitOpacity + ')');
    check(!auto.overflow, 'no horizontal overflow');

    await drag(page, auto, 80, 50);
    check(same((await measure(page)).board, auto.board), 'in auto a one-finger drag does not move the board');

    if (vp.touch) await pinch(page, 15);
    else { const [x, y] = centre(auto); await page.mouse.move(x, y); for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100); }
    await page.waitForTimeout(500);
    const zin = await measure(page);
    await shot(page, vp.name + '-2-zoomed');
    check(zin.board.r - zin.board.l > (auto.board.r - auto.board.l) * 1.3, (vp.touch ? 'pinch' : 'wheel') + ' zooms in');
    check(zin.fitOpacity >= 0.95, 'fit button is lit when zoomed (opacity ' + zin.fitOpacity + ')');

    await drag(page, zin, -4000, -4000);
    const panned = await measure(page);
    check(!same(panned.board, zin.board) && covers(panned), 'zoomed: drag pans, and the board cannot be dragged off-screen (' + JSON.stringify(panned.board) + ')');

    const fitBtn = await page.$('#g-map [data-z="fit"]');
    if (fitBtn) await fitBtn.click(); else check(false, 'fit button exists');
    await page.waitForTimeout(700);
    const back = await measure(page);
    await shot(page, vp.name + '-3-back-to-fit');
    check(same(back.board, auto.board), 'fit button glides back to the auto box (±2 px)');
    check(back.fitOpacity < 0.75, 'fit button dims again in auto');

    const plus = await page.$('#g-map [data-z="in"]'), minus = await page.$('#g-map [data-z="out"]');
    check(!!plus && !!minus, '+ and − buttons exist');
    if (plus && minus) {
      await plus.click(); await page.waitForTimeout(500);
      const p1 = await measure(page);
      check(p1.board.r - p1.board.l > (auto.board.r - auto.board.l) * 1.2 && p1.fitOpacity >= 0.95, '+ zooms in and lights fit');
      await minus.click(); await minus.click(); await minus.click(); await page.waitForTimeout(600);
      const p2 = await measure(page);
      check(same(p2.board, auto.board) && p2.fitOpacity < 0.75, '− never goes past the fit, and zooming out to the fit is auto again');
    }
    if (!vp.touch) {
      const [x, y] = centre(auto); await page.mouse.move(x, y);
      for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 200);
      await page.waitForTimeout(400);
      check(same((await measure(page)).board, auto.board), 'wheel out in auto stays at the fit');
    }

    // tab return: zoom in, go to Study, come back: auto
    if (plus) await plus.click(); else if (vp.touch) await pinch(page, 15); else { const [x, y] = centre(auto); await page.mouse.move(x, y); await page.mouse.wheel(0, -300); }
    await page.waitForTimeout(400);
    await page.click('#tabs button[data-tab="study"]');
    await page.waitForTimeout(200);
    await page.click('#tabs button[data-tab="play"]');
    await page.waitForTimeout(700);
    check(same((await measure(page)).board, auto.board), 'back on the Play tab the map is in auto again');

    // the box changes size (window resize / rotation): auto re-fits by itself
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await page.waitForTimeout(800);
    const rot = await measure(page);
    check(fits(rot), 'after a rotation the whole board fits the new box');
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(800);
    check(same((await measure(page)).board, auto.board), 'rotating back: same auto box as on load');

    check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
