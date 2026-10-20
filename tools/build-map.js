// Builds the world board's land, lakes and city spots (run once; the site has no build step).
//   npm install            (dev only: d3-geo)
//   node tools/build-map.js
// Land and lakes: Natural Earth 1:50m (public domain, naturalearthdata.com), fetched once into
// tools/.ne-cache/ (git-ignored). Writes js/map-data.js and the x/y numbers of the RAW rows in js/data.js.
//
// How: Mercator (like the real board) cropped to 1000 x 500. Each city starts on its real spot. Crowded
// areas (US north-east, western Europe, Japan/Korea, ...) are then pushed apart until every pair of cities
// is at least MIN apart, and ONE smooth warp (thin-plate spline: real spot -> board spot, pinned to zero
// far from the cities) bends the coastlines the same way, so each city still sits on its real piece of land.
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const d3 = require('d3-geo');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.ne-cache');
const W = 1000, H = 500;
const MIN = 60;            // closest two cities may be (board units); before this build the board's closest pair was 47.7
const CLIP = [[-260, -260], [W + 260, H + 210]];

// real spots [lat, lon], in data.js order
const LL = {
  'San Francisco': [37.77, -122.42], 'Chicago': [41.88, -87.63], 'Montréal': [45.50, -73.57], 'New York': [40.71, -74.01],
  'Washington': [38.91, -77.04], 'Atlanta': [33.75, -84.39], 'London': [51.51, -0.13], 'Madrid': [40.42, -3.70],
  'Paris': [48.86, 2.35], 'Essen': [51.46, 7.01], 'Milan': [45.46, 9.19], 'St. Petersburg': [59.93, 30.34],
  'Los Angeles': [34.05, -118.24], 'Mexico City': [19.43, -99.13], 'Miami': [25.76, -80.19], 'Bogotá': [4.71, -74.07],
  'Lima': [-12.05, -77.04], 'Santiago': [-33.45, -70.67], 'Buenos Aires': [-34.60, -58.38], 'São Paulo': [-23.55, -46.63],
  'Lagos': [6.52, 3.38], 'Kinshasa': [-4.44, 15.27], 'Johannesburg': [-26.20, 28.05], 'Khartoum': [15.50, 32.56],
  'Algiers': [36.75, 3.06], 'Istanbul': [41.01, 28.98], 'Moscow': [55.76, 37.62], 'Cairo': [30.04, 31.24],
  'Baghdad': [33.31, 44.36], 'Riyadh': [24.71, 46.68], 'Tehran': [35.69, 51.39], 'Karachi': [24.86, 67.01],
  'Delhi': [28.61, 77.21], 'Mumbai': [19.08, 72.88], 'Chennai': [13.08, 80.27], 'Kolkata': [22.57, 88.36],
  'Beijing': [39.90, 116.41], 'Seoul': [37.57, 126.98], 'Tokyo': [35.68, 139.69], 'Shanghai': [31.23, 121.47],
  'Osaka': [34.69, 135.50], 'Taipei': [25.03, 121.57], 'Hong Kong': [22.32, 114.17], 'Bangkok': [13.76, 100.50],
  'Manila': [14.60, 120.98], 'Ho Chi Minh City': [10.82, 106.63], 'Jakarta': [-6.21, 106.85], 'Sydney': [-33.87, 151.21],
};

