// Ballot Gap Lab - core simulation (ES module; runs in the browser and under node).
// Times are minutes after 17:00 Brasilia on election day.
// gap = Flavio% - Lula% of valid votes counted so far (a cumulative ratio).

export const WINDOW = [75, 195];            // 18:15 .. 20:15
export const GRID_MAX = 420;                // 24:00
export const FLAT_TOL = 0.3;                // points
export const SLOPE_TOL = 0.5;               // pt/h around the observed slope
export const REGIONS = ['S', 'SE', 'CO', 'N', 'NE', 'EX'];

export function hhmm(min) {
  const t = Math.round(17 * 60 + min); const h = Math.floor(t / 60) % 24, m = ((t % 60) + 60) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function toMin(s) { const [h, m] = s.split(':').map(Number); let x = (h - 17) * 60 + m; if (h < 12) x += 24 * 60; return x; }

// ---------- RNG ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  r.normal = () => { if (spare !== null) { const s = spare; spare = null; return s; } let u, v, s; do { u = 2 * r() - 1; v = 2 * r() - 1; s = u * u + v * v; } while (s >= 1 || s === 0); const k = Math.sqrt(-2 * Math.log(s) / s); spare = v * k; return u * k; };
  return r;
}

// ---------- model preparation ----------
export function prepare(data) {
  const c = data.cells, N = c.n.length;
  const ufRegion = data.states.map(s => REGIONS.indexOf(s.region));
  const m = {
    N, nzones: data.nzones, states: data.states, final: data.final, target: data.target, real2022: data.real2022, meta: data.meta,
    uf: Int16Array.from(c.uf), zone: Int32Array.from(c.zone), t22: Float32Array.from(c.t22), t26: Float32Array.from(c.t26),
    n: Int32Array.from(c.n), V: Float64Array.from(c.V), F: Float64Array.from(c.F), L: Float64Array.from(c.L),
  };
  m.region = Int8Array.from(c.uf, u => ufRegion[u]);
  m.nne = Uint8Array.from(m.region, r => (r === 3 || r === 4) ? 1 : 0);
  m.totN = m.n.reduce((a, b) => a + b, 0);
  // per-UF weighted sampling tables (for within-state reshuffling of arrival times)
  const nuf = data.states.length; m.ufCells = []; m.ufCum = [];
  for (let u = 0; u < nuf; u++) { m.ufCells.push([]); m.ufCum.push([]); }
  for (let i = 0; i < N; i++) { const u = m.uf[i]; const arr = m.ufCum[u]; m.ufCells[u].push(i); arr.push((arr.length ? arr[arr.length - 1] : 0) + m.n[i]); }
  m.ufCells = m.ufCells.map(a => Int32Array.from(a)); m.ufCum = m.ufCum.map(a => Float64Array.from(a));
  m.markers = buildMarkers(data.target);
  m.pace = buildPaces(data.target);
  m.obsSlope = observedShape(m).tseTimed.slope;
  return m;
}

export function buildMarkers(target) {
  const out = [];
  for (const p of target.news_partials) {
    const t = p.t_used ? toMin(p.t_used) : null; if (t === null) continue;
    out.push({ t, label: p.t_news, pst: p.pst, pF: p.pF, pL: p.pL, gap: +(p.pF - p.pL).toFixed(2),
      reliable: p.t_source && p.t_source.startsWith('TSE'), source: p.t_source, abs: !!(p.valid || p.F) });
  }
  return out.sort((a, b) => a.t - b.t);
}

