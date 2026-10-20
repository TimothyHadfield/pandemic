/* The Pandemic engine as the shared online module's `game` object (see ../_online/README.md).
   Co-op: everyone (people and computers) plays on the same team. The state carries its own
   seeded shuffler, so apply() never needs outside randomness. publicView hides the deck orders
   and (except with open hands) each person's hand; privateView holds only that hand. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./bots.js'));
  else root.PanOnlineGame = factory(root.PanEngine, root.PanBots);
})(typeof self !== 'undefined' ? self : this, function (E, B) {
  'use strict';
  const game = {
    id: 'pandemic',
    minSeats: 2,
    maxSeats: 4,
    // options: {epidemics: 4|5|6, roles: [role index or -1], openHands, eventPause}
    setup(nSeats, options, rng, seats) {
      const o = options || {};
      const S = seats || [];
      return E.newGame({
        players: nSeats,
        epidemics: [4, 5, 6].includes(o.epidemics) ? o.epidemics : 5,
        seed: Math.floor(rng() * 4294967296) >>> 0,
        roles: Array.isArray(o.roles) ? o.roles.slice(0, nSeats) : [],
        names: S.map((x, i) => (x && x.name) || (x && x.kind === 'computer' ? 'Computer ' + (i + 1) : 'Player ' + (i + 1))),
        human: S.map(x => !!x && x.kind === 'human'),
        openHands: typeof o.openHands === 'boolean' ? o.openHands : undefined,
        eventPause: o.eventPause !== false,
      });
    },
    toAct(state) { return E.toAct(state); },
    apply(state, seat, action) { return E.apply(state, seat, action); },
    publicView(state) { return E.publicView(state); },
    privateView(state, seat) { return E.privateView(state, seat); },
    // a computer teammate (also used when a person's seat is handed to a computer mid-game)
    bot(ctx, seat) { return B.decide(ctx.state, seat, {}); },
    isOver(state) { return !!state.over; },
  };
  // the screens use the same shape as PanEngine.view(state, seat)
  function viewFromSnap(snap) {
    if (!snap || !snap.pub) return null;
    const v = JSON.parse(JSON.stringify(snap.pub));
    v.seat = snap.mySeat;
    if (snap.mine && snap.mine.hand && snap.mySeat >= 0) v.hands[snap.mySeat] = snap.mine.hand;
    return v;
  }
  return { game, viewFromSnap };
});
