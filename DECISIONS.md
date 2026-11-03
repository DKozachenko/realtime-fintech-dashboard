# Decisions

Each entry is a choice the task left open, or a reading of the task that needed an interpretation. Quotes are from the task description.

## Architecture

### D1. A dedicated Web Worker, not a SharedWorker
"Navigating between pages" means Angular Router navigation inside one SPA, and that never reloads the page. One root-provided `ProducerService` owns one dedicated `Worker` for the lifetime of the tab, so navigation never creates another producer. A SharedWorker would tie tabs together, so pausing in one tab would pause the others. The task does not ask for that, and Chrome on Android does not support SharedWorker.
**Consequence:** every tab runs its own independent run with its own random data.

### D2. Layers: Wasm generates, the worker computes metrics, Angular renders
- **Wasm (Rust)** produces only raw market updates: one trade plus a bid/ask snapshot.
- **The worker (TypeScript)** owns the batch timer, calls the generator, aggregates the metrics, and decides when to publish.
- **Angular** keeps the run state in signals, drops results from other runs, and formats values for display.

If the metrics were computed in Angular, up to 20,000 updates/s would cross into the main thread. A snapshot sent from the worker is O(instruments), at most 50 rows, whatever the generation rate. Keeping the metrics in TypeScript instead of Rust separates generation from aggregation and keeps the metric tests in the Angular test suite. The rule *"a TypeScript generator wrapped in a trivial Wasm call is not sufficient"* is about generation, not aggregation.

### D3. Batch transport is a flat `Uint32Array`, 7 fields per update
The task allows it: *"you may choose a different transport format."* Fields: instrument index, priceCents, tradeQuantity, bidCents, askCents, bidQuantity, askQuantity. Rust writes into a reused buffer inside Wasm memory, and the worker reads it through a view with no copy.
- **Instrument index instead of a symbol string.** Strings would have to be decoded across the Wasm/JS boundary on every update. Symbols are fixed for a run, so `instrumentSymbol(i)` lives in TypeScript and Rust never sees names.
- **No `serde-wasm-bindgen` objects.** They allocate one JS object and one string per update, which means up to 20,000 short-lived objects per second for the garbage collector.
- **The typed-array view is recreated for every batch.** If Wasm memory grows, the old `ArrayBuffer` is detached.

### D4. Snapshots are throttled in the worker, at about 4 per second
The task allows it: *"The interface may refresh less frequently than data is produced."* The worker aggregates every batch but publishes a snapshot only on every Nth batch:

```
N = max(1, round(DISPLAY_INTERVAL_MS / batchIntervalMs)), DISPLAY_INTERVAL_MS = 250
```

- **Counting batches instead of measuring time.** It is deterministic, unaffected by timer jitter, and needs no second timer.
- **`round` instead of `ceil`.** The constant is a target rate, not a hard cap. `ceil`, which is what a time check does, can drop the rate to almost half: a 200 ms interval would publish every 400 ms.
- **`max(1, …)`.** With slow batches (for example 600 ms, where `round` gives 0) every batch is published.
- **Pause publishes immediately,** so the screen shows exact totals.
- **The value is 250 ms.** We picked it by eye on a live prototype at 1, 2, 4, 10 and 20 Hz. At 20 Hz the numbers are unreadable.

### D5. Angular builds the empty table on Apply
When the user applies new settings, `ProducerService` assigns a new `runId` and immediately sets an empty table of N rows (all `null`, volume 0) before it messages the worker. The reset is instant even while Wasm is still loading, it can be tested without a worker, and every later snapshot with an old `runId` is dropped.

### D6. Pause and resume semantics
- **Pause** stops the worker's timer and publishes a final snapshot.
- **Resume** restarts the timer, and the first batch comes one full interval later. If resume generated a batch immediately, quick pause/resume clicks would generate faster than the requested interval (*"requested time between batches"*). Nothing is replayed for the paused time.
- **Apply** always starts generating, even from pause, as the task requires.

