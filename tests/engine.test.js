'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const E = require('../js/engine.js');
const O = require('../js/odds.js');
const B = require('../js/bots.js');
const G = require('../js/online-game.js');

const I = D.IDX;
const ROLE = k => D.ROLE_IDX[k];
function blank(o) {
  // a game with no cubes on the board, for hand-built positions
  const s = E.newGame(Object.assign({ players: 2, epidemics: 5, seed: 1, roles: [D.ROLE_IDX.scientist, D.ROLE_IDX.medic] }, o));
  s.cubes.fill(0); s.supply = [24, 24, 24, 24];
  s.hands = s.hands.map(h => h.filter(D.isCity)); // no events unless a test adds them
  s.log = [];
  return s;
}
const cubes = (s, city, col) => s.cubes[I[city] * 4 + (col === undefined ? D.CITIES[I[city]].color : col)];
function setCubes(s, city, n, col) {
  const c = I[city], k = col === undefined ? D.CITIES[c].color : col;
  s.supply[k] += s.cubes[c * 4 + k] - n; s.cubes[c * 4 + k] = n;
}

// ------------------------------------------------------------------ board facts
test('48 cities, 12 per colour, 93 links, all two-way', () => {
  assert.equal(D.CITIES.length, 48);
  for (let col = 0; col < 4; col++) assert.equal(D.CITIES.filter(c => c.color === col).length, 12);
  let ends = 0;
  for (const c of D.CITIES) {
    ends += c.adj.length;
    for (const a of c.adj) assert.ok(D.CITIES[a].adj.includes(c.i), c.name + ' - ' + D.CITIES[a].name);
  }
  assert.equal(ends / 2, 93);
  assert.equal(D.LINKS.length, 93);
  assert.equal(D.CITIES[I['Santiago']].adj.length, 1);
  assert.equal(D.CITIES[I['Hong Kong']].adj.length, 6);
  assert.equal(D.CITIES[I['Istanbul']].adj.length, 6);
  assert.equal(Math.max(...D.CITIES.map(c => c.adj.length)), 6);
  // the whole map is one network
  assert.ok(D.DIST[0].every(d => d < 99));
});
test('card populations: Jakarta biggest, Essen smallest', () => {
  const by = D.CITIES.slice().sort((a, b) => b.pop - a.pop);
  assert.equal(by[0].name, 'Jakarta');
  assert.equal(by[0].pop, 26063000);
  assert.equal(by[47].name, 'Essen');
  assert.equal(D.CITIES[I['Chicago']].pop, D.CITIES[I['Lima']].pop); // the one tie on the cards
});
test('roles, events and tracks', () => {
  assert.equal(D.ROLES.length, 7);
  assert.equal(D.EVENTS.length, 5);
  assert.deepEqual(D.RATE_TRACK, [2, 2, 2, 3, 3, 4, 4]);
  assert.equal(D.MAX_OUTBREAKS, 8);
  assert.equal(D.CUBES_PER_COLOR, 24);
  assert.equal(D.MAX_STATIONS, 6);
  assert.deepEqual(D.DEAL, { 2: 4, 3: 3, 4: 2 });
});

// ------------------------------------------------------------------ setup
test('setup: hands, piles, epidemics, first infections', () => {
  for (const players of [2, 3, 4]) for (const epidemics of [4, 5, 6]) for (let seed = 1; seed <= 15; seed++) {
    const s = E.newGame({ players, epidemics, seed });
    s.hands.forEach(h => assert.equal(h.length, D.DEAL[players]));
    assert.equal(s.pdeck.length, 53 - players * D.DEAL[players] + epidemics);
    assert.equal(s.piles.length, epidemics);
    assert.equal(s.piles.reduce((a, b) => a + b, 0), s.pdeck.length);
    for (let k = 1; k < s.piles.length; k++) assert.ok(s.piles[k - 1] >= s.piles[k], 'bigger piles on top');
    assert.ok(s.piles[0] - s.piles[s.piles.length - 1] <= 1);
    // exactly one epidemic in each pile (top pile = end of the array)
    let end = s.pdeck.length;
    for (const size of s.piles) {
      const pile = s.pdeck.slice(end - size, end);
      assert.equal(pile.filter(c => c === D.EPIDEMIC).length, 1);
      end -= size;
    }
    assert.equal(s.idisc.length, 9);
    assert.equal(s.ideck.length, 39);
    const placed = s.idisc.map(c => s.cubes[c * 4 + D.CITIES[c].color]);
    assert.deepEqual(placed, [3, 3, 3, 2, 2, 2, 1, 1, 1]);
    assert.equal(96 - s.supply.reduce((a, b) => a + b, 0), 18);
    assert.deepEqual(s.stations, [D.ATLANTA]);
    assert.ok(s.pawns.every(p => p === D.ATLANTA));
    assert.equal(new Set(s.roles).size, players);
    // first player holds the most populous city card
    const best = Math.max(...s.hands.flat().filter(D.isCity).map(c => D.CITIES[c].pop));
    assert.ok(s.hands[s.cur].some(c => D.isCity(c) && D.CITIES[c].pop === best));
    assert.equal(s.open, epidemics === 4);
  }
});

