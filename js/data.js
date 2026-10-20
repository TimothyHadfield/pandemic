/* Pandemic (2013 2nd edition) facts: 48 cities with their board links, card populations,
   roles, events and setup numbers. Sources are listed in docs/rules-check.md.
   Map positions are our own layout on a 1000 x 500 board (not traced from the real board). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PanData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const COLORS = ['blue', 'yellow', 'black', 'red'];
  const COLOR_NAMES = ['Blue', 'Yellow', 'Black', 'Red'];
  // [name, colour, x, y, population]
  const RAW = [
    ['San Francisco', 0, 55, 160, 5864000],
    ['Chicago', 0, 150, 132, 9121000],
    ['Montréal', 0, 228, 112, 3429000],
    ['New York', 0, 300, 135, 20464000],
    ['Washington', 0, 268, 188, 4679000],
    ['Atlanta', 0, 168, 192, 4715000],
    ['London', 0, 425, 108, 8586000],
    ['Madrid', 0, 418, 178, 5427000],
    ['Paris', 0, 486, 150, 10755000],
    ['Essen', 0, 500, 92, 575000],
    ['Milan', 0, 553, 128, 5232000],
    ['St. Petersburg', 0, 592, 78, 4879000],

    ['Los Angeles', 1, 72, 238, 14900000],
    ['Mexico City', 1, 150, 268, 19463000],
    ['Miami', 1, 236, 252, 5582000],
    ['Bogotá', 1, 240, 322, 8702000],
    ['Lima', 1, 203, 388, 9121000],
    ['Santiago', 1, 212, 458, 6015000],
    ['Buenos Aires', 1, 296, 452, 13639000],
    ['São Paulo', 1, 338, 396, 20186000],
    ['Lagos', 1, 478, 300, 11547000],
    ['Kinshasa', 1, 530, 352, 9046000],
    ['Johannesburg', 1, 578, 422, 3888000],
    ['Khartoum', 1, 592, 295, 4887000],

    ['Algiers', 2, 494, 216, 2946000],
    ['Istanbul', 2, 582, 168, 13576000],
    ['Moscow', 2, 652, 122, 15512000],
    ['Cairo', 2, 560, 242, 14718000],
    ['Baghdad', 2, 636, 205, 6204000],
    ['Riyadh', 2, 642, 282, 5037000],
    ['Tehran', 2, 702, 155, 7419000],
    ['Karachi', 2, 706, 235, 20711000],
    ['Delhi', 2, 772, 192, 22242000],
    ['Mumbai', 2, 716, 300, 16910000],
    ['Chennai', 2, 782, 335, 8865000],
    ['Kolkata', 2, 832, 222, 14374000],

    ['Beijing', 3, 880, 135, 17311000],
    ['Seoul', 3, 944, 128, 22547000],
    ['Tokyo', 3, 982, 182, 13189000],
    ['Shanghai', 3, 882, 190, 13482000],
    ['Osaka', 3, 978, 242, 2871000],
    ['Taipei', 3, 938, 268, 8338000],
    ['Hong Kong', 3, 884, 262, 7106000],
    ['Bangkok', 3, 836, 302, 7151000],
    ['Manila', 3, 958, 334, 20767000],
    ['Ho Chi Minh City', 3, 890, 348, 8314000],
    ['Jakarta', 3, 842, 398, 26063000],
    ['Sydney', 3, 962, 456, 3785000],
  ];
  const LINKS = [
    ['San Francisco', 'Tokyo'], ['San Francisco', 'Manila'], ['San Francisco', 'Los Angeles'], ['San Francisco', 'Chicago'],
    ['Chicago', 'Los Angeles'], ['Chicago', 'Mexico City'], ['Chicago', 'Atlanta'], ['Chicago', 'Montréal'],
    ['Montréal', 'Washington'], ['Montréal', 'New York'],
    ['New York', 'Washington'], ['New York', 'London'], ['New York', 'Madrid'],
    ['Washington', 'Atlanta'], ['Washington', 'Miami'],
    ['Atlanta', 'Miami'],
    ['London', 'Madrid'], ['London', 'Essen'], ['London', 'Paris'],
    ['Madrid', 'Paris'], ['Madrid', 'Algiers'], ['Madrid', 'São Paulo'],
    ['Paris', 'Essen'], ['Paris', 'Milan'], ['Paris', 'Algiers'],
    ['Essen', 'Milan'], ['Essen', 'St. Petersburg'],
    ['Milan', 'Istanbul'],
    ['St. Petersburg', 'Istanbul'], ['St. Petersburg', 'Moscow'],

    ['Los Angeles', 'Mexico City'], ['Los Angeles', 'Sydney'],
    ['Mexico City', 'Miami'], ['Mexico City', 'Bogotá'], ['Mexico City', 'Lima'],
    ['Miami', 'Bogotá'],
    ['Bogotá', 'Lima'], ['Bogotá', 'Buenos Aires'], ['Bogotá', 'São Paulo'],
    ['Lima', 'Santiago'],
    ['Buenos Aires', 'São Paulo'],
    ['São Paulo', 'Lagos'],
    ['Lagos', 'Kinshasa'], ['Lagos', 'Khartoum'],
    ['Kinshasa', 'Khartoum'], ['Kinshasa', 'Johannesburg'],
    ['Johannesburg', 'Khartoum'],
    ['Khartoum', 'Cairo'],

    ['Algiers', 'Istanbul'], ['Algiers', 'Cairo'],
    ['Cairo', 'Istanbul'], ['Cairo', 'Baghdad'], ['Cairo', 'Riyadh'],
    ['Istanbul', 'Moscow'], ['Istanbul', 'Baghdad'],
    ['Moscow', 'Tehran'],
    ['Baghdad', 'Riyadh'], ['Baghdad', 'Karachi'], ['Baghdad', 'Tehran'],
    ['Riyadh', 'Karachi'],
    ['Tehran', 'Karachi'], ['Tehran', 'Delhi'],
    ['Karachi', 'Mumbai'], ['Karachi', 'Delhi'],
    ['Delhi', 'Mumbai'], ['Delhi', 'Chennai'], ['Delhi', 'Kolkata'],
    ['Mumbai', 'Chennai'],
    ['Chennai', 'Kolkata'], ['Chennai', 'Bangkok'], ['Chennai', 'Jakarta'],
    ['Kolkata', 'Bangkok'], ['Kolkata', 'Hong Kong'],

    ['Beijing', 'Seoul'], ['Beijing', 'Shanghai'],
    ['Seoul', 'Shanghai'], ['Seoul', 'Tokyo'],
    ['Tokyo', 'Shanghai'], ['Tokyo', 'Osaka'],
    ['Shanghai', 'Taipei'], ['Shanghai', 'Hong Kong'],
    ['Osaka', 'Taipei'],
    ['Taipei', 'Hong Kong'], ['Taipei', 'Manila'],
    ['Hong Kong', 'Manila'], ['Hong Kong', 'Ho Chi Minh City'], ['Hong Kong', 'Bangkok'],
    ['Bangkok', 'Jakarta'], ['Bangkok', 'Ho Chi Minh City'],
    ['Manila', 'Ho Chi Minh City'], ['Manila', 'Sydney'],
    ['Ho Chi Minh City', 'Jakarta'],
    ['Jakarta', 'Sydney'],
  ];
  // links drawn off the map edge (across the Pacific)
  const WRAP = [['San Francisco', 'Tokyo'], ['San Francisco', 'Manila'], ['Los Angeles', 'Sydney']];

  const CITIES = RAW.map((r, i) => ({ i, name: r[0], color: r[1], x: r[2], y: r[3], pop: r[4], adj: [] }));
  const IDX = {};
  CITIES.forEach(c => { IDX[c.name] = c.i; });
  LINKS.forEach(([a, b]) => {
    const A = IDX[a], B = IDX[b];
    if (A === undefined || B === undefined) throw new Error('bad link ' + a + ' - ' + b);
    if (!CITIES[A].adj.includes(B)) CITIES[A].adj.push(B);
    if (!CITIES[B].adj.includes(A)) CITIES[B].adj.push(A);
  });
  const N = CITIES.length; // 48
  const ATLANTA = IDX['Atlanta'];

  // shortest drive distance between every pair (for the computer and the planner)
  const DIST = [];
  for (let s = 0; s < N; s++) {
    const d = new Array(N).fill(99);
    d[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of CITIES[u].adj) if (d[v] === 99) { d[v] = d[u] + 1; q.push(v); }
    }
    DIST.push(d);
  }

  // Player-card ids: 0..47 city cards, 48..52 events, 60 epidemic
  const EVENTS = [
    { id: 48, key: 'airlift', name: 'Airlift', text: 'Move any one pawn to any city.' },
    { id: 49, key: 'forecast', name: 'Forecast', text: 'Look at the top 6 infection cards and put them back in any order.' },
    { id: 50, key: 'grant', name: 'Government Grant', text: 'Add a research station to any city. No city card needed.' },
    { id: 51, key: 'quiet', name: 'One Quiet Night', text: 'Skip the next Infect Cities step.' },
    { id: 52, key: 'resilient', name: 'Resilient Population', text: 'Remove one card in the infection discard pile from the game.' },
  ];
  const EPIDEMIC = 60;
  const EV = {};
  EVENTS.forEach(e => { EV[e.key] = e.id; });

  const ROLES = [
    { key: 'planner', name: 'Contingency Planner', color: '#4fb8c9',
      text: 'As an action, take an event card from the discard pile and keep it on this card (one at a time). When played, it leaves the game.' },
    { key: 'dispatcher', name: 'Dispatcher', color: '#d77ad9',
      text: 'Move other pawns as if they were your own. As an action, move any pawn to a city that has another pawn.' },
    { key: 'medic', name: 'Medic', color: '#f08c3c',
      text: 'Treat removes all cubes of a colour. Cured colours are removed from your city for free and cannot be placed there.' },
    { key: 'ops', name: 'Operations Expert', color: '#7ccf6e',
      text: 'Build a research station without a card. Once a turn, move from a station to any city by discarding any city card.' },
    { key: 'quarantine', name: 'Quarantine Specialist', color: '#3f8f5b',
      text: 'No cubes are placed (and no outbreaks happen) in your city or the cities linked to it.' },
    { key: 'researcher', name: 'Researcher', color: '#b58a5a',
      text: 'When sharing, you may give any city card, not just the one for your city.' },
    { key: 'scientist', name: 'Scientist', color: '#e8e8ee',
      text: 'You need only 4 cards of the same colour to discover a cure.' },
  ];
  const ROLE_IDX = {};
  ROLES.forEach((r, i) => { ROLE_IDX[r.key] = i; });

  const RATE_TRACK = [2, 2, 2, 3, 3, 4, 4];
  const MAX_OUTBREAKS = 8;
  const CUBES_PER_COLOR = 24;
  const MAX_STATIONS = 6;
  const HAND_LIMIT = 7;
  const DEAL = { 2: 4, 3: 3, 4: 2 };
  const LEVELS = [
    { key: 'intro', name: 'Introductory', epidemics: 4 },
    { key: 'standard', name: 'Standard', epidemics: 5 },
    { key: 'heroic', name: 'Heroic', epidemics: 6 },
  ];

  function cardName(id) {
    if (id === EPIDEMIC) return 'Epidemic';
    if (id >= 48) return EVENTS[id - 48].name;
    return CITIES[id].name;
  }
  const isCity = id => id >= 0 && id < 48;
  const isEvent = id => id >= 48 && id <= 52;

  return { COLORS, COLOR_NAMES, CITIES, IDX, LINKS, WRAP, N, ATLANTA, DIST, EVENTS, EV, EPIDEMIC, ROLES, ROLE_IDX,
    RATE_TRACK, MAX_OUTBREAKS, CUBES_PER_COLOR, MAX_STATIONS, HAND_LIMIT, DEAL, LEVELS, cardName, isCity, isEvent };
});