### D7. The active run's settings live in memory, not in storage
`ProducerService.activeSettings` is the source of truth. Storage would survive a reload, which conflicts with *"The application starts with the defaults"*: the producer would run on defaults while the form compared against stored values. The task also says *"Settings do not need to persist after a browser reload."*

### D8. Logger abstraction
`LoggerService` takes a source (`app`, `worker` or `wasm`), a message and context such as `runId`. The current implementation writes to the console. A Sentry implementation can replace it later without touching the callers. Sentry itself is not wired up, because it needs an account and a DSN and the task does not ask for it.

## Metrics and numbers

### D9. "No data yet" applies per instrument
*"Before any data arrives, show unavailable values and zero volume."* We read this per instrument: an instrument with no update in the current run shows `—` and volume 0. An instrument missing from one batch keeps its previous values. Nothing in the task requires every instrument to appear in every batch. With 50 instruments and 10 updates per batch, at least 40 are always missing.

### D10. `number`, not `BigInt`
Prices, spread and book quantities are small integers. Volume (`Σqty`) would take millions of years to reach 2^53. `Σ(price × qty)` is the only value that grows fast. The worst case is 1 instrument, 20,000 trades/s, about 10,000¢ × 50 units per trade, roughly 10^10 per second, which reaches 2^53 (≈ 9·10^15) after about 10 days of continuous running. Past that point the sum is no longer an exact integer, but VWAP's relative error stays around 10^-16, far below one cent. BigInt would allocate on every operation, cannot mix with `number`, and the VWAP division would need `number` anyway.
**We would switch** if runs had to last weeks with exact integer totals, using `BigInt` or periodic normalisation.

### D11. Rounding happens only in pipes
*"Round calculated prices only for display."* The worker sends unrounded values in cents, or `null`. Angular pipes format currency, the signed imbalance and `—`.

## Generator

### D12. `rand_pcg` with an explicit seed
JavaScript passes the seed once per run. Every random number after that is computed in Rust. We never use OS entropy (`thread_rng` / `OsRng`): on `wasm32` it calls into JavaScript's `crypto.getRandomValues`, so part of the randomness would live in JS. A fixed seed makes the tests reproducible.

### D13. Model constants are our own choice
The task fixes only the invariants: positive prices, bid < ask, positive trade quantities, non-negative book quantities, a trade at the bid or the ask, and prices evolving from previous values. The ranges are ours, picked around the task's example and kept as constants in one place:
- start price $10–$500;
- step about ±0.1% with a mild pull back to the start price;
- spread of at least 1¢;
- book quantity 100–1,000 at the start;
- trade quantity 1–500.

There is no coupling between imbalance and trade side. *"No realistic exchange model … is required."*

## Dashboard

### D24. Last price is coloured by its last move, without a flash
The mockup flashed the last price, with an arrow, for ~350 ms on every move. Snapshots arrive every ~250 ms and almost every price moves on almost every snapshot, so the flash either never faded or turned into a flicker whose look depended on the batch interval. Instead the price text is green after a rise and red after a fall, and keeps that colour until the next move. The colour change is a 150 ms transition, a little shorter than the fastest possible snapshot interval (about 167 ms with a 167 ms batch interval), so it always completes. A new run clears it. The task does not ask for any of this.

### D25. Rows are tracked by index
`@for (row of rows; track $index)`. A row's position is the instrument's identity for the whole run (D3: the worker sends rows by instrument index, and the symbol comes from `instrumentSymbol(i)`), and rows are never inserted, removed or reordered. Every snapshot carries new row objects, so `track row` would rebuild the whole table DOM four times a second; tracking by index reuses the same `<tr>` elements and only updates changed text. A metric field cannot serve as a key either: none of them is stable or unique.

## Settings form

### D14. Apply is enabled only when the form is valid and differs from the active run
We compare against `activeSettings`, not Angular's `dirty` flag. Changing a value and changing it back disables Apply again.
**Trade-off:** a run cannot be restarted with identical settings. The task does not require that.