// ------------------------------------------------------------------ infections and outbreaks
test('outbreak spreads one cube to each link, chains, and never repeats in a chain', () => {
  const s = blank();
  setCubes(s, 'Paris', 3); setCubes(s, 'Essen', 3); setCubes(s, 'London', 3);
  s.layers = [];
  s.cur = 0; s.left = 1; s.pdeck.push(1, 2); // two harmless player cards on top
  // the top of the infection deck is the end of the array: Paris first, then Lima
  s.ideck.splice(s.ideck.length - 2, 2, I['Lima'], I['Paris']);
  const t = E.apply(s, s.cur, { t: 'end' });
  // Paris outbreaks -> Essen and London outbreak (chain); each outbreaks once
  assert.equal(t.outbreaks, 3);
  assert.equal(cubes(t, 'Milan'), 2); // from Paris and Essen
  assert.equal(cubes(t, 'Madrid'), 2); // from Paris and London
  assert.equal(cubes(t, 'New York'), 1); // London
  assert.equal(cubes(t, 'St. Petersburg'), 1); // Essen
  assert.equal(cubes(t, 'Algiers', 0), 1); // blue cube in a black city
  assert.equal(cubes(t, 'Paris'), 3);
  assert.equal(cubes(t, 'Lima'), 1);
});
test('Quarantine Specialist protects her city and links; Medic protects cured colours', () => {
  const s = blank({ roles: [ROLE('quarantine'), ROLE('medic')] });
  s.pawns[0] = I['Paris'];
  setCubes(s, 'Milan', 3);
  s.cur = 0; s.left = 1; s.pdeck.push(1, 2); s.layers = [];
  s.ideck.splice(s.ideck.length - 2, 2, I['Lima'], I['Milan']);
  const t = E.apply(s, 0, { t: 'end' });
  assert.equal(t.outbreaks, 0, 'Milan is linked to Paris');
  // Medic: cured blue never lands in his city
  const m = blank({ roles: [ROLE('scientist'), ROLE('medic')] });
  m.cured[0] = 1; m.pawns[1] = I['London']; m.cur = 0; m.left = 1; m.pdeck.push(1, 2); m.layers = [];
  m.ideck.splice(m.ideck.length - 2, 2, I['Lima'], I['London']);
  const u = E.apply(m, 0, { t: 'end' });
  assert.equal(cubes(u, 'London'), 0);
});
test('Medic removes cured cubes on arrival; treating a cured colour removes all; eradication', () => {
  const s = blank({ roles: [ROLE('medic'), ROLE('scientist')] });
  s.cur = 0; s.left = 4;
  s.cured[0] = 1; setCubes(s, 'Chicago', 2);
  let t = E.apply(s, 0, { t: 'drive', to: I['Chicago'] });
  assert.equal(cubes(t, 'Chicago'), 0);
  assert.equal(t.erad[0], 1, 'last blue cube gone with blue cured');
  const u = blank({ roles: [ROLE('scientist'), ROLE('dispatcher')] });
  u.cur = 0; u.left = 4; setCubes(u, 'Atlanta', 3);
  t = E.apply(u, 0, { t: 'treat', color: 0 });
  assert.equal(cubes(t, 'Atlanta'), 2);
  u.cured[0] = 1;
  t = E.apply(u, 0, { t: 'treat', color: 0 });
  assert.equal(cubes(t, 'Atlanta'), 0);
  assert.equal(t.erad[0], 1);
});

