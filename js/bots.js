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
  const W = { cured: 2200, cure: 1500, spare: 25, shareF: 0.3, shareD: 4, toStation: 70, cube: 10, soon: 4, out: 120, cardCity: 7, cardEvent: 16, station: 30, near: 6, limit: 25, grantMin: 40, width: 10, cap: 3000, look: 0.5, lookK: 8, lookW: 4, lookCap: 1500, oc: 300, supply: 6, tight: 300 };
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
    // the player whose turn it is draws 2 cards when the actions end
    const drawer = s.phase === 'actions' ? s.cur : -1;
    const need = [], res = [];
    for (let p = 0; p < s.n; p++) { need.push(E.needFor(s, p)); res.push(E.roleKey(s, p) === 'researcher'); }
    return { odds, soon, drawer, need, res, minNeed: Math.min.apply(null, need) };
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

  // scratch buffers reused by every evaluate() call (it runs thousands of times per plan)
  const COL = Int8Array.from(CITIES, c => c.color);
  const PROT = new Uint8Array(N), STD = new Int8Array(N), HOTC = new Int8Array(4 * N), HOTW = new Float64Array(4 * N);
  const CNT = new Int8Array(16);
  function markProtected(s) {
    PROT.fill(0);
    for (let p = 0; p < s.n; p++) {
      const key = ROLES[s.roles[p]].key, at = s.pawns[p];
      if (key === 'quarantine') { PROT[at] = 1; for (const c of CITIES[at].adj) PROT[c] = 1; }
      else if (key === 'medic' && s.cured[COL[at]]) PROT[at] = 1;
    }
  }

  function evaluate(s, ctx) {
    if (s.over) return s.over.win ? 1e7 : -1e7;
    let v = 0;
    let curedN = 0;
    const cubes = s.cubes, cured = s.cured, soon = ctx.soon;
    for (let col = 0; col < 4; col++) if (cured[col]) { curedN++; v += s.erad[col] ? 60 : 0; }
    v += W.cured * curedN;
    v -= W.out * s.outbreaks;
    // disease on the board, weighted by how soon each city is likely to be infected again
    markProtected(s);
    let nh = 0;
    for (let c = 0; c < N; c++) {
      const base = c * 4, own = COL[c];
      for (let col = 0; col < 4; col++) {
        const k = cubes[base + col];
        if (!k) continue;
        let w = CUBE_W[k] * (1 + W.soon * soon[c]);
        if (col !== own) w *= 0.6; // only outbreaks bring other colours here
        else if (PROT[c]) w *= 0.35;
        if (k === 3) { const adj = CITIES[c].adj; for (let i = 0; i < adj.length; i++) if (cubes[adj[i] * 4 + col] === 3) w += 3; }
        if (cured[col]) w *= 0.7;
        v -= W.cube * w;
        if (k >= 2) { HOTC[nh] = c; HOTW[nh] = CUBE_W[k] * (0.3 + soon[c]); nh++; }
      }
    }
    // outbreaks the next Infect step would cause (the current player can still stop these)
    const esc = 1 + s.outbreaks / 4, dr = ctx.odds.draw, ep = ctx.odds.epi;
    for (let c = 0; c < N; c++) {
      const col = COL[c];
      if (PROT[c] || s.erad[col]) continue;
      const k = cubes[c * 4 + col];
      if (!k) continue;
      const pr = k === 3 ? dr[c] + ep[c] : ep[c];
      if (!pr) continue;
      let chain = 1;
      const adj = CITIES[c].adj;
      for (let i = 0; i < adj.length; i++) if (cubes[adj[i] * 4 + col] === 3 && !PROT[adj[i]]) chain += 0.7;
      v -= W.oc * esc * pr * chain;
    }
    for (let col = 0; col < 4; col++) if (s.supply[col] < 8) v -= (8 - s.supply[col]) * (8 - s.supply[col]) * W.supply;
    // travel between two cities: driving, or via the two nearest stations (shuttle)
    const stations = s.stations, ns = stations.length;
    STD.fill(99);
    for (let i = 0; i < ns; i++) { const row = DIST[stations[i]]; for (let c = 0; c < N; c++) if (row[c] < STD[c]) STD[c] = row[c]; }
    const td = (a, b) => { const d = DIST[a][b], x = STD[a] + 1 + STD[b]; return ns > 1 && x < d ? x : d; };
    // city cards per player and colour
    const hands = s.hands, n = s.n;
    CNT.fill(0);
    for (let p = 0; p < n; p++) for (const c of hands[p]) if (c < 48) CNT[p * 4 + COL[c]]++;
    // city cards of each colour gone for good
    let g0 = 0, g1 = 0, g2 = 0, g3 = 0;
    for (const c of s.pdisc) if (c < 48) { const k = COL[c]; if (k === 0) g0++; else if (k === 1) g1++; else if (k === 2) g2++; else g3++; }
    const gone = [g0, g1, g2, g3];
    // cures in progress: the player closest to a cure collects; copies others hold are worth part of
    // what they would add to the collector's hand, less the further the two have to travel to meet
    for (let col = 0; col < 4; col++) {
      if (cured[col]) continue;
      let bp = -1, bf = -1, total = 0, bc = 0;
      for (let p = 0; p < n; p++) {
        const cnt = CNT[p * 4 + col];
        total += cnt;
        const f = cnt / ctx.need[p];
        if (f > bf) { bf = f; bp = p; bc = cnt; }
      }
      const prog = bf < 1 ? bf : 1;
      v += W.cure * prog * prog + W.spare * (total - bc);
      const left = 12 - gone[col];
      if (left < ctx.minNeed) v -= W.cured * 3; // this disease can no longer be cured
      else if (left === ctx.minNeed) v -= W.tight;
      if (bf >= 1) v -= W.toStation * Math.min(6, stationDist(s, bp));
      else if (total > bc) {
        const need = ctx.need[bp], at = s.pawns[bp];
        const costs = [];
        for (let q = 0; q < n; q++) {
          if (q === bp || !CNT[q * 4 + col]) continue;
          const qRes = ctx.res[q], pq = s.pawns[q];
          for (const c of hands[q]) {
            if (c >= 48 || COL[c] !== col) continue;
            costs.push(qRes ? td(at, pq) : td(at, c) + td(pq, c));
          }
        }
        costs.sort((a, b) => a - b);
        let k = bc;
        for (let i = 0; i < costs.length && k < need; i++, k++) {
          const gain = W.cure * (2 * k + 1) / (need * need);
          v += W.shareF * gain / (1 + costs[i] / W.shareD);
        }
      }
    }
    // cards left in hand (each one is a flight or a cure share)
    for (let p = 0; p < n; p++) {
      const h = hands[p];
      for (const c of h) v += c >= 48 ? W.cardEvent : cured[COL[c]] ? 2 : W.cardCity;
      if (h.length > 7) v -= 30 * (h.length - 7);
      if (p === ctx.drawer && h.length > 5) v -= W.limit * (h.length - 5);
    }
    if (s.cp >= 0) v += W.cardEvent;
    // stations: a few, spread out
    v += W.station * Math.min(ns, 4) + 8 * Math.max(0, ns - 4);
    // somebody should be able to reach each dangerous city quickly (drive, flight card or shuttle)
    for (let i = 0; i < nh; i++) {
      const c = HOTC[i];
      let best = 99;
      for (let p = 0; p < n; p++) {
        const a = s.pawns[p];
        let t = td(a, c);
        if (t > 1) { const h = hands[p]; if (h.includes(c) || h.includes(a)) t = 1; }
        if (t < best) best = t;
      }
      v -= W.near * HOTW[i] * Math.min(best, 6);
    }
    return v;
  }

  // ------------------------------------------------------------ routes (whole moves, "go to X")
  // cities worth sending a teammate to: stations, pawns, 2+ cubes
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
  function cardValue(s, p, c) {
    if (isEvent(c)) return 14;
    const col = CITIES[c].color;
    if (s.cured[col]) return 2;
    let cnt = 0;
    for (const x of s.hands[p]) if (isCity(x) && CITIES[x].color === col) cnt++;
    return 5 + 3 * cnt;
  }
  const MOVES = new Set(['drive', 'direct', 'charter', 'shuttle', 'dispatch', 'opsmove']);
  // card-free moves (drive, shuttle, the Dispatcher's pawn-to-pawn) from `from`, up to `budget` actions
  function freeBFS(s, who, from, budget, disp) {
    const dist = new Int8Array(N).fill(99), prev = new Int8Array(N).fill(-1), how = new Array(N);
    dist[from] = 0;
    const q = [from];
    const stations = s.stations;
    for (let i = 0; i < q.length; i++) {
      const u = q[i], d = dist[u];
      if (d >= budget) continue;
      const step = (v, t) => { if (dist[v] > d + 1) { dist[v] = d + 1; prev[v] = u; how[v] = t; q.push(v); } };
      for (const v of CITIES[u].adj) step(v, 'drive');
      if (stations.includes(u)) for (const v of stations) if (v !== u) step(v, 'shuttle');
      if (disp) for (let o = 0; o < s.n; o++) if (o !== who && s.pawns[o] !== u) step(s.pawns[o], 'dispatch');
    }
    return { dist, prev, how };
  }
  function freePath(bfs, who, to) {
    const out = [];
    for (let c = to; bfs.prev[c] >= 0; c = bfs.prev[c]) out.push({ t: bfs.how[c], who, to: c });
    return out.reverse();
  }
  // the cheapest ways for pawn `who` (moved by the current player) to reach each city within `budget`
  // actions: the card-free route and, when it is quicker, one that spends a single card
  function routes(s, who, budget) {
    const p = s.cur, hand = s.hands[p], from = s.pawns[who];
    const disp = E.roleKey(s, p) === 'dispatcher';
    const b0 = freeBFS(s, who, from, budget, disp);
    const best = new Array(N);
    const offer = (x, cost, val, mk) => {
      if (cost > budget) return;
      const cur = best[x];
      if (!cur || cost < cur.cost || cost === cur.cost && val < cur.val) best[x] = { cost, val, mk };
    };
    // direct flight to a card's city, then card-free moves
    if (budget >= 1) {
      for (const c of hand) {
        if (!isCity(c) || c === from) continue;
        const val = cardValue(s, p, c);
        offer(c, 1, val, () => [{ t: 'direct', who, to: c }]);
        if (budget > 1) {
          const b1 = freeBFS(s, who, c, budget - 1, disp);
          for (let x = 0; x < N; x++) if (x !== c && x !== from && b1.dist[x] < 99) offer(x, 1 + b1.dist[x], val, () => [{ t: 'direct', who, to: c }].concat(freePath(b1, who, x)));
        }
      }
    }
    // charter from a city whose card the player holds (after card-free moves to get there)
    let ch = null;
    for (const c of hand) {
      if (!isCity(c) || b0.dist[c] >= budget) continue;
      const val = cardValue(s, p, c);
      if (!ch || b0.dist[c] < ch.d || b0.dist[c] === ch.d && val < ch.val) ch = { c, d: b0.dist[c], val };
    }
    if (ch) for (let x = 0; x < N; x++) if (x !== ch.c && x !== from) offer(x, ch.d + 1, ch.val, () => freePath(b0, who, ch.c).concat([{ t: 'charter', who, to: x }]));
    // Operations Expert: from a station to anywhere by discarding any city card (once a turn)
    if (who === p && E.roleKey(s, p) === 'ops' && !s.opsUsed) {
      let card = -1, cv = 99;
      for (const c of hand) if (isCity(c)) { const v = cardValue(s, p, c); if (v < cv) { cv = v; card = c; } }
      let st = -1;
      for (const x of s.stations) if (b0.dist[x] < budget && (st < 0 || b0.dist[x] < b0.dist[st])) st = x;
      if (card >= 0 && st >= 0) for (let x = 0; x < N; x++) if (x !== st && x !== from) offer(x, b0.dist[st] + 1, cv, () => freePath(b0, who, st).concat([{ t: 'opsmove', to: x, card }]));
    }
    const out = [];
    for (let x = 0; x < N; x++) {
      if (x === from) continue;
      if (b0.dist[x] <= budget) out.push({ to: x, cost: b0.dist[x], mk: () => freePath(b0, who, x) });
      const b = best[x];
      if (b && b.cost < b0.dist[x]) out.push({ to: x, cost: b.cost, mk: b.mk });
    }
    return out;
  }

  // light copy for the look-ahead: only what actions can change
  // (a small fixed-shape object: everything an action reads or changes, and what evaluate() reads)
  function simClone(s) {
    return { sim: true, n: s.n, roles: s.roles, names: s.names, cur: s.cur, left: s.left, opsUsed: s.opsUsed, cp: s.cp,
      outbreaks: s.outbreaks, over: s.over, phase: s.phase, log: s.sim ? s.log : [],
      cubes: s.cubes.slice(), supply: s.supply.slice(), cured: s.cured.slice(), erad: s.erad.slice(),
      stations: s.stations.slice(), pawns: s.pawns.slice(), hands: s.hands.map(h => h.slice()), pdisc: s.pdisc.slice() };
  }
  function stateKey(s2) {
    let h = 7;
    for (let i = 0; i < s2.cubes.length; i++) if (s2.cubes[i]) h = (h * 31 + s2.cubes[i] * (i + 3)) | 0;
    for (let p = 0; p < s2.n; p++) { h = (h * 31 + s2.pawns[p]) | 0; for (const c of s2.hands[p]) h = (h * 17 + c + 1) | 0; h = (h * 13 + 99) | 0; }
    for (const st of s2.stations) h = (h * 7 + st) | 0;
    return h + ':' + s2.cured.join('') + s2.cp + s2.opsUsed;
  }
  // with all 6 stations built, the one to move is the one closest to another station
  function spareStation(s) {
    let best = s.stations[0], bd = 99;
    for (const a of s.stations) {
      let d = 99;
      for (const b of s.stations) if (b !== a && DIST[a][b] < d) d = DIST[a][b];
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  function nearStation(s, c) {
    let d = 99;
    for (const st of s.stations) if (DIST[c][st] < d) d = DIST[c][st];
    return d;
  }
  // actions other than moving, where the current player stands
  function localActions(s) {
    const out = [];
    const p = s.cur, key = E.roleKey(s, p), hand = s.hands[p], here = s.pawns[p];
    const isSt = s.stations.includes(here);
    if (!isSt && (key === 'ops' || hand.includes(here))) {
      if (s.stations.length < 6) out.push({ t: 'build' });
      else out.push({ t: 'build', remove: spareStation(s) });
    }
    for (let col = 0; col < 4; col++) if (s.cubes[here * 4 + col]) out.push({ t: 'treat', color: col });
    for (let q = 0; q < s.n; q++) {
      if (q === p || s.pawns[q] !== here) continue;
      for (const c of hand) if (isCity(c) && (c === here || key === 'researcher')) out.push({ t: 'give', to: q, card: c });
      const qRes = E.roleKey(s, q) === 'researcher';
      for (const c of s.hands[q]) if (isCity(c) && (c === here || qRes)) out.push({ t: 'take', from: q, card: c });
    }
    if (isSt) {
      const need = E.needFor(s, p);
      for (let col = 0; col < 4; col++) {
        if (s.cured[col]) continue;
        let k = 0;
        for (const c of hand) if (isCity(c) && CITIES[c].color === col) k++;
        if (k >= need) out.push({ t: 'cure', color: col });
      }
    }
    if (key === 'planner' && s.cp < 0) for (const c of s.pdisc) if (isEvent(c)) out.push({ t: 'cptake', card: c });
    return out;
  }

  // ------------------------------------------------------------ search over this turn's actions
  // Moves are whole routes, so a far city that needs treating competes fairly with work close by.
  // Positions are grouped by how many actions they used; each group keeps its best `width`.
  const s0n = s => s.n;
  function plan(state, opts) {
    opts = opts || {};
    const width = opts.width || W.width;
    const ctx = opts.ctx || context(state);
    const root = simClone(state);
    const startScore = evaluate(root, ctx);
    const rootNode = { s: root, seq: [], score: startScore };
    const steps = Math.max(0, state.left);
    const levels = [];
    for (let i = 0; i <= steps; i++) levels.push(new Map());
    levels[0].set('root', rootNode);
    let bestNode = rootNode;
    let evals = 0;
    const cap = opts.cap || W.cap, perLevel = cap / Math.max(1, steps);
    const p = root.cur;
    const disp = E.roleKey(root, p) === 'dispatcher';
    const add = (node, seq) => {
      const s2 = simClone(node.s);
      try { for (const a of seq) E.doAction(s2, a); } catch (e) { return null; }
      // a shared card that puts the receiver over the hand limit costs them their least useful card
      const last = seq[seq.length - 1];
      if (last.t === 'give' || last.t === 'take') {
        const r = last.t === 'give' ? last.to : s2.cur, h = s2.hands[r];
        while (h.length > 7) {
          let k = 0, kv = 1e9;
          for (let i = 0; i < h.length; i++) { const v = cardValue(s2, r, h[i]); if (v < kv) { kv = v; k = i; } }
          s2.pdisc.push(h[k]); h.splice(k, 1);
        }
      }
      const used = steps - s2.left;
      if (used > steps || used < 1) return null;
      const key = stateKey(s2);
      const L = levels[used];
      if (L.has(key)) return null;
      evals++;
      const n2 = { s: s2, seq: node.seq.concat(seq), score: evaluate(s2, ctx) };
      L.set(key, n2);
      if (n2.score > bestNode.score) bestNode = n2;
      return n2;
    };
    for (let d = 0; d < steps; d++) {
      const nodes = Array.from(levels[d].values()).sort((x, y) => y.score - x.score).slice(0, width);
      const stop = evals + perLevel;
      for (let ni = 0; ni < nodes.length; ni++) {
        const node = nodes[ni];
        const s = node.s;
        if (s.over || s.left <= 0) continue;
        if (evals > stop) break; // keeps the phone fast: the best positions are expanded first
        for (const a of localActions(s)) add(node, [a]);
        // the current player goes somewhere (and does something there)
        for (const r of routes(s, p, s.left)) {
          const n2 = add(node, r.mk());
          if (n2 && !n2.s.over && n2.s.left > 0) {
            for (const a of localActions(n2.s)) {
              if (a.t === 'cptake' || a.t === 'build' && nearStation(n2.s, r.to) < 3) continue;
              add(n2, [a]);
            }
          }
        }
        // the Dispatcher moves a teammate (to a pawn, a station or a danger spot)
        if (disp && ni < 4) { // (only from the best few positions: it is the slowest part)
          const hot = interesting(s);
          for (let q = 0; q < s.n; q++) {
            if (q === p) continue;
            for (const r of routes(s, q, s.left)) if (hot.has(r.to)) add(node, r.mk());
          }
        }
      }
    }
    // look one turn further: how much can the next player do from each of the best end positions?
    // (sets up meetings for Share Knowledge and hand-offs that one turn alone does not see)
    const look = opts.look === undefined ? W.look : opts.look;
    if (look > 0 && s0n(root) > 1) {
      const all = [];
      for (const L of levels) for (const n of L.values()) all.push(n);
      all.push(rootNode);
      all.sort((x, y) => y.score - x.score);
      const top = all.slice(0, W.lookK);
      let bestV = -Infinity;
      for (const n of top) {
        if (n.s.over) { if (n.score > bestV) { bestV = n.score; bestNode = n; } continue; }
        const s2 = simClone(n.s);
        s2.cur = (root.cur + 1) % root.n; s2.left = 4; s2.opsUsed = false;
        const ctx2 = Object.assign({}, ctx, { drawer: s2.cur });
        const inner = plan(s2, { width: W.lookW, cap: W.lookCap, ctx: ctx2, look: 0 });
        const val = n.score + look * (inner.score - inner.start);
        if (val > bestV) { bestV = val; bestNode = n; }
      }
    }
    const seq = bestNode.seq.slice();
    if (!seq.length || (bestNode.s.left > 0 && !bestNode.s.over)) seq.push({ t: 'end' });
    return { seq, score: bestNode.score, start: startScore, evals };
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
      // Airlift a teammate who holds a full set onto a station, so they cure at the start of their turn
      if (has(EV.airlift)) {
        for (let q = 0; q < s.n; q++) {
          if (s.stations.includes(s.pawns[q]) || readyColor(s, q) < 0 || stationDist(s, q) <= 1) continue;
          let bst = s.stations[0], bd = 99;
          for (const st of s.stations) if (DIST[s.pawns[q]][st] < bd) { bd = DIST[s.pawns[q]][st]; bst = st; }
          return { t: 'event', card: EV.airlift, who: q, to: bst };
        }
      }
    }
    return null;
  }
  function readyColor(s, p) {
    for (let col = 0; col < 4; col++) {
      if (s.cured[col]) continue;
      let k = 0;
      for (const c of s.hands[p]) if (isCity(c) && CITIES[c].color === col) k++;
      if (k >= E.needFor(s, p)) return col;
    }
    return -1;
  }
  // Government Grant on the city where a new station helps the team most (null if none is worth the card)
  function bestGrant(s, p, ctx, base) {
    const t0 = simClone(s);
    if (base === undefined) base = evaluate(t0, ctx);
    let best = base + W.grantMin, pick = -1;
    for (let c = 0; c < N; c++) {
      if (s.stations.includes(c)) continue;
      const t = simClone(s);
      const h = t.hands[p], k = h.indexOf(EV.grant);
      if (k >= 0) h.splice(k, 1);
      t.stations.push(c);
      if (t.stations.length > 6) t.stations.splice(t.stations.indexOf(spareStation(s)), 1);
      const w = evaluate(t, ctx);
      if (w > best) { best = w; pick = c; }
    }
    if (pick < 0) return null;
    const a = { t: 'event', card: EV.grant, city: pick };
    if (s.stations.length >= 6) a.remove = spareStation(s);
    return a;
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
      // Government Grant early in the turn when a station somewhere is clearly worth the card
      if (s.left === 4 && s.hands[p].includes(EV.grant) && s.stations.length < 6) {
        const g = bestGrant(s, p, ctx);
        if (g) return g;
      }
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
