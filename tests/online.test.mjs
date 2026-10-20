// The Pandemic engine behind the shared online module's game interface (_online/README.md §2, §6).
// Run: node tests/online.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createLocal } from '../js/online.js';
const require = createRequire(import.meta.url);
const { game, viewFromSnap } = require('../js/online-game.js');
const E = require('../js/engine.js');

let pass = 0;
const ok = label => { pass++; console.log('  PASS  ' + label); };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const humans = n => Array.from({ length: n }, (_, i) => ({ kind: 'human', name: 'P' + (i + 1) }));
const clone = x => JSON.parse(JSON.stringify(x));

// 1. Every seat a person, every move made by game.bot through JSON copies (the online path).
{
  let games = 0, moves = 0, wins = 0;
  for (let g = 0; g < 9; g++) {
    const rng = mulberry(g + 11);
    const n = 2 + (g % 3);
    let s = game.setup(n, { epidemics: 4 + (g % 3) }, rng, humans(n));
    assert.equal(JSON.stringify(clone(s)), JSON.stringify(s), 'state survives JSON');
    while (!game.isOver(s)) {
      const toAct = game.toAct(s);
      assert.ok(toAct.length >= 1, 'someone must act before the end');
      const seat = toAct[0];
      const ctx = { pub: game.publicView(s), mine: game.privateView(s, seat), state: s };
      s = game.apply(clone(s), seat, clone(game.bot(ctx, seat, rng)));
      moves++;
      assert.ok(moves < 100000, 'runaway');
    }
    assert.deepEqual(game.toAct(s), []);
    if (s.over.win) wins++;
    games++;
  }
  ok(games + ' online-path games (2-4 seats, all 3 levels) end cleanly; ' + moves + ' moves, ' + wins + ' wins, never an illegal bot move');
}

// 2. Illegal moves throw (online.js drops them).
{
  const s = game.setup(2, { epidemics: 5 }, mulberry(3), humans(2));
  const seat = game.toAct(s)[0];
  const other = 1 - seat;
  assert.throws(() => game.apply(clone(s), other, { t: 'end' }));
  assert.throws(() => game.apply(clone(s), seat, { t: 'drive', to: 999 }));
  assert.throws(() => game.apply(clone(s), seat, { t: 'nope' }));
  assert.throws(() => game.apply(clone(s), seat, null));
  ok('moves out of turn, impossible moves and malformed moves throw');
}

// 3. Secrecy with hidden hands (Standard): no deck order, no seed, no other person's hand.
{
  for (let g = 0; g < 4; g++) {
    const rng = mulberry(100 + g);
    let s = game.setup(3, { epidemics: 5 }, rng, humans(3));
    for (let step = 0; step < 30 * (g + 1) && !game.isOver(s); step++) {
      const seat = game.toAct(s)[0];
      s = game.apply(clone(s), seat, game.bot({ state: s }, seat, rng));
    }
    const pub = game.publicView(s);
    for (const k of ['rng', 'pdeck', 'ideck', 'queue', 'seed']) assert.ok(!(k in pub), 'public view has no ' + k);
    pub.hands.forEach((h, j) => assert.deepEqual(h, [], 'seat ' + j + ' hand hidden'));
    for (let j = 0; j < 3; j++) {
      const pv = game.privateView(s, j);
      assert.deepEqual(Object.keys(pv), ['hand']);
      assert.deepEqual(pv.hand, s.hands[j], 'own hand only');
      assert.equal(pub.handN[j], s.hands[j].length, 'hand sizes are public');
    }
  }
  // open hands (Introductory default): hands are public, nothing private
  const s = game.setup(2, { epidemics: 4 }, mulberry(7), humans(2));
  assert.deepEqual(game.publicView(s).hands, s.hands);
  assert.deepEqual(game.privateView(s, 0), {});
  ok('hidden hands: public view has no deck order, seed or hands; private view is your own hand. Open hands at Introductory');
}

// 4. The screens' view shape matches PanEngine.view for the same seat.
{
  const rng = mulberry(5);
  let s = game.setup(2, { epidemics: 5 }, rng, humans(2));
  for (let i = 0; i < 25; i++) { const seat = game.toAct(s)[0]; s = game.apply(clone(s), seat, game.bot({ state: s }, seat, rng)); }
  for (const seat of [0, 1]) {
    const v = viewFromSnap({ pub: game.publicView(s), mine: game.privateView(s, seat), mySeat: seat });
    const w = E.view(s, seat);
    assert.deepEqual(clone(v), clone(w));
  }
  ok('snapshot view equals the local engine view seat for seat');
}

// 5. A local room (createLocal) plays a person + computer game to "finished".
{
  const room = createLocal({ game, seats: ['human', 'computer'], options: { epidemics: 4 }, botDelayMs: 0, rng: mulberry(21) });
  let last = null;
  room.on('change', snap => { last = snap; });
  room.on('error', e => { throw new Error(String(e)); });
  room.start();
  let guard = 0;
  const t0 = Date.now();
  while (last.status !== 'finished') {
    if (last.toAct.includes(last.mySeat)) {
      const r = room.act(game.bot({ state: room.state }, last.mySeat));
      assert.ok(r.ok, r.message);
      guard++;
    } else {
      // computer steps run on a timer: let them happen
      await new Promise(r => setTimeout(r, 1));
    }
    assert.ok(Date.now() - t0 < 120000, 'room never finished');
  }
  assert.ok(last.pub.over);
  ok('createLocal room plays to finished (' + guard + ' person moves)');
}

// 6. Bad options fall back to safe defaults.
{
  const s = game.setup(2, { epidemics: 9, roles: ['x', 99], openHands: 'yes' }, mulberry(1), humans(2));
  assert.equal(s.epidemics, 5);
  assert.ok(s.roles.every(r => r >= 0 && r < 7) && s.roles[0] !== s.roles[1]);
  const t = game.setup(3, null, mulberry(2), null);
  assert.equal(t.n, 3);
  ok('junk options give a valid Standard game');
}

console.log(pass + ' passed');
