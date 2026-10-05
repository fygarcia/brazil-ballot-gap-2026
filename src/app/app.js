import * as S from './sim.js';
const $ = id => document.getElementById(id);
const COL = { F: '#1f4fbf', L: '#c62828', gap: '#333', flat: '#2e9e5b', band: 'rgba(242,140,40,.25)', med: '#e07b00', req: '#7b3fbf', grey: '#888' };
let M = null, last = null;

// ---------- tiny canvas plotting ----------
function plot(cv, { x0, x1, y0, y1, xlab = t => S.hhmm(t), xticks, yticks, ylab = v => v, shade, title }) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, P = { l: 52, r: 14, t: 22, b: 26 };
  ctx.clearRect(0, 0, W, H); ctx.font = '12px system-ui'; ctx.fillStyle = '#222';
  const X = x => P.l + (x - x0) / (x1 - x0) * (W - P.l - P.r), Y = y => H - P.b - (y - y0) / (y1 - y0) * (H - P.t - P.b);
  if (shade) { ctx.fillStyle = 'rgba(255,214,0,.13)'; ctx.fillRect(X(shade[0]), P.t, X(shade[1]) - X(shade[0]), H - P.t - P.b); }
  ctx.strokeStyle = '#e4e2dc'; ctx.lineWidth = 1; ctx.fillStyle = '#555';
  for (const v of yticks) { ctx.beginPath(); ctx.moveTo(P.l, Y(v)); ctx.lineTo(W - P.r, Y(v)); ctx.stroke(); ctx.fillText(ylab(v), 4, Y(v) + 4); }
  for (const t of xticks) { ctx.beginPath(); ctx.moveTo(X(t), P.t); ctx.lineTo(X(t), H - P.b); ctx.stroke(); ctx.fillText(xlab(t), X(t) - 15, H - 8); }
  if (title) { ctx.fillStyle = '#111'; ctx.font = 'bold 13px system-ui'; ctx.fillText(title, P.l, 15); ctx.font = '12px system-ui'; }
  const api = {
    ctx, X, Y,
    line(xs, ys, color, w = 1, alpha = 1, dash = null) { ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); ctx.beginPath(); let st = false; for (let i = 0; i < xs.length; i++) { if (!Number.isFinite(ys[i]) || xs[i] < x0 || xs[i] > x1) { st = false; continue; } st ? ctx.lineTo(X(xs[i]), Y(ys[i])) : ctx.moveTo(X(xs[i]), Y(ys[i])); st = true; } ctx.stroke(); ctx.restore(); },
    dot(x, y, color, filled = true, r = 4.5) { ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = filled ? color : '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); },
    band(xs, lo, hi, color) { ctx.save(); ctx.fillStyle = color; ctx.beginPath(); xs.forEach((x, i) => i ? ctx.lineTo(X(x), Y(hi[i])) : ctx.moveTo(X(x), Y(hi[i]))); for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(X(xs[i]), Y(lo[i])); ctx.closePath(); ctx.fill(); ctx.restore(); },
    text(x, y, s, color = '#222') { ctx.fillStyle = color; ctx.fillText(s, X(x), Y(y)); },
    legend(items) { let x = W - P.r - 8; ctx.font = '12px system-ui'; for (const [lab, c] of items.reverse()) { const w = ctx.measureText(lab).width + 26; x -= w; ctx.fillStyle = c; ctx.fillRect(x, 8, 14, 4); ctx.fillStyle = '#333'; ctx.fillText(lab, x + 18, 14); } },
  };
  return api;
}
const range = (a, b, s = 1) => { const o = []; for (let x = a; x <= b + 1e-9; x += s) o.push(x); return o; };
const T = range(0, S.GRID_MAX);

