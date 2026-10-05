# Ballot Gap Lab

Local static webapp that tests how hard it is for Brazil's ballot-transmission process to produce the
near-straight fall of the Flávio − Lula gap between 18:15 and 20:15 (Brasília) on 4 Oct 2026
(1st round, president). Neutral framing: it measures the shape and does not assume the count was clean or rigged.

## Run
```
cd /workspace/ballot-gap-lab
python3 -m http.server 8765 --directory app      # then open http://localhost:8765/
node tools/run_headless.mjs 500                  # headless Monte Carlo -> results/headless_results.{md,json}
python3 tools/build_target.py && python3 tools/build_app_data.py   # rebuild data from data/raw
```

## Files
- `app/index.html, app/app.js, app/style.css`: one-page UI (canvas charts, no external libraries)
- `app/sim.js`: core simulation + scoring (ES module, runs in the browser and in node)
- `app/data/model_data.json`: built model input (117k cells = state × municipality × zona × 2022 reception minute)
- `data/target_partials.json`: target series with consistency checks and timestamp reconciliation flags
- `data/raw/`: raw extracts with `FETCHLOG.tsv` (URL + fetch time)
  - `tse2026/`: TSE results JSON, election 6257: per-UF, national, `br-e006257-ab.json`, 5,757 municipality files
  - `tse2022_bu/`: TSE 2022 boletim de urna, 1st round, President rows aggregated to one line per section (472,028), with `DT_BU_RECEBIDO`
  - `urnaaberta/`: Urna Aberta 2022 reference (embedded in their JS) and their stored 2026 series (389 points, TSE file times)
- `tools/`: fetch/build/headless/screenshot scripts
- `results/`: headless tables and PNG screenshots

## What is real vs modeled
- Real: 2026 final totals by UF and municipality (TSE); 2022 reception time of every boletim (TSE); 2026 % counted vs time
  and shares at TSE file times (Urna Aberta stored series); news partials relayed in the brief.
- Modeled: no 2026 timestamped boletim file is published, so arrival = **2022 reception order/times applied to 2026
  municipal results** (uniform swing within municipality, then exact rescale so every scenario ends at the registered result).
  The 2026 pace has no stored TSE point between 18:10–18:43 and between 19:14–20:04; those stretches are linear interpolation.

## Limits
- The observed "straightness" rests on 6 TSE-timed points inside the window (18:43, 18:48, 19:14, 20:04, 20:13 + 18:00 outside).
  There is no published point between 19:14 and 20:04, so a curve there would be invisible. The app scores runs both on the full
  minute series and sampled only at those points.
- 2026 within-state arrival order is unknown; the within-state randomness and zona jitter knobs stand in for it. Results depend on them.
- `mun2026` uses the municipality's last-section time, which is dominated by stragglers.
- 2022 sections are the arrival unit (2026 has 499,248 sections vs 472,028 in 2022); % counted is in 2022-section units.
