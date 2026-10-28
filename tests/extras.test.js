'use strict';
// "Extra roles & events" option and the Legendary level (wave 3). Run: node --test tests/extras.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const E = require('../js/engine.js');
const O = require('../js/odds.js');
const B = require('../js/bots.js');
const G = require('../js/online-game.js');

const I = D.IDX;
const ROLE = k => D.ROLE_IDX[k];
const EVK = k => D.EV[k];
function blank(o) {
  const s = E.newGame(Object.assign({ players: 2, epidemics: 5, seed: 1, extra: true, roles: [ROLE('scientist'), ROLE('medic')] }, o));
  s.cubes.fill(0); s.supply = [24, 24, 24, 24];
  s.hands = s.hands.map(h => h.filter(D.isCity));
  s.log = [];
  return s;
}
function setCubes(s, city, n, col) {
  const c = I[city], k = col === undefined ? D.CITIES[c].color : col;
  s.supply[k] += s.cubes[c * 4 + k] - n; s.cubes[c * 4 + k] = n;
}
const cubes = (s, city, col) => s.cubes[I[city] * 4 + (col === undefined ? D.CITIES[I[city]].color : col)];

test('data: 3 extra roles and 3 extra events, marked extra; base lists unchanged', () => {
  assert.equal(D.ROLES.filter(r => !r.extra).length, 7);
  assert.equal(D.EVENTS.filter(e => !e.extra).length, 5);
  assert.deepEqual(D.ROLES.filter(r => r.extra).map(r => r.key), ['veteran', 'responder', 'analyst']);
  assert.deepEqual(D.EVENTS.filter(e => e.extra).map(e => e.key), ['shift', 'remote', 'ban']);
  for (const e of D.EVENTS) assert.ok(D.isEvent(e.id) && e.id < D.EPIDEMIC);
  assert.ok(!D.isEvent(D.EPIDEMIC));
});

test('option off: the base game is exactly as before (roles, events, actions)', () => {
  for (let seed = 1; seed <= 60; seed++) for (const players of [2, 3, 4]) {
    const s = E.newGame({ players, epidemics: 5, seed });
    assert.ok(s.roles.every(r => !D.ROLES[r].extra));
    const all = s.hands.flat().concat(s.pdeck);
    assert.deepEqual(all.filter(D.isEvent).sort((a, b) => a - b), [48, 49, 50, 51, 52]);
    assert.equal(s.left, 4);
    assert.equal(s.extra, undefined);
  }
  // asking for an extra role without the option gives a base role
  const s = E.newGame({ players: 2, seed: 3, roles: [ROLE('veteran')] });
  assert.ok(!D.ROLES[s.roles[0]].extra);
});

test('option on: 2 events per player drawn from all 8; every extra role and event shows up', () => {
  const seenR = new Set(), seenE = new Set();
  for (let seed = 1; seed <= 80; seed++) for (const players of [2, 3, 4]) {
    const s = E.newGame({ players, epidemics: 5, seed, extra: true });
    const evs = s.hands.flat().concat(s.pdeck).filter(D.isEvent);
    assert.equal(evs.length, 2 * players);
    assert.equal(new Set(evs).size, evs.length);
    assert.equal(s.pdeck.length + s.hands.flat().length, 48 + 2 * players + 5);
    s.roles.forEach(r => seenR.add(r)); evs.forEach(e => seenE.add(e));
  }
  assert.equal(seenR.size, 10);
  assert.equal(seenE.size, 8);
  const s = E.newGame({ players: 2, seed: 3, extra: true, roles: [ROLE('analyst')] });
  assert.equal(s.roles[0], ROLE('analyst'));
});

test('Legendary: 7 Epidemics, one in each of 7 piles', () => {
  for (const players of [2, 3, 4]) for (let seed = 1; seed <= 10; seed++) {
    const s = E.newGame({ players, epidemics: 7, seed });
    assert.equal(s.epidemics, 7);
    assert.equal(s.piles.length, 7);
    let end = s.pdeck.length;
    for (const size of s.piles) { assert.equal(s.pdeck.slice(end - size, end).filter(c => c === D.EPIDEMIC).length, 1); end -= size; }
  }
  const g = G.game.setup(2, { epidemics: 7, extra: true }, () => 0.5, []);
  assert.equal(g.epidemics, 7); assert.equal(g.extra, true);
});

