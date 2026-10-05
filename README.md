# Ballot Gap Lab

Static page that tests whether Brazil's ballot-transmission **arrival order** can explain the near-straight decline in the Flávio − Lula gap between **18:15 and 20:15 (Brasília) on 4 Oct 2026** (1st round, president). Neutral framing: it measures the shape of the partials and does **not** assume the count was clean or rigged.

**Live:** [https://fygarcia.github.io/brazil-ballot-gap-2026/](https://fygarcia.github.io/brazil-ballot-gap-2026/)

The site root serves a self-contained `index.html` (data, JS, and CSS inlined). Modular source, build tools, and headless results live under [`src/`](src/).

## Data sources

- **TSE** election results / dados abertos (2026 municipal and UF totals; 2022 boletim de urna reception times)
- **[Urna Aberta](https://urnaaberta.com.br/)** stored 2026 series (shares and % counted at TSE file times) and 2022 reference

Fetch URL + time logs: [`data/fetchlogs/`](data/fetchlogs/). Compressed raw snapshot as of 2026-10-05: [`data/raw-snapshot-2026-10-05.tar.gz`](data/raw-snapshot-2026-10-05.tar.gz). Extracted raw extracts used by the build also sit under [`src/data/raw/`](src/data/raw/).

## Key caveats

- **No timestamped 2026 boletim file is published.** Arrival order is **modeled**: 2022 TSE reception times/order applied to 2026 municipal results (uniform swing within municipality, then exact rescale so every scenario ends at the registered result).
- Some **news timestamps** used in the target series are **unverified** (see consistency / reconciliation flags in `src/data/target_partials.json`).
- The observed “straightness” rests on a small number of TSE-timed points inside the window; stretches without published points are interpolated. Results also depend on within-state mix / zona-jitter knobs. Details: [`src/README.md`](src/README.md), [`src/results/headless_results.md`](src/results/headless_results.md).

## Rerun locally

```bash
# Serve the modular app
python3 -m http.server 8765 --directory src/app   # http://localhost:8765/

# Headless Monte Carlo (writes src/results/headless_results.{md,json})
node src/tools/run_headless.mjs 500

# Rebuild model data from raw extracts
python3 src/tools/build_target.py && python3 src/tools/build_app_data.py
```

Open `index.html` from the repo root (or via Pages) for the published single-file build.
