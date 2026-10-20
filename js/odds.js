/* Exact infection odds from what every player at the table can know:
   - the infection deck is a stack of "layers": after each Intensify the discard pile (known cards,
     unknown order) sits on top of what was there before; under all of them is the never-seen rest.
   - the player deck is made of piles with exactly one Epidemic each, so the chance of an Epidemic in
     the next draw follows from how many cards have been drawn and how many Epidemics came out.
   Works for the in-app game (from publicView) and for the real-table tracker (same fields). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.PanOdds = factory(root.PanData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const { N, RATE_TRACK, CITIES } = D;

  // k = {piles:[sizes top first], pdeckCount, epiDrawn, draws: how many player cards are still to come this turn}
  // returns [P(0 epidemics), P(1), P(2)]
  function epidemicChances(k) {
    const total = k.piles.reduce((a, b) => a + b, 0);
    let d = total - k.pdeckCount; // cards already drawn from the deck
    const draws = Math.min(k.draws, k.pdeckCount);
    let dist = [1, 0, 0];
    let start = 0, left = draws;
    for (let p = 0; p < k.piles.length && left > 0; p++) {
      const end = start + k.piles[p];
      if (d < end) {
        const remaining = end - d;              // cards still in this pile
        const t = Math.min(left, remaining);    // how many of the next draws come from this pile
        const present = k.epiDrawn <= p;        // this pile's Epidemic has not shown up yet
        const q = present ? t / remaining : 0;
        dist = [dist[0] * (1 - q), dist[1] * (1 - q) + dist[0] * q, dist[2] * (1 - q) + dist[1] * q];
        d += t; left -= t;
      }
      start = end;
    }
    return dist;
  }

  // structure = array of card lists, top first; the last one is the never-seen remainder
  function drawProbs(struct, r, out, w) {
    let before = 0;
    for (const L of struct) {
      const n = L.length;
      if (!n) continue;
      const p = r <= before ? 0 : r >= before + n ? 1 : (r - before) / n;
      if (p > 0) for (const c of L) out[c] += w * p;
      before += n;
      if (before >= r) break;
    }
  }
  function lowest(struct) {
    for (let i = struct.length - 1; i >= 0; i--) if (struct[i].length) return i;
    return -1;
  }

  // the known layers + remainder from a public game view (or the table tracker)
  function structure(v) {
    const inDisc = new Set(v.idisc), gone = new Set(v.iremoved || []);
    const known = new Set();
    v.layers.forEach(l => l.forEach(c => known.add(c)));
    const rest = [];
    for (let c = 0; c < N; c++) if (!inDisc.has(c) && !gone.has(c) && !known.has(c)) rest.push(c);
    return v.layers.map(l => l.slice()).concat([rest]);
  }

  // How many player cards are still to be drawn before the next Infect step, from a game view.
  function drawsAhead(v) {
    if (v.phase === 'actions' || v.phase === 'forecast' && v.pend && v.pend.prev === 'actions') return 2;
    if (v.phase === 'discard' && v.pend && v.pend.back !== 'resolve') return 2;
    return 0;
  }

  /* v: {layers, idisc, iremoved, rate, piles, pdeckCount, epiDrawn, cubes?, quiet?}
     draws: player cards still to come before the infection step.
     Returns per city: draw = chance its infection card comes up in the next Infect step (including the
     Epidemic bottom card), epi = chance it is the Epidemic city, out = chance of an outbreak there
     (direct, not counting chain reactions), plus the Epidemic chances and the rate in each case. */
  function infectionOdds(v, draws, prot) {
    const struct = structure(v);
    const epi = epidemicChances({ piles: v.piles, pdeckCount: v.pdeckCount, epiDrawn: v.epiDrawn, draws });
    const draw = new Float64Array(N), epiC = new Float64Array(N), out = new Float64Array(N);
    const cubes = c => (v.cubes ? v.cubes[c * 4 + CITIES[c].color] : 0);
    const safe = c => (prot && prot[c]) || (v.erad && v.erad[CITIES[c].color]);
    const rateAt = k => RATE_TRACK[Math.min(RATE_TRACK.length - 1, v.rate + k)];
    const quiet = !!v.quiet;
    const tmp = new Float64Array(N);

    // no epidemic
    if (epi[0] > 0 && !quiet) {
      tmp.fill(0);
      drawProbs(struct, rateAt(0), tmp, 1);
      for (let c = 0; c < N; c++) {
        draw[c] += epi[0] * tmp[c];
        if (!safe(c) && cubes(c) >= 3) out[c] += epi[0] * tmp[c];
      }
    }
    // one epidemic: bottom card B, discard + B shuffled on top
    if (epi[1] > 0) {
      const bi = lowest(struct);
      if (bi >= 0) {
        const B = struct[bi], pb = epi[1] / B.length;
        for (const b of B) {
          epiC[b] += pb;
          if (!safe(b) && cubes(b) >= 1) out[b] += pb;
          if (quiet) continue;
          const s1 = struct.map(l => l.filter(c => c !== b));
          s1.unshift(v.idisc.concat([b]));
          tmp.fill(0);
          drawProbs(s1, rateAt(1), tmp, 1);
          for (let c = 0; c < N; c++) {
            draw[c] += pb * tmp[c];
            if (safe(c)) continue;
            if (c === b ? cubes(c) === 0 : cubes(c) >= 3) out[c] += pb * tmp[c];
          }
        }
      }
    }
    // two epidemics in the same draw: the second bottom card is drawn first in the Infect step
    if (epi[2] > 0) {
      const bi = lowest(struct);
      if (bi >= 0) {
        const B = struct[bi];
        for (const b1 of B) {
          const s1 = struct.map(l => l.filter(c => c !== b1));
          s1.unshift(v.idisc.concat([b1]));
          const bj = lowest(s1);
          const B2 = s1[bj];
          for (const b2 of B2) {
            const pb = epi[2] / B.length / B2.length;
            epiC[b1] += pb; epiC[b2] += pb;
            if (!safe(b1) && cubes(b1) >= 1) out[b1] += pb;
            if (!safe(b2)) out[b2] += pb; // 3 cubes, then its card is the first one drawn
            if (quiet) continue;
            const s2 = s1.map(l => l.filter(c => c !== b2));
            s2.unshift([b2]);
            tmp.fill(0);
            drawProbs(s2, rateAt(2), tmp, 1);
            for (let c = 0; c < N; c++) {
              draw[c] += pb * tmp[c];
              if (safe(c) || c === b2) continue;
              if (c === b1 ? cubes(c) === 0 : cubes(c) >= 3) out[c] += pb * tmp[c];
            }
          }
        }
      }
    }
    for (let c = 0; c < N; c++) { if (draw[c] > 1) draw[c] = 1; if (out[c] > 1) out[c] = 1; }
    return { draw, epi: epiC, out, epidemic: epi, rate: [rateAt(0), rateAt(1), rateAt(2)], struct };
  }

  // protected cities (Quarantine Specialist and her links, Medic for cured colours) from a game view
  function protectedCities(v) {
    const prot = new Array(N).fill(false);
    if (!v.roles) return prot;
    v.roles.forEach((r, p) => {
      const key = D.ROLES[r].key, at = v.pawns[p];
      if (key === 'quarantine') { prot[at] = true; CITIES[at].adj.forEach(c => { prot[c] = true; }); }
      if (key === 'medic' && v.cured[CITIES[at].color]) prot[at] = true;
    });
    return prot;
  }

  // chance that the next card off the top is each city (no epidemic): handy for Forecast
  return { epidemicChances, drawProbs, structure, infectionOdds, protectedCities, drawsAhead };
});