test('Veteran: 5 actions every turn', () => {
  const s = blank({ roles: [ROLE('veteran'), ROLE('medic')] });
  s.cur = 1; s.left = 1; s.pdeck.push(1, 2);
  const t = E.apply(s, 1, { t: 'end' });
  const u = t.phase === 'window' ? E.apply(t, 1, { t: 'go' }) : t;
  assert.equal(u.cur, 0); assert.equal(u.left, 5);
  let v = u;
  for (let i = 0; i < 5; i++) { assert.equal(v.cur, 0); v = E.apply(v, 0, { t: 'drive', to: D.CITIES[v.pawns[0]].adj[0] }); }
  assert.notEqual(v.phase === 'actions' && v.cur === 0, true);
  // a new game where the Veteran goes first starts with 5
  for (let seed = 1; seed < 40; seed++) {
    const g = E.newGame({ players: 2, seed, extra: true, roles: [ROLE('veteran')] });
    assert.equal(g.left, g.cur === 0 ? 5 : 4);
  }
});

test('Responder: entering a city with 2+ cubes of a colour removes 1 of each such colour', () => {
  const s = blank({ roles: [ROLE('responder'), ROLE('medic')] });
  s.cur = 0; s.left = 4;
  setCubes(s, 'Chicago', 3); setCubes(s, 'Chicago', 2, 1); setCubes(s, 'Chicago', 1, 2);
  setCubes(s, 'Washington', 1);
  let t = E.apply(s, 0, { t: 'drive', to: I['Chicago'] });
  assert.equal(cubes(t, 'Chicago'), 2); assert.equal(cubes(t, 'Chicago', 1), 1); assert.equal(cubes(t, 'Chicago', 2), 1);
  t = E.apply(t, 0, { t: 'drive', to: I['Atlanta'] });
  t = E.apply(t, 0, { t: 'drive', to: I['Washington'] });
  assert.equal(cubes(t, 'Washington'), 1);
  // moved by an Airlift counts too
  const a = blank({ roles: [ROLE('responder'), ROLE('medic')] });
  a.cur = 0; a.hands[1] = [EVK('airlift')]; setCubes(a, 'Tokyo', 3);
  const b = E.apply(a, 1, { t: 'event', card: EVK('airlift'), who: 0, to: I['Tokyo'] });
  assert.equal(cubes(b, 'Tokyo'), 2);
  assert.equal(b.supply.reduce((x, y) => x + y, 0) + b.cubes.reduce((x, y) => x + y, 0), 96);
});

test('Analyst: once a turn, take any city card from a player in the same city, no action', () => {
  const s = blank({ roles: [ROLE('analyst'), ROLE('medic')] });
  s.cur = 0; s.left = 4; s.hands[0] = [I['Tokyo']]; s.hands[1] = [I['Lima'], I['Cairo']];
  const L = E.legalActions(s).filter(a => a.t === 'grab');
  assert.equal(L.length, 2);
  let t = E.apply(s, 0, { t: 'grab', from: 1, card: I['Lima'] });
  assert.ok(t.hands[0].includes(I['Lima']) && !t.hands[1].includes(I['Lima']));
  assert.equal(t.left, 4);
  assert.equal(E.legalActions(t).filter(a => a.t === 'grab').length, 0);
  assert.throws(() => E.apply(t, 0, { t: 'grab', from: 1, card: I['Cairo'] }));
  // not in another city
  const o = blank({ roles: [ROLE('analyst'), ROLE('medic')] });
  o.cur = 0; o.hands[1] = [I['Lima']]; o.pawns[1] = I['Miami'];
  assert.throws(() => E.apply(o, 0, { t: 'grab', from: 1, card: I['Lima'] }));
  // other roles can't
  const m = blank();
  m.cur = 0; m.hands[1] = [I['Lima']];
  assert.throws(() => E.apply(m, 0, { t: 'grab', from: 1, card: I['Lima'] }));
  // resets on the Analyst's next turn
  t.left = 1; t.pdeck.push(3, 4, 5, 6);
  let u = E.apply(t, 0, { t: 'end' });
  while (u.phase !== 'actions') u = E.apply(u, E.toAct(u)[0], B.decide(u, E.toAct(u)[0]));
  u.left = 1; u.pdeck.push(7, 8);
  u = E.apply(u, 1, { t: 'end' });
  while (u.phase !== 'actions') u = E.apply(u, E.toAct(u)[0], B.decide(u, E.toAct(u)[0]));
  assert.equal(u.cur, 0); assert.equal(u.grabbed, false);
});

