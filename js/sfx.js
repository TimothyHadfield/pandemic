/* What just happened on the board, as a timed list of sounds and small animations.
   events(prev, next, me, {step}) compares two views (local, computer or online moves alike) and returns
   { items: [{at ms, sound?, anim?, celebrate?, city?, col?, n?}], booms: [{city, at}], cubeAt: {city: ms} }.
   Timing follows the flip strip: drawn cards, Epidemics, then infection cards, `step` ms apart. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.PanSfx = factory(root.PanData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const NAMES = D.COLOR_NAMES.map(n => n.toLowerCase());
  const key = e => e.t + '|' + e.m;

  // the log is append-only but capped, so find where the old tail meets the new one
  function newEntries(a, b) {
    a = a || []; b = b || [];
    const A = a.map(key), B = b.map(key);
    for (let k = 0; k <= B.length; k++) {
      const m = B.length - k;
      if (m > A.length) continue;
      let ok = true;
      for (let i = 0; i < m; i++) if (B[i] !== A[A.length - m + i]) { ok = false; break; }
      if (ok) return b.slice(m);
    }
    return b.slice();
  }
  const sig = v => [v.turn, v.phase, v.cur, v.left, v.pdeckCount, v.ideckCount, (v.idisc || []).length, (v.iremoved || []).length, v.outbreaks,
    (v.log || []).length, v.log && v.log.length ? key(v.log[v.log.length - 1]) : '', (v.pawns || []).join(), (v.stations || []).join(),
    (v.cured || []).join(), (v.handN || []).join(), !!v.over].join(';');

  // one logged move -> its sounds (the action itself; draws, infections and outbreaks come from lastDraw etc.)
  function actionSounds(m) {
    if (/ played One Quiet Night\.$| played Forecast\.$/.test(m)) return [['cardFlip', 0]];
    if (/ removed .+ from the infection cards\.$/.test(m)) return [['cardFlip', 0], ['cardSlide', 150]];
    if (/ airlifted .+ to /.test(m)) return [['cardFlip', 0], ['whoosh', 150]];
    if (/: Government Grant station in /.test(m)) return [['cardFlip', 0], ['place', 180]];
    if (/ moved .*to /.test(m)) return [['slide', 0]];
    if (/ (flew|chartered|shuttled|sent) /.test(m)) return [['whoosh', 0]];
    if (/ built a station in /.test(m)) return [['place', 0]];
    if (/ treated /.test(m)) return [['pop', 0]];
    if (/ (gave|took|kept|discarded) /.test(m)) return [['cardSlide', 0]];
    return [];
  }

  function events(prev, next, me, o) {
    const out = { items: [], booms: [], cubeAt: {} };
    if (!prev || !next || sig(prev) === sig(next)) return out;
    const step = (o && o.step) || 140;
    const items = out.items;
    const add = x => items.push(x);
    const C = D.CITIES;
    const own = (v, c) => v.cubes[c * 4 + C[c].color];

    // moves, in log order
    const fresh = newEntries(prev.log, next.log);
    let k = 0;
    const hasCure = fresh.some(x => / cured (blue|yellow|black|red)!$/.test(x.m));
    fresh.forEach(e => {
      const m = e.m;
      const snd = actionSounds(m);
      snd.forEach(([s, dt]) => add({ at: k * 120 + dt, sound: s }));
      if (snd.length) k++;
      const cu = / cured (blue|yellow|black|red)!$/.exec(m);
      if (cu && !(next.over && next.over.win)) add({ at: 0, celebrate: 'big', anim: 'cure', col: NAMES.indexOf(cu[1]) });
      const er = /^(Blue|Yellow|Black|Red) is eradicated\.$/.exec(m);
      if (er) add({ at: hasCure ? 600 : 150, sound: 'stamp', anim: 'erad', col: NAMES.indexOf(er[1].toLowerCase()) });
    });
    if (prev.phase === 'forecast' && next.phase !== 'forecast') add({ at: 0, sound: 'cardSlide' });

    // cubes taken off (treat, Medic): "-N" on the city
    for (let c = 0; c < C.length; c++) {
      let n = 0, col = -1;
      for (let j = 0; j < 4; j++) { const d = prev.cubes[c * 4 + j] - next.cubes[c * 4 + j]; if (d > 0) { n += d; col = j; } }
      if (n) add({ at: 0, anim: 'treat', city: c, col, n });
    }

    // the flip strip: drawn cards, Epidemics, infection cards
    const draws = next.lastDraw || [], epis = next.lastEpi || [], infs = next.lastInf || [], outs = next.lastOut || [];
    let i = 0;
    const slot = {};
    draws.forEach(() => { add({ at: i * step, sound: 'cardDeal' }); i++; });
    epis.forEach(c => {
      const t = i * step;
      add({ at: t, sound: 'alarm', anim: 'epidemic', city: c });
      if (!outs.includes(c)) add({ at: t + 220, sound: 'place', pitch: 0.85 });
      add({ at: t + 650, sound: 'shuffle' });
      if (!(('e' + c) in slot)) slot['e' + c] = t;
      if (out.cubeAt[c] === undefined) out.cubeAt[c] = t + 220;
      i++;
    });
    infs.forEach(c => {
      const t = i * step;
      add({ at: t, sound: 'cardFlip' });
      if (!(('i' + c) in slot)) slot['i' + c] = t;
      if (own(next, c) > own(prev, c) && !outs.includes(c)) add({ at: t + 110, sound: 'place' });
      if (out.cubeAt[c] === undefined) out.cubeAt[c] = t + 110;
      i++;
    });
    // outbreaks: each chain after the card that started it, one blast per city
    let origin = 0, chain = 0;
    const used = new Set();
    outs.forEach(c => {
      const s = !used.has('e' + c) && ('e' + c) in slot ? 'e' + c : !used.has('i' + c) && ('i' + c) in slot ? 'i' + c : null;
      if (s) { used.add(s); origin = slot[s] + 180; chain = 0; } else chain++;
      const t = origin + chain * 260;
      add({ at: t, sound: 'explosion', anim: 'outbreak', city: c });
      out.booms.push({ city: c, at: t });
      C[c].adj.forEach(a => { if (out.cubeAt[a] === undefined) out.cubeAt[a] = t + 120; });
    });

    const end = items.reduce((m, x) => Math.max(m, x.at), 0);
    // game over: the team wins or loses together
    if (next.over && !prev.over) add({ at: end + (end ? 350 : 0), celebrate: next.over.win ? 'win' : 'lose' });
    // it just became your turn
    else if (!next.over && next.phase === 'actions' && next.cur === me && (prev.cur !== me || prev.turn !== next.turn)) add({ at: end + 250, sound: 'turn', anim: 'myturn' });
    items.sort((a, b) => a.at - b.at);
    return out;
  }
  return { events, newEntries };
});
