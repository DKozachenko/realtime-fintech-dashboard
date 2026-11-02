# Realtime Fintech Dashboard

An Angular dashboard that shows live market metrics for a configurable set of instruments. A Rust generator compiled to WebAssembly produces raw price updates inside a Web Worker; the worker aggregates them (last price, spread, volume, VWAP, order-book imbalance) and sends throttled snapshots to the UI. The producer can be paused, resumed and reconfigured at runtime.

**Live demo:** https://dkozachenko.github.io/realtime-fintech-dashboard/

## Requirements

- Node 22 (see `.node-version`)
- Rust stable with the `wasm32-unknown-unknown` target
- wasm-pack 0.15.1
- Chrome or Chromium (for the Karma tests)

## Commands

```bash
npm ci               # install dependencies
npm start            # build the Wasm generator and serve the app (ng serve)
npm run build        # build the Wasm generator and the production bundle
npm run test:wasm    # Rust unit tests (cargo test)
npm test             # build the Wasm generator, then Angular unit tests (headless Chrome, single run)
```

If Karma cannot find the browser, point it at one:

```bash
CHROME_BIN=/usr/bin/chromium npm test
```

## Architecture

```
Angular (main thread)            Worker (TS)                          Wasm (Rust)
─────────────────────            ───────────                          ───────────
ProducerService (root, one) ─commands─▶ ProducerEngine:               Generator:
  activeSettings, runId,               batch timer, runId,    ─next_batch(n)─▶ instrument state,
  status, rows (signals)               metrics aggregator     ◀─Uint32Array──  rand_pcg(seed)
        ▲                              │
        └──────── snapshot (≤ 50 rows, ≤ 4 per second) ◀┘
Dashboard / Settings (OnPush, pipes only format)
```

- **Wasm** generates raw updates only, as a flat `Uint32Array` (7 numbers per update).
- **Worker** owns the timer, calls the generator, computes metrics and decides when to send a snapshot. `ProducerEngine` is a plain TS class with injected dependencies; `producer.worker.ts` is a thin wrapper.
- **Angular** keeps run state in signals, drops snapshots from previous runs, and renders.

## Tests

| Files | Covers |
| --- | --- |
| `generator/` (`npm run test:wasm`) | Rust generator |
| `src/app/worker/producer-engine.spec.ts` | batch timer, run lifecycle, pause/resume |
| `src/app/worker/metrics-aggregator.spec.ts` | metrics and batch decoding |
| `src/app/worker/snapshot-throttle.spec.ts` | snapshot frequency |
| `src/app/worker/wasm-batch-source.spec.ts` | batch source over the Wasm memory |
| `src/app/services/producer.service.spec.ts` | service state, stale-run filtering, retry (fake worker) |
| `src/app/shared/*.spec.ts` | settings and instrument helpers |
| `src/app/settings/*.spec.ts` | settings form validation and component |
| `src/app/dashboard/*.spec.ts` | market table and price-trend directive |
| `src/app/pipes/*.spec.ts` | formatting pipes |
| `src/app/ui/status-indicator.component.spec.ts` | status indicator |
| `src/app/app.component.spec.ts` | app shell |

## Design decisions

See [DECISIONS.md](DECISIONS.md) for the choices made and their trade-offs.

## Deployment

The workflow in `.github/workflows/pipeline.yml` runs on pushes to `develop`, pull requests and manual dispatch. `test-wasm` (Rust) starts at once; after dependencies are cached, `deploy` and `test` (Angular) run in parallel, so deploy does not wait for tests. A push to `develop`, or a manual run on it, builds the app with `--base-href=/realtime-fintech-dashboard/`, copies `index.html` to `404.html` (so deep links such as `/settings` work on GitHub Pages), and publishes it with `actions/upload-pages-artifact` and `actions/deploy-pages`. In the repository settings, Pages source must be set to "GitHub Actions".

## License

[MIT](LICENSE)