// ------------------------------------------------------------------ epidemics
test('epidemic: rate up, bottom card gets 3 cubes, discard goes back on top', () => {
  const s = blank();
  s.cur = 0; s.left = 1;
  s.pdeck.push(D.EPIDEMIC, 5); // draws 5 then the Epidemic
  const bottom = s.ideck[0];
  const disc = s.idisc.slice();
  const t = E.apply(s, 0, { t: 'end' });
  assert.equal(t.rate, 1);
  assert.equal(t.cubes[bottom * 4 + D.CITIES[bottom].color], 3);
  // the infect step drew 2 cards from the new top layer (old discard + the bottom city)
  assert.equal(t.idisc.length, 2);
  for (const c of t.idisc) assert.ok(disc.includes(c) || c === bottom);
  assert.equal(t.layers.length, 1);
  assert.equal(t.layers[0].length, disc.length + 1 - 2);
  assert.equal(t.epiDrawn, 1);
});
test('double epidemic: the second bottom city is drawn first and outbreaks', () => {
  const s = blank();
  s.cur = 0; s.left = 1;
  s.pdeck.push(D.EPIDEMIC, D.EPIDEMIC);
  const b2 = s.ideck[1];
  const t = E.apply(s, 0, { t: 'end' });
  assert.equal(t.rate, 2);
  assert.ok(t.outbreaks >= 1);
  assert.ok(t.log.some(e => e.m === 'Outbreak in ' + D.CITIES[b2].name + '!'));
});
test('epidemic with an empty infection deck: rate up, no bottom card, discard back on top, game goes on', () => {
  const s = blank();
  s.cur = 0; s.left = 1;
  s.idisc = s.idisc.concat(s.ideck); s.ideck = []; s.layers = [];
  s.pdeck.push(D.EPIDEMIC, 5);
  const t = E.apply(s, 0, { t: 'end' });
  assert.equal(t.rate, 1);
  assert.equal(t.epiDrawn, 1);
  assert.equal(t.over, null);
  assert.equal(t.phase, 'actions');
  assert.equal(t.ideck.length + t.idisc.length, 48); // all 48 back in play: on top, then 2 flipped
  assert.equal(t.idisc.length, 2);
  // Forecast with nothing to look at says why
  const f = blank(); f.idisc = f.idisc.concat(f.ideck); f.ideck = []; f.hands[0].push(EVf('forecast'));
  assert.throws(() => E.apply(f, 0, { t: 'event', card: EVf('forecast') }), /infection deck is empty/);
});
function EVf(k) { return D.EVENTS.find(e => e.key === k).id; }