test('Extra Shift: 2 more actions, only during a turn’s actions', () => {
  const s = blank();
  s.cur = 0; s.left = 3; s.hands[1] = [EVK('shift')];
  const t = E.apply(s, 1, { t: 'event', card: EVK('shift') });
  assert.equal(t.left, 5); assert.ok(t.pdisc.includes(EVK('shift')));
  const w = blank();
  w.cur = 0; w.left = 1; w.hands[0] = [EVK('shift')]; w.pdeck.push(1, 2);
  const x = E.apply(w, 0, { t: 'end' });
  assert.equal(x.phase, 'window');
  assert.throws(() => E.apply(x, 0, { t: 'event', card: EVK('shift') }));
});

test('Remote Care: removes any 2 cubes (same city allowed), refuses cubes that are not there', () => {
  const s = blank();
  s.cur = 0; s.hands[1] = [EVK('remote')];
  setCubes(s, 'Tokyo', 3); setCubes(s, 'Lima', 1);
  assert.throws(() => E.apply(s, 1, { t: 'event', card: EVK('remote'), cubes: [[I['Lima'], 1], [I['Lima'], 1]] }));
  assert.throws(() => E.apply(s, 1, { t: 'event', card: EVK('remote'), cubes: [[I['Paris'], 0]] }));
  assert.throws(() => E.apply(s, 1, { t: 'event', card: EVK('remote'), cubes: [] }));
  const t = E.apply(s, 1, { t: 'event', card: EVK('remote'), cubes: [[I['Tokyo'], 3], [I['Tokyo'], 3]] });
  assert.equal(cubes(t, 'Tokyo'), 1); assert.equal(t.supply[3], 23);
  // a cured colour's last cubes: eradicated
  const e = blank();
  e.hands[1] = [EVK('remote')]; e.cured[1] = 1; setCubes(e, 'Lima', 1); setCubes(e, 'Bogotá', 1);
  const f = E.apply(e, 1, { t: 'event', card: EVK('remote'), cubes: [[I['Lima'], 1], [I['Bogotá'], 1]] });
  assert.equal(f.erad[1], 1);
});

test('Travel Ban: 1 infection card per Infect step until the player who played it starts a turn; odds agree', () => {
  const s = blank({ players: 3, roles: [ROLE('scientist'), ROLE('medic'), ROLE('dispatcher')] });
  s.cur = 0; s.left = 1; s.rate = 5; s.hands[1] = [EVK('ban')];
  for (let k = 0; k < 6; k++) s.pdeck.push(k + 1);
  let t = E.apply(s, 1, { t: 'event', card: EVK('ban') });
  assert.equal(t.ban, 1); assert.equal(E.infectRate(t), 1);
  const o = O.infectionOdds(Object.assign({}, t, { pdeckCount: t.pdeck.length }), 2, null);
  assert.deepEqual(o.rate, [1, 1, 1]);
  let n0 = t.idisc.length;
  t = E.apply(t, 0, { t: 'end' });
  while (t.phase === 'window') t = E.apply(t, E.toAct(t)[0], E.toAct(t)[0] === t.cur ? { t: 'go' } : { t: 'pass' });
  assert.equal(t.idisc.length - n0, 1); // seat 0's infect step: 1 card
  assert.equal(t.cur, 1); assert.equal(t.ban, -1); // seat 1's turn started: over
  n0 = t.idisc.length; t.left = 1;
  t = E.apply(t, 1, { t: 'end' });
  while (t.phase === 'window') t = E.apply(t, E.toAct(t)[0], E.toAct(t)[0] === t.cur ? { t: 'go' } : { t: 'pass' });
  assert.equal(t.idisc.length - n0, 4);
});

