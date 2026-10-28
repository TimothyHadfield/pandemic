/* The guided first game (shared _coach kit, js/coach.js) and the rules sheet, in our own words.
   The guided game is a normal Introductory game with a stacked deal: you are the Scientist with three
   blue cards, your computer teammate holds Atlanta, and Washington has 3 blue cubes. Five things to try:
   share a card, discover a cure, move, treat, and watch the turn end (draw 2, infect). */
(function (root) {
  'use strict';
  const D = root.PanData, E = root.PanEngine;
  const I = D.IDX;
  // seed 5: Washington starts with 3 blue cubes, no Epidemic in the top 4 player cards, the first 4 infection cards hit empty cities
  const SEED = 5;

  function game(name) {
    const R = D.ROLE_IDX;
    const s = E.newGame({ players: 2, epidemics: 4, seed: SEED, roles: [R.scientist, R.medic], names: [name || 'You', 'Computer 1'],
      human: [true, false], openHands: true, eventPause: true });
    // stack the hands by swapping cards with the player deck (the Epidemics stay where they are)
    const want = [[I['Chicago'], I['Montréal'], I['New York'], I['Miami']], [I['Atlanta']]];
    want.forEach((cards, p) => cards.forEach(c => {
      const h = s.hands[p];
      if (h.includes(c)) return;
      const slot = h.findIndex(x => !want[p].includes(x));
      const out = h[slot];
      let k = s.pdeck.indexOf(c);
      if (k >= 0) { s.pdeck[k] = out; h[slot] = c; return; }
      const q = s.hands.findIndex(x => x.includes(c));
      const hq = s.hands[q], kq = hq.indexOf(c);
      // the other hand gives c and takes a card from the deck that nobody wants (keeps both hands their size)
      k = s.pdeck.findIndex((x, i) => i < s.pdeck.length - 4 && x !== D.EPIDEMIC && !want.some(w => w.includes(x)));
      hq[kq] = s.pdeck[k]; s.pdeck[k] = out; h[slot] = c;
    }));
    s.cur = 0; s.first = 0; s.left = 4;
    s.log = [{ t: 1, m: 'Guided game: you go first.' }];
    return s;
  }

  // steps follow the game's own state. ctx.v() = the guided game's view (null otherwise), ctx.wide() = laptop layout
  function steps(ctx) {
    const v = () => ctx.v();
    const me = () => { const x = v(); return x && x.phase === 'actions' && x.cur === 0 && !x.over ? x : null; };
    const W = I['Washington'], A = I['Atlanta'];
    // a step whose chance has passed is skipped, so the guide never waits for something that can't happen any more
    const past = () => { const x = v(); return !!x && (x.over || x.turn > 1 || x.cur !== 0); };
    const cantShare = () => { const x = v(); return !!x && !x.hands[0].includes(A) && (x.pawns[0] !== A || !x.hands.some(h => h.includes(A))); };
    const cantCure = () => { const x = v(); return !!x && !x.cured[0] && (cantShare() || x.pawns[0] !== A); };
    return [
      { title: 'One team', target: '#g-players', next: true,
        text: 'Pandemic is played together: you and your computer teammate win or lose as a team. Find a cure for all four diseases before the outbreaks, the cubes or the player cards run out.' },
      { title: 'Your hand', target: '#g-hand', next: true,
        text: 'You are the Scientist: a cure takes you only 4 cards of one colour (others need 5). You hold 3 blue. Your teammate, in Atlanta with you, holds the Atlanta card.' },
      { title: 'Share a card', target: '[data-g="share"]', skipIf: () => past() || cantShare(), when: () => !!me(), until: () => { const x = v(); return !!x && x.hands[0].includes(A); },
        text: 'Two players in the same city can pass that city’s card. Tap Share, then Take Atlanta.' },
      { title: 'Discover a cure', target: '[data-cure="0"]', skipIf: () => past() || cantCure(), when: () => !!me(), until: () => { const x = v(); return !!x && !!x.cured[0]; },
        text: 'Four blue cards at a research station (Atlanta has one): tap Cure. Each action costs one of your 4 actions a turn.' },
      // once a city is picked the bubble moves to its panel, so it never covers the Drive button
      { title: 'Move', target: () => (typeof document !== 'undefined' && document.querySelector('#g-info [data-mv]') ? '#g-info' : '#g-map'), skipIf: past, when: () => !!me(), until: () => { const x = v(); return !!x && x.pawns[0] === W; },
        text: 'Washington has 3 blue cubes. Tap Washington on the board (tap again if the board zooms in), then Drive.' },
      { title: 'Treat', target: '#g-acts', skipIf: () => past() || (() => { const x = v(); return !!x && x.pawns[0] !== W && x.left === 0; })(), when: () => !!me() && me().pawns[0] === W, until: () => { const x = v(); return !!x && !x.cubes[W * 4]; },
        text: 'Treat removes one cube, but blue is cured now, so one Treat clears all three.' },
      { title: 'End of the turn', target: '#g-map', when: () => { const x = v(); return !!x && (x.turn > 1 || x.cur !== 0); }, next: true,
        text: 'Your 4 actions are used, so your turn ended (End turn does it early). You drew 2 player cards, then infection cards were flipped: each puts a cube on its city. A fourth cube makes an outbreak.' },
      { title: 'The odds', target: () => (ctx.wide() ? '#g-side' : '#g-risk'), next: true,
        text: 'Here is the exact chance each city is infected next and the chance of an Epidemic in the next 2 cards. Cities with 3 cubes come first: treat those.' },
      { title: 'You’re ready', target: '#g-menu', next: true,
        text: 'Hint shows the planner’s best 4 actions. Undo takes back an action in your turn. The rules are in this menu. Cure all four to win!' },
    ];
  }

  const RULES = {
    title: 'Pandemic rules',
    intro: 'Two to four players work as one team of disease experts to cure four diseases before they spread out of control.',
    foot: 'Fan-made summary in our own words of the second edition (2013). Not affiliated with any game publisher.',
    sections: [
      { id: 'goal', title: 'The goal', short: 'Goal', html: '<p>Discover a cure for all four diseases (blue, yellow, black and red). Everyone wins together or loses together.</p>' +
        '<p>The team loses at once if there are 8 outbreaks, if a disease needs cubes and none are left, or if a player can’t draw 2 player cards at the end of a turn.</p>' },
      { id: 'setup', title: 'Setting up', short: 'Setup', html: '<p>Everyone starts in Atlanta, which has the first research station. Flip 9 infection cards: 3 cities get 3 cubes, 3 get 2 and 3 get 1.</p>' +
        '<p>Deal player cards (4 each with 2 players, 3 with 3, 2 with 4). Split the rest into piles, one per Epidemic card, shuffle one Epidemic into each pile and stack them.</p>' +
        '<table><tr><th>Level</th><th>Epidemics</th></tr><tr><td>Introductory</td><td>4</td></tr><tr><td>Standard</td><td>5</td></tr><tr><td>Heroic</td><td>6</td></tr></table>' },
      { id: 'turn', title: 'Your turn', short: 'Turn', html: '<ol><li>Do up to 4 actions.</li><li>Draw 2 player cards (an Epidemic happens at once).</li><li>Infect: flip as many infection cards as the infection rate and put 1 cube on each city.</li></ol>' +
        '<p>You may hold 7 cards. With more, discard or play events down to 7.</p>' },
      { id: 'move', title: 'Moving', short: 'Move', html: '<ul><li><b>Drive</b> to a connected city.</li><li><b>Direct flight</b>: discard a city card to fly to that city.</li>' +
        '<li><b>Charter flight</b>: discard the card of the city you are in to fly anywhere.</li><li><b>Shuttle</b> between two research stations.</li></ul>' },
      { id: 'actions', title: 'Other actions', short: 'Actions', html: '<ul><li><b>Build</b> a research station: discard the card of the city you are in (6 at most).</li>' +
        '<li><b>Treat</b>: remove 1 cube from your city, or all cubes of a cured colour.</li>' +
        '<li><b>Share knowledge</b>: give or take the card of the city you are both in.</li>' +
        '<li><b>Discover a cure</b>: at a research station, discard 5 cards of one colour.</li></ul>' },
      { id: 'epidemic', title: 'Epidemics', short: 'Epidemic', html: '<ol><li><b>Increase</b>: the infection rate moves up one step (2-2-2-3-3-4-4).</li>' +
        '<li><b>Infect</b>: the bottom infection card gets 3 cubes.</li><li><b>Intensify</b>: shuffle the infection discard pile and put it back on top.</li></ol>' +
        '<p class="tip">After an Epidemic the cities just infected come up again first. That is what the odds on the board count exactly.</p>' },
      { id: 'outbreak', title: 'Outbreaks', short: 'Outbreak', html: '<p>A city that would get a 4th cube of a colour outbreaks instead: the outbreak marker moves up and every connected city gets 1 cube of that colour. That can set off more outbreaks, but each city outbreaks at most once per chain.</p>' },
      { id: 'cure', title: 'Cures', short: 'Cures', html: '<p>A cured disease still spreads, but Treat removes all its cubes from a city. Once a cured disease has no cubes left on the board it is <b>eradicated</b>: its infection cards do nothing any more.</p>' },
      { id: 'roles', title: 'Roles', short: 'Roles', html: '<p>Each player has a role that bends one rule.</p><ul>' +
        D.ROLES.filter(r => !r.extra).map(r => '<li><b>' + r.name + '</b>: ' + r.text + '</li>').join('') + '</ul>' },
      { id: 'events', title: 'Events', short: 'Events', html: '<p>Event cards are played at any time (here: when the game asks, before infections) and don’t cost an action.</p><ul>' +
        D.EVENTS.filter(e => !e.extra).map(e => '<li><b>' + e.name + '</b>: ' + e.text + '</li>').join('') + '</ul>' },
      { id: 'variants', title: 'Variants', short: 'Variants', html: '<p>Off unless you turn them on in Settings.</p>' +
        '<p><b>Extra roles &amp; events</b>: three more roles join the role pool, and the deck gets 2 events per player, drawn at random from all eight (the rule of the expansion this follows; our own names).</p><ul>' +
        D.ROLES.filter(r => r.extra).map(r => '<li><b>' + r.name + '</b> (role): ' + r.text + '</li>').join('') +
        D.EVENTS.filter(e => e.extra).map(e => '<li><b>' + e.name + '</b> (event): ' + e.text + '</li>').join('') + '</ul>' +
        '<p><b>Legendary level</b>: 7 Epidemic cards, so 7 piles. Harder than Heroic.</p>' +
        '<p><b>Hands</b>: the rulebook keeps hands face up only in the Introductory game; many groups always play open. Settings → Hands.</p>' },
      { id: 'videos', title: 'Learn by video', short: 'Videos', html: '<p>Real videos on YouTube (opens a new tab).</p><ul class="vids">' +
        [['ojkScPkdgsk', 'Pandemic - How To Play', 'Watch It Played'],
          ['ytK1zDPPDhw', 'Pandemic on TableTop, episode 14 (a full game)', 'Geek & Sundry'],
          ['DLmBx7Eznsc', 'Pandemic Strategy Guide / Top 10 Tips', 'Legendary Tactics'],
          ['OAF-VtnveRs', 'How to Play: Pandemic On the Brink expansion (more roles, events, challenges)', 'The Hobbyist']]
          .map(x => '<li><a href="https://www.youtube.com/watch?v=' + x[0] + '" target="_blank" rel="noopener">' + x[1] + '</a> · ' + x[2].replace('&', '&amp;') + '</li>').join('') + '</ul>' },
      { id: 'app', title: 'In this app', short: 'App', html: '<p><b>Hint</b> shows the planner’s best 4 actions. <b>Undo</b> takes back an action in your own turn (not after cards are drawn). A game with Hint or Undo counts as “with help” in My stats, so it doesn’t change your rating.</p>' +
        '<p>The <b>Daily game</b> is the same deal for everyone that day: 2 players, Standard. It has no Undo.</p>' },
    ],
  };

  root.PanTutorial = { SEED, game, steps, RULES };
})(typeof self !== 'undefined' ? self : this);