function drawRuns(res) {
  const x0 = 45, x1 = 225, xt = range(60, 220, 20);
  const sh = plot($('cShares'), { x0, x1, y0: 38, y1: 54, xticks: xt, yticks: range(38, 54, 2), ylab: v => v + '%', shade: S.WINDOW, title: 'Share of valid votes counted so far' });
  for (const s of res.series) { sh.line(T, s.pF, s.flat ? COL.flat : COL.F, 1, 0.35); sh.line(T, s.pL, s.flat ? COL.flat : COL.L, 1, 0.35); }
  const med = medianSeries(res.series);
  sh.line(T, med.pF, COL.F, 2.5); sh.line(T, med.pL, COL.L, 2.5);
  for (const mk of M.markers) { sh.dot(mk.t, mk.pF, COL.F, mk.reliable); sh.dot(mk.t, mk.pL, COL.L, mk.reliable); }
  sh.legend([['Flávio (median run)', COL.F], ['Lula (median run)', COL.L], ['flat runs', COL.flat]]);
  const gp = plot($('cGap'), { x0, x1, y0: 2, y1: 13.5, xticks: xt, yticks: range(2, 13, 1), ylab: v => v + ' pt', shade: S.WINDOW, title: 'Gap = Flávio − Lula (points)' });
  for (const s of res.series) gp.line(T, s.gap, s.flat ? COL.flat : '#999', 1, 0.4);
  gp.line(T, med.gap, COL.gap, 2.5);
  const obs = S.observedShape(M).tseTimed;
  if (obs) { const tc = (S.WINDOW[0] + S.WINDOW[1]) / 2; gp.line([S.WINDOW[0], S.WINDOW[1]], [obs.intercept + obs.slope * (S.WINDOW[0] - tc) / 60, obs.intercept + obs.slope * (S.WINDOW[1] - tc) / 60], COL.req, 1.5, 1, [6, 4]); }
  for (const mk of M.markers) gp.dot(mk.t, mk.gap, '#000', mk.reliable);
  for (const p of M.target.ua_series) { const t = S.toMin(p.t); if (t >= x0 && t <= x1) gp.dot(t, p.pF - p.pL, '#000', true, 1.6); }
  gp.legend([['median run', COL.gap], ['flat runs', COL.flat], ['best line through TSE-timed points', COL.req]]);
}
function medianSeries(series) {
  const k = ['pF', 'pL', 'gap']; const o = {};
  for (const key of k) { o[key] = T.map((_, g) => S.quant(series.map(s => s[key][g]), 0.5)); }
  return o;
}
function drawBlocks(sum, req, oinc) {
  const xs = sum.blocksAll.map(b => b.t + 5);
  const allM = sum.blocksAll.map(b => b.margin.p50), reqM = req.map(r => r.margin);
  const vals = [...allM, ...reqM, ...(sum.blocksFlat || []).flatMap(b => [b.margin.p10, b.margin.p90]), ...oinc.map(o => o.margin)].filter(Number.isFinite);
  const lo = Math.floor(Math.min(...vals, -2)) - 1, hi = Math.ceil(Math.max(...vals, 10)) + 1;
  const step = (hi - lo) > 30 ? 5 : 2;
  const p = plot($('cMargin'), { x0: 70, x1: 200, y0: lo, y1: hi, xticks: range(75, 195, 10), yticks: range(Math.ceil(lo / step) * step, hi, step), ylab: v => (v > 0 ? '+' : '') + v, shade: S.WINDOW, title: 'Incoming margin, Flávio − Lula (pts of incoming valid votes)' });
  p.line([70, 200], [0, 0], '#000', 1, 0.5);
  if (sum.blocksFlat) { p.band(xs, sum.blocksFlat.map(b => b.margin.p10), sum.blocksFlat.map(b => b.margin.p90), COL.band); p.line(xs, sum.blocksFlat.map(b => b.margin.p50), COL.med, 2.5); }
  p.line(xs, allM, COL.grey, 2); p.line(xs, reqM, COL.req, 2, 1, [6, 4]);
  for (const o of oinc) { const a = S.toMin(o.from), b = S.toMin(o.to); if (b < 70 || a > 200) continue; p.line([Math.max(a, 70), Math.min(b, 200)], [o.margin, o.margin], '#000', 2.5); }
  p.legend([['flat runs median', COL.med], ['all runs median', COL.grey], ['needed for straight line', COL.req], ['real, between snapshots', '#000']]);
  const allV = sum.blocksAll.map(b => b.vpm.p50 / 1000), reqV = req.map(r => r.vpm / 1000);
  const vv = [...allV, ...reqV, ...(sum.blocksFlat || []).flatMap(b => [b.vpm.p90 / 1000])].filter(Number.isFinite);
  const vmax = Math.ceil(Math.max(...vv, 100) / 200) * 200;
  const r = plot($('cRate'), { x0: 70, x1: 200, y0: 0, y1: vmax, xticks: range(75, 195, 10), yticks: range(0, vmax, vmax / 5), ylab: v => v + 'k', shade: S.WINDOW, title: 'Valid votes arriving per minute (thousands)' });
  if (sum.blocksFlat) { r.band(xs, sum.blocksFlat.map(b => b.vpm.p10 / 1000), sum.blocksFlat.map(b => b.vpm.p90 / 1000), COL.band); r.line(xs, sum.blocksFlat.map(b => b.vpm.p50 / 1000), COL.med, 2.5); }
  r.line(xs, allV, COL.grey, 2); r.line(xs, reqV, COL.req, 2, 1, [6, 4]);
  for (const o of oinc) { const a = S.toMin(o.from), b = S.toMin(o.to); if (b < 70 || a > 200 || b <= a) continue; r.line([Math.max(a, 70), Math.min(b, 200)], [o.dV / (b - a) / 1000, o.dV / (b - a) / 1000], '#000', 2.5); }
  r.legend([['flat runs', COL.med], ['all runs', COL.grey], ['observed 2026 pace', COL.req], ['real, between snapshots', '#000']]);
}
function drawHist(scores) {
  const md = scores.map(s => s.maxdev), mx = Math.max(1, Math.ceil(Math.max(...md) * 2) / 2), nb = 40, w = mx / nb, h = new Array(nb).fill(0);
  for (const v of md) h[Math.min(nb - 1, Math.floor(v / w))]++;
  const top = Math.max(...h);
  const p = plot($('cHist'), { x0: 0, x1: mx, y0: 0, y1: top * 1.1, xticks: range(0, mx, mx > 4 ? 1 : 0.25), xlab: v => v.toFixed(2), yticks: range(0, top, Math.max(1, Math.ceil(top / 5))), title: 'Runs by max |gap − best straight line| (pts); red line = 0.3 pt' });
  h.forEach((c, i) => { p.ctx.fillStyle = (i + 1) * w <= S.FLAT_TOL + 1e-9 ? COL.flat : '#9aa'; p.ctx.fillRect(p.X(i * w) + 1, p.Y(c), p.X(w) - p.X(0) - 2, p.Y(0) - p.Y(c)); });
  p.line([S.FLAT_TOL, S.FLAT_TOL], [0, top * 1.1], '#d00', 2);
}
const f2 = x => Number.isFinite(x) ? x.toFixed(2) : '–', pc = x => (100 * x).toFixed(1) + '%';
function summaryHTML(sum, p) {
  const o = S.observedShape(M).tseTimed;
  return `<div>Flat within 0.3 pt (full minute series)<br><b>${pc(sum.fracFlat)}</b> of ${sum.runs} runs</div>
  <div>Flat and slope within ${S.SLOPE_TOL} pt/h of observed<br><b>${pc(sum.fracFlatSlope)}</b></div>
  <div>Flat when sampled only at the ${S.observedShape(M).tseTimed.n} TSE-timed points (like the observation)<br><b>${pc(sum.fracFlatAtMarkers)}</b> · max dev p50 ${f2(sum.maxdevAtMarkers.p50)}</div>
  <div>Flat and gap RMSE ≤ 0.5 pt at TSE-timed markers<br><b>${pc(sum.fracFlatAndMarkers)}</b></div>
  <div>Gap slope 18:15–20:15<br><b>${f2(sum.slope.p50)}</b> pt/h [${f2(sum.slope.p10)}, ${f2(sum.slope.p90)}] · observed ${f2(o.slope)}</div>
  <div>Slope 1st hour / 2nd hour<br><b>${f2(sum.slopeH1.p50)} / ${f2(sum.slopeH2.p50)}</b> pt/h</div>
  <div>Curvature (quadratic term)<br><b>${f2(sum.quad.p50)}</b> pt/h² · observed points ${f2(o.quad)}</div>
  <div>Max deviation from line<br><b>${f2(sum.maxdev.p50)}</b> pt [${f2(sum.maxdev.p10)}, ${f2(sum.maxdev.p90)}] · observed points ${f2(o.maxdev)}</div>
  <div>Gap RMSE vs TSE-timed markers<br><b>${f2(sum.markerRMSE.p50)}</b> pt (all markers ${f2(sum.markerRMSEall.p50)})</div>
  <div>% counted RMSE vs markers<br><b>${f2(sum.pstRMSE.p50)}</b> pts · pace: ${p.pace}</div>` + (sum.knobsFlat ? `<div style="grid-column:1/-1">Knobs of flat runs (median; all runs in brackets): ${Object.entries(sum.knobsFlat).map(([k, v]) => `${k} ${f2(v)} [${f2(sum.knobsAll[k])}]`).join(' · ')}</div>` : '');
}