test('computer teammates use the new roles and events sensibly', () => {
  // Remote Care in the window before infections when a 3-cube city is likely to be hit
  const s = blank();
  s.cur = 0; s.left = 1; s.hands[1] = [EVK('remote')]; s.pdeck.push(1, 2);
  // make Tokyo the top infection card and give it 3 cubes
  s.ideck.splice(s.ideck.indexOf(I['Tokyo']), 1); s.ideck.push(I['Tokyo']); s.layers = [[I['Tokyo']]];
  setCubes(s, 'Tokyo', 3);
  let t = E.apply(s, 0, { t: 'end' });
  assert.equal(t.phase, 'window');
  const d = B.decide(t, 1);
  assert.equal(d.card, EVK('remote'));
  assert.ok(d.cubes.every(x => x[0] === I['Tokyo']), JSON.stringify(d));
  // nothing dangerous on the board: keep the card
  const q = blank();
  q.cur = 0; q.left = 1; q.hands[1] = [EVK('remote')]; q.pdeck.push(1, 2); setCubes(q, 'Lima', 1);
  const q2 = E.apply(q, 0, { t: 'end' });
  if (q2.phase === 'window') assert.equal(B.decide(q2, 1).t, 'pass');
  // Travel Ban when the rate is high and 3-cube cities are likely hit
  const b = blank();
  b.cur = 0; b.left = 1; b.rate = 5; b.hands[1] = [EVK('ban')]; b.pdeck.push(1, 2);
  b.ideck.splice(b.ideck.indexOf(I['Tokyo']), 1); b.ideck.push(I['Tokyo']); b.layers = [[I['Tokyo']]];
  setCubes(b, 'Tokyo', 3);
  const b2 = E.apply(b, 0, { t: 'end' });
  assert.equal(B.decide(b2, 1).card, EVK('ban'));
  // Analyst takes the card that completes a cure set
  const a = blank({ roles: [ROLE('analyst'), ROLE('medic')] });
  a.cur = 0; a.left = 4; a.hands[0] = [I['Chicago'], I['Montréal'], I['New York'], I['Washington']]; a.hands[1] = [I['London'], I['Lima']];
  const g = B.decide(a, 0);
  assert.deepEqual(g, { t: 'grab', from: 1, card: I['London'] });
  // Extra Shift at the start of the turn when 2 more actions finish a cure: 5 blue, station 2 actions further than reachable
  const x = blank({ roles: [ROLE('medic'), ROLE('dispatcher')] });
  x.cur = 0; x.left = 4; x.pawns = [I['Tokyo'], I['Tokyo']];
  x.hands[0] = [I['Chicago'], I['Montréal'], I['New York'], I['Washington'], I['London'], EVK('shift')];
  x.stations = [I['Karachi']];
  const sh = B.decide(x, 0);
  assert.equal(sh.card, EVK('shift'), JSON.stringify(sh));
  // the Hint shows the same extra step
  assert.deepEqual(B.preMove(a, 0), { t: 'grab', from: 1, card: I['London'] });
});

function invariants(s) {
  assert.equal(s.cubes.reduce((a, b) => a + b, 0) + s.supply.reduce((a, b) => a + b, 0), 96);
  assert.ok(s.cubes.every(x => x >= 0 && x <= 3));
  const cards = s.hands.flat().length + s.pdeck.length + s.pdisc.length + s.premoved.length + (s.cp >= 0 ? 1 : 0);
  assert.equal(cards, 48 + 2 * s.n + s.epidemics);
  assert.equal(s.ideck.length + s.idisc.length + s.iremoved.length, 48);
  if (!s.over) assert.ok(E.toAct(s).length > 0);
}
test('random legal play with the option on never breaks the engine (150 games, incl. Legendary)', () => {
  let r = 7;
  const rng = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let g = 0; g < 150; g++) {
    let s = E.newGame({ players: 2 + (g % 3), epidemics: 4 + (g % 4), seed: 500 + g, extra: true });
    let steps = 0;
    while (!s.over && steps++ < 3000) {
      const seat = E.toAct(s)[Math.floor(rng() * E.toAct(s).length)];
      let a;
      if (s.phase === 'actions') { const L = E.legalActions(s); a = L[Math.floor(rng() * L.length)]; } else a = B.decide(s, seat);
      s = E.apply(s, seat, a);
      invariants(s);
    }
    assert.ok(s.over);
  }
});
test('computer teammates finish games with the option on (all sizes)', () => {
  const used = new Set();
  for (const players of [2, 3, 4]) for (const epidemics of [4, 7]) {
    let s = E.newGame({ players, epidemics, seed: 900 + players * 10 + epidemics, extra: true });
    while (!s.over) {
      const seat = E.toAct(s)[0];
      const a = B.decide(s, seat);
      if (a.t === 'event') used.add(D.EVENTS[a.card - 48].key);
      if (a.t === 'grab') used.add('grab');
      s = E.apply(s, seat, a);
      invariants(s);
    }
  }
  assert.ok(used.size >= 1, [...used].join());
});