## Tooling and delivery

### D15. Angular 19
Matches the target production stack.

### D16. Node 22 LTS
Pinned in `.node-version`. Angular 19 supports Node 18, 20 and 22, not 24. CI reads the same file.

### D17. Karma + Jasmine
This is Angular 19's default. The task does not prescribe a test framework.

### D18. `wasm-pack`
The rustwasm GitHub organisation is being archived, but wasm-pack moved to a long-time maintainer and still gets releases (0.15.0 in 2026). If it fails, the fallback is `wasm-bindgen-cli`.

### D19. Deploy does not wait for tests
In CI, deploy waits for dependency caching and the Wasm build, not for tests. Tests and linters run in parallel. "Each push" is read as each push to `develop`, the working branch (plus manual runs on it); pull requests build and test but never deploy. Every push reaches the live demo as fast as possible, and a failing test still shows up as a red check.
**Trade-off:** broken code can be deployed.

### D20. GitHub Pages: artifact deploy and a `404.html` fallback
- **Deploy from a workflow artifact, not a `gh-pages` branch.** The deploy job uploads the build with `actions/upload-pages-artifact` and publishes it with `actions/deploy-pages`; the Pages source is "GitHub Actions". The repository has no branch full of build output, the job needs only `pages: write` and `id-token: write` instead of write access to the repository, and every deploy is recorded in the `github-pages` environment. The environment allows deployments from `develop`, which is not the default branch.
- **`404.html` fallback.** GitHub Pages is a static file host with no rewrite rules: a path with no file behind it, such as `/dashboard` after a reload or from a shared link, gets the site's `404.html`. CI copies the built `index.html` to `404.html`, so that response is the app itself; Angular reads the URL and opens the matching route. Routes are `/dashboard` and `/settings`, and the root redirects to `/dashboard`.

**Trade-offs:** the deployed files are not browsable as a branch, they live in the workflow run's artifact; a deep link answers with HTTP status 404 even though the page works. Hash routing (`/#/dashboard`) would avoid the 404 status but puts a `#` in every URL.

### D21. No mobile layout
Not required by the task. The left rail and the table keep their desktop layout; on narrow screens the table scrolls horizontally.

### D22. Recovery recreates the whole worker, and only on user action
After any error, whether the worker script failed to load, the `.wasm` failed to load, or Rust panicked, generation stops and the dashboard shows the error with a **Retry** button. Retry, or Apply while in the error state, calls `terminate()` on the worker, which also destroys its Wasm instance, memory and generator. It then creates a new worker that loads the module again and starts a new run.
- **Recreate everything instead of repairing in place.** After a panic the Wasm instance is in an undefined state, and a worker whose script failed has nothing to repair. One "start over" path covers every case. The cost is reloading a small `.wasm` that the browser has already cached.
- **No automatic retry.** A permanent failure, such as a missing `.wasm` file, would otherwise retry forever and flood the logs.

### D23. Zoneless change detection
Angular 19's `provideExperimentalZonelessChangeDetection()` instead of Zone.js. State lives in signals and components are OnPush, so change detection runs only when a signal the template reads changes; worker messages no longer trigger app-wide checks through Zone.js patching.
**Trade-off:** the API is experimental in Angular 19 (stable from Angular 20), and tests cannot use `fakeAsync` — timers are injected instead (the worker engine uses a fake scheduler).

### D26. Third-party actions are pinned to commit SHAs
`dtolnay/rust-toolchain`, `Swatinem/rust-cache` and `taiki-e/install-action` are referenced by full commit SHA, with the version in a comment. A tag such as `@v2` or `@stable` can be moved to different code by the action's author, or by whoever takes over their account, and that code would run in the deploy job, which can publish the site. GitHub's own `actions/*` stay on major versions: they come from the same vendor as the runner itself.
**Trade-off:** updates are manual (or through Dependabot, which is not set up).