// ------------------------------------------------------------------ actions
test('moves: drive, direct, charter, shuttle; illegal ones throw', () => {
  const s = blank({ roles: [ROLE('scientist'), ROLE('medic')] });
  s.cur = 0; s.left = 4; s.hands[0] = [I['Tokyo'], I['Atlanta'], I['Lima']];
  assert.throws(() => E.apply(s, 0, { t: 'drive', to: I['Paris'] }));
  let t = E.apply(s, 0, { t: 'drive', to: I['Chicago'] });
  assert.equal(t.pawns[0], I['Chicago']);
  t = E.apply(s, 0, { t: 'direct', to: I['Tokyo'] });
  assert.equal(t.pawns[0], I['Tokyo']); assert.ok(!t.hands[0].includes(I['Tokyo']));
  t = E.apply(s, 0, { t: 'charter', to: I['Sydney'] });
  assert.equal(t.pawns[0], I['Sydney']); assert.ok(!t.hands[0].includes(I['Atlanta']));
  assert.throws(() => E.apply(s, 0, { t: 'shuttle', to: I['Paris'] }));
  s.stations.push(I['Paris']);
  t = E.apply(s, 0, { t: 'shuttle', to: I['Paris'] });
  assert.equal(t.pawns[0], I['Paris']);
  assert.throws(() => E.apply(s, 1, { t: 'drive', to: I['Chicago'] }), /turn/);
});
test('build: needs the city card (not the Operations Expert); 7th station moves one', () => {
  const s = blank({ roles: [ROLE('scientist'), ROLE('ops')] });
  s.cur = 0; s.left = 4; s.pawns[0] = I['Lima']; s.hands[0] = [I['Lima']];
  let t = E.apply(s, 0, { t: 'build' });
  assert.ok(t.stations.includes(I['Lima'])); assert.equal(t.hands[0].length, 0);
  s.stations = [0, 1, 2, 3, 4, 5].map(i => i + 6);
  assert.throws(() => E.apply(s, 0, { t: 'build' }));
  t = E.apply(s, 0, { t: 'build', remove: 6 });
  assert.equal(t.stations.length, 6); assert.ok(!t.stations.includes(6));
  const o = blank({ roles: [ROLE('ops'), ROLE('medic')] });
  o.cur = 0; o.left = 4; o.pawns[0] = I['Lima']; o.hands[0] = [];
  t = E.apply(o, 0, { t: 'build' });
  assert.ok(t.stations.includes(I['Lima']));
});
test('Operations Expert: station to anywhere, once a turn, any city card', () => {
  const s = blank({ roles: [ROLE('ops'), ROLE('medic')] });
  s.cur = 0; s.left = 4; s.hands[0] = [I['Lima'], I['Paris']];
  let t = E.apply(s, 0, { t: 'opsmove', to: I['Tokyo'], card: I['Lima'] });
  assert.equal(t.pawns[0], I['Tokyo']);
  t.stations.push(I['Tokyo']);
  assert.throws(() => E.apply(t, 0, { t: 'opsmove', to: I['Cairo'], card: I['Paris'] }));
});
test('share knowledge: matching card only, Researcher gives any; hand limit discard', () => {
  const s = blank({ roles: [ROLE('scientist'), ROLE('medic')] });
  s.cur = 0; s.left = 4; s.hands[0] = [I['Atlanta'], I['Lima']]; s.hands[1] = [];
  assert.throws(() => E.apply(s, 0, { t: 'give', to: 1, card: I['Lima'] }));
  let t = E.apply(s, 0, { t: 'give', to: 1, card: I['Atlanta'] });
  assert.deepEqual(t.hands[1], [I['Atlanta']]);
  const r = blank({ roles: [ROLE('researcher'), ROLE('medic')] });
  r.cur = 1; r.left = 4; r.hands[0] = [I['Lima']]; r.hands[1] = [1, 2, 3, 4, 5, 6, 7];
  t = E.apply(r, 1, { t: 'take', from: 0, card: I['Lima'] });
  assert.equal(t.hands[1].length, 8);
  assert.equal(t.phase, 'discard');
  assert.deepEqual(E.toAct(t), [1]);
  t = E.apply(t, 1, { t: 'discard', card: 3 });
  assert.equal(t.phase, 'actions'); assert.equal(t.left, 3);
});
test('cure: 5 cards at a station, Scientist 4, win with all four', () => {
  const s = blank({ roles: [ROLE('medic'), ROLE('scientist')] });
  const blues = D.CITIES.filter(c => c.color === 0).map(c => c.i);
  s.cur = 0; s.left = 4; s.hands[0] = blues.slice(0, 4);
  assert.throws(() => E.apply(s, 0, { t: 'cure', color: 0 }));
  s.hands[0] = blues.slice(0, 5);
  let t = E.apply(s, 0, { t: 'cure', color: 0 });
  assert.equal(t.cured[0], 1); assert.equal(t.hands[0].length, 0);
  const sc = blank({ roles: [ROLE('scientist'), ROLE('medic')] });
  sc.cur = 0; sc.left = 4; sc.hands[0] = blues.slice(0, 4); sc.cured = [0, 1, 1, 1];
  t = E.apply(sc, 0, { t: 'cure', color: 0 });
  assert.deepEqual(t.over, { win: true, why: 'cured' });
});
test('losing: 8 outbreaks, no cubes, no cards', () => {
  const s = blank();
  s.outbreaks = 7; setCubes(s, 'Lima', 3); s.cur = 0; s.left = 1; s.pdeck.push(1, 2); s.layers = [];
  s.ideck.splice(s.ideck.length - 1, 1, I['Lima']);
  let t = E.apply(s, 0, { t: 'end' });
  assert.equal(t.over.why, 'outbreaks');
  const c = blank();
  c.supply[1] = 0; c.cur = 0; c.left = 1; c.pdeck.push(1, 2); c.layers = [];
  c.ideck.splice(c.ideck.length - 1, 1, I['Lima']);
  t = E.apply(c, 0, { t: 'end' });
  assert.equal(t.over.why, 'cubes');
  const d = blank(); d.cur = 0; d.left = 1; d.pdeck = [3];
  t = E.apply(d, 0, { t: 'end' });
  assert.equal(t.over.why, 'cards');
});

