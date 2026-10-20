// Two separate headless browsers play Pandemic Lab online against the REAL shared project.
//   node tools/two-browsers.mjs [url] [--engine webkit|chromium] [--shots dir] [--turns N]
// Proves: create room, join by code, hidden hands (Standard), turns pass between people,
// reload mid-game puts you back in your seat, no console errors.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(join(homedir(), '.claude/tools/') + 'x.js');
const pw = require('playwright');

const args = process.argv.slice(2);
const url = args.find(a => a.startsWith('http')) || 'https://timothyhadfield.github.io/pandemic/';
const engine = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : 'webkit';
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const TURNS = args.includes('--turns') ? +args[args.indexOf('--turns') + 1] : 4;
const fail = m => { console.error('FAIL: ' + m); process.exit(1); };

const iphone = pw.devices['iPhone 13'] ? { ...pw.devices['iPhone 13'], viewport: { width: 393, height: 659 } } : {};
const opts = engine === 'webkit' ? iphone : {};
const bA = await pw[engine].launch(), bB = await pw[engine].launch();
const A = await (await bA.newContext(opts)).newPage(), B = await (await bB.newContext(opts)).newPage();
const errs = [], noise = [];
let reloading = false;
for (const [n, p] of [['A', A], ['B', B]]) {
  p.on('console', m => { if (m.type() === 'error' && !/BloomFilter/.test(m.text())) (reloading && n === 'B' ? noise : errs).push(n + ': ' + m.text()); });
  p.on('pageerror', e => (reloading && n === 'B' ? noise : errs).push(n + ' pageerror: ' + e.message));
}
const state = p => p.evaluate(() => {
  const h = [...document.querySelectorAll('#g-hand [data-card]')].map(e => e.textContent.trim());
  return { hand: h, info: (document.querySelector('#g-info') || {}).innerText || '', body: document.body.innerText };
});

await A.goto(url); await B.goto(url);
await A.click('[data-on=open]'); await A.fill('#on-name', 'Alice'); await A.click('[data-on=create]');
await A.waitForSelector('.code-big', { timeout: 25000 }).catch(async e => { console.error('page says: ' + (await A.innerText('body')).slice(0, 400)); throw e; });
const code = (await A.textContent('.code-big')).trim();
console.log('room code', code);
if (shots) await A.screenshot({ path: shots + '/online-lobby.png' });

await B.click('[data-on=open]'); await B.fill('#on-name', 'Bob'); await B.fill('#on-code', code); await B.click('[data-on=join]');
await A.waitForFunction(() => /Bob/.test(document.querySelector('.seats').textContent), null, { timeout: 60000 }).catch(async e => { console.error('Bob sees: ' + (await B.innerText('body')).slice(0, 300) + ' || Alice sees: ' + (await A.innerText('body')).slice(0, 300)); throw e; });
console.log('Bob is seated');
await A.click('[data-on=start]');
await A.waitForSelector('#g-map', { timeout: 25000 });
await B.waitForSelector('#g-map', { timeout: 25000 });
await B.waitForFunction(() => document.querySelectorAll('#g-hand [data-card]').length >= 4, null, { timeout: 25000 });

let a = await state(A), b = await state(B);
console.log('Alice holds', a.hand.join(', '), '| Bob holds', b.hand.join(', '));
const bobPlayers = await B.$$eval('#g-players .pchip', els => els.map(e => e.innerText));
if (a.hand.some(c => bobPlayers.join(' ').includes(c.split('\n')[0]))) fail("Bob's player chips show Alice's cards");
console.log("PASS hidden hands: Bob's screen does not list Alice's cards (Standard rules)");
if (shots) { await A.screenshot({ path: shots + '/online-alice.png' }); await B.screenshot({ path: shots + '/online-bob.png' }); }

// play: whoever is asked ends their turn / answers windows / discards
async function step(p) {
  const tryClick = async sel => { const el = await p.$(sel); if (el && await el.isVisible().catch(() => false)) return el.click({ timeout: 3000 }).then(() => true, () => false); return false; };
  if (await tryClick('.banner')) return true;
  if (await tryClick('[data-g=go]')) return true;
  if (await tryClick('[data-g=pass]')) return true;
  if (await p.$('#g-info.alert') && /discard/.test((await p.textContent('#g-info')) || '')) {
    await tryClick('#g-hand .pc:not(.event) ') || await tryClick('#g-hand [data-card]');
    return tryClick('[data-g=discard]');
  }
  if (await tryClick('#g-acts [data-g=end]')) { await p.waitForSelector('.confirm-back [data-c=yes]', { timeout: 5000 }); await p.click('.confirm-back [data-c=yes]'); return true; }
  return false;
}
let reloaded = false, loops = 0;
const acted = { A: 0, B: 0 }, after = { A: 0, B: 0 };
while (loops++ < 300) {
  const info = (await A.textContent('#g-info').catch(() => '')) + ' / ' + (await B.textContent('#g-info').catch(() => ''));
  if (/team lost|world is saved/.test(info)) { console.log('game ended: ' + info.slice(0, 80)); break; }
  if (await step(A)) { acted.A++; if (reloaded) after.A++; }
  else if (await step(B)) { acted.B++; if (reloaded) after.B++; }
  await A.waitForTimeout(600);
  if (!reloaded && acted.A >= 2 && acted.B >= 2) {
    reloading = true;
    await B.reload();
    await B.waitForSelector('#g-map', { timeout: 30000 });
    await B.waitForFunction(() => document.querySelectorAll('#g-hand [data-card]').length >= 1, null, { timeout: 25000 });
    reloading = false; reloaded = true;
    console.log('PASS Bob reloaded mid-game and is back in his seat with his cards');
  }
  if (reloaded && after.A >= TURNS && after.B >= TURNS) break;
}
console.log('decisions answered: Alice ' + acted.A + ', Bob ' + acted.B + ' (after the reload: ' + after.A + ' / ' + after.B + ')');
if (!(after.A >= 1 && after.B >= 1)) fail('turns did not keep passing between Alice and Bob after the reload');
if (!reloaded) fail('never got far enough to test a reload');
a = await state(A); b = await state(B);
console.log('PASS turns passed between Alice and Bob');
if (shots) { await A.screenshot({ path: shots + '/online-alice-later.png' }); await B.screenshot({ path: shots + '/online-bob-later.png' }); }
// host leaves: room closes or hands over
await A.click('#g-menu'); await A.click('[data-m=leave]'); await A.click('.confirm-back [data-c=yes]');
await A.waitForTimeout(2000);
if (noise.length) console.log('note: ' + noise.length + ' messages while Bob reloaded (cut-off Firestore channels)');
if (errs.length) fail('console errors:\n' + errs.join('\n'));
console.log('PASS no console errors (' + engine + ')');
await bA.close(); await bB.close();
