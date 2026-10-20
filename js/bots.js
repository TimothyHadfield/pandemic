/* Computer teammates and the planner. The planner looks ahead over the current player's
   remaining actions (beam search) and scores each end position: cures, how dangerous the cubes
   on the board are given the exact infection odds, progress towards each cure, stations and
   where the pawns stand. It only uses what every player can see (never the deck order). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./engine.js'), require('./odds.js'));
  else root.PanBots = factory(root.PanData, root.PanEngine, root.PanOdds);
})(typeof self !== 'undefined' ? self : this, function (D, E, O) {
  'use strict';
  const { CITIES, N, DIST, EV, EVENTS, ROLES, RATE_TRACK } = D;
  const isCity = D.isCity, isEvent = D.isEvent;

  // ------------------------------------------------------------ context computed once per decision
  // weights (tuned by measuring win rates with tools/measure.js; PAN_W env overrides for tuning)
  const W = { cured: 2200, cure: 1500, spare: 25, share: 60, toStation: 70, cube: 10, soon: 4, out: 120, cardCity: 7, cardEvent: 16, station: 30, near: 6 };
  const CUBE_W = [0, 0.6, 2.5, 8];
  if (typeof process !== 'undefined' && process.env && process.env.PAN_W) Object.assign(W, JSON.parse(process.env.PAN_W));

  function context(s) {
    const v = { layers: s.layers, idisc: s.idisc, iremoved: s.iremoved, rate: s.rate, piles: s.piles,
      pdeckCount: s.pdeck ? s.pdeck.length : s.pdeckCount, epiDrawn: s.epiDrawn, cubes: s.cubes, erad: s.erad, quiet: s.quiet };
    const odds = O.infectionOdds(v, O.drawsAhead(s), null);
    // chance each city is hit before this player's next turn (one Infect step per player),
    // plus a share for being in the discard pile (back on top after an Epidemic)
    const struct = O.structure(v);
    const far = new Float64Array(N);
    O.drawProbs(struct, RATE_TRACK[s.rate] * s.n, far, 1);
    const epiSoon = 1 - O.epidemicChances({ piles: s.piles, pdeckCount: v.pdeckCount, epiDrawn: s.epiDrawn, draws: 2 * s.n })[0];
    const soon = new Float64Array(N);
    const disc = new Set(s.idisc);
    const dn = s.idisc.length + 1;
    for (let c = 0; c < N; c++) {
      soon[c] = Math.max(odds.draw[c] + odds.epi[c], far[c]);
      if (disc.has(c)) soon[c] += epiSoon * Math.min(1, RATE_TRACK[Math.min(6, s.rate + 1)] * 2 / dn);
      if (soon[c] > 1) soon[c] = 1;
    }
    return { odds, soon };
  }

  // nearest station distance for a player (counting a flight they can pay for as one step)
  function stationDist(s, p) {
    const at = s.pawns[p];
    let best = 99;
    for (const st of s.stations) best = Math.min(best, DIST[at][st]);
    if (best > 1) {
      const h = s.hands[p];
      if (h.includes(at) && s.stations.length) best = Math.min(best, 1);
      for (const st of s.stations) if (h.includes(st)) best = Math.min(best, 1);
    }
    return best;
  }

  function evaluate(s, ctx) {
    if (s.over) return s.over.win ? 1e7 : -1e7;
    let v = 0;
    let curedN = 0;
    for (let col = 0; col < 4; col++) if (s.cured[col]) { curedN++; v += s.erad[col] ? 60 : 0; }
    v += W.cured * curedN;
    v -= W.out * s.outbreaks;
    // disease on the board, weighted by how soon each city is likely to be infected again
    const prot = O.protectedCities(s);
    let hot = [];
    for (let c = 0; c < N; c++) {
      for (let col = 0; col < 4; col++) {
        const k = s.cubes[c * 4 + col];
        if (!k) continue;
        let w = CUBE_W[k] * (1 + W.soon * ctx.soon[c]);
        if (col !== CITIES[c].color) w *= 0.6; // only outbreaks bring other colours here
        if (prot[c] && col === CITIES[c].color) w *= 0.35;
        if (k === 3) for (const a of CITIES[c].adj) if (s.cubes[a * 4 + col] === 3) w += 3;
        if (s.cured[col]) w *= 0.7;
        v -= W.cube * w;
        if (k >= 2) hot.push([c, CUBE_W[k] * (0.3 + ctx.soon[c])]);
      }
    }
    for (let col = 0; col < 4; col++) if (s.supply[col] < 6) v -= (6 - s.supply[col]) * 25;
    // cures in progress: the player closest to a cure collects; other copies can be shared
    const hands = s.hands;
    for (let col = 0; col < 4; col++) {
      if (s.cured[col]) continue;
      let bp = -1, bf = -1, total = 0, bc = 0;
      for (let p = 0; p < s.n; p++) {
        let cnt = 0;
        for (const c of hands[p]) if (c < 48 && CITIES[c].color === col) cnt++;
        total += cnt;
        const f = cnt / E.needFor(s, p);
        if (f > bf) { bf = f; bp = p; bc = cnt; }
      }
      const prog = Math.min(1, bf);
      v += W.cure * prog * prog + W.spare * (total - bc);
      if (bf >= 1) v -= W.toStation * Math.min(6, stationDist(s, bp));
      else if (total > bc) {
        // copies held by others: worth more the cheaper it is to meet and hand them over
        const at = s.pawns[bp], bRes = E.roleKey(s, bp) === 'researcher';
        for (let q = 0; q < s.n; q++) {
          if (q === bp) continue;
          const qRes = E.roleKey(s, q) === 'researcher';
          for (const c of hands[q]) {
            if (c >= 48 || CITIES[c].color !== col) continue;
            const cost = qRes ? DIST[at][s.pawns[q]] : DIST[at][c] + DIST[s.pawns[q]][c];
            v += W.share * Math.max(0, 1 - cost / 7);
          }
        }
        void bRes;
      }
    }
    // cards left in hand (each one is a flight or a cure share)
    for (let p = 0; p < s.n; p++) {
      for (const c of hands[p]) v += c >= 48 ? W.cardEvent : s.cured[CITIES[c].color] ? 2 : W.cardCity;
      if (hands[p].length > 7) v -= 30 * (hands[p].length - 7);
    }
    if (s.cp >= 0) v += W.cardEvent;
    // stations: a few, spread out
    const ns = s.stations.length;
    v += W.station * Math.min(ns, 4) + 8 * Math.max(0, ns - 4);
    // somebody should be able to reach each dangerous city quickly (drive, flight card or shuttle)
    if (hot.length) {
      const stD = new Array(N).fill(99);
      for (const st of s.stations) for (let c = 0; c < N; c++) if (DIST[st][c] < stD[c]) stD[c] = DIST[st][c];
      for (const [c, w] of hot) {
        let best = 99;
        for (let p = 0; p < s.n; p++) {
          const a = s.pawns[p], h = hands[p];
          let t = DIST[a][c];
          if (t > 1 && (h.includes(c) || h.includes(a))) t = 1;
          if (s.stations.length > 1 && stD[a] + 1 + stD[c] < t) t = stD[a] + 1 + stD[c];
          if (t < best) best = t;
        }
        v -= W.near * w * Math.min(best, 6);
      }
    }
    return v;
  }

  // ------------------------------------------------------------ candidate moves (trimmed for speed)
  function interesting(s) {
    const set = new Set(s.stations);
    for (let c = 0; c < N; c++) {
      let k = 0;
      for (let col = 0; col < 4; col++) k = Math.max(k, s.cubes[c * 4 + col]);
      if (k >= 2) set.add(c);
    }
    s.pawns.forEach(c => set.add(c));
    return set;
  }
  function candidates(s) {
    const all = E.legalActions(s);
    const hot = interesting(s);
    const p = s.cur;
    const out = [];
    let opsBest = null;
    for (const a of all) {
      if (a.t === 'charter' && !hot.has(a.to)) continue;
      if (a.t === 'end') continue;
      if (a.t === 'opsmove') {
        if (!hot.has(a.to)) continue;
        // pay with the least useful card only
        const w = cardValue(s, p, a.card);
        if (!opsBest || !opsBest.has(a.to) || w < opsBest.get(a.to).w) { opsBest = opsBest || new Map(); opsBest.set(a.to, { a, w }); }
        continue;
      }
      if (a.who !== undefined && a.who !== p && (a.t === 'direct' || a.t === 'charter')) continue; // Dispatcher: fly others only via dispatch/drive
      out.push(a);
    }
    if (opsBest) for (const { a } of opsBest.values()) out.push(a);
    out.push({ t: 'end' });
    return out;
  }
  function cardValue(s, p, c) {
    if (isEvent(c)) return 14;
    const col = CITIES[c].color;
    if (s.cured[col]) return 2;
    let cnt = 0;
    for (const x of s.hands[p]) if (isCity(x) && CITIES[x].color === col) cnt++;
    return 5 + 3 * cnt;
  }

  // light copy for the look-ahead: only what actions can change
  function simClone(s) {
    const c = Object.assign({}, s);
    c.cubes = s.cubes.slice(); c.supply = s.supply.slice(); c.cured = s.cured.slice(); c.erad = s.erad.slice();
    c.stations = s.stations.slice(); c.pawns = s.pawns.slice(); c.hands = s.hands.map(h => h.slice()); c.pdisc = s.pdisc.slice();
    return c;
  }
  // ------------------------------------------------------------ beam search over this turn's actions
  function plan(state, opts) {
    opts = opts || {};
    const width = opts.width || 10;
    const ctx = opts.ctx || context(state);
    const root = E.clone(state);
    root.sim = true; root.log = []; root.hist = [];
    let beam = [{ s: root, seq: [], score: evaluate(root, ctx) }];
    let bestEnd = beam[0];
    const steps = state.left;
    for (let d = 0; d < steps; d++) {
      const next = [];
      const seen = new Set();
      for (const node of beam) {
        if (node.s.over || node.s.left <= 0) { next.push(node); continue; }
        for (const a of candidates(node.s)) {
          const s2 = simClone(node.s);
          try { E.doAction(s2, a); } catch (e) { continue; }
          if (a.t === 'end') s2.left = 0;
          let h = 7;
          for (let i = 0; i < s2.cubes.length; i++) if (s2.cubes[i]) h = (h * 31 + s2.cubes[i] * (i + 3)) | 0;
          for (let p = 0; p < s2.n; p++) { h = (h * 31 + s2.pawns[p]) | 0; for (const c of s2.hands[p]) h = (h * 17 + c + 1) | 0; h = (h * 13 + 99) | 0; }
          for (const st of s2.stations) h = (h * 7 + st) | 0;
          const key = h + ':' + s2.left + s2.cured.join('') + s2.cp + s2.opsUsed;
          if (seen.has(key)) continue;
          seen.add(key);
          const score = evaluate(s2, ctx);
          next.push({ s: s2, seq: node.seq.concat([a]), score });
        }
      }
      next.sort((x, y) => y.score - x.score);
      beam = next.slice(0, width);
      if (beam[0].score > bestEnd.score || bestEnd.seq.length === 0) bestEnd = beam[0];
      if (beam.every(n => n.s.over || n.s.left <= 0)) break;
    }
    const best = beam[0];
    return { seq: best.seq.length ? best.seq : [{ t: 'end' }], score: best.score, start: evaluate(root, ctx) };
  }

  // score of a finished-turn position (used by Study: "points lost")
  function score(state, ctx) {
    const s = E.clone(state); s.sim = true;
    return evaluate(s, ctx || context(state));
  }

  // ------------------------------------------------------------ the computer's choice for any decision
  // drop the card whose loss hurts the team's position least
  function pickDiscard(s, p, ctx) {
    ctx = ctx || context(s);
    let best = null, bw = -Infinity;
    const tried = new Set();
    for (const c of s.hands[p]) {
      if (tried.has(c)) continue;
      tried.add(c);
      const t = E.clone(s);
      t.sim = true;
      t.hands[p].splice(t.hands[p].indexOf(c), 1);
      const w = evaluate(t, ctx) - (isEvent(c) ? 12 : 0);
      if (w > bw) { bw = w; best = c; }
    }
    return best;
  }
  function dangerOf(s, c) {
    const k = s.cubes[c * 4 + CITIES[c].color];
    return k === 3 ? 10 : k;
  }
  // which event (if any) seat p should play now, outside its own action planning
  function eventNow(s, p, ctx) {
    const has = card => E.holds(s, p, card);
    if (s.phase === 'rpwin' || s.phase === 'window') {
      if (has(EV.resilient) && s.idisc.length) {
        // just after an Epidemic: the bottom city is in the discard with 3 cubes and comes back on top
        const pick = s.idisc.slice().sort((a, b) => dangerOf(s, b) - dangerOf(s, a))[0];
        if (s.phase === 'rpwin' || dangerOf(s, pick) >= 3 && s.layers.length === 0) return { t: 'event', card: EV.resilient, city: pick };
      }
    }
    if (s.phase === 'window') {
      const r = RATE_TRACK[s.rate];
      const odds = ctx.odds;
      let risk = 0;
      for (let c = 0; c < N; c++) if (s.cubes[c * 4 + CITIES[c].color] === 3) risk += odds.draw[c];
      if (has(EV.quiet) && !s.quiet && (risk >= 0.5 || (s.pdeck ? s.pdeck.length : s.pdeckCount) <= 2 * s.n)) return { t: 'event', card: EV.quiet };
      if (has(EV.forecast) && risk >= 0.25 && !s.quiet) return { t: 'event', card: EV.forecast };
      void r;
    }
    return null;
  }
  // Forecast: least dangerous cities on top, dangerous ones as deep as possible
  function forecastOrder(s) {
    return s.pend.cards.slice().sort((a, b) => dangerOf(s, a) - dangerOf(s, b));
  }
  // Airlift / Government Grant during own turn when a cure is ready but no station is in reach
  function cureHelp(s, p) {
    for (let col = 0; col < 4; col++) {
      if (s.cured[col]) continue;
      const cnt = s.hands[p].filter(c => isCity(c) && CITIES[c].color === col).length;
      if (cnt < E.needFor(s, p)) continue;
      const d = Math.min(...s.stations.map(st => DIST[s.pawns[p]][st]));
      if (d < s.left) return null;
      if (E.holds(s, p, EV.grant) && !s.stations.includes(s.pawns[p])) {
        const a = { t: 'event', card: EV.grant, city: s.pawns[p] };
        if (s.stations.length >= 6) a.remove = s.stations.find(x => x !== s.pawns[p]);
        return a;
      }
      if (E.holds(s, p, EV.airlift)) {
        let bst = s.stations[0], bd = 99;
        for (const st of s.stations) if (DIST[s.pawns[p]][st] < bd) { bd = DIST[s.pawns[p]][st]; bst = st; }
        return { t: 'event', card: EV.airlift, who: p, to: bst };
      }
    }
    return null;
  }

  const cache = { key: null, seq: [] };
  const posKey = s => s.turn + ':' + s.cur + ':' + s.left + ':' + s.pawns.join() + ':' + s.hands.map(h => h.join('.')).join('/') + ':' +
    s.stations.join() + ':' + s.cubes.join('') + ':' + s.cured.join('') + ':' + s.cp;
  // decide one move for seat p in full state s (the computer uses only public facts)
  function decide(s, p, opts) {
    const ctx = context(s);
    if (s.phase === 'forecast') return { t: 'forecast', order: forecastOrder(s) };
    if (s.phase === 'discard') {
      const card = pickDiscard(s, p, ctx);
      // over the limit with a Government Grant: use it if a new station is worth more than the worst card
      if (s.hands[p].includes(EV.grant) && s.stations.length < 6) {
        const t0 = simClone(s); t0.sim = true; t0.hands[p].splice(t0.hands[p].indexOf(card), 1);
        let best = evaluate(t0, ctx), pick = -1;
        for (let c = 0; c < N; c++) {
          if (s.stations.includes(c)) continue;
          const t = simClone(s); t.sim = true;
          t.hands[p].splice(t.hands[p].indexOf(EV.grant), 1); t.stations.push(c);
          const w = evaluate(t, ctx);
          if (w > best) { best = w; pick = c; }
        }
        if (pick >= 0) return { t: 'event', card: EV.grant, city: pick };
      }
      return { t: 'discard', card };
    }
    if (s.phase === 'rpwin') return eventNow(s, p, ctx) || { t: 'pass' };
    if (s.phase === 'window') {
      const e = eventNow(s, p, ctx);
      if (e) return e;
      return p === s.cur ? { t: 'go' } : { t: 'pass' };
    }
    if (s.phase === 'actions' && p === s.cur) {
      const help = cureHelp(s, p);
      if (help) return help;
      // the turn's plan is made once; nothing random happens between actions, so it stays good
      let a;
      if (cache.key === posKey(s) && cache.seq.length) a = cache.seq.shift();
      else {
        const pl = plan(s, Object.assign({ ctx }, opts));
        a = pl.seq[0];
        cache.seq = pl.seq.slice(1);
      }
      // remember what the position will look like after this action, to reuse the plan next time
      cache.key = null;
      if (cache.seq.length && a.t !== 'end') {
        try { const t = E.clone(s); t.sim = true; E.doAction(t, a); cache.key = posKey(t); } catch (e) { /* re-plan */ }
      }
      return a;
    }
    return { t: 'pass' };
  }

  return { plan, decide, evaluate, context, score, forecastOrder, pickDiscard };
});
