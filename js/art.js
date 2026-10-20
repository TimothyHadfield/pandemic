/* Our own drawings: the world board (SVG, built once and updated in place so pawns glide and
   new cubes pop in), player cards, role badges. Nothing here is traced from the published game. */
(function (root) {
  'use strict';
  const D = root.PanData;
  const NS = 'http://www.w3.org/2000/svg';
  const HEX = ['#4f8ff7', '#f2c94c', '#3a3d4a', '#e5484d'];
  const LIGHT = ['#9cc0ff', '#ffe08a', '#a7abbd', '#ff9a9d'];
  const W = 1000, H = 500;

  // real coastlines (Natural Earth, public domain), built by tools/build-map.js into js/map-data.js
  const MAP = root.PanMap || { land: '', lakes: '', labelUp: [] };
  const LABEL_UP = new Set(MAP.labelUp);
  // land a clear step lighter than the dark sea, so the continents read at a glance
  const LAND_FILL = '#2c4a52', COAST = '#5b8290';
  // a label sits under its city, or above it where the map builder found a clash below
  const lblY = (i, off, fs) => D.CITIES[i].y + (LABEL_UP.has(i) ? fs * 0.75 - off : off);

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  const ROLE_GLYPH = {
    planner: 'M7 4h10v16H7z M9 2h6v4H9z M9 10h6 M9 14h4',
    dispatcher: 'M4 12h16 M14 6l6 6-6 6 M10 6L4 12l6 6',
    medic: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
    ops: 'M4 20V10l8-6 8 6v10z M10 20v-6h4v6',
    quarantine: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    researcher: 'M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z M20 5h-6 M20 5v13h-6',
    scientist: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  };
  function roleIcon(roleIdx, size) {
    const r = D.ROLES[roleIdx];
    return '<svg viewBox="0 0 24 24" width="' + (size || 14) + '" height="' + (size || 14) + '" fill="none" stroke="' + r.color +
      '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="' + ROLE_GLYPH[r.key] + '"/></svg>';
  }
  const EVENT_GLYPH = {
    48: 'M3 14l18-7-6 13-3-6z', // airlift: plane-ish arrow
    49: 'M3 12c3-5 15-5 18 0-3 5-15 5-18 0z M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', // forecast: eye
    50: 'M4 20V10l8-6 8 6v10z M9 14h6 M12 11v6', // grant: station plus
    51: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z', // quiet night: moon
    52: 'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z', // resilient: heart
  };
  // the world outline once, as a picture (an image is painted once and reused; a live outline in every card
  // made each frame of the board's zoom glide repaint dozens of coastlines), so every city card can show where its city is
  const WORLD = {};
  function world(fill) {
    if (WORLD[fill] !== undefined) return WORLD[fill];
    let u = '';
    try {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" width="1000" height="500"><path fill="' + fill + '" d="' + MAP.land + '"/></svg>';
      u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    } catch (e) { u = ''; }
    return (WORLD[fill] = u);
  }
  const worldImg = fill => { const u = world(fill); return u ? '<image href="' + u + '" width="1000" height="500" preserveAspectRatio="none"/>' : ''; };
  const soft = name => name.replace(/\b(Johannes|Washing|Fran|Peters|Govern|Popu)(burg|ton|cisco|ment|lation)\b/g, '$1&shy;$2');
  // a real player card at poker proportions (63:88): city cards in their disease colour with the city name on top,
  // a small world map with the city marked and the population at the foot; events golden; Epidemic green.
  // o.tag 'span' for cards that are only looked at (teammates' hands, flips); o.cls / o.attr as before
  function cardHtml(id, o) {
    o = o || {};
    const tag = o.tag || 'button';
    const cls = ['pc', 'tbl-card', o.cls || ''];
    let inner;
    if (id === D.EPIDEMIC) {
      cls.push('epi');
      inner = '<span class="pc-nm">Epidemic</span><svg class="pc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8V3.5M9.2 13.6l-4.6 2.7M14.8 13.6l4.6 2.7M7.5 4.8a7 7 0 0 0 9 0M3.9 16.5a7 7 0 0 0 4.5 4.6M20.1 16.5a7 7 0 0 1-4.5 4.6"/></svg>' +
        (o.city !== undefined ? '<span class="pc-pp">' + D.CITIES[o.city].name + '</span>' : '<span class="pc-pp">Increase · Infect · Intensify</span>');
    } else if (D.isEvent(id)) {
      cls.push('ev');
      inner = '<span class="pc-nm">' + soft(D.EVENTS[id - 48].name) + '</span><svg class="pc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="' + EVENT_GLYPH[id] + '"/></svg><span class="pc-pp">Event</span>';
    } else {
      const c = D.CITIES[id];
      cls.push('c' + c.color);
      inner = '<span class="pc-nm">' + soft(c.name) + '</span>' +
        '<svg class="pc-map" viewBox="0 30 1000 440" aria-hidden="true">' + worldImg(c.color === 1 ? 'rgba(70,45,0,.28)' : 'rgba(255,255,255,.3)') + '<circle cx="' + c.x + '" cy="' + c.y + '" r="34"/></svg>' +
        '<span class="pc-pp">' + (c.pop / 1e6).toFixed(1) + 'M</span>';
    }
    return '<' + tag + ' class="' + cls.join(' ') + '"' + (o.attr || '') + (o.style ? ' style="' + o.style + '"' : '') + '>' + inner + '</' + tag + '>';
  }
  // an infection card face: the city on a stripe of its disease colour, on the green infection card stock
  function infHtml(c, o) {
    o = o || {};
    const city = D.CITIES[c];
    return '<span class="ic-card tbl-card c' + city.color + (o.cls ? ' ' + o.cls : '') + '"><span class="ic-strip"><i></i><b>' + soft(city.name) + '</b></span><span class="ic-foot">Infect</span></span>';
  }
  // card backs: player cards blue, infection cards green (our own emblems)
  function backHtml(kind, o) {
    o = o || {};
    return '<span class="tbl-card tbl-back ' + (kind === 'inf' ? 'pan-iback' : 'pan-pback') + (o.cls ? ' ' + o.cls : '') + '"' + (o.style ? ' style="' + o.style + '"' : '') + '></span>';
  }
  // a role card: the role's colour (same as its pawn), its sign, its name
  function roleCardHtml(roleIdx, o) {
    o = o || {};
    const r = D.ROLES[roleIdx];
    const nm = r.name.replace('Contingency ', '').replace('Operations', 'Ops').replace('Quarantine Specialist', 'Quarantine');
    return '<span class="rc tbl-card' + (o.cls ? ' ' + o.cls : '') + '" style="--rc:' + r.color + '"' + (o.attr || '') + '>' +
      '<span class="rc-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + ROLE_GLYPH[r.key] + '"/></svg></span>' +
      '<span class="rc-nm">' + nm + '</span></span>';
  }

  // ------------------------------------------------------------------ the board
  function createMap(box, opts) {
    opts = opts || {};
    box.classList.add('map');
    const zi = d => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="' + d + '"/></svg>';
    box.innerHTML = '<div class="zctl">' +
      '<button class="zbtn" data-z="out" aria-label="Zoom out">' + zi('M5 12h14') + '</button>' +
      '<button class="zbtn" data-z="in" aria-label="Zoom in">' + zi('M5 12h14M12 5v14') + '</button>' +
      '<button class="zbtn" data-z="fit" aria-label="Whole map">' + zi('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5') + '</button></div>';
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-label': 'World map' });
    box.insertBefore(svg, box.firstChild);
    const defs = el('defs', {}, svg);
    const g1 = el('radialGradient', { id: 'oc', gradientUnits: 'userSpaceOnUse', cx: W / 2, cy: H * 0.45, r: W * 0.75 }, defs);
    el('stop', { offset: '0', 'stop-color': '#12304a' }, g1);
    el('stop', { offset: '1', 'stop-color': '#0a1626' }, g1);
    // the board is a real folded board lying on the table: everything printed is clipped to it, past its edge is table
    el('rect', { x: 0, y: 0, width: W, height: H }, el('clipPath', { id: 'brd' }, defs));
    const sh = el('filter', { id: 'bshadow', x: '-5%', y: '-5%', width: '110%', height: '115%' }, defs);
    el('feGaussianBlur', { stdDeviation: 5 }, sh);
    const pf = el('filter', { id: 'piece', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feDropShadow', { dx: 0.8, dy: 1.4, stdDeviation: 0.9, 'flood-color': '#000', 'flood-opacity': 0.55 }, pf);
    // card backs printed on the board's deck spaces (our own emblems): player cards blue, infection cards green
    const back = (id, base, ink, emblem) => {
      const s = el('symbol', { id, viewBox: '0 0 50 70' }, defs);
      el('rect', { x: 0, y: 0, width: 50, height: 70, rx: 3.5, fill: '#f4f1e8' }, s);
      el('rect', { x: 2.6, y: 2.6, width: 44.8, height: 64.8, rx: 2.4, fill: base }, s);
      el('path', { d: emblem, fill: 'none', stroke: ink, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, s);
    };
    back('pb', '#1f4378', 'rgba(255,255,255,.55)', 'M25 23a12 12 0 1 0 .01 0z M13 35h24 M25 23c-5 4-5 20 0 24 M25 23c5 4 5 20 0 24');
    back('ib', '#2d6b45', 'rgba(220,255,225,.6)', 'M25 31a4 4 0 1 0 .01 0z M25 31v-8 M21.5 37l-7 4 M28.5 37l7 4 M18 25.5a10 10 0 0 0 14 0 M15 44a10 10 0 0 0 6 6.5 M35 44a10 10 0 0 1-6 6.5');
    // board edge: a soft shadow on the table, the board's thickness, the printed frame
    el('rect', { x: -4, y: 2, width: W + 8, height: H + 6, rx: 6, fill: 'rgba(0,0,0,.55)', filter: 'url(#bshadow)' }, svg);
    el('rect', { x: -6, y: -6, width: W + 12, height: H + 15, rx: 5, fill: '#050b14' }, svg);
    el('rect', { x: -6, y: -6, width: W + 12, height: H + 12, rx: 5, fill: '#132640' }, svg);
    el('rect', { x: -2.5, y: -2.5, width: W + 5, height: H + 5, rx: 2.5, fill: 'none', stroke: '#c9a45a', 'stroke-opacity': .55, 'stroke-width': 1 }, svg);
    const board = el('g', { 'clip-path': 'url(#brd)' }, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#oc)' }, board);
    const grid = el('g', { stroke: '#1d3a57', 'stroke-width': 1, opacity: .55 }, board);
    for (let x = 100; x < W; x += 100) el('line', { x1: x, y1: 0, x2: x, y2: H }, grid);
    for (let y = 100; y < H; y += 100) el('line', { x1: 0, y1: y, x2: W, y2: y }, grid);
    el('path', { d: MAP.land, fill: LAND_FILL, stroke: COAST, 'stroke-width': 1, 'stroke-linejoin': 'round' }, board);
    el('path', { d: MAP.lakes, fill: 'url(#oc)', stroke: COAST, 'stroke-width': .8 }, board);
    // the printed tracks and card spaces, where the real board has them
    const P = { fill: 'rgba(8,18,32,.62)', stroke: 'rgba(201,164,90,.55)', 'stroke-width': 1 };
    const title = (x, y, t, anchor) => { const e = el('text', { x, y, class: 'ptitle', 'text-anchor': anchor || 'middle' }, board); e.textContent = t; return e; };
    // infection rate: top edge, centre-right (2 2 2 3 3 4 4)
    el('rect', Object.assign({ x: 602, y: 5, width: 212, height: 50, rx: 7 }, P), board);
    title(708, 19, 'INFECTION RATE');
    const RATE_XY = D.RATE_TRACK.map((n, i) => ({ x: 627 + i * 27, y: 37 }));
    D.RATE_TRACK.forEach((n, i) => {
      el('circle', { cx: RATE_XY[i].x, cy: RATE_XY[i].y, r: 11, fill: '#0c2238', stroke: '#6fa0c0', 'stroke-width': 1.2 }, board);
      const t = el('text', { x: RATE_XY[i].x, y: RATE_XY[i].y + 0.5, class: 'pnum', 'font-size': 11.5 }, board); t.textContent = n;
    });
    // outbreaks: down the left side, zig-zag 0..8, the last space is the loss
    el('rect', Object.assign({ x: 14, y: 306, width: 136, height: 188, rx: 8 }, P), board);
    title(82, 321, 'OUTBREAKS');
    const OUT_XY = Array.from({ length: 9 }, (_, i) => ({ x: i % 2 ? 104 : 60, y: 343 + i * 17.6 }));
    for (let i = 0; i < 8; i++) el('line', { x1: OUT_XY[i].x, y1: OUT_XY[i].y, x2: OUT_XY[i + 1].x, y2: OUT_XY[i + 1].y, stroke: '#6fa0c0', 'stroke-opacity': .5, 'stroke-width': 1.2 }, board);
    OUT_XY.forEach((p, i) => {
      el('circle', { cx: p.x, cy: p.y, r: 10.5, fill: i === 8 ? '#5a1418' : '#0c2238', stroke: i === 8 ? '#e5484d' : i >= 5 ? '#d9824a' : '#6fa0c0', 'stroke-width': 1.2 }, board);
      const t = el('text', { x: p.x, y: p.y + 0.5, class: 'pnum', 'font-size': 10 }, board); t.textContent = i;
    });
    // cures discovered: along the bottom, one vial space per colour
    el('rect', Object.assign({ x: 338, y: 420, width: 172, height: 76, rx: 8 }, P), board);
    title(424, 435, 'CURES DISCOVERED');
    const VIAL = 'M-6 -15h12v3h-2v15a6 6 0 0 1-8 0v-15h-2z';
    const CURE_XY = [0, 1, 2, 3].map(k => ({ x: 366 + k * 39, y: 470 }));
    CURE_XY.forEach((p, k) => {
      el('circle', { cx: p.x, cy: p.y, r: 16, fill: 'none', stroke: HEX[k] === '#3a3d4a' ? '#9aa0b4' : HEX[k], 'stroke-width': 1.4, 'stroke-dasharray': '3 2.4' }, board);
      el('path', { d: VIAL, transform: 'translate(' + p.x + ' ' + (p.y + 3) + ')', fill: 'none', stroke: HEX[k] === '#3a3d4a' ? '#9aa0b4' : HEX[k], 'stroke-opacity': .55, 'stroke-width': 1 }, board);
    });
    // card spaces: player deck + discard (bottom right), infection deck + discard (top right)
    const space = (x, y, label) => {
      el('rect', { x: x - 2, y: y - 2, width: 54, height: 74, rx: 4.5, fill: 'rgba(8,18,32,.55)', stroke: 'rgba(201,164,90,.6)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }, board);
      const t = el('text', { x: x + 25, y: y + 84, class: 'ptitle', 'font-size': 8.5 }, board); t.textContent = label;
    };
    const SP = { pdeck: [618, 386], pdisc: [690, 386], ideck: [878, 14], idisc: [944, 14] };
    space(SP.pdeck[0], SP.pdeck[1], 'PLAYER DECK'); space(SP.pdisc[0], SP.pdisc[1], 'DISCARD');
    space(SP.ideck[0], SP.ideck[1], 'INFECTION'); space(SP.idisc[0], SP.idisc[1], 'DISCARD');
    // fold creases (the real board folds in quarters)
    const crease = (x1, y1, x2, y2) => {
      el('line', { x1, y1, x2, y2, stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1.4 }, board);
      el('line', { x1: x1 + (x1 === x2 ? 1.2 : 0), y1: y1 + (y1 === y2 ? 1.2 : 0), x2: x2 + (x1 === x2 ? 1.2 : 0), y2: y2 + (y1 === y2 ? 1.2 : 0), stroke: 'rgba(255,255,255,.08)', 'stroke-width': 1 }, board);
    };
    crease(W / 2, 0, W / 2, H); crease(0, H / 2, W, H / 2);
    // links (the three across the Pacific run off the board's edges)
    const links = el('g', {}, board);
    const wrap = new Set(D.WRAP.map(([a, b]) => D.IDX[a] + '-' + D.IDX[b]));
    D.LINKS.forEach(([a, b]) => {
      const A = D.CITIES[D.IDX[a]], B = D.CITIES[D.IDX[b]];
      if (wrap.has(A.i + '-' + B.i) || wrap.has(B.i + '-' + A.i)) {
        const L = A.x < B.x ? A : B, R = A.x < B.x ? B : A;
        const yMid = (L.y + R.y) / 2;
        el('line', { class: 'link', x1: L.x, y1: L.y, x2: -40, y2: yMid, 'stroke-dasharray': '5 4' }, links);
        el('line', { class: 'link', x1: R.x, y1: R.y, x2: W + 40, y2: yMid, 'stroke-dasharray': '5 4' }, links);
      } else el('line', { class: 'link', x1: A.x, y1: A.y, x2: B.x, y2: B.y }, links);
    });
    // pieces lying on the printed spaces: decks, discard piles, the two track markers, cure vials
    const pieceG = el('g', {}, svg);
    const deckG = {};
    ['pdeck', 'pdisc', 'ideck', 'idisc'].forEach(k => { deckG[k] = el('g', { class: 'spot-' + k, transform: 'translate(' + SP[k][0] + ' ' + SP[k][1] + ')' }, pieceG); });
    const marker = (fill) => {
      const g = el('g', { class: 'marker', filter: 'url(#piece)' }, pieceG);
      el('circle', { r: 8.6, fill }, g);
      el('circle', { r: 8.6, fill: 'none', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1 }, g);
      el('circle', { cx: -2.6, cy: -2.8, r: 3, fill: 'rgba(255,255,255,.45)' }, g);
      return g;
    };
    const outMark = marker('#3fae6a');
    const rateMark = marker('#3fae6a');
    const cureMarks = CURE_XY.map((p, k) => {
      const g = el('g', { class: 'cure', transform: 'translate(' + p.x + ' ' + (p.y + 3) + ')', filter: 'url(#piece)', visibility: 'hidden' }, pieceG);
      el('path', { d: VIAL, fill: HEX[k], stroke: k === 2 ? '#9aa0b4' : 'rgba(0,0,0,.5)', 'stroke-width': 1 }, g);
      el('path', { d: 'M-3.5 -10v10', stroke: 'rgba(255,255,255,.5)', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
      const erad = el('path', { d: 'M-8 -1a8 8 0 0 1 16 0z M-9 1h18', fill: '#f0b354', stroke: '#24180a', 'stroke-width': .8, visibility: 'hidden' }, g);
      return { g, erad };
    });
    const reachG = el('g', {}, svg);
    const riskG = el('g', {}, svg);
    const cityG = el('g', {}, svg);
    const lblG = el('g', {}, svg);
    const pawnG = el('g', {}, svg);
    const fxG = el('g', {}, svg);
    const cities = D.CITIES.map(c => {
      const g = el('g', { class: 'city', transform: 'translate(' + c.x + ' ' + c.y + ')' }, cityG);
      // a small wooden house: front, side and roof
      const station = el('g', { class: 'station', visibility: 'hidden', filter: 'url(#piece)' }, g);
      el('path', { d: 'M-19 -4 L-13 -10 L-7 -4 L-7 4 L-19 4 Z', fill: '#f4f1e8', stroke: '#2a2a2a', 'stroke-width': .7 }, station);
      el('path', { d: 'M-7 -4 L-13 -10 L-10 -12 L-4 -6 Z', fill: '#d8d2c2', stroke: '#2a2a2a', 'stroke-width': .7 }, station);
      el('path', { d: 'M-7 -4 L-4 -6 L-4 2 L-7 4 Z', fill: '#bdb6a3', stroke: '#2a2a2a', 'stroke-width': .7 }, station);
      el('circle', { class: 'city-halo', r: 10.2 }, g);
      const dot = el('circle', { class: 'city-dot', r: 8, fill: HEX[c.color] }, g);
      if (c.color === 2) dot.classList.add('blk');
      el('circle', { class: 'city-shine', cx: -2.4, cy: -2.6, r: 2.6 }, g);
      const sel = el('circle', { class: 'ring-sel', r: 14, visibility: 'hidden' }, g);
      // disease cubes sit beside the city, like real cubes (no printed number)
      const others = el('g', { class: 'cubes' }, g);
      const lbl = el('text', { class: 'lbl', x: c.x, y: lblY(c.i, 21, 11), 'text-anchor': 'middle', 'font-size': 11 }, lblG);
      lbl.textContent = c.name;
      const risk = el('circle', { class: 'riskring', cx: c.x, cy: c.y, r: 12, visibility: 'hidden' }, riskG);
      return { g, station, dot, sel, others, lbl, risk, last: [0, 0, 0, 0], key: '' };
    });
    const pawns = [];
    // ---------------------------------------------------------------- zoom: one auto fit, manual zoom on demand
    // Auto (default): the whole board fits the box, centred, with a small margin, and re-fits whenever the box
    // changes size. Pinch / wheel / + zooms in (drag then pans); the fit button or zooming back out returns to auto.
    const PAD = 8; // px of sea around the board in auto
    let vb = { x: 0, y: 0, w: W, h: H }, base = { x: 0, y: 0, w: W, h: H };
    let auto = true, boxW = 0, boxH = 0, anim = 0;
    let scale = 1;
    let last = null;

    function fitBox() {
      const s = Math.min((boxW - 2 * PAD) / W, (boxH - 2 * PAD) / H);
      const w = boxW / s, h = boxH / s;
      return { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }
    // the box changed size (load, tab return, rotation, panels, phone toolbar)
    function fit(instant) {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) { boxW = boxH = 0; return; }
      const wasHidden = !boxW, flipped = boxW && (boxW > boxH) !== (r.width > r.height);
      const old = base;
      boxW = r.width; boxH = r.height;
      base = fitBox();
      if (wasHidden || flipped) auto = true;
      if (auto) { if (wasHidden || instant === true) set(base); else glide(base); return; }
      // zoomed: keep the same zoom and centre in the new box shape
      stop();
      const z = vb.w / old.w, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
      const w = base.w * z, h = base.h * z;
      set(clamp({ x: cx - w / 2, y: cy - h / 2, w, h }));
    }
    // keep a manual view between 1x (= auto) and 4x, and keep the board on screen
    function clamp(v) {
      v = Object.assign({}, v);
      if (v.w >= base.w - 0.5) { auto = true; return Object.assign({}, base); }
      auto = false;
      const minW = base.w / 4;
      if (v.w < minW) { const k = minW / v.w; v.x += v.w * (1 - k) / 2; v.y += v.h * (1 - k) / 2; v.w *= k; v.h *= k; }
      const m = PAD * v.w / boxW; // the same small margin, in board units at this zoom
      const ax = (lo, len, span) => (len >= span + 2 * m ? (span - len) / 2 : Math.min(Math.max(lo, -m), span + m - len));
      v.x = ax(v.x, v.w, W); v.y = ax(v.y, v.h, H);
      return v;
    }
    function set(v) { vb = v; apply(); }
    function stop() { if (anim) cancelAnimationFrame(anim); anim = 0; }
    // glide (don't jump) to a view
    function glide(to) {
      stop();
      const from = Object.assign({}, vb), t0 = performance.now(), T = 260;
      const step = now => {
        const t = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - t, 3);
        set({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
        anim = t < 1 ? requestAnimationFrame(step) : 0;
      };
      anim = requestAnimationFrame(step);
    }
    function reset(instant) { auto = true; if (instant === true) { stop(); set(Object.assign({}, base)); } else glide(Object.assign({}, base)); }
    // zoom by k (>1 = in) keeping the board point p under the same screen spot (fx, fy = 0..1 across the box)
    function zoomBy(k, p, fx, fy, smooth) {
      const w = vb.w / k, h = vb.h / k;
      const to = clamp({ x: p.x - fx * w, y: p.y - fy * h, w, h });
      if (smooth) glide(to); else { stop(); set(to); }
    }
    function apply() {
      svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
      scale = boxW ? boxW / vb.w : 1;
      box.classList.toggle('zoomed', !auto);
      sizeThings();
    }
    // keep dots, pawns and text readable at any zoom
    function sizeThings() {
      const k = Math.max(1, 0.62 / scale);
      const showAll = 11 * scale >= 7.2;
      cities.forEach((c, i) => {
        c.g.setAttribute('transform', 'translate(' + D.CITIES[i].x + ' ' + D.CITIES[i].y + ') scale(' + Math.min(k, 1.7) + ')');
        c.risk.setAttribute('r', 12 * Math.min(k, 1.7));
        c.risk.setAttribute('stroke-width', 3 * Math.min(k, 1.7));
        const important = last && last.sel === i;
        c.lbl.setAttribute('visibility', showAll || important ? 'visible' : 'hidden');
        c.lbl.setAttribute('font-size', showAll ? 11 : 8 / scale);
        c.lbl.setAttribute('y', showAll ? lblY(i, 21, 11) : lblY(i, 13 / scale + 8, 8 / scale));
      });
      pawnK = Math.min(k, 1.8);
      placePawns();
    }
    let pawnK = 1;
    // pawns stand round the city's upper-left, clear of the cubes (right) and the station (left)
    const OFF = [[-3, -9], [-12, -10], [5, -12], [-19, -9]];
    function placePawns() {
      if (!last) return;
      pawns.forEach((p, i) => {
        const c = D.CITIES[last.view.pawns[i]];
        const o = OFF[i % 4];
        p.style.transform = 'translate(' + (c.x + o[0] * pawnK) + 'px,' + (c.y + o[1] * pawnK) + 'px) scale(' + pawnK + ')';
      });
    }

    // a face-down deck on its printed space: the paper edges below the top card grow with the count
    function drawDeck(g, n, sym) {
      if (g._n === n) return;
      g._n = n;
      if (!n) { g.innerHTML = ''; return; }
      const t = Math.max(1, Math.min(7, Math.round(n * 0.14)));
      let h = '<rect x="2" y="' + (t + 3) + '" width="50" height="70" rx="4" fill="rgba(0,0,0,.45)" filter="url(#piece)"/>';
      for (let i = t; i >= 1; i--) h += '<rect x="' + (i * 0.3).toFixed(1) + '" y="' + i + '" width="50" height="70" rx="3.5" fill="' + (i % 2 ? '#e8e2d2' : '#b9b19d') + '"/>';
      h += '<use href="#' + sym + '" width="50" height="70"/>' +
        '<g transform="translate(47 66)"><circle r="8.5" fill="#1b1b1f" stroke="rgba(255,255,255,.35)" stroke-width=".8"/><text class="pnum" font-size="9" y=".5">' + n + '</text></g>';
      g.innerHTML = h;
    }
    const jit = (seed, i) => {
      if (root.TABLE && root.TABLE.jitter) return root.TABLE.jitter(seed, i, { rot: 9, off: 3 });
      return { x: 0, y: 0, r: ((i * 37) % 17) - 8 };
    };
    const fitTxt = (t, w) => (t.length > 10 ? ' textLength="' + w + '" lengthAdjust="spacingAndGlyphs"' : '');
    function faceSvg(id, kind) {
      const nm = s => String(s).replace(/&/g, '&amp;');
      if (kind === 'i') {
        const c = D.CITIES[id];
        return '<rect width="50" height="70" rx="3.5" fill="#f4f1e8" stroke="rgba(0,0,0,.35)" stroke-width=".6"/><rect x="2.6" y="2.6" width="44.8" height="64.8" rx="2.4" fill="#1d4a33"/>' +
          '<rect x="2.6" y="25" width="44.8" height="16" fill="' + HEX[c.color] + '"/><text x="25" y="33.5" class="pcard' + (c.color === 1 ? ' dk' : '') + '"' + fitTxt(c.name, 42) + '>' + nm(c.name) + '</text>' +
          '<text x="25" y="58" class="pcard sm">INFECT</text>';
      }
      if (id === D.EPIDEMIC) return '<rect width="50" height="70" rx="3.5" fill="#f4f1e8"/><rect x="2.6" y="2.6" width="44.8" height="64.8" rx="2.4" fill="#2f7a45"/><text x="25" y="36" class="pcard">EPIDEMIC</text>';
      if (D.isEvent(id)) {
        const n = D.EVENTS[id - 48].name;
        return '<rect width="50" height="70" rx="3.5" fill="#f4f1e8"/><rect x="2.6" y="2.6" width="44.8" height="64.8" rx="2.4" fill="#e3a63f"/><text x="25" y="13" class="pcard dk"' + fitTxt(n, 42) + '>' + nm(n) + '</text>' +
          '<path transform="translate(15 26) scale(.85)" d="' + EVENT_GLYPH[id] + '" fill="none" stroke="#5a3a08" stroke-width="2"/>';
      }
      const c = D.CITIES[id];
      return '<rect width="50" height="70" rx="3.5" fill="#f4f1e8"/><rect x="2.6" y="2.6" width="44.8" height="64.8" rx="2.4" fill="' + HEX[c.color] + '"/>' +
        '<text x="25" y="13" class="pcard' + (c.color === 1 ? ' dk' : '') + '"' + fitTxt(c.name, 42) + '>' + nm(c.name) + '</text>' +
        '<svg x="5" y="22" width="40" height="22" viewBox="0 30 1000 440">' + worldImg('rgba(255,255,255,.3)') + '<circle cx="' + c.x + '" cy="' + c.y + '" r="45" fill="#fff"/></svg>';
    }
    // a face-up discard pile: the last few cards, each a little askew (stable: seeded by its place in the pile)
    function drawPile(g, cards, kind) {
      const key = cards.length + ':' + cards.slice(-3).join(',');
      if (g._k === key) return;
      g._k = key;
      let h = '';
      for (let i = Math.max(0, cards.length - 3); i < cards.length; i++) {
        const j = jit(kind + 'pile', i);
        h += '<g transform="translate(' + (25 + j.x) + ' ' + (35 + j.y) + ') rotate(' + j.r + ') translate(-25 -35)" filter="url(#piece)">' + faceSvg(cards[i], kind) + '</g>';
      }
      g.innerHTML = h;
    }

    // update everything from a game view
    // o = {sel, reach: Set of cities, risk: Float64Array (chance), boom: [cities], fresh: true to animate new cubes}
    function update(v, o) {
      o = o || {};
      last = { view: v, sel: o.sel };
      // pawns (created once per seat)
      while (pawns.length < v.n) {
        const i = pawns.length;
        // a plastic pawn: round head, neck, flared base, with its shadow on the board (origin = where it stands)
        const p = el('g', { class: 'pawn' }, pawnG);
        const col = D.ROLES[v.roles[i]].color;
        el('ellipse', { cx: 1.6, cy: 0.6, rx: 6.4, ry: 2.1, fill: 'rgba(0,0,0,.5)' }, p);
        el('path', { d: 'M-5.6 0 C-5.6 -2.4 -3.4 -3.4 -2.4 -6 C-1.9 -7.4 -2.2 -8.6 -2.6 -9.4 L2.6 -9.4 C2.2 -8.6 1.9 -7.4 2.4 -6 C3.4 -3.4 5.6 -2.4 5.6 0 Z', fill: col, stroke: '#0b1420', 'stroke-width': .8 }, p);
        el('circle', { cy: -12, r: 3.6, fill: col, stroke: '#0b1420', 'stroke-width': .8 }, p);
        el('path', { d: 'M-3.6 -2 C-3 -4 -1.6 -5 -1.2 -7', stroke: 'rgba(255,255,255,.45)', 'stroke-width': 1.1, fill: 'none', 'stroke-linecap': 'round' }, p);
        el('circle', { cx: -1.2, cy: -13.2, r: 1.2, fill: 'rgba(255,255,255,.6)' }, p);
        pawns.push(p);
      }
      pawns.forEach((p, i) => { p.style.opacity = 1; p.classList.toggle('cur', i === v.cur && !v.over); });
      cities.forEach((c, i) => {
        const col = D.CITIES[i].color;
        const own = v.cubes[i * 4 + col];
        c.station.setAttribute('visibility', v.stations.includes(i) ? 'visible' : 'hidden');
        c.sel.setAttribute('visibility', o.sel === i ? 'visible' : 'hidden');
        // the cubes: its own colour first, then any others, in a little block to the city's right
        const list = [];
        for (let k = 0; k < 4; k++) {
          const kk = k === 0 ? col : k <= col ? k - 1 : k;
          for (let j = 0; j < v.cubes[i * 4 + kk]; j++) list.push(kk);
        }
        const key = list.join('');
        if (c.key !== key) {
          let html = '';
          list.forEach((k, n) => {
            const x = 9.5 + (n % 3) * 8.6, y = -11 + Math.floor(n / 3) * 8.6;
            html += '<g transform="translate(' + x + ' ' + y + ')"><g class="cube' + (o.fresh && c.seen && k === col && n >= c.last[col] ? ' newcube' : '') + '">' +
              '<rect x="1" y="1.4" width="7.4" height="7.4" rx="1.2" fill="rgba(0,0,0,.5)"/>' +
              '<rect width="7.4" height="7.4" rx="1.2" fill="' + HEX[k] + '" stroke="' + (k === 2 ? '#9aa0b4' : 'rgba(0,0,0,.55)') + '" stroke-width=".7"/>' +
              '<path d="M1.2 6.2V1.2h5" fill="none" stroke="' + LIGHT[k] + '" stroke-opacity=".8" stroke-width="1.1" stroke-linecap="round"/></g></g>';
          });
          c.others.innerHTML = html;
          c.key = key;
          // o.cubeAt: drop the cube in when its infection card flips (ms), not all at once
          const at = o.cubeAt && o.cubeAt[i];
          c.others.querySelectorAll('.newcube').forEach(q => { if (at) { q.style.animationDelay = at + 'ms'; q.style.animationFillMode = 'backwards'; } });
        }
        for (let k = 0; k < 4; k++) c.last[k] = v.cubes[i * 4 + k];
        c.seen = true;
        // risk ring: chance this city is infected in the next Infect step
        const r = o.risk ? o.risk[i] : 0;
        // only where it matters: cities with cubes, or cities likely to be hit (e.g. after an Epidemic)
        if (r > 0.004 && (own > 0 || r >= 0.12)) {
          c.risk.setAttribute('visibility', 'visible');
          c.risk.setAttribute('stroke', heat(1 - Math.min(1, r * (1 + own))));
          c.risk.setAttribute('stroke-opacity', String(0.35 + 0.65 * Math.min(1, r * 1.5)));
        } else c.risk.setAttribute('visibility', 'hidden');
      });
      // the track markers, cure vials, the decks (their thickness follows the count) and the face-up discard piles
      const mv = (g, p) => { g.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; };
      mv(outMark, OUT_XY[Math.min(8, v.outbreaks)]);
      mv(rateMark, RATE_XY[Math.min(6, v.rate)]);
      cureMarks.forEach((m, k) => {
        m.g.setAttribute('visibility', v.cured[k] ? 'visible' : 'hidden');
        m.erad.setAttribute('visibility', v.erad && v.erad[k] ? 'visible' : 'hidden');
      });
      drawDeck(deckG.pdeck, v.pdeckCount, 'pb');
      drawDeck(deckG.ideck, v.ideckCount, 'ib');
      drawPile(deckG.pdisc, v.pdisc || [], 'p');
      drawPile(deckG.idisc, v.idisc || [], 'i');
      reachG.innerHTML = '';
      if (o.reach) o.reach.forEach(i => { const c = D.CITIES[i]; el('circle', { class: 'reach', cx: c.x, cy: c.y, r: 13 * Math.min(Math.max(1, 0.62 / scale), 1.7) }, reachG); });
      // o.boom: city numbers, or {city, at: ms} to ring each outbreak of a chain in turn
      (o.boom || []).forEach(x => {
        const i = typeof x === 'object' ? x.city : x, at = typeof x === 'object' ? x.at || 0 : 0;
        const c = D.CITIES[i];
        setTimeout(() => {
          const b = el('circle', { class: 'boom', cx: c.x, cy: c.y, r: 16, fill: 'none', stroke: '#ff6b6b', 'stroke-width': 4 }, fxG);
          setTimeout(() => b.remove(), 1200);
        }, at);
      });
      sizeThings();
    }
    function heat(f) { return 'hsl(' + Math.round(Math.max(0, Math.min(1, f)) * 130) + ',72%,58%)'; }

    // ---------------------------------------------------------------- touch: tap, drag, pinch, double tap
    const pts = new Map();
    let drag = null, moved = false, lastTap = 0;
    const toMap = (cx, cy) => {
      const r = svg.getBoundingClientRect();
      return { x: vb.x + (cx - r.left) / r.width * vb.w, y: vb.y + (cy - r.top) / r.height * vb.h };
    };
    box.addEventListener('pointerdown', e => {
      if (e.target.closest('.zctl')) return;
      try { box.setPointerCapture(e.pointerId); } catch (er) { /* not a live pointer */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, vb: Object.assign({}, vb) };
      else if (pts.size === 2) {
        stop();
        const [a, b] = Array.from(pts.values());
        drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), mid: toMap((a.x + b.x) / 2, (a.y + b.y) / 2), vb: Object.assign({}, vb) };
      }
    });
    box.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !drag) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = svg.getBoundingClientRect();
      if (pts.size === 1 && !drag.pinch) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
        if (!moved || auto) return; // auto: a one-finger drag never moves the board
        stop();
        set(clamp({ x: drag.vb.x - dx / r.width * drag.vb.w, y: drag.vb.y - dy / r.height * drag.vb.h, w: drag.vb.w, h: drag.vb.h }));
      } else if (pts.size === 2 && drag.pinch) {
        moved = true;
        const [a, b] = Array.from(pts.values());
        const k = drag.pinch / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
        const w = drag.vb.w * k, h = drag.vb.h * k;
        const mx = ((a.x + b.x) / 2 - r.left) / r.width, my = ((a.y + b.y) / 2 - r.top) / r.height;
        set(clamp({ x: drag.mid.x - mx * w, y: drag.mid.y - my * h, w, h }));
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size) { drag = null; return; }
      if (!moved && e.type === 'pointerup') {
        const p = toMap(e.clientX, e.clientY);
        const now = Date.now();
        let best = -1, bd = 1e9;
        D.CITIES.forEach(c => { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c.i; } });
        const lim = Math.max(22, 16 / scale);
        const city = bd <= lim ? best : -1;
        // double tap on empty board while zoomed: back to auto (taps on cities stay taps)
        if (city < 0 && !auto && now - lastTap < 300) { lastTap = 0; reset(); }
        else { lastTap = city < 0 ? now : 0; if (opts.onTap) opts.onTap(city); }
      }
      drag = null;
    };
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    // mouse wheel, or a trackpad pinch (ctrl + wheel), over the board
    box.addEventListener('wheel', e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      const k = Math.exp(-Math.max(-300, Math.min(300, dy)) * (e.ctrlKey ? 0.01 : 0.0025));
      zoomBy(k, toMap(e.clientX, e.clientY), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, false);
    }, { passive: false });
    // + / − / fit
    box.querySelector('.zctl').addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      if (b.dataset.z === 'fit') { reset(); return; }
      zoomBy(b.dataset.z === 'in' ? 1.6 : 1 / 1.6, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, 0.5, 0.5, true);
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fit()).observe(box);
    requestAnimationFrame(() => fit());
    // the deck / discard spaces on the board (cards are dealt from and played onto them)
    const spot = k => deckG[k];
    return { update, fit, reset, svg, spot };
  }

  // a small static board for Study (heat per city)
  function heatMap(values, maxV) {
    let s = '<svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;background:#0a1626;border-radius:10px">';
    s += '<path fill="' + LAND_FILL + '" stroke="' + COAST + '" stroke-width="1" d="' + MAP.land + '"/><path fill="#0a1626" stroke="' + COAST + '" stroke-width=".8" d="' + MAP.lakes + '"/>';
    s += '<g stroke="#7f95b5" stroke-opacity=".25" stroke-width="1.4">';
    D.LINKS.forEach(([a, b]) => { const A = D.CITIES[D.IDX[a]], B = D.CITIES[D.IDX[b]]; if (Math.abs(A.x - B.x) < 500) s += '<line x1="' + A.x + '" y1="' + A.y + '" x2="' + B.x + '" y2="' + B.y + '"/>'; });
    s += '</g>';
    D.CITIES.forEach((c, i) => {
      const f = maxV ? values[i] / maxV : 0;
      s += '<circle cx="' + c.x + '" cy="' + c.y + '" r="' + (5 + 16 * Math.sqrt(f)) + '" fill="hsl(' + Math.round((1 - f) * 130) + ',72%,55%)" fill-opacity="' + (0.35 + 0.55 * f) + '"/>';
      s += '<circle cx="' + c.x + '" cy="' + c.y + '" r="4" fill="' + HEX[c.color] + '" stroke="#0b1420" stroke-width="1.5"/>';
    });
    return s + '</svg>';
  }

  root.PanArt = { HEX, LIGHT, createMap, cardHtml, infHtml, backHtml, roleCardHtml, roleIcon, heatMap, EVENT_GLYPH };
})(typeof self !== 'undefined' ? self : this);
