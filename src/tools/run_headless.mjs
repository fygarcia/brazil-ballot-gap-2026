// Headless batch: node tools/run_headless.mjs [runs]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as S from '../app/sim.js';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/data/model_data.json')));
const m = S.prepare(data);
const RUNS = +(process.argv[2] || 200);
const f2 = x => Number.isFinite(x) ? x.toFixed(2) : 'NA';
const pct = x => (100 * x).toFixed(1) + '%';

const configs = [
  // realistic arrival models, fixed knobs (zona jitter 10 min, cell jitter 3 min unless stated)
  { name: '2022 order, 2022 clock (native)', scenario: 'emp2022', pace: 'native' },
  { name: '2022 order, 2026 observed pace', scenario: 'emp2022', pace: 'observed' },
  { name: '2022 order, 2026 pace, within-state mix 0.5', scenario: 'emp2022', pace: 'observed', withinState: 0.5 },
  { name: '2022 order, 2026 pace, zona jitter 30 min', scenario: 'emp2022', pace: 'observed', zoneJitter: 30 },
  { name: '2022 order, 2026 pace, N/NE +20 min', scenario: 'emp2022', pace: 'observed', neDelay: 20 },
  { name: '2022 order, 2026 pace, N/NE -15 min', scenario: 'emp2022', pace: 'observed', neDelay: -15 },
  { name: '2022 order, steady rate', scenario: 'emp2022', pace: 'steady' },
  { name: '2022 order, slow (back-loaded) rate', scenario: 'emp2022', pace: 'slow' },
  { name: '2022 order, peaked rate', scenario: 'emp2022', pace: 'peaked' },
  { name: '2026 municipal completion scaling, native clock', scenario: 'mun2026', pace: 'native' },
  { name: '2026 municipal completion scaling, 2026 pace', scenario: 'mun2026', pace: 'observed' },
  { name: 'Fast-first, N/NE +0, 2026 pace', scenario: 'fastfirst', pace: 'observed', neDelay: 0 },
  { name: 'Fast-first, N/NE +30, 2026 pace', scenario: 'fastfirst', pace: 'observed', neDelay: 30 },
  { name: 'Fast-first, N/NE +60, 2026 pace', scenario: 'fastfirst', pace: 'observed', neDelay: 60 },
  // realistic models with knobs randomized per run (prior ranges in sim.js PRIOR)
  { name: 'PRIOR 2022 order, 2026 pace', scenario: 'emp2022', pace: 'observed', prior: true },
  { name: 'PRIOR 2022 order, steady', scenario: 'emp2022', pace: 'steady', prior: true },
  { name: 'PRIOR 2022 order, slow', scenario: 'emp2022', pace: 'slow', prior: true },
  { name: 'PRIOR 2022 order, peaked', scenario: 'emp2022', pace: 'peaked', prior: true },
  { name: 'PRIOR 2026 municipal completion, 2026 pace', scenario: 'mun2026', pace: 'observed', prior: true },
  { name: 'PRIOR fast-first, 2026 pace', scenario: 'fastfirst', pace: 'observed', prior: true },
  { name: 'PRIOR fast-first, steady', scenario: 'fastfirst', pace: 'steady', prior: true },
  { name: 'PRIOR fast-first, slow', scenario: 'fastfirst', pace: 'slow', prior: true },
  { name: 'PRIOR fast-first, peaked', scenario: 'fastfirst', pace: 'peaked', prior: true },
  // baselines
  { name: 'Random section order, 2026 pace', scenario: 'random', pace: 'observed' },
  { name: 'Constant mix, 2026 pace', scenario: 'constmix', pace: 'observed' },
  { name: 'Constant mix, steady', scenario: 'constmix', pace: 'steady' },
  { name: 'Constant mix, slow', scenario: 'constmix', pace: 'slow' },
  { name: 'Constant mix, peaked', scenario: 'constmix', pace: 'peaked' },
];
const results = [];
const t0 = Date.now();
for (const c of configs) {
  const t = Date.now();
  const res = S.monteCarlo(m, { ...c, runs: RUNS, keepSeries: 3 });
  const s = res.summary;
  results.push({ ...c, realistic: S.SCENARIOS[c.scenario].realistic, summary: s, params: res.params, medianSeries: res.series[0] });
  console.error(`${c.name}: ${((Date.now() - t) / 1000).toFixed(1)}s flat ${pct(s.fracFlat)}`);
}
const obs = S.observedShape(m);
const oinc = S.observedIncoming(m);
const req = S.requiredIncoming(m, 'observed', obs.tseTimed.slope);
const out = { real2022Shape: S.real2022Shape(m), generated: new Date().toISOString(), runsPerConfig: RUNS, window: '18:15-20:15', flatTol: S.FLAT_TOL, observedShape: obs, observedIncoming: oinc, requiredIncomingObservedPace: req, results: results.map(r => ({ ...r, medianSeries: undefined })) };
fs.writeFileSync(path.join(ROOT, 'results/headless_results.json'), JSON.stringify(out, null, 1));