function params() {
  const g = id => +$(id).value;
  return { scenario: $('scenario').value, pace: $('pace').value, neDelay: g('neDelay'), withinState: g('withinState'), zoneJitter: g('zoneJitter'), cellJitter: g('cellJitter'), ffBase: g('ffBase'), ffSigma: g('ffSigma'), mixNoise: g('mixNoise'), runs: Math.max(1, g('runs')), seed: g('seed'), keepSeries: 40, prior: $('prior').checked };
}
async function mc(p, onProg) {
  const rng = S.mulberry32(p.seed * 7919 + 13), scores = [], series = [];
  for (let i = 0; i < p.runs; i++) {
    let q = p, knobs = null; if (p.prior) ({ q, knobs } = S.samplePrior(p, rng));
    const r = S.runOne(M, q, rng), s = S.scoreRun(M, r); if (knobs) s.knobs = knobs; scores.push(s);
    if (series.length < p.keepSeries || (s.flat && series.filter(x => x.flat).length < p.keepSeries)) series.push({ flat: s.flat, pF: r.pF, pL: r.pL, gap: r.gap });
    if (i % 4 === 3) { onProg && onProg(i + 1); await new Promise(r => setTimeout(r, 0)); }
  }
  return { params: p, scores, series, summary: S.summarize(scores) };
}
async function runScenario() {
  const p = params(); $('run').disabled = $('runAll').disabled = true;
  const t = performance.now();
  last = await mc(p, i => $('status').textContent = `running ${i}/${p.runs}…`);
  $('status').textContent = `done: ${p.runs} runs in ${((performance.now() - t) / 1000).toFixed(1)} s`;
  drawRuns(last); drawHist(last.scores);
  const o = S.observedShape(M).tseTimed;
  drawBlocks(last.summary, S.requiredIncoming(M, 'observed', o.slope), S.observedIncoming(M));
  $('runSummary').innerHTML = summaryHTML(last.summary, p);
  $('run').disabled = $('runAll').disabled = false;
}
const ALL = [
  ['2022 order, 2026 observed pace', { scenario: 'emp2022', pace: 'observed' }],
  ['2022 order, 2022 clock', { scenario: 'emp2022', pace: 'native' }],
  ['2022 order, steady', { scenario: 'emp2022', pace: 'steady' }],
  ['2022 order, slow', { scenario: 'emp2022', pace: 'slow' }],
  ['2022 order, peaked', { scenario: 'emp2022', pace: 'peaked' }],
  ['2026 municipal completion, 2026 pace', { scenario: 'mun2026', pace: 'observed' }],
  ['2026 municipal completion, native', { scenario: 'mun2026', pace: 'native' }],
  ['Fast-first (N/NE delay slider), 2026 pace', { scenario: 'fastfirst', pace: 'observed' }],
  ['Fast-first, steady', { scenario: 'fastfirst', pace: 'steady' }],
  ['Fast-first, peaked', { scenario: 'fastfirst', pace: 'peaked' }],
  ['Random section order', { scenario: 'random', pace: 'observed' }],
  ['Constant mix, 2026 pace', { scenario: 'constmix', pace: 'observed' }],
  ['Constant mix, steady', { scenario: 'constmix', pace: 'steady' }],
];
async function runAll() {
  const base = params(); $('run').disabled = $('runAll').disabled = true; const rows = [];
  for (const [name, o] of ALL) {
    $('status').textContent = `running ${name}…`;
    const res = await mc({ ...base, ...o, keepSeries: 0 }); const s = res.summary;
    rows.push(`<tr class="${S.SCENARIOS[o.scenario].realistic ? 'real' : ''}"><td>${name}</td><td>${pc(s.fracFlat)}</td><td>${pc(s.fracFlatSlope)}</td><td>${pc(s.fracFlatAtMarkers)}</td><td>${pc(s.fracFlatAndMarkers)}</td><td>${f2(s.slope.p50)} [${f2(s.slope.p10)}, ${f2(s.slope.p90)}]</td><td>${f2(s.slopeH1.p50)} / ${f2(s.slopeH2.p50)}</td><td>${f2(s.quad.p50)}</td><td>${f2(s.maxdev.p50)} [${f2(s.maxdev.p10)}, ${f2(s.maxdev.p90)}]</td><td>${f2(s.markerRMSE.p50)}</td><td>${s.blocksFlat ? s.blocksFlat.map(b => f2(b.margin.p50)).join(' ') : '–'}</td></tr>`);
    $('tableWrap').innerHTML = table(rows, base);
  }
  $('status').textContent = 'all models done'; $('run').disabled = $('runAll').disabled = false;
}
function table(rows, b) {
  return `<p>${b.prior ? '<b>knobs randomized per run (prior)</b> · ' : ''}${b.runs} runs each · N/NE delay ${b.neDelay} min · within-state ${b.withinState} · zona jitter ${b.zoneJitter} min · cell jitter ${b.cellJitter} min · seed ${b.seed}. Shaded rows = realistic arrival models.</p>
  <table><tr><th>model</th><th>flat ≤0.3</th><th>flat + slope</th><th>flat @ TSE-timed points</th><th>flat & marker RMSE≤0.5</th><th>slope pt/h p50 [p10,p90]</th><th>slope 1st/2nd h</th><th>quad pt/h²</th><th>max dev p50 [p10,p90]</th><th>marker RMSE</th><th>flat runs: incoming margin per 10-min batch 18:15→20:05</th></tr>${rows.join('')}</table>`;
}
function draw2022() {
  const g = M.real2022.grid; const xs = g.map(r => r[0]), gap = g.map(r => r[2] == null ? NaN : r[2] - r[3]);
  const p = plot($('c2022'), { x0: 45, x1: 240, y0: -6, y1: 10, xticks: range(60, 240, 20), yticks: range(-6, 10, 2), ylab: v => v + ' pt', shade: S.WINDOW, title: '2022 1st round: Bolsonaro − Lula, cumulative (TSE BU reception times)' });
  p.line([45, 240], [0, 0], '#000', 1, .4); p.line(xs, gap, '#333', 2.5);
  const r = S.real2022Shape(M);
  $('ref2022').innerHTML = `Same clock window ${r.sameClock.from}–${r.sameClock.to} (${f2(r.sameClock.pstFrom)}→${f2(r.sameClock.pstTo)}% counted): slope ${f2(r.sameClock.slope)} pt/h, quad ${f2(r.sameClock.quad)}, max dev from line <b>${f2(r.sameClock.maxdev)}</b> pt.<br>
  Same %-counted span as 2026's window (${f2(r.pstSpan2026[0])}→${f2(r.pstSpan2026[1])}%), 2022 time ${r.samePstSpan.from}–${r.samePstSpan.to}: slope ${f2(r.samePstSpan.slope)} pt/h, quad ${f2(r.samePstSpan.quad)}, max dev <b>${f2(r.samePstSpan.maxdev)}</b> pt. Urna Aberta: 2022 crossover at ${M.real2022.ua_virada[0]}% counted, ${M.real2022.ua_virada[1]}.`;
}
function dataCard() {
  const d = M; const fz = d.final;
  $('built').textContent = '· built ' + d.meta.built;
  const st = d.states.map(s => `${s.uf} F ${(100 * s.F26 / s.V26).toFixed(1)} / L ${(100 * s.L26 / s.V26).toFixed(1)}`).join(' · ');
  $('datasummary').innerHTML = `<p><b>Real (fetched):</b> TSE 2026 final totals by UF and municipality (resultados.tse.jus.br, election 6257): Flávio ${fz.F.toLocaleString()} · Lula ${fz.L.toLocaleString()} · valid ${fz.V.toLocaleString()} · ${fz.sections.toLocaleString()} sections. TSE 2022 boletins de urna, 472,028 sections with reception time (dadosabertos.tse.jus.br). Urna Aberta stored 2026 series (TSE file times) and 2022 hour-by-hour reconstruction.</p>
  <p><b>Modeled (labelled):</b> no 2026 timestamped boletim file is published, so the arrival model is <b>2022 reception order/times scaled to 2026 municipal results</b> (uniform swing within municipality, exact totals). The “2026 municipal completion” model rescales 2022 within-municipality timing so each municipality finishes when the 2026 TSE municipal file says it did (local <code>ht</code> converted to Brasília). The 2026 pace between 19:14 and 20:04 is a straight interpolation (no stored TSE point in between).</p>
  <details><summary>2026 state shares</summary><p>${st}</p></details>`;
  $('flags').innerHTML = d.target.flags.map(f => `<li>${f}</li>`).join('');
  $('notes').innerHTML = d.meta.notes.map(f => `<li>${f}</li>`).join('');
}
async function init() {
  $('status').textContent = 'loading data…';
  const data = await (await fetch('data/model_data.json')).json();
  M = S.prepare(data);
  for (const [k, v] of Object.entries(S.SCENARIOS)) $('scenario').insertAdjacentHTML('beforeend', `<option value="${k}">${v.label}</option>`);
  for (const id of ['neDelay', 'withinState', 'zoneJitter', 'cellJitter', 'ffBase', 'ffSigma', 'mixNoise']) { const f = () => $(id + 'V').textContent = $(id).value; $(id).addEventListener('input', f); f(); }
  const note = () => { const s = $('scenario').value; $('scenarioNote').textContent = {
    emp2022: 'Each 2022 section keeps its real 2022 TSE reception time (plus jitter); within-state randomness swaps a share of sections for random times from the same state. With a pace other than native, the order is kept and the clock is remapped so the % of sections counted follows the chosen curve.',
    mun2026: 'Same 2022 within-municipality order, but each municipality is stretched/compressed so its last section lands at the 2026 TSE completion time of that municipality.',
    fastfirst: 'Each cartório (zona) draws a lognormal delay; N/NE medians are shifted by the delay slider; exterior +150 min. Within-state randomness mixes in independent per-section draws.',
    random: 'Sections arrive in uniformly random order (pace mapped to the chosen curve). Null model: the gap stays near its final value.',
    constmix: 'From the real 18:00 snapshot (12.45%, absolute votes), every later batch has the same Flávio/Lula mix needed to land exactly on the final result (plus optional noise per 10-min batch).' }[s]; };
  const pn = () => { const pr = S.PRIOR[$('scenario').value] || {}; $('priorNote').textContent = Object.keys(pr).length ? 'ranges: ' + Object.entries(pr).map(([k, [lo, hi]]) => `${k} ${lo}…${hi}`).join(', ') : 'no knobs for this model'; };
  $('scenario').addEventListener('change', () => { note(); pn(); }); note(); pn();
  $('run').onclick = runScenario; $('runAll').onclick = runAll;
  dataCard(); draw2022();
  $('status').textContent = `loaded ${M.N.toLocaleString()} cells`;
  await runScenario();
}
init();