// ------------------------------------------------------------------ events
test('events: airlift, grant, quiet night, resilient population, forecast, planner', () => {
  const s = blank({ roles: [ROLE('planner'), ROLE('medic')] });
  s.cur = 0; s.left = 4; s.hands[1] = [D.EV.airlift, D.EV.grant, D.EV.quiet, D.EV.resilient, D.EV.forecast];
  let t = E.apply(s, 1, { t: 'event', card: D.EV.airlift, who: 0, to: I['Tokyo'] });
  assert.equal(t.pawns[0], I['Tokyo']);
  t = E.apply(t, 1, { t: 'event', card: D.EV.grant, city: I['Lima'] });
  assert.ok(t.stations.includes(I['Lima']));
  const gone = t.idisc[0];
  t = E.apply(t, 1, { t: 'event', card: D.EV.resilient, city: gone });
  assert.ok(t.iremoved.includes(gone) && !t.idisc.includes(gone));
  t = E.apply(t, 1, { t: 'event', card: D.EV.forecast });
  assert.equal(t.phase, 'forecast'); assert.deepEqual(E.toAct(t), [1]);
  const order = t.pend.cards.slice().reverse();
  t = E.apply(t, 1, { t: 'forecast', order });
  assert.equal(t.phase, 'actions');
  assert.deepEqual(t.ideck.slice(-6).reverse(), order);
  assert.deepEqual(t.layers.slice(0, 6), order.map(c => [c]));
  t = E.apply(t, 1, { t: 'event', card: D.EV.quiet });
  assert.equal(t.quiet, true);
  // planner keeps an event from the discard pile; playing it removes it from the game
  t = E.apply(t, 0, { t: 'cptake', card: D.EV.airlift });
  assert.equal(t.cp, D.EV.airlift);
  t = E.apply(t, 0, { t: 'event', card: D.EV.airlift, who: 1, to: I['Cairo'] });
  assert.equal(t.cp, -1); assert.ok(t.premoved.includes(D.EV.airlift)); assert.ok(!t.pdisc.includes(D.EV.airlift));
  // quiet night: no infection this turn
  t.left = 1; t.pdeck.push(1, 2);
  const before = t.idisc.length;
  t = E.apply(t, 0, { t: 'end' });
  assert.equal(t.idisc.length, before);
  assert.equal(t.quiet, false);
});
test('Resilient Population can be played between Infect and Intensify', () => {
  const s = blank();
  s.cur = 0; s.left = 1; s.hands[1] = [D.EV.resilient];
  s.pdeck.push(D.EPIDEMIC, 5);
  const bottom = s.ideck[0];
  let t = E.apply(s, 0, { t: 'end' });
  assert.equal(t.phase, 'rpwin'); assert.deepEqual(E.toAct(t), [1]);
  t = E.apply(t, 1, { t: 'event', card: D.EV.resilient, city: bottom });
  assert.ok(t.iremoved.includes(bottom));
  assert.ok(!t.layers.flat().includes(bottom) && !t.idisc.includes(bottom));
});

