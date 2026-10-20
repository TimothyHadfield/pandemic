/* Pandemic Lab screens: Play (vs computer teammates or online), Table (real-table infection
   tracker with exact odds), Study (measured strength, danger map, your last game), Settings. */
(function () {
  'use strict';
  const D = PanData, E = PanEngine, O = PanOdds, B = PanBots, A = PanArt, G = PanOnlineGame;
  const { CITIES, EVENTS, ROLES, EV } = D;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLOR_NAMES = D.COLOR_NAMES;
  const HEX = A.HEX;
  const pct = x => (x >= 0.995 ? '100' : x < 0.005 && x > 0 ? '<1' : Math.round(x * 100)) + '%';
  const heat = (x, lo, hi) => 'hsl(' + Math.round(Math.max(0, Math.min(1, (x - lo) / (hi - lo))) * 130) + ',70%,62%)';
  const cname = c => CITIES[c].name;
  const LEVEL_NOTE = { 4: 'Introductory', 5: 'Standard', 6: 'Heroic' };

  // ------------------------------------------------------------------ sounds, celebrations, animations (js/fx.js, js/sfx.js)
  const FX = window.FX;
  FX.init({ game: 'pandemic', accent: '#6ea8fe' });
  // the game's own CSS motion (cards, flips, cubes, pawns) follows the Animations and Speed settings too
  function fxClasses() {
    const st = FX.settings, h = document.documentElement.classList;
    h.toggle('fx-still', !st.animations);
    h.toggle('fx-fast', st.animations && st.animSpeed === 'fast');
  }
  fxClasses();
  FX.onChange(fxClasses);
  const flipStep = () => (FX.settings.animSpeed === 'fast' ? 77 : 140);
  const fxCol = c => (c === 2 ? '#b8bccb' : HEX[c]);

  // ------------------------------------------------------------------ saved data
  const KEY = 'pandemic-lab-v1';
  const DEF = { name: '', players: 2, epidemics: 5, role: -1, speed: 'normal', showOdds: true, eventPause: true, openHands: 'auto', hints: true };
  let store = { settings: Object.assign({}, DEF), game: null, last: null, table: null, online: false };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') store = Object.assign(store, raw);
  } catch (e) { /* private mode or bad data */ }
  // clamp saved settings
  (function clampSettings() {
    const s = store.settings = Object.assign({}, DEF, store.settings || {});
    if (![2, 3, 4].includes(s.players)) s.players = 2;
    if (![4, 5, 6].includes(s.epidemics)) s.epidemics = 5;
    if (!(Number.isInteger(s.role) && s.role >= -1 && s.role < ROLES.length)) s.role = -1;
    if (!['slow', 'normal', 'fast'].includes(s.speed)) s.speed = 'normal';
    if (!['auto', 'open', 'hidden'].includes(s.openHands)) s.openHands = 'auto';
    s.name = String(s.name || '').slice(0, 20);
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* full or blocked */ } }

  // ------------------------------------------------------------------ the table (where the seats live)
  let ME = 0;
  function LocalTable(state) { this.state = state; }
  LocalTable.prototype.view = function () { return E.view(this.state, ME); };
  LocalTable.prototype.toAct = function () { return E.toAct(this.state); };
  LocalTable.prototype.act = function (seat, a) {
    this.state = E.apply(this.state, seat, a);
    store.game.state = this.state; save();
    return this.state;
  };
  let table = null;
  if (store.game && store.game.state) {
    // a saved game must survive everything the game screen does with it, or it is dropped
    try {
      table = new LocalTable(store.game.state);
      const n = store.game.state.n;
      ME = Number.isInteger(store.game.me) && store.game.me >= 0 && store.game.me < n ? store.game.me : 0;
      store.game.me = ME;
      const v = table.view();
      oddsFor(v); E.toAct(store.game.state); E.legalActions(planState(v));
      if (!Array.isArray(store.game.checks)) store.game.checks = [];
    } catch (e) { table = null; ME = 0; store.game = null; save(); }
  }

  // online: the same screens over the shared module (loaded only when someone opens online play)
  function OnlineTable(room) { this.online = true; this.room = room; this.snap = room.view(); }
  OnlineTable.prototype.view = function () { return G.viewFromSnap(this.snap); };
  OnlineTable.prototype.toAct = function () { return (this.snap && this.snap.toAct) || []; };
  const net = { room: null, snap: null, connecting: false, savedLast: false };
  function loadOnline() {
    if (net.room) return Promise.resolve(net.room);
    return import(new URL('js/online.js?v=1', location.href).href).then(mod => {
      if (net.room) return net.room;
      net.room = mod.createOnline({ game: G.game, gameId: 'pandemic', botDelayMs: 900 });
      net.room.on('change', onNet);
      net.room.on('error', msg => { ui.busy = false; toast(String(msg)); if (ui.tab === 'play') renderPlay(); });
      return net.room;
    });
  }
  function backToLocal() {
    net.savedLast = false;
    ME = store.game ? store.game.me || 0 : 0;
    table = store.game && store.game.state ? new LocalTable(store.game.state) : null;
    lastSeen = null;
  }
  function onNet(snap) {
    net.snap = snap;
    ui.busy = false;
    if (snap.status === 'playing' || snap.status === 'finished') {
      if (!table || !table.online) { table = new OnlineTable(net.room); resetSel(); lastSeen = null; net.savedLast = false; }
      table.snap = snap;
      ME = snap.mySeat >= 0 ? snap.mySeat : 0;
      const v = table.view();
      if (v && v.over && !net.savedLast) { net.savedLast = true; saveLast(v, []); }
    } else if (table && table.online) backToLocal();
    if (snap.status === 'closed' || snap.status === 'left') {
      store.online = false; save();
      if (snap.status === 'closed') toast('The room was closed');
    }
    if (ui.tab === 'play') renderPlay();
  }
  function leaveOnline() {
    const r = net.room;
    store.online = false; ui.online = false; save();
    backToLocal(); resetSel();
    if (r) r.leave().catch(() => {});
    renderPlay();
  }
  async function onlineBtn(k) {
    if (k === 'open') { ui.online = true; renderPlay(); loadOnline().catch(() => toast('Online play couldn’t load. Check your internet.')); return; }
    if (k === 'back') {
      if (net.snap && net.snap.status === 'lobby') { confirmBox('Leave this room?', 'Leave', leaveOnline); return; }
      ui.online = false; renderPlay(); return;
    }
    if (k === 'start') {
      if (net.connecting) return;
      net.connecting = true; renderPlay();
      const r = await net.room.start();
      net.connecting = false;
      if (!r.ok) toast(r.message);
      renderPlay(); return;
    }
    if (k !== 'create' && k !== 'join') return;
    const nameEl = $('#on-name');
    if (nameEl) { store.settings.name = nameEl.value.trim().slice(0, 20); save(); }
    const name = store.settings.name || 'Player';
    const codeEl = $('#on-code');
    const code = codeEl ? codeEl.value.trim().toUpperCase() : '';
    if (k === 'join' && code.length !== 5) { oops('Room codes have 5 letters'); return; }
    if (net.connecting) return;
    net.connecting = true; renderPlay();
    let r;
    try {
      const room = await loadOnline();
      if (k === 'create') {
        const s = store.settings;
        const seats = ['human'].concat(new Array(s.players - 1).fill('empty'));
        r = await room.createRoom({ name, seats, options: { epidemics: s.epidemics, roles: [s.role], openHands: openHandsOpt(), eventPause: s.eventPause } });
      } else r = await room.joinRoom(code, name);
    } catch (e) { r = { ok: false, message: 'Online play couldn’t load. Check your internet.' }; }
    net.connecting = false;
    if (r.ok) { store.online = true; save(); } else toast(r.message);
    renderPlay();
  }
  function openHandsOpt() { const o = store.settings.openHands; return o === 'open' ? true : o === 'hidden' ? false : undefined; }

  // ------------------------------------------------------------------ ui state
  const ui = { tab: 'play', online: false, sel: -1, who: -1, card: -1, mode: null, hint: null, busy: false, discardPick: -1, check: null };
  function resetSel() { ui.sel = -1; ui.who = -1; ui.card = -1; ui.mode = null; ui.hint = null; ui.discardPick = -1; }

  // ------------------------------------------------------------------ small helpers
  // write HTML only when it changed, so buttons aren't replaced under a finger (online updates arrive often)
  function put(el, html) { if (el && el._h !== html) { el.innerHTML = html; el._h = html; if (el.id === 'v-play') el.classList.remove('tbl-surface', 'tbl-wood-dark'); } }
  const qBtn = text => '<button class="q" data-q="' + esc(text) + '" aria-label="Why?">?</button>';
  function toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
  // a toast for something that isn't allowed: with a soft error sound
  function oops(msg) { toast(msg); FX.play('error'); }
  function confirmBox(msg, yes, onYes) {
    const back = document.createElement('div');
    back.className = 'confirm-back';
    back.innerHTML = '<div class="panel"><p style="margin:0 0 14px">' + esc(msg) + '</p><div class="row" style="justify-content:flex-end">' +
      '<button class="btn ghost" data-c="no">Cancel</button><button class="btn primary" data-c="yes">' + esc(yes) + '</button></div></div>';
    back.addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (e.target === back || b) { back.remove(); if (b && b.dataset.c === 'yes') onYes(); }
    });
    document.body.appendChild(back);
    return back;
  }
  function sheet(title, html, onClick, opts) {
    closeSheet();
    const back = document.createElement('div');
    back.className = 'sheet-back'; back.id = 'sheet';
    // info sheets (a player's hand, the game menu) may stay open after the game ends; decision sheets may not
    if (opts && opts.keep) back.dataset.keep = '1';
    if (opts && opts.kind) back.dataset.kind = opts.kind;
    back.innerHTML = '<div class="sheet"><div class="row"><h3 class="grow">' + esc(title) + '</h3>' +
      (opts && opts.noClose ? '' : '<button class="btn small ghost" data-close>Close</button>') + '</div><div class="scroll" style="display:flex;flex-direction:column;gap:8px">' + html + '</div></div>';
    back.addEventListener('click', e => {
      if ((e.target === back && !(opts && opts.noClose)) || e.target.closest('[data-close]')) { closeSheet(); return; }
      if (onClick) onClick(e);
    });
    document.body.appendChild(back);
    return back;
  }
  function closeSheet() { const s = $('#sheet'); if (s) s.remove(); }
  const sw = col => '<span class="sw" style="background:' + HEX[col] + (col === 2 ? ';outline:1px solid #8a8fa3' : '') + '"></span>';
  const cubePips = (n, col) => '<span class="cubes-mini">' + Array.from({ length: n }, () => '<i style="background:' + HEX[col] + (col === 2 ? ';outline:1px solid #8a8fa3' : '') + '"></i>').join('') + '</span>';
  const roleName = (v, p) => ROLES[v.roles[p]].name;
  const shortRole = r => ROLES[r].name.replace('Contingency ', '').replace('Operations', 'Ops').replace('Quarantine Specialist', 'Quarantine');
  const playerLabel = (v, p) => (p === ME && !v.over ? 'You' : v.names[p]);

  // ------------------------------------------------------------------ tabs + back
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) showTab(b.dataset.tab, true);
  });
  function showTab(tab, push) {
    ui.tab = tab;
    document.querySelectorAll('.banner, .flipstrip, .pop').forEach(b => b.remove());
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + tab));
    if (tab === 'play' && mapApi) mapApi.reset(true); // back on Play: the map is in auto
    if (tab === 'play') fxQuiet = true; // no catch-up burst of sounds for moves made while another tab was open
    if (push) try { history.pushState({ tab }, '', '#' + tab); } catch (e) { /* file:// */ }
    render();
  }
  const TABS = ['play', 'table', 'study', 'settings'];
  const hashTab = () => { const h = (location.hash || '').slice(1); return TABS.includes(h) ? h : null; };
  window.addEventListener('popstate', e => {
    // Back with a sheet open only closes the sheet; the address stays on the tab that is shown
    if ($('#sheet')) { closeSheet(); try { history.pushState({ tab: ui.tab }, '', '#' + ui.tab); } catch (er) { /* file:// */ } return; }
    const tab = (e.state && TABS.includes(e.state.tab) && e.state.tab) || hashTab() || 'play';
    if (tab !== ui.tab) showTab(tab, false);
  });
  // a typed address (#table etc.) switches tabs too
  window.addEventListener('hashchange', () => {
    const tab = hashTab();
    if (tab && tab !== ui.tab) { closeSheet(); showTab(tab, false); }
  });
  // help bubbles
  document.addEventListener('click', e => {
    const old = $('.pop');
    const q = e.target.closest('[data-q]');
    if (old) old.remove();
    if (!q || (old && old.dataset.for === q.dataset.q)) return;
    const pop = document.createElement('div');
    pop.className = 'pop'; pop.textContent = q.dataset.q; pop.dataset.for = q.dataset.q;
    document.body.appendChild(pop);
    const r = q.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const x = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 8) y = r.top - h - 8;
    pop.style.left = x + 'px'; pop.style.top = Math.max(8, y) + 'px';
  });
  function render() {
    if (ui.tab === 'play') renderPlay();
    else if (ui.tab === 'table') renderTable();
    else if (ui.tab === 'study') renderStudy();
    else renderSettings();
  }

  // ================================================================== PLAY
  const vPlay = $('#v-play');
  function renderPlay() {
    if (table) renderGame();
    else if (ui.online) renderOnline();
    else renderSetup();
  }

  function renderSetup() {
    const s = store.settings;
    const st = window.PanStrength;
    const rateNote = n => {
      if (!st) return '';
      const c = st.cells.filter(x => x.epidemics === n && x.players === s.players)[0];
      return c ? Math.round(100 * c.wins / c.games) + '% computer wins' : '';
    };
    const lvQ = 'More Epidemic cards means the infection speeds up sooner and more often. The % is how often a team of our computer players wins at this level with ' + s.players + ' players (measured over many games).';
    put(vPlay, '<div class="setup">' +
      '<div class="hero"><img src="icon.svg" alt=""><div><h1>Pandemic Lab</h1><p>Save the world with computer teammates or friends. Exact odds every turn.</p></div></div>' +
      '<div class="panel">' +
      '<div class="label">Players</div><div class="seg" data-set="players">' + [2, 3, 4].map(n => '<button aria-pressed="' + (s.players === n) + '" data-v="' + n + '">' + n + '</button>').join('') + '</div>' +
      '<div class="row"><span class="label grow">Difficulty</span>' + qBtn(lvQ) + '</div>' +
      '<div class="seg" data-set="epidemics">' + [4, 5, 6].map(n => '<button aria-pressed="' + (s.epidemics === n) + '" data-v="' + n + '">' + LEVEL_NOTE[n] + '<small>' + n + ' Epidemics' + (rateNote(n) ? ' · ' + rateNote(n) : '') + '</small></button>').join('') + '</div>' +
      '<div class="row"><span class="label grow">Your role</span>' + qBtn('Teammates get random roles. Each role bends one rule; tap a role in the game to read it.') + '</div>' +
      '<div class="rolepick" data-set="role"><button aria-pressed="' + (s.role === -1) + '" data-v="-1"><i style="background:linear-gradient(90deg,#4f8ff7,#f2c94c,#e5484d)"></i>Random</button>' +
      ROLES.map((r, i) => '<button aria-pressed="' + (s.role === i) + '" data-v="' + i + '">' + A.roleIcon(i, 14) + shortRole(i) + '</button>').join('') + '</div>' +
      '<button class="btn primary" data-start style="width:100%">Start · you + ' + (s.players - 1) + ' computer' + (s.players > 2 ? 's' : '') + '</button>' +
      '<button class="btn" data-on="open" style="width:100%">Play online with friends</button>' +
      '</div>' +
      (store.last ? '<button class="btn ghost" data-go="study">Review your last game</button>' : '') +
      '</div>');
  }

  function renderOnline() {
    const s = net.snap;
    const st = s ? s.status : 'none';
    let body;
    if (net.connecting && st !== 'lobby') body = '<div class="panel"><b>Connecting…</b><p class="muted small" style="margin:0">Talking to the game server.</p></div>';
    else if (st === 'joining') body = '<div class="panel"><b>Joining…</b><p class="muted small" style="margin:0">Waiting for the host to give you a seat.</p></div>';
    else if (st === 'lobby') {
      const host = s.isHost, o = s.options || {};
      const seats = s.seats.map((x, i) => {
        const who = x.kind === 'human' ? esc(x.name || 'Player') + (i === s.mySeat ? ' <span class="muted">(you)</span>' : '') + (x.online || i === s.mySeat ? '' : ' <span class="muted">· away</span>') :
          x.kind === 'computer' ? 'Computer teammate' : '<span class="muted">Open seat</span>';
        let b = '';
        if (host && i !== s.mySeat) b = x.kind === 'empty' ? '<button class="btn small" data-seat="' + i + '" data-kind="computer">Computer</button>' :
          '<button class="btn small ghost" data-seat="' + i + '" data-kind="empty">' + (x.kind === 'human' ? 'Remove' : 'Open') + '</button>';
        return '<div class="seatrow"><span class="dot" style="background:' + ['#6ea8fe', '#f0b354', '#6ee7a8', '#d77ad9'][i] + '"></span><span class="grow">' + who + '</span>' + b + '</div>';
      }).join('');
      body = '<div class="panel" style="align-items:center;gap:4px"><span class="label">Room code</span><div class="code-big">' + esc(s.code) + '</div>' +
        '<p class="muted small" style="margin:0;text-align:center">Friends open this site, tap Play online and type the code.</p></div>' +
        '<div class="panel"><span class="label">Team · ' + LEVEL_NOTE[o.epidemics || 5] + '</span><div class="seats">' + seats + '</div>' +
        (host ? '<button class="btn primary" data-on="start" style="width:100%"' + (net.connecting ? ' disabled' : '') + '>' + (net.connecting ? 'Starting…' : 'Start') + '</button>' +
          '<p class="muted small" style="margin:0">Open seats become computer teammates.</p>' :
          '<p class="muted small" style="margin:0">Waiting for the host to start…</p>') + '</div>';
    } else {
      body = '<div class="panel"><span class="label">Your name</span>' +
        '<input class="txt" id="on-name" maxlength="20" autocomplete="nickname" placeholder="Name" value="' + esc(store.settings.name || '') + '">' +
        '<button class="btn primary" data-on="create" style="width:100%">Create a room</button>' +
        '<p class="muted small" style="margin:0">Uses your number of players, difficulty and role. Everyone plays on one team.</p></div>' +
        '<div class="panel"><span class="label">Join a friend</span><div class="row">' +
        '<input class="txt code" id="on-code" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Code">' +
        '<button class="btn primary" data-on="join">Join</button></div></div>';
    }
    put(vPlay, '<div class="setup"><div class="row"><button class="btn small ghost" data-on="back">Back</button><span class="grow"></span><span class="label">Play online</span></div>' + body + '</div>');
  }

  function startLocal() {
    const s = store.settings;
    const seed = (Math.random() * 4294967296) >>> 0;
    const names = [s.name || 'You'];
    for (let i = 1; i < s.players; i++) names.push('Computer ' + i);
    const state = E.newGame({ players: s.players, epidemics: s.epidemics, seed, roles: [s.role], names,
      human: names.map((_, i) => i === 0), openHands: openHandsOpt(), eventPause: s.eventPause });
    ME = 0;
    store.game = { state, me: 0, checks: [] };
    table = new LocalTable(state);
    resetSel(); lastSeen = null; ui.check = null;
    save();
    FX.play('shuffle');
    renderPlay();
  }

  // ---------------------------------------------------------------- the game screen
  let fxQuiet = false;
  let mapApi = null, mapBox = null, lastSeen = null, botTimer = null, flipTimer = null, flipKey = null;
  function ensureMap() {
    if (mapBox) return;
    mapBox = document.createElement('div');
    mapBox.id = 'g-map';
    mapApi = A.createMap(mapBox, { onTap: onMapTap });
  }
  function onMapTap(c) {
    if (c < 0) { ui.sel = -1; ui.card = -1; renderGame(); return; }
    ui.sel = ui.sel === c && !ui.mode ? -1 : c;
    ui.card = -1;
    renderGame();
  }
  const ICON = {
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2l2.2 6.3L20.5 6l-3.3 5.7L22 15l-6.3.8L14 22l-2-6-2 6-1.7-6.2L2 15l4.8-3.3L3.5 6l6.3 2.3z"/></svg>',
    rate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 18l6-6 4 4 6-8"/><path d="M15 8h5v5"/></svg>',
    deck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="3" width="12" height="16" rx="2"/><path d="M8 21h11V7"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  };

  // risk numbers for the current view (exact; from what the players can know)
  function oddsFor(v) {
    const draws = O.drawsAhead(v);
    return O.infectionOdds(v, draws, O.protectedCities(v));
  }
  // a state-like object the planner can read from a view (hidden order stays hidden)
  function planState(v) {
    return Object.assign({}, v, { pdeck: new Array(v.pdeckCount).fill(0), ideck: new Array(v.ideckCount).fill(0), queue: [] });
  }

  function renderGame() {
    try { renderGame2(); } catch (e) {
      // a broken local save must never leave Play blank: drop it and show the setup screen
      if (table && table.online) throw e;
      table = null; store.game = null; save(); resetSel(); lastSeen = null;
      const g = $('#game'); if (g) g.remove();
      vPlay._h = null; renderSetup();
    }
  }
  function renderGame2() {
    const v = table.view();
    if (!v) { put(vPlay, '<div class="setup"><div class="panel"><b>Connecting…</b></div></div>'); return; }
    ensureMap();
    if (!$('#game')) {
      vPlay._h = null;
      // the table from your seat: teammates at the far side, the board in the middle, your role card and hand at the bottom
      vPlay.innerHTML = '<div id="game"><div class="status" id="g-status"></div><div class="info" id="g-info"></div><div class="risk" id="g-risk"></div>' +
        '<div class="players" id="g-players"></div><div class="hand" id="g-hand"><div id="g-me"></div><div id="g-fan"></div></div><div class="acts" id="g-acts"></div><div id="g-side"></div></div>';
      fanApi = null;
      vPlay.classList.add('tbl-surface', 'tbl-wood-dark');
      $('#game').insertBefore(mapBox, $('#g-info'));
      setTimeout(() => { mapApi.reset(true); mapApi.fit(true); }, 0); // a new game screen always starts in auto
    }
    const toAct = table.toAct();
    const odds = oddsFor(v);
    const fresh = lastSeen && lastSeen.turn === v.turn ? false : true;
    // what changed since the last screen (for motion)
    // what happened since the last screen: sounds + motion, timed like the flip strip (nothing on a reload)
    const fx = lastSeen && !fxQuiet ? PanSfx.events(lastSeen, v, ME, { step: flipStep() }) : null;
    fxQuiet = false;
    const boom = fx ? fx.booms : [];
    // flips show once, when the move that made them arrives (not on every tap, not after a reload)
    const fk = v.turn + ':' + v.log.length + ':' + v.phase;
    if (lastSeen && fk !== flipKey && ((v.lastInf && v.lastInf.length) || (v.lastEpi && v.lastEpi.length) || (v.lastDraw && v.lastDraw.length))) showFlips(v);
    flipKey = fk;
    lastSeen = v;
    dropStalePrompts(v);
    const myTurn = toAct.includes(ME);
    // reachable cities for the current move selection
    let reach = null;
    if (v.phase === 'actions' && v.cur === ME && !v.over && !ui.mode) {
      reach = new Set();
      const who = ui.who >= 0 ? ui.who : ME;
      E.legalActions(planState(v)).forEach(a => {
        if (a.to !== undefined && (a.who === undefined || a.who === who) && ['drive', 'shuttle', 'dispatch'].includes(a.t)) reach.add(a.to);
      });
    }
    mapApi.update(v, { sel: ui.sel, reach, risk: store.settings.showOdds ? odds.draw : null, boom, cubeAt: fx ? fx.cubeAt : null, fresh: true });
    renderStatus(v, odds);
    renderInfo(v, odds, toAct);
    renderRisk(v, odds);
    renderPlayers(v);
    renderHand(v, toAct);
    renderActs(v, toAct);
    renderSide(v, odds);
    if (v.over) showEnd(v);
    if (fx) runFx(fx.items);
    // forecast: open the sheet for whoever played it
    if (v.phase === 'forecast' && v.pend && v.pend.seat === ME && !$('#sheet')) forecastSheet(v);
    scheduleBots();
    if (myTurn && v.phase === 'actions' && v.cur === ME) turnCheckStart(v);
  }

  // a prompt opened for a decision the game no longer needs must not linger: the Forecast window once its
  // move is made, and every decision sheet or event confirm once the game is over (online, someone else's
  // infection can end the game while your Resilient Population or Airlift picker is still open)
  function dropStalePrompts(v) {
    const sh = $('#sheet');
    if (sh && sh.dataset.kind === 'forecast' && !(v.phase === 'forecast' && v.pend && v.pend.seat === ME && !v.over)) closeSheet();
    if (!v.over) return;
    const sh2 = $('#sheet');
    if (sh2 && !sh2.dataset.keep) closeSheet();
    document.querySelectorAll('.confirm-back[data-decide]').forEach(b => b.remove());
    ui.mode = null;
  }

  function renderStatus(v, odds) {
    const outCol = heat(v.outbreaks, 7, 2);
    const epi = 1 - odds.epidemic[0];
    const vials = '<span class="vials">' + [0, 1, 2, 3].map(c => '<span class="vial" title="' + COLOR_NAMES[c] + '" style="border-color:' + HEX[c] +
      ';background:' + (v.cured[c] ? (v.erad[c] ? 'repeating-linear-gradient(45deg,' + HEX[c] + ' 0 3px,#fff 3px 5px)' : HEX[c]) : 'transparent') + (c === 2 ? ';border-color:#8a8fa3' : '') + '"></span>').join('') + '</span>';
    put($('#g-status'),
      '<span class="stat" data-q="Outbreaks so far. At 8 the team loses." style="color:' + outCol + '">' + ICON.out + '<b>' + v.outbreaks + '</b>/8</span>' +
      '<span class="stat" data-q="Infection rate: how many infection cards are flipped at the end of each turn. It goes up with every Epidemic (2-2-2-3-3-4-4).">' + ICON.rate + '<b>' + D.RATE_TRACK[v.rate] + '</b></span>' +
      '<span class="stat" data-q="Cures found (filled) and diseases wiped out (striped). Cure all four to win.">' + vials + '</span>' +
      '<span class="stat" data-q="' + esc('Player cards left: ' + v.pdeckCount + '. You lose when someone cannot draw 2. Chance of an Epidemic in the next draw: ' + pct(epi) + ' (exact, from the ' + v.piles.length + ' piles the deck was built from).') + '">' + ICON.deck + '<b>' + v.pdeckCount + '</b><span style="color:' + heat(epi, 0.6, 0) + '">' + (O.drawsAhead(v) ? '· ' + pct(epi) : '') + '</span></span>' +
      '<span class="grow"></span><button class="icon-btn" id="g-menu" aria-label="Menu">' + ICON.menu + '</button>');
  }

  function moveLabel(a, v) {
    const via = { drive: 'Drive', direct: 'Fly', charter: 'Charter', shuttle: 'Shuttle', dispatch: 'Send', opsmove: 'Ops flight' }[a.t];
    let card = '';
    if (a.t === 'direct') card = ' (' + cname(a.to) + ' card)';
    if (a.t === 'charter') card = ' (' + cname(v.pawns[a.who === undefined ? v.cur : a.who]) + ' card)';
    if (a.t === 'opsmove') card = ' (' + cname(a.card) + ')';
    return via + card;
  }
  function renderInfo(v, odds, toAct) {
    const box = $('#g-info');
    let p1 = '', p2 = '', cls = 'info';
    const myAct = v.phase === 'actions' && v.cur === ME && toAct.includes(ME);
    if (v.over) {
      p1 = v.over.win ? 'The world is saved!' : 'The team lost — ' + ({ outbreaks: '8 outbreaks', cubes: 'out of disease cubes', cards: 'out of player cards' }[v.over.why] || 'game over');
      // New game / Review sit in the action row below (and in the banner): no third copy squeezed in here
      p2 = '<span>' + esc('Turn ' + v.turn + ' · ' + v.outbreaks + ' outbreak' + (v.outbreaks === 1 ? '' : 's') + ' · ' + v.cured.filter(Boolean).length + ' of 4 cures') + '</span>';
      cls += v.over.win ? ' mine' : ' alert';
    } else if (ui.mode) {
      const m = ui.mode;
      const nm = EVENTS[m.card - 48].name;
      p1 = nm + ': ' + (m.card === EV.airlift ? 'tap the city for ' + playerLabel(v, m.who) : 'tap a city for the new station');
      p2 = (ui.sel >= 0 ? '<button class="btn small primary" data-g="ev-go">' + (m.card === EV.airlift ? 'Airlift to ' : 'Station in ') + esc(cname(ui.sel)) + '</button>' : '') +
        '<button class="btn small ghost" data-g="ev-cancel">Cancel</button>';
      cls += ' mine';
    } else if (v.phase === 'discard' && v.pend && v.pend.seat === ME) {
      p1 = 'Too many cards: discard 1 (or play an event)';
      p2 = ui.discardPick >= 0 ? '<button class="btn small warm" data-g="discard">Discard ' + esc(D.cardName(ui.discardPick)) + '</button>' : '<span>Tap a card in your hand.</span>';
      cls += ' alert';
    } else if (v.phase === 'window' && toAct.includes(ME)) {
      const r = D.RATE_TRACK[v.rate];
      p1 = v.cur === ME ? (v.quiet ? 'One Quiet Night is on' : 'Infect ' + r + ' cities next') : 'Events before ' + v.names[v.cur] + '’s infections?';
      p2 = v.cur === ME ? '<button class="btn small primary" data-g="go">' + (v.quiet ? 'Skip infections' : 'Infect ' + r + ' cities') + '</button><span>Play an event first if you want.</span>' :
        '<button class="btn small" data-g="pass">No events</button><span>Tap an event card to play it.</span>';
      cls += ' mine';
    } else if (v.phase === 'rpwin' && toAct.includes(ME)) {
      const c = v.idisc[v.idisc.length - 1];
      p1 = 'Epidemic in ' + cname(c) + ' — Resilient Population?';
      p2 = '<button class="btn small warm" data-g="rp" data-c="' + c + '">Remove ' + esc(cname(c)) + '</button><button class="btn small" data-g="rp-pick">Other…</button><button class="btn small ghost" data-g="pass">Not now</button>';
      cls += ' mine';
    } else if (ui.sel >= 0) {
      const c = ui.sel, col = CITIES[c].color;
      const own = v.cubes[c * 4 + col];
      const others = [0, 1, 2, 3].filter(k => k !== col && v.cubes[c * 4 + k]).map(k => cubePips(v.cubes[c * 4 + k], k)).join('');
      p1 = sw(col) + '<span>' + esc(cname(c)) + '</span>' + (own ? cubePips(own, col) : '') + others +
        '<span class="muted small" style="font-weight:500">' + (odds.draw[c] > 0 ? 'next ' + pct(odds.draw[c]) : 'safe this turn') + (odds.out[c] > 0.004 ? ' · <b style="color:' + heat(odds.out[c], 0.4, 0) + '">outbreak ' + pct(odds.out[c]) + '</b>' : '') + '</span>';
      if (myAct) {
        const who = ui.who >= 0 ? ui.who : ME;
        const moves = E.legalActions(planState(v)).filter(a => a.to === c && a.t !== 'give' && (a.who === undefined ? who === ME : a.who === who));
        // one button per way to get there (ops flights: one, paying with the least useful card)
        const seen = new Set();
        p2 = moves.filter(a => { const k = a.t; if (seen.has(k)) return false; seen.add(k); return true; })
          .map(a => '<button class="btn small' + (a.t === 'drive' || a.t === 'shuttle' || a.t === 'dispatch' ? ' primary' : '') + '" data-mv=\'' + esc(JSON.stringify(a)) + '\'>' + esc(moveLabel(a, v)) + '</button>').join('');
        if (!p2) p2 = '<span>' + (c === v.pawns[who] ? (who === ME ? 'You are here.' : v.names[who] + ' is here.') : 'No way to get there this action.') + '</span>';
        if (v.roles[ME] === D.ROLE_IDX.dispatcher) { p2 = whoPicker(v) + p2; cls += ' wrap'; }
      } else p2 = '<span>' + esc(cityNote(v, c)) + '</span>';
    } else if (myAct) {
      p1 = 'Your turn <span class="left-pips">' + [0, 1, 2, 3].map(i => '<i class="' + (i < v.left ? '' : 'off') + '"></i>').join('') + '</span><span class="muted small" style="font-weight:500">' + v.left + ' action' + (v.left === 1 ? '' : 's') + ' left</span>';
      p2 = ui.hint ? '<span style="color:var(--text)">Plan: ' + esc(ui.hint.text) + '</span>' : '<span>Tap a city to move. Dashed rings: one action away.</span>';
      if (v.roles[ME] === D.ROLE_IDX.dispatcher) { p2 = whoPicker(v) + p2; cls += ' wrap'; }
      cls += ' mine';
    } else if (v.phase === 'forecast' && v.pend && v.pend.seat === ME) {
      p1 = 'Forecast: put the top 6 infection cards in order';
      p2 = '<button class="btn small primary" data-g="forecast">Arrange cards</button>';
      cls += ' mine';
    } else if (v.cur === ME) {
      const last = v.log[v.log.length - 1];
      p1 = 'Waiting for teammates…';
      p2 = '<span>' + esc(last ? last.m : '') + '</span>';
    } else {
      const last = v.log[v.log.length - 1];
      p1 = (v.human[v.cur] ? esc(v.names[v.cur]) : esc(v.names[v.cur]) + ' <span class="muted small">(' + esc(roleName(v, v.cur)) + ')</span>') + ' is playing…';
      p2 = '<span>' + esc(last ? last.m : '') + '</span>';
    }
    box.className = cls;
    put(box, '<div class="p1">' + p1 + '</div><div class="p2">' + p2 + '</div>');
  }
  function whoPicker(v) {
    const who = ui.who >= 0 ? ui.who : ME;
    return v.pawns.map((_, p) => '<button class="btn small' + (p === who ? ' warm' : ' ghost') + '" data-who="' + p + '">' + A.roleIcon(v.roles[p], 13) + (p === ME ? 'You' : esc(shortRole(v.roles[p]))) + '</button>').join('');
  }
  function cityNote(v, c) {
    const bits = [];
    if (v.stations.includes(c)) bits.push('Research station.');
    const here = v.pawns.map((x, p) => (x === c ? playerLabel(v, p) : null)).filter(Boolean);
    if (here.length) bits.push(here.join(', ') + ' here.');
    if (v.idisc.includes(c)) bits.push('Card in the infection discard pile.');
    if (v.iremoved.includes(c)) bits.push('Card removed from the game.');
    return bits.join(' ') || CITIES[c].adj.length + ' links.';
  }

  function renderRisk(v, odds) {
    const rows = [];
    for (let c = 0; c < 48; c++) if (odds.draw[c] + odds.epi[c] > 0.004) rows.push(c);
    rows.sort((a, b) => (odds.out[b] - odds.out[a]) || (odds.draw[b] - odds.draw[a]));
    const epi = 1 - odds.epidemic[0];
    const epiChip = O.drawsAhead(v) ? '<span class="rchip" data-q="Chance the next 2 player cards include an Epidemic. Exact: each pile of the player deck holds exactly one." style="border-color:' + heat(epi, 0.6, 0) + '">Epidemic <b class="pct" style="color:' + heat(epi, 0.6, 0) + '">' + pct(epi) + '</b></span>' : '';
    put($('#g-risk'), epiChip + rows.slice(0, 8).map(c => {
      const col = CITIES[c].color, own = v.cubes[c * 4 + col];
      return '<span class="rchip" data-city="' + c + '"><span class="dot" style="background:' + HEX[col] + '"></span>' + esc(cname(c)) +
        (own ? ' ' + own : '') + ' <b class="pct" style="color:' + (odds.out[c] > 0.004 ? heat(odds.out[c], 0.4, 0) : heat(odds.draw[c] * (1 + own), 1, 0)) + '">' +
        (odds.out[c] > 0.004 ? 'boom ' + pct(odds.out[c]) : pct(odds.draw[c])) + '</b></span>';
    }).join(''));
  }

  // teammates sit at the far side of the table: role card, their held cards (face up when open, backs when hidden)
  function renderPlayers(v) {
    const others = v.roles.map((_, p) => p).filter(p => p !== ME);
    const html = others.map(p => {
      const r = v.roles[p];
      const cards = v.hands[p].length ? v.hands[p].slice() : new Array(v.handN[p]).fill(-1);
      if (v.cp >= 0 && ROLES[r].key === 'planner') cards.push(v.cp);
      const n = cards.length;
      const hand = cards.map((c, i) => {
        const st = '--r:' + ((i - (n - 1) / 2) * 3).toFixed(1) + 'deg';
        return c < 0 ? A.backHtml('p', { style: st }) : A.cardHtml(c, { tag: 'span', cls: 'mini', style: st });
      }).join('');
      const label = v.human[p] ? esc(v.names[p]) : others.length > 1 ? esc(shortRole(r)) : esc(v.names[p]) + ' <span class="muted">· ' + esc(shortRole(r)) + '</span>';
      return '<div class="pchip seat' + (p === v.cur && !v.over ? ' turn' : '') + '" data-player="' + p + '" style="--n:' + others.length + '">' + A.roleCardHtml(r) +
        '<span class="sc"><span class="snm"><span class="nmx">' + label + '</span><b>' + v.handN[p] + '</b></span><span class="sh">' + hand + '</span></span></div>';
    }).join('');
    put($('#g-players'), html);
  }

  // your hand, held as a fan of real cards; new cards are dealt from the player deck, spent ones go to their pile
  let fanApi = null;
  function renderHand(v, toAct) {
    const hand = v.hands[ME] || [];
    const sorted = hand.slice().sort((a, b) => (a >= 48) - (b >= 48) || (a < 48 && b < 48 ? CITIES[a].color - CITIES[b].color || a - b : a - b));
    const extra = v.cp >= 0 && v.roles[ME] === D.ROLE_IDX.planner ? [v.cp] : [];
    const ids = sorted.concat(extra);
    const me = $('#g-me');
    me.dataset.player = ME;
    put(me, A.roleCardHtml(v.roles[ME], { cls: v.cur === ME && !v.over ? 'turn' : '' }));
    const fanEl = $('#g-fan');
    const key = ids.join(',') + '|' + ui.card + '|' + ui.discardPick + '|' + extra.length;
    if (fanEl._k === key) return;
    const prevIds = fanEl._ids || null;
    // cards that left your hand slide to where they went: a teammate's seat, or the player discard pile
    if (prevIds && fanApi) {
      prevIds.forEach((c, i) => {
        if (ids.includes(c)) return;
        const from = fanApi.cards[i];
        let to = null;
        v.hands.forEach((h, p) => { if (p !== ME && h.includes(c)) to = document.querySelector('#g-players [data-player="' + p + '"]'); });
        if (!to) to = visibleSpot('pdisc');
        if (from && to) TABLE.slide(from, to);
      });
    }
    if (fanApi && fanApi.disconnect) fanApi.disconnect();
    fanApi = null;
    if (!ids.length) { fanEl.style.height = ''; fanEl.className = 'fan-empty'; fanEl.innerHTML = '<span class="empty">No cards</span>'; }
    else {
      fanEl.className = '';
      fanApi = TABLE.fan(fanEl, ids.map((c, i) => A.cardHtml(c, {
        cls: ui.card === c || ui.discardPick === c ? 'sel is-up' : '',
        attr: ' data-card="' + c + '"' + (i >= sorted.length ? ' data-stored="1"' : ''),
      })), { pick: false, spread: 1.04, lift: 12, maxRot: 8, arc: 0.7 });
      // dealt from the deck: each new card flies in from the player deck on the board, turning face up
      const deck = prevIds ? visibleSpot('pdeck') : null;
      if (deck && TABLE.animOn()) {
        const a = deck.getBoundingClientRect();
        let k = 0;
        fanApi.cards.forEach((el, i) => {
          if (prevIds.includes(ids[i])) return;
          const b = el.getBoundingClientRect();
          if (!b.width) return;
          const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
          const s = Math.max(0.15, Math.min(1, a.width / b.width));
          try {
            el.animate([{ translate: dx + 'px ' + dy + 'px', scale: String(s), rotate: 'y 90deg' }, { translate: '0px 0px', scale: '1', rotate: 'y 0deg' }],
              { duration: FX.settings.animSpeed === 'fast' ? 230 : 420, delay: k++ * 110, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
          } catch (e) { /* old browser: no flight */ }
        });
      }
    }
    fanEl._k = key; fanEl._ids = ids;
  }
  // a deck / pile on the board, if it is on screen (zoomed away: the status row's deck stands in for it)
  function visibleSpot(k) {
    const el = mapApi && mapApi.spot(k);
    if (!el) return null;
    const r = el.getBoundingClientRect(), m = mapBox.getBoundingClientRect();
    if (r.width && r.left >= m.left - 2 && r.right <= m.right + 2 && r.top >= m.top - 2 && r.bottom <= m.bottom + 2) return el;
    return k === 'pdeck' ? document.querySelectorAll('#g-status .stat')[3] || null : null;
  }

  function renderActs(v, toAct) {
    const box = $('#g-acts');
    if (v.over) { put(box, '<button class="btn primary" data-g="new">New game</button><button class="btn" data-go="study">Review</button>'); return; }
    if (!(v.phase === 'actions' && v.cur === ME && toAct.includes(ME)) || ui.mode) {
      const nt = table.online ? '' : '<button class="btn ghost" data-g="speed">Speed: ' + store.settings.speed + '</button>';
      put(box, '<span class="muted small" style="align-self:center;padding:0 4px">' + (toAct.includes(ME) ? 'Your decision' : 'Teammates are playing') + '</span><span class="grow"></span>' + nt);
      return;
    }
    const L = E.legalActions(planState(v));
    const here = v.pawns[ME];
    const btn = (attr, label, cls) => '<button class="btn' + (cls ? ' ' + cls : '') + '" ' + attr + '>' + label + '</button>';
    let h = '';
    const treats = L.filter(a => a.t === 'treat');
    treats.forEach(a => { h += btn('data-act=\'' + JSON.stringify(a) + '\'', sw(a.color) + 'Treat', ''); });
    const cures = L.filter(a => a.t === 'cure');
    cures.forEach(a => { h += btn('data-cure="' + a.color + '"', sw(a.color) + 'Cure', 'warm'); });
    const builds = L.filter(a => a.t === 'build');
    if (builds.length) h += btn('data-g="build"', 'Build', '');
    if (L.some(a => a.t === 'give' || a.t === 'take')) h += btn('data-g="share"', 'Share', '');
    if (L.some(a => a.t === 'cptake')) h += btn('data-g="cptake"', 'Keep event', '');
    if (store.settings.hints) h += btn('data-g="hint"', 'Hint', 'ghost');
    h += btn('data-g="end"', 'End turn', 'ghost');
    void here;
    put(box, h);
  }

  function renderSide(v, odds) {
    const side = $('#g-side');
    if (getComputedStyle(side).display === 'none') return;
    if (!side.firstChild) {
      side.innerHTML = '<div class="info" id="g-info2"></div>' +
        '<div class="panel oddsbox"><div class="row"><span class="label grow">Next infection</span>' + qBtn('Exact chance each city is infected at the end of this turn, from the cards everyone has seen: the discard pile goes back on top after an Epidemic, and the player deck has one Epidemic per pile. “Outbreak” counts the direct risk, not chain reactions.') + '</div><div class="scroll" id="g-odds"></div></div>' +
        '<div class="panel logbox"><span class="label">Log</span><div class="scroll" id="g-log"></div></div>';
    }
    // mirror the info box
    const src = $('#g-info');
    const info2 = $('#g-info2');
    info2.className = src.className; put(info2, src._h || src.innerHTML);
    const rows = [];
    for (let c = 0; c < 48; c++) if (odds.draw[c] + odds.epi[c] > 0.004) rows.push(c);
    rows.sort((a, b) => (odds.out[b] - odds.out[a]) || (odds.draw[b] - odds.draw[a]));
    put($('#g-odds'), '<table class="odds"><tr><th>City</th><th>Cubes</th><th>Next</th><th>Outbreak</th></tr>' + rows.slice(0, 18).map(c => {
      const col = CITIES[c].color, own = v.cubes[c * 4 + col];
      return '<tr data-city="' + c + '" style="cursor:pointer"><td>' + sw(col) + ' ' + esc(cname(c)) + '</td><td>' + (own ? cubePips(own, col) : '') + '</td><td style="color:' + heat(odds.draw[c] * (1 + own), 1, 0) + '">' + pct(odds.draw[c]) +
        '</td><td style="color:' + heat(odds.out[c], 0.4, 0) + '">' + (odds.out[c] > 0.004 ? pct(odds.out[c]) : '–') + '</td></tr>';
    }).join('') + '</table>');
    const lg = $('#g-log');
    lg.innerHTML = '<ul class="log">' + v.log.slice(-60).map(e => '<li class="' + (/Outbreak|Epidemic|lost|No /.test(e.m) ? 'hot' : '') + '"><span class="r">' + e.t + '</span>' + esc(e.m) + '</li>').join('') + '</ul>';
    lg.scrollTop = lg.scrollHeight;
  }

  // the infection / epidemic / drawn cards, shown briefly as they happen
  function showFlips(v) {
    const old = $('.flipstrip');
    if (old) old.remove();
    clearTimeout(flipTimer);
    // real cards: drawn player cards come off the player deck, infection cards off the infection deck, each turned face up
    const items = [];
    (v.lastDraw || []).forEach(c => items.push({ front: A.cardHtml(c, { tag: 'span' }), deck: 'pdeck', t: 'Drew ' + D.cardName(c) }));
    (v.lastEpi || []).forEach(c => items.push({ front: A.cardHtml(D.EPIDEMIC, { tag: 'span', city: c }), deck: 'pdeck', t: 'Epidemic: ' + cname(c) }));
    (v.lastInf || []).forEach(c => items.push({ front: A.infHtml(c), deck: 'ideck', t: cname(c) }));
    if (!items.length) return;
    const strip = document.createElement('div');
    strip.className = 'flipstrip';
    const step = flipStep();
    const list = items.slice(0, 6);
    strip.innerHTML = list.map(x => {
      const f = x.front.replace(/^<span class="/, '<span class="tbl-face ').replace(/\btbl-card\b/, '');
      return '<div class="fcard tbl-card tbl-flip is-down" aria-label="' + esc(x.t) + '"><div class="tbl-inner">' + f +
        A.backHtml(x.deck === 'ideck' ? 'inf' : 'p', { cls: 'tbl-face' }).replace(/\btbl-card /, '') + '</div></div>';
    }).join('');
    document.body.appendChild(strip);
    const cards = Array.from(strip.children);
    const anim = TABLE.animOn();
    cards.forEach((el, i) => {
      const deck = anim ? visibleSpot(list[i].deck) : null;
      if (deck) {
        const a = deck.getBoundingClientRect(), b = el.getBoundingClientRect();
        const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
        try {
          el.animate([{ translate: dx + 'px ' + dy + 'px', scale: String(Math.max(0.15, Math.min(1, a.width / b.width))) }, { translate: '0px 0px', scale: '1' }],
            { duration: Math.round(step * 2.2), delay: i * step, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
        } catch (e) { /* no flight */ }
      }
      setTimeout(() => TABLE.flip(el, false), anim ? i * step + Math.round(step * 2.2) : 0);
    });
    flipTimer = setTimeout(() => strip.remove(), 2400 + items.length * step);
  }

  // play one timed list from PanSfx.events: sounds always (if on), motion only on the game screen
  function runFx(items) {
    items.forEach(x => { if (x.at > 0) setTimeout(() => fxItem(x), x.at); else fxItem(x); });
  }
  const shown = el => el && el.getClientRects().length > 0;
  const infoEl = () => [$('#g-info2'), $('#g-info')].filter(shown)[0];
  const vialEl = col => document.querySelectorAll('#g-status .vial')[col];
  function cityEl(c) {
    const el = mapBox && mapBox.querySelectorAll('g.city')[c];
    if (!el) return null;
    const r = el.getBoundingClientRect(), m = mapBox.getBoundingClientRect();
    return r.left >= m.left && r.right <= m.right && r.top >= m.top && r.bottom <= m.bottom ? el : null; // zoomed away: skip
  }
  function fxItem(x) {
    if (x.sound) FX.play(x.sound, x.pitch ? { pitch: x.pitch } : undefined);
    const live = ui.tab === 'play' && !!$('#game');
    if (x.celebrate === 'big') FX.celebrate({ kind: 'big', at: live ? vialEl(x.col) : null, colors: [fxCol(x.col), '#ffffff', '#f0b354'] });
    else if (x.celebrate) FX.celebrate({ kind: x.celebrate, colors: x.celebrate === 'win' ? [HEX[0], HEX[1], HEX[3], '#6ee7a8', '#e8eaf0', '#f0b354'] : undefined });
    if (!live || !x.anim) return;
    if (x.anim === 'outbreak') {
      FX.shake(mapBox);
      const st = $('#g-status .stat');
      // the counter sits at the top edge: the "+1" rises from just below it onto it
      if (st) { FX.pop(st); const r = st.getBoundingClientRect(); FX.floatText({ getBoundingClientRect: () => ({ left: r.left, top: r.top + 34, width: r.width, height: r.height }) }, '+1', 'var(--bad)'); }
    } else if (x.anim === 'epidemic') { FX.flash(mapBox, '#e5484d'); FX.shake(mapBox); }
    else if (x.anim === 'treat') { const el = cityEl(x.city); if (el) FX.floatText(el, '−' + x.n, fxCol(x.col)); }
    else if (x.anim === 'erad') { const vl = vialEl(x.col); if (vl) FX.pop(vl); }
    else if (x.anim === 'myturn') { const el = infoEl(); if (el) FX.flash(el, 'var(--accent-warm)'); }
  }
  function showEnd(v) {
    if (showEnd.done === v.turn + ':' + v.over.why) return;
    showEnd.done = v.turn + ':' + v.over.why;
    if (!table.online) saveLast(v, (store.game && store.game.checks) || []);
    const b = document.createElement('div');
    b.className = 'banner ' + (v.over.win ? 'win' : 'lose');
    b.innerHTML = '<h2>' + (v.over.win ? 'Cured!' : 'Game over') + '</h2><p class="muted" style="margin:0 0 12px">' +
      (v.over.win ? 'All four cures in ' + v.turn + ' turns.' : ({ outbreaks: 'Eight outbreaks.', cubes: 'A disease ran out of cubes.', cards: 'The player deck ran out.' }[v.over.why])) + '</p>' +
      '<div class="row" style="justify-content:center"><button class="btn primary" data-g="new">New game</button><button class="btn" data-go="study">Review</button></div>';
    b.addEventListener('click', () => b.remove());
    document.body.appendChild(b);
  }
  function saveLast(v, checks) {
    const outs = {};
    v.log.forEach(e => { const m = /^Outbreak in (.+)!$/.exec(e.m); if (m) outs[m[1]] = (outs[m[1]] || 0) + 1; });
    store.last = { win: v.over.win, why: v.over.why, turns: v.turn, epidemics: v.epidemics, players: v.n, roles: v.roles, names: v.names, me: ME,
      hist: v.hist.concat([E.snapStats ? { turn: v.turn, out: v.outbreaks, cubes: 96 - v.supply.reduce((a, b) => a + b, 0), cured: v.cured.reduce((a, b) => a + b, 0), epi: v.epiDrawn } : null]).filter(Boolean),
      checks: checks || [], outs, cured: v.cured };
    save();
  }

  // ---------------------------------------------------------------- doing things
  function act(a, seat) {
    if (ui.busy) return;
    seat = seat === undefined ? ME : seat;
    const v = table.view();
    // remember how this turn compares with the planner (Study: points lost)
    if (!table.online && a.t !== 'event' && v.phase === 'actions' && v.cur === ME) turnCheckEnd(a);
    if (table.online) {
      ui.busy = true;
      net.room.act(a).then(r => { if (r && r.ok === false) { ui.busy = false; oops(r.message); } });
      resetSel();
      return;
    }
    try { table.act(seat, a); } catch (e) { oops(e.message || 'Not allowed'); return; }
    if (a.t !== 'event' || ui.mode) resetSel();
    ui.hint = null;
    renderPlay();
  }
  function turnCheckStart(v) {
    if (table.online || !store.game || (ui.check && ui.check.turn === v.turn)) return;
    if (v.left !== 4) return;
    try {
      const st = table.state;
      const ctx = B.context(st);
      const pl = B.plan(st, { ctx });
      ui.check = { turn: v.turn, ctx, best: pl.score, plan: pl.seq.map(x => actText(x, v)).join(' → ') };
    } catch (e) { ui.check = null; }
  }
  function turnCheckEnd(a) {
    const c = ui.check;
    if (!c || !store.game) return;
    const st = table.state;
    try {
      const t = E.clone(st); t.sim = true;
      E.doAction(t, a);
      if (a.t !== 'end' && t.left > 0) return;
      t.left = 0;
      const yours = B.evaluate(t, c.ctx);
      store.game.checks = (store.game.checks || []).concat([{ turn: c.turn, lost: Math.max(0, Math.round(c.best - yours)), plan: c.plan }]).slice(-40);
      ui.check = null;
    } catch (e) { /* ignore */ }
  }
  function actText(a, v) {
    switch (a.t) {
      case 'drive': return 'drive to ' + cname(a.to);
      case 'direct': return 'fly to ' + cname(a.to);
      case 'charter': return 'charter to ' + cname(a.to);
      case 'shuttle': return 'shuttle to ' + cname(a.to);
      case 'dispatch': return 'send ' + v.names[a.who] + ' to ' + cname(a.to);
      case 'opsmove': return 'ops flight to ' + cname(a.to);
      case 'build': return 'build a station';
      case 'treat': return 'treat ' + COLOR_NAMES[a.color].toLowerCase();
      case 'give': return 'give ' + cname(a.card) + ' to ' + v.names[a.to];
      case 'take': return 'take ' + cname(a.card) + ' from ' + v.names[a.from];
      case 'cure': return 'cure ' + COLOR_NAMES[a.color].toLowerCase();
      case 'cptake': return 'keep ' + D.cardName(a.card);
      case 'event': return 'play ' + D.cardName(a.card);
      default: return 'end turn';
    }
  }

  // test hook: ?autoplay lets the computer play your seat too (used to screenshot whole games)
  const AUTO = /[?&]autoplay(?![a-z])/.test(location.search);
  // computer teammates (local games): one step at a time so you can follow
  function scheduleBots() {
    if (table.online || botTimer) return;
    const s = table.state;
    if (s.over) return;
    const seats = E.toAct(s).filter(p => AUTO || !s.human[p]);
    if (!seats.length) return;
    const delay = AUTO ? 20 : { slow: 1300, normal: 700, fast: 220 }[store.settings.speed] || 700;
    const extra = !AUTO && ((s.lastInf && s.lastInf.length) || (s.lastEpi && s.lastEpi.length)) ? 900 : 0;
    botTimer = setTimeout(() => {
      botTimer = null;
      if (!table || table.online || ui.tab !== 'play') { if (table && !table.online) scheduleLater(); return; }
      const st = table.state;
      const p = E.toAct(st).filter(q => AUTO || !st.human[q])[0];
      if (p === undefined) return;
      try { table.act(p, B.decide(st, p)); } catch (e) { console.warn(e); return; }
      renderPlay();
    }, delay + extra);
  }
  function scheduleLater() { setTimeout(() => { if (ui.tab === 'play' && table && !table.online) renderPlay(); }, 400); }

  // ---------------------------------------------------------------- sheets
  function shareSheet(v) {
    const L = E.legalActions(planState(v)).filter(a => a.t === 'give' || a.t === 'take');
    const html = L.map(a => '<button class="btn" style="justify-content:flex-start" data-a=\'' + JSON.stringify(a) + '\'>' + sw(CITIES[a.card].color) +
      esc(a.t === 'give' ? 'Give ' + cname(a.card) + ' to ' + v.names[a.to] : 'Take ' + cname(a.card) + ' from ' + v.names[a.from]) + '</button>').join('');
    sheet('Share a card', html + '<p class="muted small" style="margin:0">You can share the card of the city you are both in. The Researcher can give any city card.</p>', e => {
      const b = e.target.closest('[data-a]');
      if (b) { closeSheet(); act(JSON.parse(b.dataset.a)); }
    });
  }
  function cureSheet(v, col) {
    const need = ROLES[v.roles[ME]].key === 'scientist' ? 4 : 5;
    const cards = v.hands[ME].filter(c => D.isCity(c) && CITIES[c].color === col);
    if (cards.length === need) { act({ t: 'cure', color: col, cards }); return; }
    const pick = new Set(cards.slice(0, need));
    const draw = () => cards.map(c => '<button class="btn' + (pick.has(c) ? ' warm' : '') + '" style="justify-content:flex-start" data-c="' + c + '">' + sw(col) + esc(cname(c)) + '</button>').join('') +
      '<button class="btn primary" data-ok' + (pick.size === need ? '' : ' disabled') + '>Cure ' + COLOR_NAMES[col].toLowerCase() + ' with these ' + need + '</button>';
    const sh = sheet('Pick ' + need + ' cards for the cure', draw(), e => {
      const b = e.target.closest('[data-c]');
      if (b) { const c = +b.dataset.c; if (pick.has(c)) pick.delete(c); else if (pick.size < need) pick.add(c); sh.querySelector('.scroll').innerHTML = draw(); }
      if (e.target.closest('[data-ok]') && pick.size === need) { closeSheet(); act({ t: 'cure', color: col, cards: Array.from(pick) }); }
    });
  }
  function stationSheet(v, done) {
    sheet('All 6 stations are out: move one', v.stations.map(c => '<button class="btn" style="justify-content:flex-start" data-r="' + c + '">' + sw(CITIES[c].color) + esc(cname(c)) + '</button>').join(''), e => {
      const b = e.target.closest('[data-r]');
      if (b) { closeSheet(); done(+b.dataset.r); }
    });
  }
  function playerSheet(v, p) {
    const r = ROLES[v.roles[p]];
    const cards = v.hands[p].length ? '<div style="display:flex;flex-wrap:wrap;gap:6px">' + v.hands[p].map(c => A.cardHtml(c)).join('') + '</div>' : '<p class="muted small" style="margin:0">' + (v.handN[p] ? v.handN[p] + ' cards, kept hidden (Standard and Heroic rules). Ask them!' : 'No cards.') + '</p>';
    sheet(playerLabel(v, p) + ' · ' + r.name, '<div class="row">' + A.roleIcon(v.roles[p], 26) + '<p style="margin:0" class="small">' + esc(r.text) + '</p></div>' +
      '<div class="label">Hand</div>' + cards + (r.key === 'planner' && v.cp >= 0 ? '<div class="label">Kept event</div>' + A.cardHtml(v.cp) : '') +
      '<p class="muted small" style="margin:0">In ' + esc(cname(v.pawns[p])) + '.</p>', null, { keep: true });
  }
  function forecastSheet(v) {
    const order = v.pend.cards.slice();
    const odds = (c) => { const k = v.cubes[c * 4 + CITIES[c].color]; return k; };
    const draw = () => order.map((c, i) => '<div class="row" style="background:var(--bg-soft);border:1px solid var(--line);border-radius:8px;padding:4px 6px">' +
      '<span class="num muted" style="width:18px">' + (i + 1) + '</span>' + sw(CITIES[c].color) + '<span class="grow">' + esc(cname(c)) + ' ' + cubePips(odds(c), CITIES[c].color) + '</span>' +
      '<button class="btn small ghost" data-up="' + i + '"' + (i ? '' : ' disabled') + '>Up</button><button class="btn small ghost" data-down="' + i + '"' + (i < order.length - 1 ? '' : ' disabled') + '>Down</button></div>').join('') +
      '<p class="muted small" style="margin:0">1 is drawn first. Put cities with 3 cubes at the bottom.</p><button class="btn primary" data-ok>Put them back</button>';
    const sh = sheet('Forecast: order the top ' + order.length, draw(), e => {
      const u = e.target.closest('[data-up]'), d = e.target.closest('[data-down]');
      if (u) { const i = +u.dataset.up; [order[i - 1], order[i]] = [order[i], order[i - 1]]; sh.querySelector('.scroll').innerHTML = draw(); }
      if (d) { const i = +d.dataset.down; [order[i + 1], order[i]] = [order[i], order[i + 1]]; sh.querySelector('.scroll').innerHTML = draw(); }
      if (e.target.closest('[data-ok]')) { closeSheet(); act({ t: 'forecast', order }); }
    }, { noClose: true, kind: 'forecast' });
  }
  function rpSheet(v) {
    sheet('Resilient Population: remove a card', v.idisc.slice().reverse().map(c => '<button class="btn" style="justify-content:flex-start" data-r="' + c + '">' + sw(CITIES[c].color) + esc(cname(c)) + ' ' + cubePips(v.cubes[c * 4 + CITIES[c].color], CITIES[c].color) + '</button>').join(''), e => {
      const b = e.target.closest('[data-r]');
      if (b) { closeSheet(); act({ t: 'event', card: EV.resilient, city: +b.dataset.r }); }
    });
  }
  function eventStart(v, card) {
    const toAct = table.toAct();
    if (!E.canPlayEventNow(v) || (table.online && !toAct.includes(ME))) { oops(table.online ? 'Events can be played when the game asks (before infections).' : 'Not right now'); return; }
    const e = EVENTS[card - 48];
    if (card === EV.quiet) { confirmBox('Play One Quiet Night? The next infection step is skipped.', 'Play', () => act({ t: 'event', card })).dataset.decide = '1'; return; }
    if (card === EV.forecast) { confirmBox('Play Forecast? You will see the top 6 infection cards and put them back in any order.', 'Play', () => act({ t: 'event', card })).dataset.decide = '1'; return; }
    if (card === EV.resilient) { if (!v.idisc.length) { oops('The infection discard pile is empty'); return; } rpSheet(v); return; }
    if (card === EV.grant) { ui.mode = { card }; ui.sel = -1; renderPlay(); toast('Tap a city for the station'); return; }
    if (card === EV.airlift) {
      sheet('Airlift: whose pawn?', v.pawns.map((_, p) => '<button class="btn" style="justify-content:flex-start" data-p="' + p + '">' + A.roleIcon(v.roles[p], 16) + esc(playerLabel(v, p)) + ' <span class="muted">in ' + esc(cname(v.pawns[p])) + '</span></button>').join(''), ev => {
        const b = ev.target.closest('[data-p]');
        if (b) { closeSheet(); ui.mode = { card, who: +b.dataset.p }; ui.sel = -1; renderPlay(); }
      });
    }
    void e;
  }

  // ---------------------------------------------------------------- clicks on the play screen
  vPlay.addEventListener('click', e => {
    const t = e.target;
    const setBtn = t.closest('[data-set] [data-v]');
    if (setBtn) {
      const key = setBtn.parentElement.dataset.set;
      store.settings[key] = +setBtn.dataset.v;
      save(); renderPlay(); return;
    }
    if (t.closest('[data-start]')) { startLocal(); return; }
    const on = t.closest('[data-on]');
    if (on) { onlineBtn(on.dataset.on); return; }
    const seatB = t.closest('[data-seat]');
    if (seatB && net.room) { net.room.setSeat(+seatB.dataset.seat, seatB.dataset.kind).then(r => { if (!r.ok) toast(r.message); }); return; }
    const go = t.closest('[data-go]');
    if (go) { showTab(go.dataset.go, true); return; }
    if (!table) return;
    const v = table.view();
    if (!v) return;
    if (t.closest('#g-menu')) { menuSheet(v); return; }
    const city = t.closest('[data-city]');
    if (city) { ui.sel = +city.dataset.city; renderGame(); return; }
    const pl = t.closest('[data-player]');
    if (pl) { playerSheet(v, +pl.dataset.player); return; }
    const whoB = t.closest('[data-who]');
    if (whoB) { ui.who = +whoB.dataset.who; renderGame(); return; }
    const mv = t.closest('[data-mv]');
    if (mv) { act(JSON.parse(mv.dataset.mv)); return; }
    const ab = t.closest('[data-act]');
    if (ab) { act(JSON.parse(ab.dataset.act)); return; }
    const cu = t.closest('[data-cure]');
    if (cu) { cureSheet(v, +cu.dataset.cure); return; }
    const cardB = t.closest('[data-card]');
    if (cardB) { onCard(v, +cardB.dataset.card); return; }
    const g = t.closest('[data-g]');
    if (!g) return;
    const k = g.dataset.g;
    if (k === 'new') {
      document.querySelectorAll('.banner').forEach(b => b.remove());
      if (table.online) { leaveOnline(); return; }
      store.game = null; table = null; save(); resetSel(); renderPlay(); return;
    }
    if (k === 'go') act({ t: 'go' });
    else if (k === 'pass') act({ t: 'pass' });
    else if (k === 'rp') act({ t: 'event', card: EV.resilient, city: +g.dataset.c });
    else if (k === 'rp-pick') rpSheet(v);
    else if (k === 'forecast' && v.phase === 'forecast' && v.pend && v.pend.seat === ME) forecastSheet(v);
    else if (k === 'discard' && ui.discardPick >= 0) { const c = ui.discardPick; ui.discardPick = -1; act({ t: 'discard', card: c }); }
    else if (k === 'share') shareSheet(v);
    else if (k === 'cptake') {
      const L = E.legalActions(planState(v)).filter(a => a.t === 'cptake');
      sheet('Keep an event from the discard pile', L.map(a => '<button class="btn" style="justify-content:flex-start" data-a=\'' + JSON.stringify(a) + '\'>' + esc(D.cardName(a.card)) + '</button>').join(''), ev => {
        const b = ev.target.closest('[data-a]');
        if (b) { closeSheet(); act(JSON.parse(b.dataset.a)); }
      });
    } else if (k === 'build') {
      if (v.stations.length >= 6) stationSheet(v, r => act({ t: 'build', remove: r }));
      else act({ t: 'build' });
    } else if (k === 'end') {
      if (v.left > 0) confirmBox('End your turn with ' + v.left + ' action' + (v.left === 1 ? '' : 's') + ' left?', 'End turn', () => act({ t: 'end' }));
    } else if (k === 'hint') {
      const st = table.online ? planState(v) : table.state;
      const pl = B.plan(st, {});
      ui.hint = { text: pl.seq.map(x => actText(x, v)).join(' → '), first: pl.seq[0] };
      const f = pl.seq[0];
      if (f && f.to !== undefined) ui.sel = f.to;
      else ui.sel = -1;
      renderGame();
      toast('Plan: ' + ui.hint.text);
    } else if (k === 'ev-cancel') { ui.mode = null; renderGame(); }
    else if (k === 'ev-go' && ui.mode && ui.sel >= 0) {
      const m = ui.mode;
      if (m.card === EV.airlift) act({ t: 'event', card: m.card, who: m.who, to: ui.sel });
      else if (v.stations.length >= 6) stationSheet(v, r => act({ t: 'event', card: m.card, city: ui.sel, remove: r }));
      else act({ t: 'event', card: m.card, city: ui.sel });
      ui.mode = null;
    } else if (k === 'speed') {
      const order = ['slow', 'normal', 'fast'];
      store.settings.speed = order[(order.indexOf(store.settings.speed) + 1) % 3]; save(); renderGame();
    }
  });
  function onCard(v, c) {
    if (v.over) return;
    if (v.phase === 'discard' && v.pend && v.pend.seat === ME && !D.isEvent(c)) { ui.discardPick = ui.discardPick === c ? -1 : c; renderGame(); return; }
    if (D.isEvent(c)) {
      if (v.phase === 'discard' && v.pend && v.pend.seat === ME) {
        sheet(D.cardName(c), '<p class="small" style="margin:0">' + esc(EVENTS[c - 48].text) + '</p><button class="btn warm" data-x="play">Play it</button><button class="btn" data-x="drop">Discard it</button>', ev => {
          const b = ev.target.closest('[data-x]');
          if (!b) return;
          closeSheet();
          if (b.dataset.x === 'drop') act({ t: 'discard', card: c }); else eventStart(v, c);
        });
        return;
      }
      eventStart(v, c);
      return;
    }
    ui.card = ui.card === c ? -1 : c;
    ui.sel = ui.card >= 0 ? c : -1;
    renderGame();
  }
  function menuSheet(v) {
    const online = table.online;
    sheet('Game', '<div class="small muted">' + LEVEL_NOTE[v.epidemics] + ' · ' + v.n + ' players · turn ' + v.turn + (v.open ? ' · open hands' : '') + '</div>' +
      (online ? '<button class="btn" data-m="leave">Leave the room</button>' : '<button class="btn" data-m="new">New game</button>') +
      (online && net.snap && net.snap.code ? '<p class="small muted" style="margin:0">Room code <b>' + esc(net.snap.code) + '</b></p>' : ''), e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      closeSheet();
      if (b.dataset.m === 'leave') confirmBox('Leave this game? A computer takes your seat.', 'Leave', leaveOnline);
      if (b.dataset.m === 'new') confirmBox('Start a new game? This one ends.', 'New game', () => { store.game = null; table = null; save(); resetSel(); renderPlay(); });
    }, { keep: true });
  }

  // ================================================================== TABLE (real-table tracker)
  const vTable = $('#v-table');
  function newTracker(players, epidemics) {
    const deal = D.DEAL[players];
    const R = 53 - players * deal;
    const base = Math.floor(R / epidemics), extra = R % epidemics;
    const piles = [];
    for (let k = 0; k < epidemics; k++) piles.push(base + (k < extra ? 1 : 0) + 1);
    return { players, epidemics, piles, drawn: 0, epiDrawn: 0, layers: [], idisc: [], iremoved: [], cubes: new Array(192).fill(0), outbreaks: 0, rate: 0,
      setup: 9, after: false, mode: 'draw', undo: [], fq: [] };
  }
  function tr() {
    if (trOk.has(store.table)) return store.table;
    if (!trValid(store.table)) { store.table = newTracker(store.settings.players, store.settings.epidemics); save(); }
    trOk.add(store.table);
    return store.table;
  }
  const trOk = new WeakSet();
  // a saved tracker with missing or broken fields starts fresh instead of leaving the tab blank
  function trValid(t) {
    try {
      if (!t || typeof t !== 'object') return false;
      const arr = (x, len) => Array.isArray(x) && (len === undefined || x.length === len);
      const cityList = x => arr(x) && x.every(c => Number.isInteger(c) && c >= 0 && c < 48);
      if (![2, 3, 4].includes(t.players) || ![4, 5, 6].includes(t.epidemics)) return false;
      if (!arr(t.piles, t.epidemics) || !t.piles.every(n => Number.isInteger(n) && n > 0)) return false;
      if (!arr(t.layers) || !t.layers.every(cityList) || !cityList(t.idisc) || !cityList(t.iremoved) || !cityList(t.fq)) return false;
      if (!arr(t.cubes, 192) || !arr(t.undo)) return false;
      if (![t.drawn, t.epiDrawn, t.outbreaks, t.rate, t.setup].every(n => Number.isInteger(n) && n >= 0)) return false;
      if (t.rate > 6 || t.epiDrawn > t.epidemics || !['draw', 'epi', 'treat', 'rp', 'forecast'].includes(t.mode)) return false;
      if (t.mode === 'epi' && !(Number.isInteger(t.epiLeft) && t.epiLeft > 0)) return false;
      O.infectionOdds(trView(t), 2, null);
      return true;
    } catch (e) { return false; }
  }
  function trView(t) {
    return { layers: t.layers, idisc: t.idisc, iremoved: t.iremoved, rate: t.rate, piles: t.piles, pdeckCount: t.piles.reduce((a, b) => a + b, 0) - t.drawn, epiDrawn: t.epiDrawn, cubes: t.cubes, erad: [0, 0, 0, 0] };
  }
  function trPush(t) {
    const snap = JSON.parse(JSON.stringify(Object.assign({}, t, { undo: [] })));
    t.undo = t.undo.concat([snap]).slice(-40);
  }
  // add cubes with the real outbreak rules
  function trInfect(t, c, n, chain) {
    const col = CITIES[c].color, k = c * 4 + col;
    if (t.cubes[k] + n > 3) {
      t.cubes[k] = 3;
      if (chain.includes(c)) return;
      chain.push(c); t.outbreaks++;
      CITIES[c].adj.forEach(a => { if (!chain.includes(a)) trInfect2(t, a, col, chain); });
    } else t.cubes[k] += n;
  }
  function trInfect2(t, c, col, chain) {
    const k = c * 4 + col;
    if (t.cubes[k] >= 3) {
      if (chain.includes(c)) return;
      chain.push(c); t.outbreaks++;
      CITIES[c].adj.forEach(a => { if (!chain.includes(a)) trInfect2(t, a, col, chain); });
    } else t.cubes[k]++;
  }
  function trTakeTop(t, c) {
    // remove c from the known layers (it came off the top)
    if (t.layers.length) {
      const L = t.layers[0], i = L.indexOf(c);
      if (i >= 0) { L.splice(i, 1); if (!L.length) t.layers.shift(); return true; }
      return false;
    }
    return true;
  }
  function trTap(c) {
    const t = tr();
    if (t.iremoved.includes(c)) return;
    if (t.mode === 'treat') {
      const k = c * 4 + CITIES[c].color;
      if (!t.cubes[k]) return;
      trPush(t); t.cubes[k]--; FX.play('pop'); save(); renderTable(); return;
    }
    if (t.mode === 'rp') {
      if (!t.idisc.includes(c)) { oops('Pick a card from the discard pile'); return; }
      trPush(t); t.idisc.splice(t.idisc.indexOf(c), 1); t.iremoved.push(c); t.mode = 'draw'; FX.play('cardSlide'); save(); renderTable(); return;
    }
    if (t.mode === 'forecast') {
      if (t.idisc.includes(c) || t.fq.includes(c)) return;
      t.fq.push(c); FX.play('cardFlip');
      if (t.fq.length === Math.min(6, 48 - t.idisc.length - t.iremoved.length)) {
        trPush(t);
        t.fq.forEach(x => { t.layers.forEach(L => { const i = L.indexOf(x); if (i >= 0) L.splice(i, 1); }); });
        t.layers = t.fq.map(x => [x]).concat(t.layers.filter(L => L.length));
        t.fq = []; t.mode = 'draw';
      }
      save(); renderTable(); return;
    }
    if (t.mode === 'epi') {
      // bottom card: must be from the lowest part of the deck
      if (t.idisc.includes(c)) { oops(cname(c) + ' is in the discard pile, so it can’t be the bottom card'); return; }
      trPush(t);
      const o0 = t.outbreaks, k0 = t.cubes[c * 4 + CITIES[c].color];
      t.layers.forEach(L => { const i = L.indexOf(c); if (i >= 0) L.splice(i, 1); });
      t.layers = t.layers.filter(L => L.length);
      t.rate = Math.min(6, t.rate + 1);
      trInfect(t, c, 3, []);
      t.idisc.push(c);
      // intensify: the discard pile goes back on top
      t.layers.unshift(t.idisc.slice().sort((a, b) => a - b)); t.idisc = [];
      t.epiLeft--;
      t.mode = t.epiLeft > 0 ? 'epi' : 'draw';
      trEpiIfNoDeck(t);
      trSounds(t, c, o0, k0, 3);
      flash(c); save(); renderTable(); return;
    }
    // draw mode: an infection card was flipped
    if (t.idisc.includes(c)) { oops(cname(c) + ' is already in the discard pile'); return; }
    if (!trTakeTop(t, c)) { oops(cname(c) + ' can’t be on top: the cards on top are the ones shuffled back after the last Epidemic'); return; }
    trPush(t);
    const o0 = t.outbreaks, k0 = t.cubes[c * 4 + CITIES[c].color];
    if (t.setup > 0) { t.cubes[c * 4 + CITIES[c].color] = Math.ceil(t.setup / 3); t.setup--; }
    else trInfect(t, c, 1, []);
    t.idisc.push(c);
    t.after = false;
    trSounds(t, c, o0, k0, 0);
    flash(c); save(); renderTable();
  }
  // tracker: the card flips, its cubes knock down (or the city breaks out), an Epidemic reshuffles the pile
  function trSounds(t, c, o0, k0, epi) {
    const at = (ms, f) => (ms ? setTimeout(f, ms) : f());
    FX.play('cardFlip');
    const outs = t.outbreaks - o0;
    if (!outs && t.cubes[c * 4 + CITIES[c].color] > k0) at(110, () => FX.play('place', epi ? { pitch: 0.85 } : undefined));
    for (let i = 0; i < Math.min(outs, 6); i++) at(180 + i * 260, () => FX.play('explosion'));
    if (epi) at(650, () => FX.play('shuffle'));
  }
  // an Epidemic with no infection cards left to flip from the bottom: raise the rate and shuffle the discard back on top
  function trEpiIfNoDeck(t) {
    while (t.mode === 'epi' && 48 - t.idisc.length - t.iremoved.length <= 0) {
      t.rate = Math.min(6, t.rate + 1);
      t.layers = t.idisc.length ? [t.idisc.slice().sort((a, b) => a - b)] : [];
      t.idisc = [];
      t.epiLeft--;
      t.mode = t.epiLeft > 0 ? 'epi' : 'draw';
    }
  }
  function flash(c) { setTimeout(() => { const el = document.querySelector('.tc[data-tc="' + c + '"]'); if (el) el.classList.add('flash'); }, 0); }
  function renderTable() {
    const t = tr();
    const v = trView(t);
    const draws = t.setup > 0 || t.after ? 0 : 2;
    const odds = O.infectionOdds(v, draws, null);
    const epi = 1 - odds.epidemic[0];
    const left = v.pdeckCount;
    const hint = { draw: t.setup > 0 ? 'Tap the ' + t.setup + ' starting cities in the order you flip them (3, 3, 3, 2, 2, 2, 1, 1, 1 cubes).' : 'Tap each infection card as it is flipped.',
      epi: 'Epidemic: tap the city on the BOTTOM card.', treat: 'Tap a city to remove one cube.', rp: 'Resilient Population: tap a card in the discard pile.',
      forecast: 'Forecast: tap the 6 cards in their new order, top first (' + t.fq.length + ' so far).' }[t.mode];
    const cols = [0, 1, 2, 3].map(col => '<div class="tcol">' + CITIES.filter(c => c.color === col).sort((a, b) => (odds.draw[b.i] - odds.draw[a.i]) || a.name.localeCompare(b.name)).map(c => {
      const k = t.cubes[c.i * 4 + col];
      const p = odds.draw[c.i];
      const st = t.iremoved.includes(c.i) ? ' gone' : t.idisc.includes(c.i) ? ' disc' : '';
      const fq = t.fq.indexOf(c.i);
      return '<div class="tc' + st + '" data-tc="' + c.i + '"><span class="edge" style="background:' + HEX[col] + '"></span><span class="tn">' + (fq >= 0 ? (fq + 1) + '. ' : '') + esc(c.name) + '</span>' +
        (k ? '<span class="cb">' + Array.from({ length: k }, () => '<i style="background:' + HEX[col] + (col === 2 ? ';outline:1px solid #8a8fa3' : '') + '"></i>').join('') + '</span>' : '') +
        (st ? '' : '<span class="tp" style="color:' + (odds.out[c.i] > 0.004 ? heat(odds.out[c.i], 0.4, 0) : heat(p * (1 + k), 1, 0)) + '">' + (p > 0.004 ? pct(p) : '') + '</span>') + '</div>';
    }).join('') + '</div>').join('');
    const stack = t.layers.map((L, i) => '<div class="small"><b>' + (i === 0 ? 'Top' : 'Then') + ':</b> ' + L.length + ' card' + (L.length === 1 ? '' : 's') + ' <span class="muted">(' + L.map(cname).slice(0, 8).join(', ') + (L.length > 8 ? '…' : '') + ')</span></div>').join('');
    vTable.innerHTML = '<div class="tt">' +
      '<div class="bar"><button class="stat" data-t="setup" style="color:var(--text)">' + t.players + 'p · ' + LEVEL_NOTE[t.epidemics] + ' ▾</button>' +
      '<span class="stat" data-q="Chance the next 2 player cards include an Epidemic (exact, from the pile sizes: each pile holds one).">Epidemic <b style="color:' + heat(epi, 0.6, 0) + '">' + (draws ? pct(epi) : '–') + '</b></span>' +
      '<span class="stat" data-q="Infection rate right now.">Rate <b>' + D.RATE_TRACK[t.rate] + '</b></span>' +
      '<span class="stat" data-q="Outbreaks the tracker has counted from the cubes you entered.">' + ICON.out + '<b>' + t.outbreaks + '</b></span>' +
      '<span class="stat" data-q="Player cards left in the deck.">' + ICON.deck + '<b>' + left + '</b></span></div>' +
      '<div class="bar">' + (t.setup > 0 ? '<span class="muted small">Starting cities first.</span>' : '<button class="btn small" data-t="drew0">Drew 2</button><button class="btn small warm" data-t="drew1">Epidemic</button><button class="btn small warm" data-t="drew2">2 Epidemics</button>') +
      '<span class="grow"></span><button class="btn small ghost" data-t="undo"' + (t.undo.length ? '' : ' disabled') + '>Undo</button></div>' +
      '<div class="bar wrap"><div class="seg" style="flex:none">' + [['draw', 'Flip'], ['treat', 'Treat']].map(([k, l]) => '<button class="btn small" aria-pressed="' + (t.mode === k) + '" data-mode="' + k + '" style="min-height:34px">' + l + '</button>').join('') + '</div>' +
      '<button class="btn small ghost" data-t="more">More</button><span class="modehint">' + esc(hint || '') + '</span></div>' +
      '<div class="scroll"><div class="tgrid">' + cols + '</div></div>' +
      '<div class="tside panel" style="display:none"></div>' +
      '</div>';
    const side = vTable.querySelector('.tside');
    if (window.matchMedia('(min-width: 900px)').matches) {
      side.style.display = 'flex'; side.style.flexDirection = 'column'; side.style.gap = '8px';
      side.innerHTML = '<span class="label">Infection deck</span>' + (stack || '<div class="small muted">No Epidemic yet: every unflipped card is equally likely.</div>') +
        '<div class="small"><b>Rest:</b> ' + odds.struct[odds.struct.length - 1].length + ' cards never seen</div>' +
        '<div class="small"><b>Discard:</b> ' + t.idisc.length + ' cards</div>' +
        '<p class="small muted" style="margin:0">After an Epidemic only the discard pile goes back on top, so those cities come up again first. Percent = chance each city is flipped at the end of this turn.</p>';
    }
  }
  vTable.addEventListener('click', e => {
    const t = tr();
    const c = e.target.closest('[data-tc]');
    if (c) { trTap(+c.dataset.tc); return; }
    const m = e.target.closest('[data-mode]');
    if (m) {
      if (t.mode === 'epi' && m.dataset.mode !== 'epi') { oops('Tap the Epidemic’s bottom card first (or Undo)'); return; }
      t.mode = m.dataset.mode; t.fq = []; save(); renderTable(); return;
    }
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const k = b.dataset.t;
    if (k === 'undo' && t.undo.length) { const prev = t.undo.pop(); const u = t.undo; store.table = Object.assign(prev, { undo: u }); FX.play('cardSlide'); save(); renderTable(); }
    else if (k === 'drew0' || k === 'drew1' || k === 'drew2') {
      const n = +k.slice(4);
      const left = t.piles.reduce((a, b2) => a + b2, 0) - t.drawn;
      if (left < 2) { oops('The player deck is empty: the team loses.'); return; }
      if (t.mode === 'epi') { oops('Tap the Epidemic’s bottom card first (or Undo)'); return; }
      if (t.epiDrawn + n > t.epidemics) { oops(t.epiDrawn >= t.epidemics ? 'All ' + t.epidemics + ' Epidemics are already out.' : 'Only ' + (t.epidemics - t.epiDrawn) + ' Epidemic left in this setup.'); return; }
      trPush(t); t.drawn += 2; t.epiDrawn += n; t.after = true;
      FX.play('cardDeal'); setTimeout(() => FX.play('cardDeal'), flipStep());
      if (n) setTimeout(() => FX.play('alarm'), 2 * flipStep());
      if (n) { t.mode = 'epi'; t.epiLeft = n; trEpiIfNoDeck(t); }
      save(); renderTable();
    } else if (k === 'setup') {
      sheet('New tracker', '<div class="label">Players</div><div class="seg" data-ns="players">' + [2, 3, 4].map(n => '<button aria-pressed="' + (store.settings.players === n) + '" data-v="' + n + '">' + n + '</button>').join('') + '</div>' +
        '<div class="label">Difficulty</div><div class="seg" data-ns="epidemics">' + [4, 5, 6].map(n => '<button aria-pressed="' + (store.settings.epidemics === n) + '" data-v="' + n + '">' + LEVEL_NOTE[n] + '<small>' + n + ' Epidemics</small></button>').join('') + '</div>' +
        '<button class="btn primary" data-ok>Start tracking</button><p class="muted small" style="margin:0">Use it next to the real board: tap the starting cities, then each card as it is flipped.</p>', ev => {
        const s = ev.target.closest('[data-ns] [data-v]');
        if (s) { store.settings[s.parentElement.dataset.ns] = +s.dataset.v; s.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === s)); save(); }
        if (ev.target.closest('[data-ok]')) { store.table = newTracker(store.settings.players, store.settings.epidemics); save(); closeSheet(); renderTable(); }
      });
    } else if (k === 'more') {
      sheet('More', '<button class="btn" data-x="rp">Resilient Population</button><button class="btn" data-x="fc">Forecast</button><button class="btn ghost" data-x="new">New tracker…</button>' +
        '<p class="muted small" style="margin:0">Quiet night? Just don’t tap any cards that turn.</p>', ev => {
        const x = ev.target.closest('[data-x]');
        if (!x) return;
        closeSheet();
        if (x.dataset.x === 'new') { vTable.querySelector('[data-t="setup"]').click(); return; }
        if (t.mode === 'epi') { oops('Tap the Epidemic’s bottom card first (or Undo)'); return; }
        t.mode = x.dataset.x === 'rp' ? 'rp' : 'forecast'; t.fq = []; save(); renderTable();
      });
    }
  });

  // ================================================================== STUDY
  const vStudy = $('#v-study');
  function renderStudy() {
    const st = window.PanStrength;
    let strength = '<div class="panel"><div class="row"><span class="label grow">How strong are the computers?</span>' + qBtn('Teams made only of our computer players, many games per box with fixed shuffles. It shows how hard each setup is and how good your teammates are.') + '</div>';
    if (st) {
      strength += '<table class="wr"><tr><th></th><th>2 players</th><th>3 players</th><th>4 players</th></tr>' + [4, 5, 6].map(ep => '<tr><td>' + LEVEL_NOTE[ep] + '</td>' + [2, 3, 4].map(p => {
        const c = st.cells.filter(x => x.epidemics === ep && x.players === p)[0];
        if (!c) return '<td>–</td>';
        const r = c.wins / c.games;
        return '<td style="color:' + heat(r, 0.05, 0.6) + '"><b>' + Math.round(r * 100) + '%</b></td>';
      }).join('') + '</tr>').join('') + '</table><p class="muted small" style="margin:6px 0 0">' + st.games + ' games per box. Computers see only what players at the table see.</p>';
    } else strength += '<p class="muted small">Not measured yet.</p>';
    strength += '</div>';
    let danger = '';
    if (st && st.outbreakCity) {
      const mx = Math.max(...st.outbreakCity);
      const top = st.outbreakCity.map((n, i) => [n, i]).sort((a, b) => b[0] - a[0]).slice(0, 5).map(([, i]) => cname(i)).join(', ');
      danger = '<div class="panel"><div class="row"><span class="label grow">Danger map</span>' + qBtn('Where outbreaks happened most in the computer games. Cities with many links spread outbreaks further.') + '</div>' +
        '<div style="aspect-ratio:2/1;margin-top:6px">' + A.heatMap(st.outbreakCity, mx) + '</div><p class="muted small" style="margin:6px 0 0">Most outbreaks: ' + esc(top) + '.</p></div>';
    }
    const L = store.last;
    let last = '<div class="panel s-wide" style="display:flex;flex-direction:column;gap:8px;min-height:0"><span class="label">Your last game</span>';
    if (!L) last += '<p class="muted small" style="margin:0">Play a game and it shows up here: outbreaks and cubes over time, and how your turns compare with the planner.</p>';
    else {
      last += '<div class="row" style="flex-wrap:wrap;gap:6px 14px"><b style="font-size:18px;color:' + (L.win ? 'var(--good)' : 'var(--bad)') + '">' + (L.win ? 'Won' : 'Lost') + '</b><span class="muted">' + LEVEL_NOTE[L.epidemics] + ' · ' + L.players + ' players · ' + L.turns + ' turns</span></div>';
      last += '<div class="chart">' + chart(L.hist) + '</div><div class="row small muted" style="gap:14px"><span><i style="display:inline-block;width:10px;height:3px;background:#f08c8c;vertical-align:middle"></i> outbreaks</span><span><i style="display:inline-block;width:10px;height:3px;background:#6ea8fe;vertical-align:middle"></i> cubes on the board</span><span><i style="display:inline-block;width:10px;height:3px;background:#6ee7a8;vertical-align:middle"></i> cures</span></div>';
      if (L.checks && L.checks.length) {
        const tot = L.checks.reduce((a, c) => a + c.lost, 0);
        last += '<div class="row"><span class="label grow">Your turns vs the planner</span>' + qBtn('Points lost = how much better the planner scored the end of your turn with its own 4 actions. 0 means you matched it. It values cures, cubes near the top of the infection deck, cards and stations.') + '</div>' +
          '<div class="scroll" style="max-height:220px"><table class="wr"><tr><th>Turn</th><th>Points lost</th><th style="text-align:left">Planner’s idea</th></tr>' + L.checks.map(c => '<tr><td>' + c.turn + '</td><td style="color:' + heat(c.lost, 300, 0) + '"><b>' + c.lost + '</b></td><td style="text-align:left" class="small">' + esc(c.plan) + '</td></tr>').join('') + '</table></div>' +
          '<p class="muted small" style="margin:0">Total ' + tot + ' over ' + L.checks.length + ' turns.</p>';
      }
    }
    last += '</div>';
    vStudy.innerHTML = '<div class="study scroll">' + strength + (danger || '<div></div>') + last + '</div>';
  }
  function chart(h) {
    if (!h || h.length < 2) return '<p class="muted small">Too short to chart.</p>';
    const W = 600, H = 150, n = h.length - 1;
    const maxC = Math.max(30, ...h.map(x => x.cubes));
    const x = i => 30 + i / n * (W - 40);
    const yC = c => H - 18 - c / maxC * (H - 30);
    const yO = o => H - 18 - o / 8 * (H - 30);
    const line = (f, col) => '<polyline fill="none" stroke="' + col + '" stroke-width="2.5" points="' + h.map((p, i) => x(i) + ',' + f(p)).join(' ') + '"/>';
    let epis = '';
    h.forEach((p, i) => { if (i && p.epi > h[i - 1].epi) epis += '<line x1="' + x(i) + '" x2="' + x(i) + '" y1="8" y2="' + (H - 18) + '" stroke="#7a3030" stroke-dasharray="3 3"/>'; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + epis +
      '<line x1="30" x2="' + (W - 10) + '" y1="' + (H - 18) + '" y2="' + (H - 18) + '" stroke="#2a3042"/>' +
      line(p => yC(p.cubes), '#6ea8fe') + line(p => yO(p.out), '#f08c8c') + line(p => yO(p.cured * 2), '#6ee7a8') +
      '<text x="4" y="14" fill="#969db4" font-size="11">8</text><text x="4" y="' + (H - 18) + '" fill="#969db4" font-size="11">0</text></svg>';
  }
  vStudy.addEventListener('click', () => {});

  // ================================================================== SETTINGS
  const vSet = $('#v-settings');
  function renderSettings() {
    const s = store.settings;
    const swc = (key, on) => '<label class="switch"><input type="checkbox" data-sw="' + key + '"' + (on ? ' checked' : '') + '><span></span></label>';
    vSet.innerHTML = '<div class="set scroll">' +
      '<div class="panel"><div class="setrow"><div class="grow"><b>Your name</b><span>Shown to friends online.</span></div><input class="txt" id="s-name" maxlength="20" style="max-width:170px" value="' + esc(s.name) + '" placeholder="Name"></div>' +
      '<div class="setrow"><div class="grow"><b>Odds on the map</b><span>Coloured ring = chance of infection this turn.</span></div>' + swc('showOdds', s.showOdds) + '</div>' +
      '<div class="setrow"><div class="grow"><b>Hint button</b><span>The planner’s best 4 actions.</span></div>' + swc('hints', s.hints) + '</div>' +
      '<div class="setrow"><div class="grow"><b>Pause for my events</b><span>Stop before each infection if you hold an event.</span></div>' + swc('eventPause', s.eventPause) + '</div>' +
      '<div class="setrow"><div class="grow"><b>Hands</b><span>Rulebook: face up only in Introductory games.</span></div><select id="s-open"><option value="auto"' + (s.openHands === 'auto' ? ' selected' : '') + '>Rulebook</option><option value="open"' + (s.openHands === 'open' ? ' selected' : '') + '>Always open</option><option value="hidden"' + (s.openHands === 'hidden' ? ' selected' : '') + '>Always hidden</option></select></div>' +
      '<div class="setrow"><div class="grow"><b>Computer speed</b></div><div class="seg" data-sset="speed" style="min-width:200px">' + ['slow', 'normal', 'fast'].map(k => '<button aria-pressed="' + (s.speed === k) + '" data-v="' + k + '" style="min-height:36px">' + k[0].toUpperCase() + k.slice(1) + '</button>').join('') + '</div></div></div>' +
      '<div class="panel"><span class="label">Sound &amp; effects</span><div id="s-fx"></div></div>' +
      '<div class="panel"><div class="setrow"><div class="grow"><b>Start over</b><span>Clears the saved game and the table tracker.</span></div><button class="btn small" data-reset>Clear</button></div></div>' +
      '<p class="ver">Pandemic Lab · rules of the 2013 second edition · our own art · <a href="../">all games</a></p></div>';
    FX.renderSettings($('#s-fx'));
  }
  vSet.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.sw) { store.settings[t.dataset.sw] = t.checked; save(); }
    if (t.id === 's-open') { store.settings.openHands = t.value; save(); }
    if (t.id === 's-name') { store.settings.name = t.value.trim().slice(0, 20); save(); }
  });
  vSet.addEventListener('click', e => {
    const b = e.target.closest('[data-sset] [data-v]');
    if (b) { store.settings[b.parentElement.dataset.sset] = b.dataset.v; save(); renderSettings(); return; }
    if (e.target.closest('[data-reset]')) confirmBox('Clear the saved game and the tracker?', 'Clear', () => { store.game = null; store.table = null; table = table && table.online ? table : null; save(); toast('Cleared'); });
  });

  // ------------------------------------------------------------------ start
  const first = (location.hash || '').slice(1);
  if (['play', 'table', 'study', 'settings'].includes(first)) ui.tab = first;
  try { history.replaceState({ tab: ui.tab }, '', '#' + ui.tab); } catch (e) { /* file:// */ }
  showTab(ui.tab, false);
  if (store.online) { loadOnline().then(r => r.resume()).then(ok => { if (!ok) { store.online = false; save(); } }).catch(() => {}); }
  window.addEventListener('resize', () => { if (ui.tab === 'table') renderTable(); });
})();