function fetchTo(url, file) {
  return new Promise((ok, bad) => {
    https.get(url, r => {
      if (r.statusCode >= 300 && r.headers.location) return fetchTo(r.headers.location, file).then(ok, bad);
      if (r.statusCode !== 200) return bad(new Error(url + ' ' + r.statusCode));
      const out = fs.createWriteStream(file); r.pipe(out); out.on('finish', ok);
    }).on('error', bad);
  });
}
async function ne(name) {
  const f = path.join(CACHE, name + '.geojson');
  if (!fs.existsSync(f)) {
    fs.mkdirSync(CACHE, { recursive: true });
    await fetchTo('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/' + name + '.geojson', f);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

// ---------------------------------------------------------------- projection: lon -134..+151 across, lat ~70..-45 down
const SCALE = 189.9;
const proj = d3.geoMercator().rotate([-11.8, 0]).scale(SCALE).translate([W / 2, 332.6]).clipExtent(CLIP).precision(0.2);

// ---------------------------------------------------------------- city spots
const D = require(path.join(ROOT, 'js', 'data.js'));
const real = D.CITIES.map(c => { const ll = LL[c.name]; if (!ll) throw new Error('no lat/lon for ' + c.name); return proj([ll[1], ll[0]]); });

const labelW = i => D.CITIES[i].name.length * 6.1 + 6;
const labelBox = (P, i) => [P[i][0] - labelW(i) / 2, P[i][1] + 11, P[i][0] + labelW(i) / 2, P[i][1] + 26];
const dotBox = (P, j) => [P[j][0] - 10, P[j][1] - 10, P[j][0] + 10, P[j][1] + 10];
function spread(R) {
  const P = R.map(p => p.slice());
  const n = P.length;
  for (let it = 0; it < 4000; it++) {
    const F = P.map(() => [0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1];
      let d = Math.hypot(dx, dy);
      if (d >= MIN) continue;
      if (d < 1e-6) { dx = R[j][0] - R[i][0]; dy = R[j][1] - R[i][1]; d = Math.hypot(dx, dy) || 1; }
      const push = (MIN - d) / 2 * 0.5;
      F[i][0] -= dx / d * push; F[i][1] -= dy / d * push;
      F[j][0] += dx / d * push; F[j][1] += dy / d * push;
    }
    // laptop labels sit under each dot: keep every label clear of other labels and dots
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = labelBox(P, i), b = j > i ? labelBox(P, j) : null, c = dotBox(P, j);
      [b, c].forEach(o => {
        if (!o) return;
        const ox = Math.min(a[2], o[2]) - Math.max(a[0], o[0]), oy = Math.min(a[3], o[3]) - Math.max(a[1], o[1]);
        if (ox <= 0 || oy <= 0) return;
        if (ox < oy * 2.5) { const s = Math.sign(P[j][0] - P[i][0]) || 1; F[i][0] -= s * ox * 0.25; F[j][0] += s * ox * 0.25; }
        else { const s = Math.sign(P[j][1] - P[i][1]) || 1; F[i][1] -= s * oy * 0.25; F[j][1] += s * oy * 0.25; }
      });
    }
    for (let i = 0; i < n; i++) {
      // a gentle pull back to the real spot keeps the shape of each region
      F[i][0] += (R[i][0] - P[i][0]) * 0.01; F[i][1] += (R[i][1] - P[i][1]) * 0.01;
      P[i][0] = Math.min(W - 34, Math.max(34, P[i][0] + F[i][0]));
      P[i][1] = Math.min(H - 30, Math.max(40, P[i][1] + F[i][1]));
    }
  }
  return P;
}

// ---------------------------------------------------------------- thin-plate spline real -> board
function solve(A, b) { // Gaussian elimination with partial pivoting (A is n x n, b is n x k)
  const n = A.length, k = b[0].length;
  const M = A.map((r, i) => r.concat(b[i]));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const v = M[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / v;
      if (f) for (let q = c; q < n + k; q++) M[r][q] -= f * M[c][q];
    }
  }
  const X = Array.from({ length: n }, () => new Array(k).fill(0));
  for (let r = n - 1; r >= 0; r--) for (let q = 0; q < k; q++) {
    let s = M[r][n + q];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * X[c][q];
    X[r][q] = s / M[r][r];
  }
  return X;
}
const U = r2 => r2 > 0 ? r2 * Math.log(r2) / 2 : 0; // r^2 log r
function tps(src, dst) {
  const n = src.length;
  const A = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(U((src[i][0] - src[j][0]) ** 2 + (src[i][1] - src[j][1]) ** 2));
    row.push(1, src[i][0], src[i][1]);
    A.push(row);
  }
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(r === 0 ? 1 : src[j][r - 1]);
    row.push(0, 0, 0);
    A.push(row);
  }
  const b = dst.map((p, i) => [p[0] - src[i][0], p[1] - src[i][1]]).concat([[0, 0], [0, 0], [0, 0]]);
  const X = solve(A, b);
  return p => {
    let dx = X[n][0] + X[n + 1][0] * p[0] + X[n + 2][0] * p[1];
    let dy = X[n][1] + X[n + 1][1] * p[0] + X[n + 2][1] * p[1];
    for (let i = 0; i < n; i++) {
      const u = U((p[0] - src[i][0]) ** 2 + (p[1] - src[i][1]) ** 2);
      dx += X[i][0] * u; dy += X[i][1] * u;
    }
    return [p[0] + dx, p[1] + dy];
  };
}