// ------------------------------------------------------------------ whole games, random and computer
function invariants(s) {
  const board = s.cubes.reduce((a, b) => a + b, 0);
  assert.equal(board + s.supply.reduce((a, b) => a + b, 0), 96);
  assert.ok(s.cubes.every(x => x >= 0 && x <= 3));
  const cards = s.hands.flat().length + s.pdeck.length + s.pdisc.length + s.premoved.length + (s.cp >= 0 ? 1 : 0);
  assert.equal(cards, 53 + s.epidemics);
  assert.equal(s.ideck.length + s.idisc.length + s.iremoved.length, 48);
  // the known layers are exactly the top of the infection deck
  const known = s.layers.flat();
  const top = s.ideck.slice(s.ideck.length - known.length).sort((a, b) => a - b);
  assert.deepEqual(top, known.slice().sort((a, b) => a - b));
  assert.ok(s.stations.length <= 6);
  if (!s.over) assert.ok(E.toAct(s).length > 0);
}
function randomMove(s, rng) {
  const seat = E.toAct(s)[Math.floor(rng() * E.toAct(s).length)];
  if (s.phase === 'actions') {
    const L = E.legalActions(s);
    return [seat, L[Math.floor(rng() * L.length)]];
  }
  return [seat, B.decide(s, seat)];
}
test('random legal play never breaks the rules engine (300 games)', () => {
  let r = 99;
  const rng = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  let wins = 0;
  for (let g = 0; g < 300; g++) {
    let s = E.newGame({ players: 2 + (g % 3), epidemics: 4 + (g % 3), seed: g + 1 });
    let steps = 0;
    while (!s.over && steps++ < 3000) {
      // sometimes play an event out of turn
      if (rng() < 0.05 && E.canPlayEventNow(s)) {
        const p = Math.floor(rng() * s.n);
        const ev = s.hands[p].find(D.isEvent);
        if (ev === D.EV.quiet) { s = E.apply(s, p, { t: 'event', card: ev }); invariants(s); continue; }
      }
      const [seat, a] = randomMove(s, rng);
      s = E.apply(s, seat, a);
      invariants(s);
      assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
    }
    assert.ok(s.over, 'game ended');
    if (s.over.win) wins++;
  }
  assert.ok(wins < 300);
});
test('computer teammates play full games (all sizes and levels)', () => {
  for (const players of [2, 3, 4]) for (const epidemics of [4, 6]) {
    let s = E.newGame({ players, epidemics, seed: 77 + players + epidemics });
    while (!s.over) {
      const seat = E.toAct(s)[0];
      s = E.apply(s, seat, B.decide(s, seat));
      invariants(s);
    }
  }
});

// ------------------------------------------------------------------ secrecy (online)
test('public view hides deck orders and hidden hands; private view only your own hand', () => {
  let r = 5;
  const rng = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const s = G.game.setup(3, { epidemics: 5 }, rng, [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }, { kind: 'computer' }]);
  const pub = G.game.publicView(s);
  assert.equal(pub.pdeck, undefined); assert.equal(pub.ideck, undefined); assert.equal(pub.rng, undefined);
  assert.equal(pub.open, false);
  const ps = JSON.stringify(pub);
  assert.deepEqual(pub.hands[0], []); assert.deepEqual(pub.hands[1], []);
  assert.deepEqual(pub.hands[2], s.hands[2]); // computers say their cards out loud
  assert.deepEqual(G.game.privateView(s, 0), { hand: s.hands[0] });
  assert.ok(!JSON.stringify(G.game.privateView(s, 1)).includes(JSON.stringify(s.hands[0])));
  assert.ok(!ps.includes('"pdeck"'));
  const v = G.viewFromSnap({ pub, mine: G.game.privateView(s, 1), mySeat: 1 });
  assert.deepEqual(v.hands[1], s.hands[1]); assert.deepEqual(v.hands[0], []);
  // introductory: open hands
  const o = G.game.setup(2, { epidemics: 4 }, rng, [{ kind: 'human' }, { kind: 'human' }]);
  assert.deepEqual(G.game.publicView(o).hands, o.hands);
});

