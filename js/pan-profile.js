/* Pandemic's part of the player profile (the shared kit js/profile.js is never edited here):
   the difficulty levels' ratings, the achievement list, today's Daily game and a finished game -> result.
   Pandemic is co-operative: "beating a level" means the team (you + computer teammates) saves the world. */
(function (root) {
  'use strict';
  // Elo of each level from the measured team win rate with 2 players (js/strength-data.js, 200 games a box):
  // a level the team wins with share p is as hard as an opponent rated 400*log10((1-p)/p) above an even match.
  // Introductory is anchored at 1200, where every new player starts.
  const LEVELS = [
    { id: 'intro', name: 'Introductory', rating: 1200 },
    { id: 'standard', name: 'Standard', rating: 1350 },
    { id: 'heroic', name: 'Heroic', rating: 1480 },
  ];
  const LEVEL_OF = { 4: 'intro', 5: 'standard', 6: 'heroic' };
  // recompute the ratings from the measured win rates when they are there
  function rate(st) {
    try {
      const p = ep => { const c = st.cells.filter(x => x.epidemics === ep && x.players === 2)[0]; return c ? Math.min(0.97, Math.max(0.03, c.wins / c.games)) : null; };
      const lg = x => Math.log10(x / (1 - x));
      const p4 = p(4);
      if (!p4) return;
      [5, 6].forEach((ep, i) => { const q = p(ep); if (q) LEVELS[i + 1].rating = Math.round(1200 + 400 * (lg(p4) - lg(q))); });
    } catch (e) { /* keep the defaults */ }
  }
  rate(root.PanStrength);

  const won = c => !!(c.last && c.last.won);
  const ex = c => (c.last && c.last.extra) || {};
  const achievements = () => [
    { id: 'first', title: 'World saved', desc: 'Win a game', test: c => c.stats.wins >= 1 },
    { id: 'standard', title: 'Field team', desc: 'Win on Standard or Heroic', test: c => won(c) && (c.last.level === 'standard' || c.last.level === 'heroic' || ex(c).epidemics >= 5) },
    { id: 'heroic', title: 'Heroic', desc: 'Win on Heroic (6 Epidemics)', test: c => won(c) && ex(c).epidemics === 6 },
    { id: 'zero', title: 'Not one outbreak', desc: 'Win with zero outbreaks', test: c => won(c) && ex(c).outbreaks === 0 },
    { id: 'erad', title: 'Wiped out', desc: 'Win with a disease eradicated', test: c => won(c) && ex(c).erad >= 1 },
    { id: 'full', title: 'Full table', desc: 'Win with 4 players', test: c => won(c) && ex(c).players === 4 },
    { id: 'quick', title: 'Fast cure', desc: 'Win in 20 turns or fewer', test: c => won(c) && ex(c).turns > 0 && ex(c).turns <= 20 },
    { id: 'blind', title: 'No crystal ball', desc: 'Win with Odds on the map off', test: c => won(c) && ex(c).oddsOff === true },
    { id: 'streak', title: 'Hat trick', desc: 'Win 3 in a row', test: c => c.stats.bestStreak >= 3 },
    { id: 'daily', title: 'Daily responder', desc: '3-day Daily streak', test: c => c.daily.streak >= 3 },
  ];

  // Today's Daily game: the same deal for everyone that day, 2 players (you + 1 computer teammate), Standard.
  const DAILY = { players: 2, epidemics: 5 };

  /** A finished (or quit) local game -> Profile.recordResult input. helped: Hint or Undo was used -> not rated. */
  function result(o) {
    const extra = { players: o.players, epidemics: o.epidemics, turns: o.turns, outbreaks: o.outbreaks, erad: o.erad, oddsOff: !!o.oddsOff, quit: !!o.quit };
    if (o.online) return { mode: 'online', level: null, won: !!o.won, daily: false, extra };
    if (o.helped) return { mode: 'help', level: null, won: !!o.won, daily: !!o.daily, extra };
    return { mode: 'computer', level: LEVEL_OF[o.epidemics] || null, won: !!o.won, daily: !!o.daily, extra };
  }

  root.PanProfile = { LEVELS, LEVEL_OF, achievements, DAILY, result };
})(typeof self !== 'undefined' ? self : this);