// ---------------------------------------------------------------- shapes
function rings(geo) { // projected, clipped rings
  const out = [];
  let cur = null;
  const s = proj.stream({
    point(x, y) { cur.push([x, y]); }, lineStart() { cur = []; }, lineEnd() { if (cur.length > 2) out.push(cur); cur = null; },
    polygonStart() {}, polygonEnd() {}, sphere() {},
  });
  d3.geoStream(geo, s);
  return out;
}
function densify(r, step) {
  const o = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    o.push(a);
    const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
    for (let k = 1; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return o;
}
function simplify(pts, tol) { // Douglas-Peucker on a closed ring
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let best = -1, bd = tol;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const L = Math.hypot(bx - ax, by - ay);
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = L ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / L : Math.hypot(px - ax, py - ay);
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; st.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = r => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
function toPath(rs) {
  let s = '';
  rs.forEach(r => {
    let px = Math.round(r[0][0] * 10), py = Math.round(r[0][1] * 10);
    s += 'M' + px / 10 + ' ' + py / 10;
    let seg = '';
    for (let i = 1; i < r.length; i++) {
      const x = Math.round(r[i][0] * 10), y = Math.round(r[i][1] * 10);
      if (x === px && y === py) continue;
      const dx = (x - px) / 10, dy = (y - py) / 10;
      seg += (dx < 0 ? '' : seg ? ' ' : '') + dx + (dy < 0 ? '' : ' ') + dy;
      px = x; py = y;
    }
    s += 'l' + seg + 'z';
  });
  return s;
}

(async function main() {
  const P = spread(real);
  // anchors: zero movement far from every city so the oceans and the map edges stay put
  const src = real.slice(), dst = P.slice();
  for (let x = CLIP[0][0]; x <= CLIP[1][0]; x += 60) for (let y = CLIP[0][1]; y <= CLIP[1][1]; y += 60) {
    const far = real.every((r, i) => Math.hypot(r[0] - x, r[1] - y) > 120 && Math.hypot(P[i][0] - x, P[i][1] - y) > 120);
    if (far) { src.push([x, y]); dst.push([x, y]); }
  }
  const warp = tps(src, dst);

  // fold check: the warp must never flip (Jacobian > 0) anywhere on the board
  let minJ = 1e9, maxS = 0;
  for (let x = -100; x <= W + 100; x += 4) for (let y = -60; y <= H + 60; y += 4) {
    const a = warp([x, y]), b = warp([x + 1, y]), c = warp([x, y + 1]);
    const j = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    minJ = Math.min(minJ, j); maxS = Math.max(maxS, j);
  }

  const land = await ne('ne_50m_land');
  const lakesGeo = await ne('ne_50m_lakes');
  land.features = land.features.filter(f => d3.geoBounds(f)[1][1] > -58); // no Antarctica
  lakesGeo.features = lakesGeo.features.filter(f => f.properties.scalerank === 0 && d3.geoArea(f) * 1e4 > 1.9);

  const build = (geo, tol, minArea) => {
    let rs = rings(geo).map(r => simplify(densify(r, 2).map(warp).concat([]), tol));
    rs = rs.filter(r => r.length > 3 && Math.abs(area(r)) >= minArea);
    return toPath(rs);
  };
  const landD = build(land, 0.45, 2.5);
  const lakeD = build(lakesGeo, 0.45, 3);

  // labels: under the dot unless that hits another city's dot or label, then above
  const box = (i, up) => { const b = labelBox(P, i); return up ? [b[0], P[i][1] - 26, b[2], P[i][1] - 11] : b; };
  const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const up = P.map(() => false);
  const clashes = () => {
    const list = [];
    for (let i = 0; i < P.length; i++) for (let j = 0; j < P.length; j++) {
      if (i === j) continue;
      if (hit(box(i, up[i]), dotBox(P, j))) list.push([i, j, 'dot']);
      if (j > i && hit(box(i, up[i]), box(j, up[j]))) list.push([i, j, 'label']);
    }
    return list;
  };
  for (let pass = 0; pass < 6; pass++) {
    const c = clashes();
    if (!c.length) break;
    c.forEach(([i]) => {
      up[i] = !up[i];
      if (clashes().length > c.length) up[i] = !up[i];
    });
  }
  const left = clashes();

  // write js/map-data.js
  const out = '/* World board shapes (generated by tools/build-map.js; do not edit by hand).\n' +
    '   Land and lakes: Natural Earth 1:50m, public domain (naturalearthdata.com), Mercator, bent by one smooth warp so\n' +
    '   each city sits on its real spot of land while crowded areas get room. */\n' +
    '(function (root) {\n  root.PanMap = {\n    land: ' + JSON.stringify(landD) + ',\n    lakes: ' + JSON.stringify(lakeD) +
    ',\n    labelUp: ' + JSON.stringify(up.map((u, i) => u ? i : -1).filter(i => i >= 0)) + ',\n  };\n})(typeof self !== \'undefined\' ? self : this);\n';
  fs.writeFileSync(path.join(ROOT, 'js', 'map-data.js'), out);

  // write the x/y numbers into js/data.js (names, colours, populations untouched)
  let src2 = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');
  D.CITIES.forEach((c, i) => {
    const re = new RegExp("(\\['" + c.name.replace(/[.]/g, '\\.') + "', \\d, )\\d+, \\d+(, \\d+\\])");
    if (!re.test(src2)) throw new Error('row not found: ' + c.name);
    src2 = src2.replace(re, '$1' + Math.round(P[i][0]) + ', ' + Math.round(P[i][1]) + '$2');
  });
  fs.writeFileSync(path.join(ROOT, 'js', 'data.js'), src2);

  // report
  let nn = 1e9, worst = '';
  P.forEach((a, i) => P.forEach((b, j) => { if (j > i) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < nn) { nn = d; worst = D.CITIES[i].name + '-' + D.CITIES[j].name; } } }));
  const moved = P.map((p, i) => [D.CITIES[i].name, Math.round(Math.hypot(p[0] - real[i][0], p[1] - real[i][1]))]).sort((a, b) => b[1] - a[1]);
  console.log('closest pair', nn.toFixed(1), worst);
  console.log('warp: min stretch (Jacobian)', minJ.toFixed(3), 'max', maxS.toFixed(2), minJ > 0 ? '(no folds)' : '(FOLDS!)');
  console.log('moved most (board units):', moved.slice(0, 10).map(m => m.join(' ')).join(', '));
  console.log('label clashes left:', left.map(([i, j, k]) => D.CITIES[i].name + '/' + D.CITIES[j].name + ' ' + k).join(', ') || 'none');
  console.log('labels above:', up.map((u, i) => u ? D.CITIES[i].name : '').filter(Boolean).join(', ') || 'none');
  console.log('map-data.js', Math.round(out.length / 1024), 'KB');
})().catch(e => { console.error(e); process.exit(1); });