// ------------------------------------------------------------------ odds
test('epidemic chances: exact small cases', () => {
  const close = (a, b) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-12, a + ' vs ' + b));
  close(O.epidemicChances({ piles: [3, 3], pdeckCount: 6, epiDrawn: 0, draws: 2 }), [1 / 3, 2 / 3, 0]);
  close(O.epidemicChances({ piles: [2, 2], pdeckCount: 3, epiDrawn: 0, draws: 2 }), [0, 1 / 2, 1 / 2]);
  close(O.epidemicChances({ piles: [2, 2], pdeckCount: 3, epiDrawn: 1, draws: 2 }), [1 / 2, 1 / 2, 0]);
  close(O.epidemicChances({ piles: [10, 10], pdeckCount: 14, epiDrawn: 1, draws: 2 }), [1, 0, 0]);
  close(O.epidemicChances({ piles: [10, 10], pdeckCount: 14, epiDrawn: 0, draws: 2 }), [0.5, 0.5, 0]);
  close(O.epidemicChances({ piles: [10, 10], pdeckCount: 12, epiDrawn: 0, draws: 2 }), [0, 1, 0]);
});
// Exact case: only one card is unseen, so it must be the Epidemic's bottom card. It goes into the
// discard pile before Intensify, so it is back on top with the other 47: drawn 2 times in 48.
test('epidemic odds: the bottom card is shuffled back on top', () => {
  const close = (a, b) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-12, a + ' vs ' + b));
  const c0 = 7;
  const v = { layers: [], idisc: Array.from({ length: 48 }, (_, i) => i).filter(i => i !== c0), iremoved: [], rate: 0,
    piles: [2], pdeckCount: 2, epiDrawn: 0, cubes: new Array(192).fill(0), erad: [0, 0, 0, 0] };
  const o = O.infectionOdds(v, 2, null);
  close([o.epidemic[0], o.epidemic[1]], [0, 1]);
  close([o.epi[c0]], [1]);
  close([o.draw[c0], o.draw[c0 === 0 ? 1 : 0]], [2 / 48, 2 / 48]);
});
// Monte Carlo: reshuffle everything the players cannot know, run the real engine to the end of the
// Infect step, and compare how often each city is drawn with the exact odds.
test('infection odds match the real engine (Monte Carlo, incl. epidemics)', () => {
  let r = 11;
  const rng = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // play until the player deck is right before a pile boundary (high epidemic chance) with known layers
  let s = E.newGame({ players: 2, epidemics: 6, seed: 4242 });
  let guard = 0;
  while (guard++ < 2000) {
    const seat = E.toAct(s)[0];
    s = E.apply(s, seat, B.decide(s, seat));
    if (s.over) { s = E.newGame({ players: 2, epidemics: 6, seed: 4242 + guard }); continue; }
    const pe = O.epidemicChances({ piles: s.piles, pdeckCount: s.pdeck.length, epiDrawn: s.epiDrawn, draws: 2 });
    if (s.phase === 'actions' && s.layers.length && pe[1] > 0.25 && s.cur === 0 && s.left === 4) break;
  }
  const v = E.publicView(s);
  const odds = O.infectionOdds(v, 2, O.protectedCities(v));
  const n = 6000, seen = new Float64Array(48);
  let epis = 0;
  for (let k = 0; k < n; k++) {
    const t = E.clone(s);
    t.rng = (rng() * 4294967296) >>> 0;
    // reshuffle the unknown: within each known layer, within the never-seen rest, within each pile's remaining cards
    const known = t.layers.reduce((a, l) => a + l.length, 0);
    let pos = t.ideck.length;
    for (const L of t.layers) { const seg = shuf(t.ideck.slice(pos - L.length, pos)); t.ideck.splice(pos - L.length, L.length, ...seg); pos -= L.length; }
    const rest = shuf(t.ideck.slice(0, t.ideck.length - known)); t.ideck.splice(0, rest.length, ...rest);
    const total = t.piles.reduce((a, b) => a + b, 0);
    let start = 0, drawn = total - t.pdeck.length;
    for (const size of t.piles) {
      const a = Math.max(start, drawn), b = start + size;
      if (a < b) { // positions a..b-1 counted from the top -> indexes in the array
        const lo = t.pdeck.length - (b - drawn), hi = t.pdeck.length - (a - drawn);
        const seg = shuf(t.pdeck.slice(lo, hi)); t.pdeck.splice(lo, hi - lo, ...seg);
      }
      start = b;
    }
    t.eventPause = false; t.human = t.human.map(() => false);
    for (let p = 0; p < t.n; p++) t.hands[p] = t.hands[p].filter(c => !D.isEvent(c)); // no events interfering
    t.cp = -1;
    const before = t.epiDrawn;
    const u = E.apply(t, 0, { t: 'end' });
    let w = u;
    while (!w.over && w.phase !== 'actions') { const seat = E.toAct(w)[0]; w = E.apply(w, seat, B.decide(w, seat)); }
    if (w.epiDrawn > before) epis++;
    const disc = w.idisc.slice();
    // with an epidemic, the discard holds only this turn's draws; without, the old discard + new draws
    const fresh = w.epiDrawn > before ? disc : disc.slice(s.idisc.length);
    fresh.forEach(c => { seen[c]++; });
  }
  assert.ok(Math.abs(epis / n - (odds.epidemic[1] + odds.epidemic[2])) < 0.03, 'epidemic rate ' + epis / n + ' vs ' + (odds.epidemic[1] + odds.epidemic[2]));
  let worst = 0;
  for (let c = 0; c < 48; c++) worst = Math.max(worst, Math.abs(seen[c] / n - odds.draw[c]));
  assert.ok(worst < 0.03, 'largest gap ' + worst);
});