let md = `# Ballot Gap Lab - headless results\n\nGenerated ${out.generated}; ${RUNS} Monte Carlo runs per row; window 18:15-20:15 Brasilia; flat = max |gap - best line| <= ${S.FLAT_TOL} pt.\n\n`;
md += `Observed (published points with TSE file times, inside window): n=${obs.tseTimed.n}, slope ${f2(obs.tseTimed.slope)} pt/h, quad ${f2(obs.tseTimed.quad)} pt/h^2, max dev ${f2(obs.tseTimed.maxdev)} pt.\n`;
if (obs.newsTimed) md += `Observed using news timestamps instead: n=${obs.newsTimed.n}, slope ${f2(obs.newsTimed.slope)}, quad ${f2(obs.newsTimed.quad)}, max dev ${f2(obs.newsTimed.maxdev)}.\n`;
const r22 = S.real2022Shape(m);
md += `Real 2022 count (TSE 2022 BU), same clock window: slope ${f2(r22.sameClock.slope)}, quad ${f2(r22.sameClock.quad)}, max dev ${f2(r22.sameClock.maxdev)}; same %-counted span (${r22.samePstSpan.from}-${r22.samePstSpan.to}): slope ${f2(r22.samePstSpan.slope)}, quad ${f2(r22.samePstSpan.quad)}, max dev ${f2(r22.samePstSpan.maxdev)}.\n`;
md += `\nColumns: flat = full minute series within 0.3 pt of its best line; flat+slope = flat and slope within ${S.SLOPE_TOL} pt/h of observed ${f2(m.obsSlope)}; flat@markers = within 0.3 pt when sampled only at the ${obs.tseTimed.n} TSE-timed published points (same sampling as the observation); marker RMSE = gap error at TSE-timed points.\n`;
md += `\n| model | flat<=0.3 | flat+slope | flat@markers | slope pt/h p50 [p10,p90] | slope 1st h / 2nd h | quad pt/h^2 p50 | max dev p50 [p10,p90] | max dev @markers p50 | marker gap RMSE p50 | %counted RMSE p50 |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of results) {
  const s = r.summary;
  md += `| ${r.name} | ${pct(s.fracFlat)} | ${pct(s.fracFlatSlope)} | ${pct(s.fracFlatAtMarkers)} | ${f2(s.slope.p50)} [${f2(s.slope.p10)}, ${f2(s.slope.p90)}] | ${f2(s.slopeH1.p50)} / ${f2(s.slopeH2.p50)} | ${f2(s.quad.p50)} | ${f2(s.maxdev.p50)} [${f2(s.maxdev.p10)}, ${f2(s.maxdev.p90)}] | ${f2(s.maxdevAtMarkers.p50)} | ${f2(s.markerRMSE.p50)} | ${f2(s.pstRMSE.p50)} |\n`;
}
md += `\n## Incoming path required by flat runs (median over flat runs; margin = Flavio-Lula pts of incoming valid votes; vpm = valid votes per minute)\n\n`;
for (const r of results) {
  const b = r.summary.blocksFlat; if (!b) continue;
  md += `**${r.name}** (${pct(r.summary.fracFlat)} flat)\n\n| block | ` + b.map(x => S.hhmm(x.t)).join(' | ') + ' |\n|' + '---|'.repeat(b.length + 1) + '\n';
  md += '| margin | ' + b.map(x => f2(x.margin.p50)).join(' | ') + ' |\n';
  md += '| votes/min (k) | ' + b.map(x => (x.vpm.p50 / 1000).toFixed(0)).join(' | ') + ' |\n';
  if (r.summary.knobsFlat) md += '\nknobs of flat runs (median): ' + Object.entries(r.summary.knobsFlat).map(([k, v]) => `${k}=${f2(v)} (all runs ${f2(r.summary.knobsAll[k])})`).join(', ') + '\n';
  md += '\n';
}
md += `\n## All runs, incoming path (median) for the main realistic model\n\n`;
const main = results.find(r => r.name === '2022 order, 2026 observed pace');
md += '| block | ' + main.summary.blocksAll.map(x => S.hhmm(x.t)).join(' | ') + ' |\n|' + '---|'.repeat(main.summary.blocksAll.length + 1) + '\n';
md += '| margin | ' + main.summary.blocksAll.map(x => f2(x.margin.p50)).join(' | ') + ' |\n';
md += '| votes/min (k) | ' + main.summary.blocksAll.map(x => (x.vpm.p50 / 1000).toFixed(0)).join(' | ') + ' |\n';
md += `\n## Straight line requirement (observed pace, observed slope ${f2(obs.tseTimed.slope)} pt/h anchored at 18:43)\n\n| block | ` + req.map(x => S.hhmm(x.t)).join(' | ') + ' |\n|' + '---|'.repeat(req.length + 1) + '\n| margin needed | ' + req.map(x => f2(x.margin)).join(' | ') + ' |\n| votes/min (k) | ' + req.map(x => (x.vpm / 1000).toFixed(0)).join(' | ') + ' |\n';
md += `\n## Real incoming margins between published absolute snapshots\n\n| from | to | %sec | valid added | Flavio% in | Lula% in | margin |\n|---|---|---|---|---|---|---|\n` + oinc.map(o => `| ${o.from} | ${o.to} | ${o.fromPst}->${o.toPst} | ${(o.dV / 1e6).toFixed(2)}M | ${f2(o.F)} | ${f2(o.L)} | ${f2(o.margin)} |`).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'results/headless_results.md'), md);
console.log(md);
console.error(`total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
