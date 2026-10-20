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
  function cardHtml(id, o) {
    o = o || {};
    const cls = ['pc', o.cls || ''];
    let band, name, pp = '', ic = '';
    if (D.isEvent(id)) {
      cls.push('ev');
      band = '';
      name = D.EVENTS[id - 48].name;
      pp = 'Event';
      ic = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#7a5310" stroke-width="2.2" stroke-linejoin="round"><path d="' + EVENT_GLYPH[id] + '"/></svg>';
    } else {
      const c = D.CITIES[id];
      band = ' style="background:' + HEX[c.color] + (c.color === 2 ? ';box-shadow:inset 0 -2px 0 #6a6e80' : '') + '"';
      name = c.name;
      pp = (c.pop / 1e6).toFixed(1) + 'M';
      ic = '';
    }
    // soft hyphens so long one-word names break on a small card instead of being cut off
    name = name.replace(/\b(Johannes|Washing|Fran|Peters|Govern|Popu)(burg|ton|cisco|ment|lation)\b/g, '$1&shy;$2');
    return '<button class="' + cls.join(' ') + '"' + (o.attr || '') + (o.delay ? ' style="animation-delay:' + o.delay + 'ms"' : '') + '>' +
      '<span class="band"' + (band || '') + '></span><span class="nm">' + name + '</span>' + ic + '<span class="pp">' + pp + '</span></button>';
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
    // one seamless ocean past the board's edges (a tall phone box shows more sea, not a band)
    const g1 = el('radialGradient', { id: 'oc', gradientUnits: 'userSpaceOnUse', cx: W / 2, cy: H * 0.45, r: W * 0.75 }, defs);
    el('stop', { offset: '0', 'stop-color': '#12304a' }, g1);
    el('stop', { offset: '1', 'stop-color': '#0a1626' }, g1);
    el('rect', { x: -2000, y: -1000, width: 5000, height: 2500, fill: 'url(#oc)' }, svg);
    const grid = el('g', { stroke: '#1d3a57', 'stroke-width': 1, opacity: .55 }, svg);
    for (let x = -350; x < W + 400; x += 100) el('line', { x1: x, y1: -1000, x2: x, y2: H + 1000 }, grid);
    for (let y = -350; y < H + 400; y += 100) el('line', { x1: -2000, y1: y, x2: W + 2000, y2: y }, grid);
    el('path', { d: MAP.land, fill: LAND_FILL, stroke: COAST, 'stroke-width': 1, 'stroke-linejoin': 'round' }, svg);
    el('path', { d: MAP.lakes, fill: 'url(#oc)', stroke: COAST, 'stroke-width': .8 }, svg);
    // links (the three across the Pacific run off the edges)
    const links = el('g', {}, svg);
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
    const reachG = el('g', {}, svg);
    const riskG = el('g', {}, svg);
    const cityG = el('g', {}, svg);
    const lblG = el('g', {}, svg);
    const pawnG = el('g', {}, svg);
    const fxG = el('g', {}, svg);
    const cities = D.CITIES.map(c => {
      const g = el('g', { class: 'city', transform: 'translate(' + c.x + ' ' + c.y + ')' }, cityG);
      const station = el('path', { d: 'M-17 -9 L-11 -15 L-5 -9 L-5 -2 L-17 -2 Z', fill: '#f4f1e8', stroke: '#0b1420', 'stroke-width': 1.5, visibility: 'hidden' }, g);
      const dot = el('circle', { class: 'city-dot', r: 8, fill: HEX[c.color] }, g);
      if (c.color === 2) dot.classList.add('blk');
      const sel = el('circle', { class: 'ring-sel', r: 14, visibility: 'hidden' }, g);
      const cnt = el('text', { class: 'cnt' + (c.color === 1 ? ' dk' : ''), 'font-size': 11, y: 0.5 }, g);
      const others = el('g', {}, g);
      const lbl = el('text', { class: 'lbl', x: c.x, y: lblY(c.i, 21, 11), 'text-anchor': 'middle', 'font-size': 11 }, lblG);
      lbl.textContent = c.name;
      const risk = el('circle', { class: 'riskring', cx: c.x, cy: c.y, r: 12, visibility: 'hidden' }, riskG);
      return { g, station, dot, sel, cnt, others, lbl, risk, last: [0, 0, 0, 0] };
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
        c.dot.setAttribute('r', 8 * Math.min(k, 1.7));
        c.cnt.setAttribute('font-size', 11 * Math.min(k, 1.7));
        c.sel.setAttribute('r', 14 * Math.min(k, 1.7));
        c.station.setAttribute('transform', 'scale(' + Math.min(k, 1.7) + ')');
        c.others.setAttribute('transform', 'scale(' + Math.min(k, 1.7) + ')');
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
    const OFF = [[-10, -15], [10, -15], [-16, 1], [16, 1]];
    function placePawns() {
      if (!last) return;
      pawns.forEach((p, i) => {
        const c = D.CITIES[last.view.pawns[i]];
        const o = OFF[i % 4];
        p.style.transform = 'translate(' + (c.x + o[0] * pawnK) + 'px,' + (c.y + o[1] * pawnK) + 'px) scale(' + pawnK + ')';
      });
    }

    // update everything from a game view
    // o = {sel, reach: Set of cities, risk: Float64Array (chance), boom: [cities], fresh: true to animate new cubes}
    function update(v, o) {
      o = o || {};
      last = { view: v, sel: o.sel };
      // pawns (created once per seat)
      while (pawns.length < v.n) {
        const i = pawns.length;
        const p = el('g', { class: 'pawn' }, pawnG);
        el('path', { d: 'M0 4 C-5 4 -6 -2 -4 -5 A4.5 4.5 0 1 1 4 -5 C6 -2 5 4 0 4 Z', fill: D.ROLES[v.roles[i]].color, stroke: '#0b1420', 'stroke-width': 1.4 }, p);
        el('circle', { cx: 0, cy: -8, r: 1.6, fill: 'rgba(255,255,255,.65)' }, p);
        pawns.push(p);
      }
      pawns.forEach((p, i) => { p.style.opacity = i === v.cur ? 1 : 0.88; });
      cities.forEach((c, i) => {
        const col = D.CITIES[i].color;
        const own = v.cubes[i * 4 + col];
        c.cnt.textContent = own ? String(own) : '';
        c.station.setAttribute('visibility', v.stations.includes(i) ? 'visible' : 'hidden');
        c.sel.setAttribute('visibility', o.sel === i ? 'visible' : 'hidden');
        // other colours' cubes as little squares
        let html = '';
        let n = 0;
        for (let k = 0; k < 4; k++) {
          if (k === col) continue;
          for (let j = 0; j < v.cubes[i * 4 + k]; j++, n++) html += '<rect x="' + (6 + (n % 3) * 6) + '" y="' + (4 + Math.floor(n / 3) * 6) + '" width="5" height="5" rx="1" fill="' + HEX[k] + '" stroke="#0b1420" stroke-width=".8"/>';
        }
        if (c.others.innerHTML !== html) c.others.innerHTML = html;
        if (o.fresh && own > c.last[col]) { c.dot.classList.remove('newcube'); void c.dot.getBBox; c.dot.classList.add('newcube'); }
        for (let k = 0; k < 4; k++) c.last[k] = v.cubes[i * 4 + k];
        // risk ring: chance this city is infected in the next Infect step
        const r = o.risk ? o.risk[i] : 0;
        // only where it matters: cities with cubes, or cities likely to be hit (e.g. after an Epidemic)
        if (r > 0.004 && (own > 0 || r >= 0.12)) {
          c.risk.setAttribute('visibility', 'visible');
          c.risk.setAttribute('stroke', heat(1 - Math.min(1, r * (1 + own))));
          c.risk.setAttribute('stroke-opacity', String(0.35 + 0.65 * Math.min(1, r * 1.5)));
        } else c.risk.setAttribute('visibility', 'hidden');
      });
      reachG.innerHTML = '';
      if (o.reach) o.reach.forEach(i => { const c = D.CITIES[i]; el('circle', { class: 'reach', cx: c.x, cy: c.y, r: 13 * Math.min(Math.max(1, 0.62 / scale), 1.7) }, reachG); });
      (o.boom || []).forEach(i => {
        const c = D.CITIES[i];
        const b = el('circle', { class: 'boom', cx: c.x, cy: c.y, r: 16, fill: 'none', stroke: '#ff6b6b', 'stroke-width': 4 }, fxG);
        setTimeout(() => b.remove(), 1200);
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
    return { update, fit, reset, svg };
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

  root.PanArt = { HEX, LIGHT, createMap, cardHtml, roleIcon, heatMap, EVENT_GLYPH };
})(typeof self !== 'undefined' ? self : this);