// pace curve = fraction of sections counted vs clock minute; knots [[t, frac], ...] monotone
function observedKnots(target) {
  const pts = target.ua_series.map(p => [toMin(p.t), p.pst / 100]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const k = [[0, 0]];
  for (const [t, f] of pts) { const last = k[k.length - 1]; if (t < last[0]) continue; if (t === last[0]) { last[1] = Math.max(last[1], f); continue; } if (f >= last[1]) k.push([t, f]); }
  if (k[k.length - 1][1] < 1) k.push([k[k.length - 1][0] + 1, 1]);
  return k;
}
function shapedKnots(obs, shape) {
  // replace observed pace between anchors 18:00 (12.45%) and 20:04 (84.96%) with a synthetic shape
  const A = obs.find(p => p[0] >= 60), B = obs.find(p => p[0] >= 184);
  const f = {
    steady: x => x,
    slow: x => Math.pow(x, 1.8),                       // rate keeps rising through the window (back-loaded)
    peaked: (() => { const g = x => 0.5 * (1 + erf((x - 0.3) / (0.16 * Math.SQRT2))); const g0 = g(0), g1 = g(1); return x => (g(x) - g0) / (g1 - g0); })(), // early burst near 18:40
  }[shape];
  const k = obs.filter(p => p[0] < A[0]);
  for (let t = A[0]; t <= B[0]; t++) k.push([t, A[1] + (B[1] - A[1]) * f((t - A[0]) / (B[0] - A[0]))]);
  for (const p of obs) if (p[0] > B[0]) k.push(p);
  return k;
}
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
export function buildPaces(target) {
  const obs = observedKnots(target);
  return { observed: obs, steady: shapedKnots(obs, 'steady'), slow: shapedKnots(obs, 'slow'), peaked: shapedKnots(obs, 'peaked') };
}
export function paceAt(knots, t) { // frac at time t
  if (t <= knots[0][0]) return knots[0][1];
  let lo = 0, hi = knots.length - 1; if (t >= knots[hi][0]) return knots[hi][1];
  while (hi - lo > 1) { const md = (lo + hi) >> 1; if (knots[md][0] <= t) lo = md; else hi = md; }
  const [t0, f0] = knots[lo], [t1, f1] = knots[hi]; return f0 + (f1 - f0) * (t - t0) / (t1 - t0);
}
export function paceInv(knots, f) { // time at which frac f is reached
  if (f <= knots[0][1]) return knots[0][0];
  let lo = 0, hi = knots.length - 1; if (f >= knots[hi][1]) return knots[hi][0];
  while (hi - lo > 1) { const md = (lo + hi) >> 1; if (knots[md][1] < f) lo = md; else hi = md; }
  const [t0, f0] = knots[lo], [t1, f1] = knots[hi]; return f1 === f0 ? t0 : t0 + (t1 - t0) * (f - f0) / (f1 - f0);
}

// ---------- scenarios ----------
export const SCENARIOS = {
  emp2022: { label: '2022 empirical arrival order (TSE 2022 BU reception times) applied to 2026 results', realistic: true },
  mun2026: { label: '2022 within-municipality order, rescaled so each municipality finishes at its 2026 TSE completion time', realistic: true },
  fastfirst: { label: 'Fast regions first: lognormal cartório delays, tunable N/NE delay', realistic: true },
  random: { label: 'Random section order (null model)', realistic: false },
  constmix: { label: 'Constant incoming mix after 18:00 (analytic dilution case)', realistic: false },
};
export const DEFAULTS = {
  scenario: 'emp2022', pace: 'observed', neDelay: 0, withinState: 0.0, zoneJitter: 10, cellJitter: 3,
  ffBase: 95, ffSigma: 0.35, exDelay: 150, mixNoise: 1.0, runs: 200, seed: 1, keepSeries: 40, prior: false,
};

function latentTimes(m, p, rng) {
  const N = m.N, out = new Float64Array(N);
  if (p.scenario === 'random') { for (let i = 0; i < N; i++) out[i] = rng() * 1000; return out; }
  const zs = new Float64Array(m.nzones);
  if (p.scenario === 'fastfirst') {
    // zone (cartorio) draws its own lognormal delay; withinState mixes in independent per-cell draws
    const med = r => p.ffBase + (r === 3 || r === 4 ? p.neDelay : 0) + (r === 5 ? p.exDelay : 0);
    const zr = new Int8Array(m.nzones); for (let i = 0; i < N; i++) zr[m.zone[i]] = m.region[i];
    for (let z = 0; z < m.nzones; z++) zs[z] = med(zr[z]) * Math.exp(p.ffSigma * rng.normal());
    for (let i = 0; i < N; i++) {
      let t = zs[m.zone[i]];
      if (p.withinState > 0) { const ci = med(m.region[i]) * Math.exp(p.ffSigma * rng.normal()); t = (1 - p.withinState) * t + p.withinState * ci; }
      out[i] = t + p.cellJitter * rng.normal();
    }
    return out;
  }
  const base = p.scenario === 'mun2026' ? m.t26 : m.t22;
  for (let z = 0; z < m.nzones; z++) zs[z] = p.zoneJitter * rng.normal();
  for (let i = 0; i < N; i++) {
    let b = base[i];
    if (p.withinState > 0 && rng() < p.withinState) { // take the time of a random section of the same state
      const u = m.uf[i], cum = m.ufCum[u], x = rng() * cum[cum.length - 1];
      let lo = 0, hi = cum.length - 1; while (lo < hi) { const md = (lo + hi) >> 1; if (cum[md] < x) lo = md + 1; else hi = md; }
      b = base[m.ufCells[u][lo]];
    }
    out[i] = b + zs[m.zone[i]] + p.cellJitter * rng.normal() + (m.nne[i] ? p.neDelay : 0);
  }
  return out;
}

// Accumulate cells (in latent order) and map to clock minutes on a 1-minute grid.
function accumulate(m, lat, pace) {
  const N = m.N; let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { if (lat[i] < lo) lo = lat[i]; if (lat[i] > hi) hi = lat[i]; }
  const B = 6000, w = (hi - lo) / B || 1;
  const bn = new Float64Array(B), bV = new Float64Array(B), bF = new Float64Array(B), bL = new Float64Array(B);
  for (let i = 0; i < N; i++) { let k = Math.floor((lat[i] - lo) / w); if (k >= B) k = B - 1; bn[k] += m.n[i]; bV[k] += m.V[i]; bF[k] += m.F[i]; bL[k] += m.L[i]; }
  // clock time at the end of each bin
  const cb = new Float64Array(B); let cn = 0;
  for (let k = 0; k < B; k++) { cn += bn[k]; cb[k] = pace ? paceInv(pace, cn / m.totN) : lo + (k + 1) * w; }
  const G = GRID_MAX + 1, V = new Float64Array(G), F = new Float64Array(G), L = new Float64Array(G), S = new Float64Array(G);
  let k = 0, aV = 0, aF = 0, aL = 0, aS = 0, prevEnd = pace ? 0 : lo;
  for (let g = 0; g < G; g++) {
    while (k < B && cb[k] <= g) { aV += bV[k]; aF += bF[k]; aL += bL[k]; aS += bn[k]; prevEnd = cb[k]; k++; }
    let pV = aV, pF = aF, pL = aL, pS = aS;
    if (k < B && cb[k] > prevEnd) { const fr = Math.max(0, Math.min(1, (g - prevEnd) / (cb[k] - prevEnd))); pV += fr * bV[k]; pF += fr * bF[k]; pL += fr * bL[k]; pS += fr * bn[k]; }
    V[g] = pV; F[g] = pF; L[g] = pL; S[g] = pS / m.totN;
  }
  return { V, F, L, S };
}

function constMixRun(m, p, rng, pace) {
  // anchored at the real 18:00 snapshot (12.45%, absolute votes) and the registered final
  const s0 = m.target.news_partials[0]; const t0 = toMin(s0.t_used);
  const V0 = s0.valid, F0 = s0.F, L0 = s0.L, Vf = m.final.V, Ff = m.final.F, Lf = m.final.L;
  const C0 = paceAt(pace, t0);
  const f = (Ff - F0) / (Vf - V0), l = (Lf - L0) / (Vf - V0);
  const G = GRID_MAX + 1, V = new Float64Array(G), F = new Float64Array(G), L = new Float64Array(G), S = new Float64Array(G);
  const blocks = Math.ceil((GRID_MAX - t0) / 10) + 1, eps = new Float64Array(blocks), wv = new Float64Array(blocks);
  for (let b = 0; b < blocks; b++) { eps[b] = p.mixNoise * rng.normal() / 100; const ta = t0 + 10 * b, tb = ta + 10; wv[b] = paceAt(pace, tb) - paceAt(pace, ta); }
  const tw = wv.reduce((a, b) => a + b, 0), me = eps.reduce((a, e, b) => a + e * wv[b], 0) / (tw || 1);
  for (let b = 0; b < blocks; b++) eps[b] -= me;   // keep final exact
  let cV = V0, cF = F0, cL = L0;
  for (let g = 0; g < G; g++) {
    const C = paceAt(pace, g); S[g] = C;
    if (g <= t0) { const r = C0 > 0 ? C / C0 : 0; V[g] = V0 * r; F[g] = F0 * r; L[g] = L0 * r; continue; }
    const dv = (Vf - V0) * (C - paceAt(pace, g - 1)) / (1 - C0); const b = Math.floor((g - 1 - t0) / 10);
    cV += dv; cF += dv * (f + eps[b] / 2); cL += dv * (l - eps[b] / 2); V[g] = cV; F[g] = cF; L[g] = cL;
  }
  return { V, F, L, S, mix: { f, l, margin: 100 * (f - l) } };
}

// Per-run random knobs ("prior"): plausible ranges, documented in the UI
export const PRIOR = {
  emp2022: { neDelay: [-20, 40], withinState: [0, 0.6], zoneJitter: [0, 30], cellJitter: [0, 10] },
  mun2026: { neDelay: [-20, 40], withinState: [0, 0.6], zoneJitter: [0, 30], cellJitter: [0, 10] },
  fastfirst: { neDelay: [0, 90], withinState: [0, 0.6], ffBase: [60, 130], ffSigma: [0.15, 0.7], cellJitter: [0, 10] },
  random: {}, constmix: { mixNoise: [0, 3] },
};
export function samplePrior(p, rng) {
  const q = { ...p }, knobs = {};
  for (const [k, [a, b]] of Object.entries(PRIOR[p.scenario] || {})) { q[k] = a + (b - a) * rng(); knobs[k] = q[k]; }
  return { q, knobs };
}
export function runOne(m, p, rng) {
  const paceName = (p.pace === 'native' && (p.scenario === 'random' || p.scenario === 'constmix')) ? 'observed' : p.pace;
  const pace = paceName === 'native' ? null : m.pace[paceName];
  const r = p.scenario === 'constmix' ? constMixRun(m, p, rng, pace) : accumulate(m, latentTimes(m, p, rng), pace);
  const G = GRID_MAX + 1; r.pF = new Float64Array(G); r.pL = new Float64Array(G); r.gap = new Float64Array(G);
  for (let g = 0; g < G; g++) { if (r.V[g] > 0) { r.pF[g] = 100 * r.F[g] / r.V[g]; r.pL[g] = 100 * r.L[g] / r.V[g]; r.gap[g] = r.pF[g] - r.pL[g]; } else { r.pF[g] = r.pL[g] = r.gap[g] = NaN; } }
  r.paceUsed = paceName;
  return r;
}

// ---------- scoring ----------
export function polyfit(xs, ys, deg) { // least squares, returns coefficients [c0, c1, (c2)]
  const n = deg + 1, A = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let i = 0; i < xs.length; i++) { const p = []; for (let j = 0; j < n; j++) p.push(Math.pow(xs[i], j)); for (let a = 0; a < n; a++) { for (let b = 0; b < n; b++) A[a][b] += p[a] * p[b]; A[a][n] += p[a] * ys[i]; } }
  for (let c = 0; c < n; c++) { let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r; [A[c], A[piv]] = [A[piv], A[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
  return A.map((row, i) => row[n] / row[i]);
}
export function shapeScore(ts, gs) { // ts minutes, gs gap points
  const tc = (WINDOW[0] + WINDOW[1]) / 2, xs = ts.map(t => (t - tc) / 60);
  const [a, b] = polyfit(xs, gs, 1); const q = polyfit(xs, gs, 2);
  let maxdev = 0; for (let i = 0; i < xs.length; i++) maxdev = Math.max(maxdev, Math.abs(gs[i] - (a + b * xs[i])));
  return { slope: b, quad: q[2], maxdev, intercept: a };
}
export function scoreRun(m, r) {
  const ts = [], gs = [];
  for (let g = WINDOW[0]; g <= WINDOW[1]; g++) { ts.push(g); gs.push(r.gap[g]); }
  const s = shapeScore(ts, gs);
  const h1 = shapeScore(ts.slice(0, 61), gs.slice(0, 61)), h2 = shapeScore(ts.slice(60), gs.slice(60));
  s.slopeH1 = h1.slope; s.slopeH2 = h2.slope; s.flat = s.maxdev <= FLAT_TOL;
  // fit to published markers (reliable = TSE file time known via Urna Aberta)
  let se = 0, sp = 0, k = 0, seAll = 0, kAll = 0;
  for (const mk of m.markers) {
    const g = Math.round(mk.t); if (g < 0 || g > GRID_MAX) continue;
    const d = r.gap[g] - mk.gap; seAll += d * d; kAll++;
    if (mk.reliable) { se += d * d; sp += Math.pow(100 * r.S[g] - mk.pst, 2); k++; }
  }
  // same sampling as the observation: fit only at the TSE-timed published points inside the window
  const mw = m.markers.filter(x => x.reliable && x.t >= WINDOW[0] && x.t <= WINDOW[1] + 2);
  if (mw.length > 2) { const sm = shapeScore(mw.map(x => x.t), mw.map(x => r.gap[Math.round(x.t)])); s.maxdevAtMarkers = sm.maxdev; s.flatAtMarkers = sm.maxdev <= FLAT_TOL; }
  s.slopeMatch = Math.abs(s.slope - m.obsSlope) <= SLOPE_TOL;
  s.markerRMSE = Math.sqrt(se / k); s.markerRMSEall = Math.sqrt(seAll / kAll); s.pstRMSE = Math.sqrt(sp / k);
  // incoming path in 10-minute blocks over the window
  s.blocks = [];
  for (let t = WINDOW[0]; t < WINDOW[1]; t += 10) {
    const dV = r.V[t + 10] - r.V[t], dF = r.F[t + 10] - r.F[t], dL = r.L[t + 10] - r.L[t];
    s.blocks.push({ t, margin: dV > 0 ? 100 * (dF - dL) / dV : NaN, vpm: dV / 10 });
  }
  return s;
}

function quant(a, q) { const s = Float64Array.from(a.filter(x => Number.isFinite(x))).sort(); if (!s.length) return NaN; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
export { quant };

export function monteCarlo(m, params, onProgress) {
  const p = { ...DEFAULTS, ...params }; const rng = mulberry32(p.seed * 7919 + 13);
  const scores = [], series = [];
  for (let i = 0; i < p.runs; i++) {
    let q = p, knobs = null; if (p.prior) ({ q, knobs } = samplePrior(p, rng));
    const r = runOne(m, q, rng); const s = scoreRun(m, r); if (knobs) s.knobs = knobs; scores.push(s);
    if (series.length < p.keepSeries || (s.flat && series.filter(x => x.flat).length < p.keepSeries)) series.push({ flat: s.flat, pF: Array.from(r.pF), pL: Array.from(r.pL), gap: Array.from(r.gap), S: Array.from(r.S), V: Array.from(r.V) });
    if (onProgress && i % 10 === 0) onProgress(i / p.runs);
  }
  return { params: p, scores, series, summary: summarize(scores) };
}
export function summarize(scores) {
  const pick = k => scores.map(s => s[k]);
  const flat = scores.filter(s => s.flat), fm = scores.filter(s => s.flat && s.markerRMSE <= 0.5);
  const fs = scores.filter(s => s.flat && s.slopeMatch);
  const S = { runs: scores.length, fracFlat: flat.length / scores.length, fracFlatSlope: fs.length / scores.length,
    fracFlatAtMarkers: scores.filter(s => s.flatAtMarkers).length / scores.length, fracSlopeMatch: scores.filter(s => s.slopeMatch).length / scores.length, fracFlatAndMarkers: fm.length / scores.length, fracMarkers: scores.filter(s => s.markerRMSE <= 0.5).length / scores.length };
  for (const k of ['slope', 'quad', 'maxdev', 'maxdevAtMarkers', 'markerRMSE', 'markerRMSEall', 'pstRMSE', 'slopeH1', 'slopeH2']) S[k] = { p10: quant(pick(k), 0.1), p50: quant(pick(k), 0.5), p90: quant(pick(k), 0.9) };
  const blk = (set) => set.length ? set[0].blocks.map((b, j) => ({ t: b.t, margin: { p10: quant(set.map(s => s.blocks[j].margin), 0.1), p50: quant(set.map(s => s.blocks[j].margin), 0.5), p90: quant(set.map(s => s.blocks[j].margin), 0.9) }, vpm: { p10: quant(set.map(s => s.blocks[j].vpm), 0.1), p50: quant(set.map(s => s.blocks[j].vpm), 0.5), p90: quant(set.map(s => s.blocks[j].vpm), 0.9) } })) : null;
  S.blocksFlat = blk(flat); S.blocksAll = blk(scores); S.blocksFlatSlope = blk(fs);
  // knob values of accepted runs (when knobs are randomized per run)
  if (scores[0] && scores[0].knobs) { S.knobsFlat = {}; S.knobsAll = {}; for (const k of Object.keys(scores[0].knobs)) { S.knobsFlat[k] = flat.length ? quant(flat.map(s => s.knobs[k]), 0.5) : NaN; S.knobsAll[k] = quant(scores.map(s => s.knobs[k]), 0.5); } }
  return S;
}

// ---------- analytics on the published series ----------
export function observedShape(m) {
  const rel = m.markers.filter(x => x.reliable && x.t >= WINDOW[0] - 30 && x.t <= WINDOW[1] + 5);
  const inW = rel.filter(x => x.t >= WINDOW[0] - 0 && x.t <= WINDOW[1] + 2);
  const ua = m.target.ua_series.map(p => ({ t: toMin(p.t), gap: p.pF - p.pL, pst: p.pst })).filter(p => p.t >= WINDOW[0] && p.t <= WINDOW[1]);
  const newsT = m.target.news_partials.filter(p => /^\d\d:\d\d$/.test(p.t_news)).map(p => ({ t: toMin(p.t_news), gap: p.pF - p.pL })).filter(p => p.t >= WINDOW[0] && p.t <= WINDOW[1]);
  return {
    tseTimed: inW.length > 2 ? { n: inW.length, ...shapeScore(inW.map(x => x.t), inW.map(x => x.gap)) } : null,
    uaAll: ua.length > 2 ? { n: ua.length, ...shapeScore(ua.map(x => x.t), ua.map(x => x.gap)) } : null,
    newsTimed: newsT.length > 2 ? { n: newsT.length, ...shapeScore(newsT.map(x => x.t), newsT.map(x => x.gap)) } : null,
  };
}
// Incoming margin that an exactly straight gap line would require, given a pace curve.
export function requiredIncoming(m, paceName = 'observed', slopePerHour, anchorT = 103, anchorGap = null) {
  const pace = m.pace[paceName]; const Vf = m.final.V;
  const a = anchorGap ?? (m.markers.find(x => x.t === anchorT) || {}).gap;
  const Gt = t => a + slopePerHour * (t - anchorT) / 60;
  const out = [];
  for (let t = WINDOW[0]; t < WINDOW[1]; t += 10) {
    const Vs = Vf * paceAt(pace, t), Ve = Vf * paceAt(pace, t + 10);
    out.push({ t, margin: (Gt(t + 10) * Ve - Gt(t) * Vs) / (Ve - Vs), vpm: (Ve - Vs) / 10 });
  }
  return out;
}
// Incoming margins between published snapshots that carry absolute votes (real, no model).
export function observedIncoming(m) {
  const ps = m.target.news_partials.map(p => ({ t: p.t_used, pst: p.pst, V: p.valid || p.implied_valid, F: p.F, L: p.L ?? (p.valid || p.implied_valid) * p.pL / 100 })).filter(p => p.V && p.F);
  const out = [];
  for (let i = 1; i < ps.length; i++) { const a = ps[i - 1], b = ps[i]; const dV = b.V - a.V; out.push({ from: a.t, to: b.t, fromPst: a.pst, toPst: b.pst, dV, margin: 100 * ((b.F - a.F) - (b.L - a.L)) / dV, F: 100 * (b.F - a.F) / dV, L: 100 * (b.L - a.L) / dV }); }
  return out;
}

// Real 2022 count path (TSE 2022 boletins by reception time): how straight was ITS gap?
export function real2022Shape(m) {
  const g = m.real2022.grid; // [min, pst, pBolsonaro, pLula]
  const sel = (a, b) => g.filter(r => r[0] >= a && r[0] <= b && r[2] != null);
  const sc = rows => ({ n: rows.length, from: hhmm(rows[0][0]), to: hhmm(rows[rows.length - 1][0]), pstFrom: rows[0][1], pstTo: rows[rows.length - 1][1], ...shapeScoreFree(rows.map(r => r[0]), rows.map(r => r[2] - r[3])) });
  // same clock window, and the window covering the same %-counted span as 2026's 18:15-20:15
  const obsK = m.pace.observed; const p0 = 100 * paceAt(obsK, WINDOW[0]), p1 = 100 * paceAt(obsK, WINDOW[1]);
  const a = g.find(r => r[1] >= p0), b = g.find(r => r[1] >= p1);
  return { sameClock: sc(sel(WINDOW[0], WINDOW[1])), samePstSpan: sc(sel(a[0], b[0])), pstSpan2026: [p0, p1] };
}
export function shapeScoreFree(ts, gs) {
  const tc = (ts[0] + ts[ts.length - 1]) / 2, xs = ts.map(t => (t - tc) / 60);
  const [a, b] = polyfit(xs, gs, 1); const q = polyfit(xs, gs, 2);
  let maxdev = 0; for (let i = 0; i < xs.length; i++) maxdev = Math.max(maxdev, Math.abs(gs[i] - (a + b * xs[i])));
  return { slope: b, quad: q[2], maxdev };
}
