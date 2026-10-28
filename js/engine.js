/* Pandemic rules engine (2013 2nd edition). Pure and JSON-safe: the whole game is one plain
   object, randomness comes from a seeded generator stored inside it, and
   apply(state, seat, action) returns the next state or throws on an illegal move.
   publicView() leaves out the order of both decks (the only secrets in this co-op game). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.PanEngine = factory(root.PanData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const { CITIES, N, ATLANTA, EVENTS, EV, EPIDEMIC, ROLES, RATE_TRACK, MAX_OUTBREAKS, CUBES_PER_COLOR, MAX_STATIONS, HAND_LIMIT, DEAL } = D;
  const isCity = D.isCity, isEvent = D.isEvent;

  // ---------------------------------------------------------------- randomness (mulberry32)
  function rnd(s) {
    let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }

  // fast deep copy (state is plain arrays and numbers)
  function clone(s) {
    const c = Object.assign({}, s);
    c.cubes = s.cubes.slice(); c.supply = s.supply.slice(); c.cured = s.cured.slice(); c.erad = s.erad.slice();
    c.stations = s.stations.slice(); c.pawns = s.pawns.slice(); c.hands = s.hands.map(h => h.slice());
    c.pdeck = s.pdeck.slice(); c.pdisc = s.pdisc.slice(); c.premoved = s.premoved.slice();
    c.ideck = s.ideck.slice(); c.idisc = s.idisc.slice(); c.iremoved = s.iremoved.slice();
    c.layers = s.layers.map(l => l.slice()); c.queue = s.queue.slice(); c.passed = s.passed.slice();
    c.log = s.log; c.hist = s.hist; // append-only, copied on write
    c.pend = s.pend ? JSON.parse(JSON.stringify(s.pend)) : null;
    return c;
  }

  const roleKey = (s, p) => ROLES[s.roles[p]].key;
  const seatOf = (s, key) => s.roles.findIndex(r => ROLES[r].key === key);
  const cname = c => CITIES[c].name;

  function log(s, msg) {
    s.log = s.log.concat([{ t: s.turn, m: msg }]);
    if (s.log.length > 120) s.log = s.log.slice(-120);
  }

  // ---------------------------------------------------------------- setup
  // o = {players 2-4, epidemics 4|5|6 (7 = Legendary variant), seed, roles: [role index or -1], names, human: [bool], eventPause,
  //      extra: true = "Extra roles & events" (3 more roles; 2 events per player drawn from all 8, the expansion's rule)}
  function newGame(o) {
    o = o || {};
    const n = Math.max(2, Math.min(4, o.players | 0 || 2));
    const E = [4, 5, 6, 7].includes(o.epidemics) ? o.epidemics : 5;
    const xo = !!o.extra;
    const s = {
      v: 1, rng: (o.seed >>> 0) || 1, n, epidemics: E,
      roles: [], names: [], human: [],
      cubes: new Array(N * 4).fill(0), supply: [CUBES_PER_COLOR, CUBES_PER_COLOR, CUBES_PER_COLOR, CUBES_PER_COLOR],
      cured: [0, 0, 0, 0], erad: [0, 0, 0, 0], stations: [ATLANTA], pawns: new Array(n).fill(ATLANTA), hands: [],
      cp: -1, pdeck: [], pdisc: [], premoved: [], piles: [], epiDrawn: 0,
      ideck: [], idisc: [], iremoved: [], layers: [],
      rate: 0, outbreaks: 0, cur: 0, left: 4, opsUsed: false, quiet: false,
      phase: 'actions', pend: null, queue: [], passed: [], over: null, turn: 1,
      eventPause: o.eventPause !== false, log: [], hist: [],
      open: typeof o.openHands === 'boolean' ? o.openHands : E === 4, // rulebook: face up only in the Introductory game
    };
    if (xo) { s.extra = true; s.ban = -1; s.grabbed = false; }
    // roles: chosen ones first, the rest drawn at random without repeats
    const allowed = xo ? ROLES.map((r, i) => i) : D.BASE_ROLES;
    const want = (o.roles || []).slice(0, n);
    const pool = shuffle(s, allowed.filter(i => !want.includes(i)));
    for (let p = 0; p < n; p++) {
      const r = want[p];
      s.roles.push(Number.isInteger(r) && allowed.includes(r) && !s.roles.includes(r) ? r : pool.shift());
      s.names.push(String((o.names && o.names[p]) || 'Player ' + (p + 1)).slice(0, 24));
      s.human.push(!!(o.human && o.human[p]));
    }
    // infection: 3 cities with 3 cubes, 3 with 2, 3 with 1
    s.ideck = shuffle(s, CITIES.map(c => c.i));
    s.setup = true;
    for (let k = 0; k < 9; k++) {
      const c = s.ideck.pop();
      infect(s, c, CITIES[c].color, 3 - Math.floor(k / 3), null);
      s.idisc.push(c);
    }
    delete s.setup;
    // player deck: 48 cities + 5 events, deal, then E piles each with one Epidemic (bigger piles on top)
    const events = xo ? shuffle(s, EVENTS.map(e => e.id)).slice(0, 2 * n) : D.BASE_EVENTS;
    const cards = shuffle(s, CITIES.map(c => c.i).concat(events));
    for (let p = 0; p < n; p++) s.hands.push(cards.splice(cards.length - DEAL[n], DEAL[n]));
    const R = cards.length, base = Math.floor(R / E), extra = R % E;
    const piles = [];
    for (let k = 0; k < E; k++) {
      const size = base + (k < extra ? 1 : 0);
      piles.push(shuffle(s, cards.splice(cards.length - size, size).concat([EPIDEMIC])));
    }
    // deck array: top is the last element, so push the bottom pile first
    for (let k = E - 1; k >= 0; k--) s.pdeck.push(...piles[k]);
    s.piles = piles.map(p => p.length); // top pile first
    // first player: highest population among city cards in hand
    let best = -1;
    for (let p = 0; p < n; p++) for (const c of s.hands[p]) if (isCity(c) && (best < 0 || CITIES[c].pop > s._bp)) { best = p; s._bp = CITIES[c].pop; }
    delete s._bp;
    s.cur = best < 0 ? 0 : best;
    s.first = s.cur;
    s.left = actionsFor(s, s.cur);
    log(s, 'First player: ' + s.names[s.cur] + ' (biggest city in hand).');
    s.hist.push(snapStats(s));
    return s;
  }

  function snapStats(s) {
    let cubes = 0;
    for (let c = 0; c < 4; c++) cubes += CUBES_PER_COLOR - s.supply[c];
    return { turn: s.turn, out: s.outbreaks, cubes, cured: s.cured.reduce((a, b) => a + b, 0), epi: s.epiDrawn, deck: s.pdeck.length };
  }

  // ---------------------------------------------------------------- cubes
  function isProtected(s, c, col) {
    if (s.setup) return false; // pawns are not on the board yet while the first 9 cities are infected
    for (let p = 0; p < s.n; p++) {
      const k = roleKey(s, p), at = s.pawns[p];
      if (k === 'quarantine' && (at === c || CITIES[at].adj.includes(c))) return true;
      if (k === 'medic' && at === c && s.cured[col]) return true;
    }
    return false;
  }
  function lose(s, why) { if (!s.over) { s.over = { win: false, why }; s.phase = 'over'; s.queue = []; s.pend = null; } }
  function place(s, c, col, n) {
    for (let i = 0; i < n; i++) {
      if (s.supply[col] === 0) { lose(s, 'cubes'); log(s, 'No ' + D.COLOR_NAMES[col].toLowerCase() + ' cubes left.'); return; }
      s.supply[col]--; s.cubes[c * 4 + col]++;
    }
  }
  // add n cubes of col to city c; outbreak if it would go over 3. chain = cities that already outbroke this chain
  function infect(s, c, col, n, chain) {
    if (s.over || s.erad[col] || isProtected(s, c, col)) return;
    const have = s.cubes[c * 4 + col];
    if (have + n > 3) {
      place(s, c, col, 3 - have);
      if (!s.over) outbreak(s, c, col, chain || []);
    } else place(s, c, col, n);
  }
  function outbreak(s, c, col, chain) {
    if (chain.includes(c)) return;
    chain.push(c);
    s.outbreaks++;
    log(s, 'Outbreak in ' + cname(c) + '!');
    s.lastOut = (s.lastOut || []).concat([c]);
    if (s.outbreaks >= MAX_OUTBREAKS) { lose(s, 'outbreaks'); return; }
    for (const v of CITIES[c].adj) {
      if (chain.includes(v)) continue;
      infect(s, v, col, 1, chain);
      if (s.over) return;
    }
  }
  function checkErad(s, col) {
    if (s.cured[col] && !s.erad[col] && s.supply[col] === CUBES_PER_COLOR) { s.erad[col] = 1; log(s, D.COLOR_NAMES[col] + ' is eradicated.'); }
  }
  function removeCubes(s, c, col, n) {
    const k = c * 4 + col, m = Math.min(n, s.cubes[k]);
    s.cubes[k] -= m; s.supply[col] += m;
    checkErad(s, col);
    return m;
  }
  // Medic: cured colours vanish from the Medic's city
  function medicSweep(s) {
    const m = seatOf(s, 'medic');
    if (m < 0 || m >= s.n) return;
    const c = s.pawns[m];
    for (let col = 0; col < 4; col++) if (s.cured[col] && s.cubes[c * 4 + col]) removeCubes(s, c, col, 3);
  }
  function movePawn(s, who, to) {
    s.pawns[who] = to;
    const k = roleKey(s, who);
    if (k === 'medic') medicSweep(s);
    else if (k === 'responder') {
      // entering a city with 2+ cubes of a colour removes 1 of them
      for (let col = 0; col < 4; col++) if (s.cubes[to * 4 + col] >= 2) removeCubes(s, to, col, 1);
    }
  }
  const actionsFor = (s, p) => (roleKey(s, p) === 'veteran' ? 5 : 4);
  // infection cards flipped in the next Infect step (Travel Ban: 1 until the player who played it starts a turn)
  const infectRate = s => (s.ban >= 0 ? 1 : RATE_TRACK[s.rate]);

  // ---------------------------------------------------------------- whose move
  const holdsEvent = (s, p) => s.hands[p].some(isEvent) || (roleKey(s, p) === 'planner' && s.cp >= 0);
  const holds = (s, p, card) => s.hands[p].includes(card) || (roleKey(s, p) === 'planner' && s.cp === card);
  function windowSeats(s) {
    const out = [];
    for (let p = 0; p < s.n; p++) {
      if (p === s.cur || s.passed.includes(p) || !holdsEvent(s, p)) continue;
      if (s.human[p] && !s.eventPause) continue;
      out.push(p);
    }
    return out;
  }
  function rpSeats(s) {
    const out = [];
    for (let p = 0; p < s.n; p++) if (!s.passed.includes(p) && holds(s, p, EV.resilient)) out.push(p);
    return out;
  }
  function toAct(s) {
    if (s.over) return [];
    switch (s.phase) {
      case 'actions': return [s.cur];
      case 'discard': case 'forecast': return [s.pend.seat];
      case 'window': {
        const others = windowSeats(s);
        if (s.human[s.cur]) return [s.cur].concat(others);
        return others.length ? others : [s.cur];
      }
      case 'rpwin': return rpSeats(s);
      default: return [];
    }
  }

  // ---------------------------------------------------------------- end of turn
  function endActions(s) {
    s.phase = 'resolve';
    if (s.pdeck.length < 2) { lose(s, 'cards'); log(s, 'Not enough player cards left to draw.'); return; }
    s.queue = ['draw', 'draw', 'limit', 'window', 'infect', 'next'];
    run(s);
  }
  function run(s) {
    while (!s.over && s.phase === 'resolve' && s.queue.length) {
      const st = s.queue.shift();
      if (st === 'draw') {
        const card = s.pdeck.pop();
        if (card === EPIDEMIC) epidemic(s);
        else { s.hands[s.cur].push(card); s.lastDraw = (s.lastDraw || []).concat([card]); }
      } else if (st === 'intensify') {
        const layer = shuffle(s, s.idisc.slice());
        s.idisc = [];
        if (layer.length) { s.ideck.push(...layer); s.layers.unshift(layer.slice().sort((a, b) => a - b)); }
        log(s, 'Intensify: ' + layer.length + ' infection cards shuffled back on top.');
      } else if (st === 'rpwin') {
        s.passed = [];
        if (rpSeats(s).length) { s.phase = 'rpwin'; return; }
      } else if (st === 'limit') {
        if (s.hands[s.cur].length > HAND_LIMIT) { s.phase = 'discard'; s.pend = { seat: s.cur, back: 'resolve' }; return; }
      } else if (st === 'window') {
        s.passed = [];
        if (windowSeats(s).length || holdsEvent(s, s.cur)) { s.phase = 'window'; return; }
      } else if (st === 'infect') {
        if (s.quiet) { s.quiet = false; log(s, 'One Quiet Night: no infections.'); continue; }
        const r = infectRate(s);
        for (let i = 0; i < r && !s.over && s.ideck.length; i++) {
          const c = drawTop(s);
          infect(s, c, CITIES[c].color, 1, null);
          s.idisc.push(c);
          s.lastInf = (s.lastInf || []).concat([c]);
        }
      } else if (st === 'next') {
        s.cur = (s.cur + 1) % s.n; s.left = actionsFor(s, s.cur); s.opsUsed = false; s.turn++;
        if (s.extra) { s.grabbed = false; if (s.ban === s.cur) { s.ban = -1; log(s, 'Travel Ban ends.'); } }
        s.phase = 'actions'; s.passed = [];
        s.hist = s.hist.concat([snapStats(s)]);
      }
    }
  }
  function drawTop(s) {
    const c = s.ideck.pop();
    if (s.layers.length) {
      const L = s.layers[0], k = L.indexOf(c);
      if (k >= 0) L.splice(k, 1);
      if (!L.length) s.layers.shift();
    }
    return c;
  }
  function epidemic(s) {
    s.epiDrawn++;
    s.premoved.push(EPIDEMIC);
    s.rate = Math.min(RATE_TRACK.length - 1, s.rate + 1);
    // no infection card left to take from the bottom (every card is in the discard pile or removed): the rulebook
    // has no case for it, so the Infect step does nothing and Intensify still puts the discard pile back on top
    if (!s.ideck.length) {
      log(s, 'Epidemic! No infection cards left to flip.');
      s.queue.unshift('intensify');
      return;
    }
    const c = s.ideck.shift();
    const known = s.layers.reduce((a, l) => a + l.length, 0);
    if (known > s.ideck.length) { // the bottom card was inside the lowest known layer
      const L = s.layers[s.layers.length - 1], k = L.indexOf(c);
      if (k >= 0) L.splice(k, 1);
      if (!L.length) s.layers.pop();
    }
    log(s, 'Epidemic! ' + cname(c) + ' gets 3 cubes.');
    s.lastEpi = (s.lastEpi || []).concat([c]);
    infect(s, c, CITIES[c].color, 3, null);
    s.idisc.push(c);
    if (s.over) return;
    s.queue.unshift('rpwin', 'intensify');
  }
  function resume(s) { s.phase = 'resolve'; run(s); }

  // ---------------------------------------------------------------- legal moves
  function cityCards(h) { return h.filter(isCity); }
  function needFor(s, p) { return roleKey(s, p) === 'scientist' ? 4 : 5; }
  // every legal action for the current player in the action phase (events excluded)
  function legalActions(s) {
    const out = [];
    if (s.over || s.phase !== 'actions') return out;
    const p = s.cur, key = roleKey(s, p), hand = s.hands[p], here = s.pawns[p];
    const movers = key === 'dispatcher' ? Array.from({ length: s.n }, (_, i) => i) : [p];
    const stations = s.stations;
    for (const who of movers) {
      const at = s.pawns[who];
      for (const to of CITIES[at].adj) out.push({ t: 'drive', who, to });
      for (const c of hand) if (isCity(c) && c !== at) out.push({ t: 'direct', who, to: c });
      if (hand.includes(at)) for (let to = 0; to < N; to++) if (to !== at) out.push({ t: 'charter', who, to });
      if (stations.includes(at)) for (const to of stations) if (to !== at) out.push({ t: 'shuttle', who, to });
      if (key === 'dispatcher') {
        const dest = new Set();
        for (let q = 0; q < s.n; q++) if (q !== who && s.pawns[q] !== at) dest.add(s.pawns[q]);
        for (const to of dest) out.push({ t: 'dispatch', who, to });
      }
    }
    if (key === 'ops' && !s.opsUsed && stations.includes(here)) {
      const cc = cityCards(hand);
      if (cc.length) for (let to = 0; to < N; to++) if (to !== here) for (const card of cc) out.push({ t: 'opsmove', to, card });
    }
    if (!stations.includes(here) && (key === 'ops' || hand.includes(here))) {
      if (stations.length < MAX_STATIONS) out.push({ t: 'build' });
      else for (const r of stations) out.push({ t: 'build', remove: r });
    }
    for (let col = 0; col < 4; col++) if (s.cubes[here * 4 + col]) out.push({ t: 'treat', color: col });
    for (let q = 0; q < s.n; q++) {
      if (q === p || s.pawns[q] !== here) continue;
      for (const c of hand) if (isCity(c) && (c === here || key === 'researcher')) out.push({ t: 'give', to: q, card: c });
      for (const c of s.hands[q]) if (isCity(c) && (c === here || roleKey(s, q) === 'researcher')) out.push({ t: 'take', from: q, card: c });
    }
    if (stations.includes(here)) {
      for (let col = 0; col < 4; col++) {
        if (s.cured[col]) continue;
        if (hand.filter(c => isCity(c) && CITIES[c].color === col).length >= needFor(s, p)) out.push({ t: 'cure', color: col });
      }
    }
    if (key === 'planner' && s.cp < 0) for (const c of s.pdisc) if (isEvent(c)) out.push({ t: 'cptake', card: c });
    if (key === 'analyst' && !s.grabbed) {
      for (let q = 0; q < s.n; q++) if (q !== p && s.pawns[q] === here) for (const c of s.hands[q]) if (isCity(c)) out.push({ t: 'grab', from: q, card: c });
    }
    out.push({ t: 'end' });
    return out;
  }

  // ---------------------------------------------------------------- doing things
  function bad(msg) { throw new Error(msg || 'Illegal move'); }
  const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  function takeCard(h, c) { const k = h.indexOf(c); if (k < 0) bad('Card not in hand'); h.splice(k, 1); }

  function doAction(s, a) {
    const p = s.cur, key = roleKey(s, p), hand = s.hands[p], here = s.pawns[p];
    const who = a.who === undefined ? p : a.who;
    if (!int(who, 0, s.n - 1)) bad();
    if (who !== p && key !== 'dispatcher' && ['drive', 'direct', 'charter', 'shuttle', 'dispatch'].includes(a.t)) bad('Only the Dispatcher moves other pawns');
    const at = s.pawns[who];
    let receiver = -1;
    switch (a.t) {
      case 'drive':
        if (!int(a.to, 0, N - 1) || !CITIES[at].adj.includes(a.to)) bad('Not a linked city');
        movePawn(s, who, a.to); break;
      case 'direct':
        if (!int(a.to, 0, N - 1) || a.to === at) bad();
        takeCard(hand, a.to); s.pdisc.push(a.to); movePawn(s, who, a.to); break;
      case 'charter':
        if (!int(a.to, 0, N - 1) || a.to === at) bad();
        takeCard(hand, at); s.pdisc.push(at); movePawn(s, who, a.to); break;
      case 'shuttle':
        if (!int(a.to, 0, N - 1) || a.to === at || !s.stations.includes(at) || !s.stations.includes(a.to)) bad('Needs a station at both ends');
        movePawn(s, who, a.to); break;
      case 'dispatch':
        if (key !== 'dispatcher' || !int(a.to, 0, N - 1) || a.to === at) bad();
        if (!s.pawns.some((c, q) => q !== who && c === a.to)) bad('No other pawn there');
        movePawn(s, who, a.to); break;
      case 'opsmove':
        if (key !== 'ops' || s.opsUsed || !s.stations.includes(here) || !int(a.to, 0, N - 1) || a.to === here || !isCity(a.card)) bad();
        takeCard(hand, a.card); s.pdisc.push(a.card); s.opsUsed = true; movePawn(s, p, a.to); break;
      case 'build': {
        if (s.stations.includes(here)) bad('Already a station here');
        if (s.stations.length >= MAX_STATIONS) {
          if (!s.stations.includes(a.remove)) bad('Pick a station to move');
          s.stations.splice(s.stations.indexOf(a.remove), 1);
        } else if (a.remove !== undefined) bad();
        if (key !== 'ops') { takeCard(hand, here); s.pdisc.push(here); }
        s.stations.push(here); break;
      }
      case 'treat': {
        if (!int(a.color, 0, 3) || !s.cubes[here * 4 + a.color]) bad('No cubes of that colour here');
        removeCubes(s, here, a.color, key === 'medic' || s.cured[a.color] ? 3 : 1); break;
      }
      case 'give': case 'take': {
        const other = a.t === 'give' ? a.to : a.from;
        if (!int(other, 0, s.n - 1) || other === p || s.pawns[other] !== here || !isCity(a.card)) bad('You must be in the same city');
        const giver = a.t === 'give' ? p : other;
        receiver = a.t === 'give' ? other : p;
        if (a.card !== here && roleKey(s, giver) !== 'researcher') bad('Only the card for this city can be shared');
        takeCard(s.hands[giver], a.card); s.hands[receiver].push(a.card); break;
      }
      case 'cure': {
        if (!int(a.color, 0, 3) || s.cured[a.color] || !s.stations.includes(here)) bad();
        const need = needFor(s, p);
        let cards = Array.isArray(a.cards) ? a.cards.slice() : hand.filter(c => isCity(c) && CITIES[c].color === a.color).slice(0, need);
        if (cards.length !== need || new Set(cards).size !== need || cards.some(c => !isCity(c) || CITIES[c].color !== a.color || !hand.includes(c))) bad('Not enough cards of that colour');
        for (const c of cards) { takeCard(hand, c); s.pdisc.push(c); }
        s.cured[a.color] = 1;
        log(s, s.names[p] + ' cured ' + D.COLOR_NAMES[a.color].toLowerCase() + '!');
        checkErad(s, a.color);
        medicSweep(s);
        if (s.cured.every(Boolean)) { s.over = { win: true, why: 'cured' }; s.phase = 'over'; return; }
        break;
      }
      case 'cptake': {
        if (key !== 'planner' || s.cp >= 0 || !isEvent(a.card) || !s.pdisc.includes(a.card)) bad();
        s.pdisc.splice(s.pdisc.indexOf(a.card), 1); s.cp = a.card; break;
      }
      case 'grab': { // Analyst: once a turn, take any city card from a player in the same city, free
        if (key !== 'analyst' || s.grabbed || !int(a.from, 0, s.n - 1) || a.from === p || s.pawns[a.from] !== here || !isCity(a.card)) bad('Not now');
        takeCard(s.hands[a.from], a.card); hand.push(a.card);
        s.grabbed = true; s.left++; receiver = p; break;
      }
      case 'end': s.left = 1; break;
      default: bad('Unknown move');
    }
    s.left--;
    if (s.sim) return; // the planner's look-ahead: no log, no hand-limit stop, no end of turn
    if (a.t !== 'end') log(s, describe(s, p, a));
    const back = s.left <= 0 ? 'end' : 'actions';
    if (receiver >= 0 && s.hands[receiver].length > HAND_LIMIT) { s.phase = 'discard'; s.pend = { seat: receiver, back }; return; }
    if (back === 'end') endActions(s);
  }

  function describe(s, p, a) {
    const nm = s.names[p], who = a.who !== undefined && a.who !== p ? s.names[a.who] + ' ' : '';
    switch (a.t) {
      case 'drive': return nm + ' moved ' + who + 'to ' + cname(a.to) + '.';
      case 'direct': return nm + ' flew ' + who + 'to ' + cname(a.to) + '.';
      case 'charter': return nm + ' chartered ' + who + 'to ' + cname(a.to) + '.';
      case 'shuttle': return nm + ' shuttled ' + who + 'to ' + cname(a.to) + '.';
      case 'dispatch': return nm + ' sent ' + who + 'to ' + cname(a.to) + '.';
      case 'opsmove': return nm + ' flew from the station to ' + cname(a.to) + '.';
      case 'build': return nm + ' built a station in ' + cname(s.pawns[p]) + '.';
      case 'treat': return nm + ' treated ' + D.COLOR_NAMES[a.color].toLowerCase() + ' in ' + cname(s.pawns[p]) + '.';
      case 'give': return nm + ' gave ' + cname(a.card) + ' to ' + s.names[a.to] + '.';
      case 'take': return nm + ' took ' + cname(a.card) + ' from ' + s.names[a.from] + '.';
      case 'cptake': return nm + ' kept ' + D.cardName(a.card) + '.';
      case 'grab': return nm + ' took ' + cname(a.card) + ' from ' + s.names[a.from] + ' (free).';
      default: return nm + ' acted.';
    }
  }

  function canPlayEventNow(s) {
    return !s.over && ['actions', 'window', 'rpwin', 'discard'].includes(s.phase);
  }
  function playEvent(s, seat, a) {
    if (!canPlayEventNow(s)) bad('Not now');
    const card = a.card;
    if (!isEvent(card) || !holds(s, seat, card)) bad('You do not hold that event');
    const e = EVENTS[card - 48].key;
    // check targets before spending the card
    if (e === 'airlift' && (!int(a.who, 0, s.n - 1) || !int(a.to, 0, N - 1) || a.to === s.pawns[a.who])) bad('Pick a pawn and a new city');
    if (e === 'grant') {
      if (!int(a.city, 0, N - 1) || s.stations.includes(a.city)) bad('Pick a city without a station');
      if (s.stations.length >= MAX_STATIONS ? !s.stations.includes(a.remove) : a.remove !== undefined) bad('Pick a station to move');
    }
    if (e === 'resilient' && !s.idisc.includes(a.city)) bad('Pick a card in the infection discard pile');
    if (e === 'forecast' && !s.ideck.length) bad('The infection deck is empty');
    if (e === 'shift' && s.phase !== 'actions') bad('Play it during a turn’s actions');
    if (e === 'remote') {
      const left = s.cubes.slice();
      if (!Array.isArray(a.cubes) || a.cubes.length < 1 || a.cubes.length > 2) bad('Pick 1 or 2 cubes');
      for (const x of a.cubes) {
        if (!Array.isArray(x) || !int(x[0], 0, N - 1) || !int(x[1], 0, 3) || left[x[0] * 4 + x[1]] <= 0) bad('Pick cubes on the board');
        left[x[0] * 4 + x[1]]--;
      }
    }
    if (s.hands[seat].includes(card)) { takeCard(s.hands[seat], card); s.pdisc.push(card); }
    else { s.cp = -1; s.premoved.push(card); }
    const nm = s.names[seat];
    if (e === 'airlift') { movePawn(s, a.who, a.to); log(s, nm + ' airlifted ' + s.names[a.who] + ' to ' + cname(a.to) + '.'); }
    else if (e === 'grant') {
      if (a.remove !== undefined) s.stations.splice(s.stations.indexOf(a.remove), 1);
      s.stations.push(a.city); log(s, nm + ': Government Grant station in ' + cname(a.city) + '.');
    } else if (e === 'quiet') { s.quiet = true; log(s, nm + ' played One Quiet Night.'); }
    else if (e === 'resilient') {
      s.idisc.splice(s.idisc.indexOf(a.city), 1); s.iremoved.push(a.city);
      log(s, nm + ' removed ' + cname(a.city) + ' from the infection cards.');
    } else if (e === 'forecast') {
      const k = Math.min(6, s.ideck.length);
      const top = s.ideck.slice(s.ideck.length - k).reverse(); // top first
      s.pend = { seat, cards: top, prev: s.phase, prevPend: s.pend };
      s.phase = 'forecast';
      log(s, nm + ' played Forecast.');
    } else if (e === 'shift') { s.left += 2; log(s, nm + ' played Extra Shift: 2 more actions.'); }
    else if (e === 'remote') {
      for (const x of a.cubes) removeCubes(s, x[0], x[1], 1);
      log(s, nm + ' played Remote Care (' + a.cubes.map(x => cname(x[0])).join(', ') + ').');
    } else if (e === 'ban') { s.ban = seat; log(s, nm + ' played Travel Ban: 1 infection card per step until their next turn.'); }
    // a hand that was over the limit may now be fine
    if (s.phase === 'discard' && s.hands[s.pend.seat].length <= HAND_LIMIT) finishDiscard(s);
  }
  function finishDiscard(s) {
    const back = s.pend.back;
    s.pend = null;
    if (back === 'resolve') resume(s);
    else if (back === 'end') endActions(s);
    else s.phase = 'actions';
  }

  // ---------------------------------------------------------------- the one entry point
  function apply(state, seat, a) {
    if (!a || typeof a !== 'object' || typeof a.t !== 'string') bad('Bad move');
    if (state.over) bad('The game is over');
    const s = clone(state);
    s.lastOut = []; s.lastInf = []; s.lastEpi = []; s.lastDraw = [];
    if (!int(seat, 0, s.n - 1)) bad('Bad seat');
    if (a.t === 'event') playEvent(s, seat, a);
    else if (!toAct(s).includes(seat)) bad('Not your turn');
    else switch (s.phase) {
      case 'actions': doAction(s, a); break;
      case 'discard': {
        if (a.t !== 'discard' || seat !== s.pend.seat) bad('Discard a card first');
        takeCard(s.hands[seat], a.card); s.pdisc.push(a.card);
        log(s, s.names[seat] + ' discarded ' + D.cardName(a.card) + '.');
        if (s.hands[seat].length <= HAND_LIMIT) finishDiscard(s);
        break;
      }
      case 'forecast': {
        const want = s.pend.cards.slice().sort((x, y) => x - y).join();
        if (a.t !== 'forecast' || !Array.isArray(a.order) || a.order.slice().sort((x, y) => x - y).join() !== want) bad('Put back the same cards');
        const k = a.order.length;
        s.ideck.splice(s.ideck.length - k, k, ...a.order.slice().reverse());
        // the cards are now known exactly, in this order
        for (const c of a.order) for (let i = 0; i < s.layers.length; i++) { const j = s.layers[i].indexOf(c); if (j >= 0) s.layers[i].splice(j, 1); }
        s.layers = a.order.map(c => [c]).concat(s.layers.filter(l => l.length));
        const prev = s.pend.prev, pp = s.pend.prevPend;
        s.pend = pp || null; s.phase = prev;
        if (prev === 'discard' && s.hands[s.pend.seat].length <= HAND_LIMIT) finishDiscard(s);
        break;
      }
      case 'window': {
        if (a.t === 'go' && seat === s.cur) { s.passed = []; resume(s); }
        else if (a.t === 'pass' && seat !== s.cur) { s.passed.push(seat); }
        else bad('Tap Infect to go on');
        break;
      }
      case 'rpwin': {
        if (a.t !== 'pass') bad();
        s.passed.push(seat);
        if (!rpSeats(s).length) resume(s);
        break;
      }
      default: bad('Not now');
    }
    // the Resilient Population window closes when nobody holds it any more
    if (s.phase === 'rpwin' && !rpSeats(s).length) resume(s);
    return s;
  }

  // ---------------------------------------------------------------- views
  // Public: everything but the deck orders. Hands are face up in the Introductory game (or when the
  // group chooses open hands); otherwise each person's hand is private. Computer teammates always
  // tell you their cards (talking about your cards is allowed).
  function publicView(s) {
    const o = {};
    for (const k in s) if (k !== 'rng' && k !== 'pdeck' && k !== 'ideck' && k !== 'queue') o[k] = s[k];
    o.pdeckCount = s.pdeck.length;
    o.ideckCount = s.ideck.length;
    o.toAct = toAct(s);
    o.handN = s.hands.map(h => h.length);
    const v = JSON.parse(JSON.stringify(o));
    // (the Forecast cards stay public: players may tell each other what they saw)
    if (!s.open) v.hands = s.hands.map((h, p) => (s.human[p] ? [] : h.slice()));
    return v;
  }
  function privateView(s, seat) {
    return s.open || !(seat >= 0 && seat < s.n) ? {} : { hand: s.hands[seat].slice() };
  }
  // what one seat sees, as one object (the screens use this)
  function view(s, seat) {
    const v = publicView(s);
    const m = privateView(s, seat);
    if (m.hand) v.hands[seat] = m.hand;
    v.seat = seat;
    return v;
  }

  return { newGame, apply, toAct, legalActions, publicView, privateView, view, clone, rnd, shuffle, roleKey, seatOf, holds, holdsEvent, isProtected,
    needFor, canPlayEventNow, doAction, endActions, snapStats, actionsFor, infectRate };
});
