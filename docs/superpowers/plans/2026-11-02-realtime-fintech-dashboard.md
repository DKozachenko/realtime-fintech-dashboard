# Realtime Fintech Dashboard — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Angular-приложение с живым дашбордом рынка и страницей настроек; данные генерирует Rust→Wasm внутри Web Worker, метрики считает воркер, деплой на GitHub Pages на каждый push в `develop`.

**Architecture:** Три слоя: Wasm (`generator/`) генерирует сырые обновления в плоский `Uint32Array`; воркер (`ProducerEngine`) по таймеру забирает батчи, агрегирует метрики и раз в N батчей шлёт снимок; Angular (`ProducerService` + две страницы) хранит прогон в сигналах, отбрасывает чужие `runId`, форматирует через pipes.

**Tech Stack:** Angular 19.2.x (standalone, signals, Reactive Forms, SCSS), Karma + Jasmine, Node 22, Rust stable + wasm-bindgen + wasm-pack 0.15.1 + rand_pcg, GitHub Actions + actions/deploy-pages.

**Spec:** `docs/superpowers/specs/2026-11-02-realtime-fintech-dashboard-design.md` (+ `DECISIONS.md`, макеты `docs/superpowers/mockups/dashboard.html`, `settings.html` — вариант B в обоих).

## Global Constraints

- Angular **19** (последний 19.x); standalone-компоненты, `ChangeDetectionStrategy.OnPush`, сигналы.
- Node **22** в `.node-version`; `.npmrc`: `save-exact=true` — все версии в `package.json` без `^`/`~`.
- Стили — SCSS, без UI-библиотек. Шрифт Manrope (Google Fonts), цифры `font-variant-numeric: tabular-nums`.
- Все тексты интерфейса, код, комментарии, README, DECISIONS.md — **на английском**. Закоммиченные файлы описывают проект нейтрально — как демо-дашборд рынка, без ссылок на другие репозитории.
- Коммиты — Conventional Commits, по одному на задачу (или чаще), ветка `develop`. В remote не пушить без явной просьбы.
- Цены — целые центы до самого pipe; округление только при отображении.
- Никакой истории событий: память воркера O(instrumentCount).
- Тесты без реальных ожиданий: таймеры — подставные.
- Диапазоны настроек: instrumentCount 1–50 (default 5), updatesPerBatch 1–1000 (default 100), batchIntervalMs 50–2000 (default 500); только целые.
- `DISPLAY_INTERVAL_MS = 250`; `snapshotEvery = max(1, round(250 / batchIntervalMs))`.
- Палитра (CSS custom properties в `src/styles.scss`): `--ink #06110d`, `--panel #0b1c16`, `--line #1a3329`, `--text #e3efe8`, `--muted #7e9b8d`, `--mint #8fe3b6`, `--rose #ee8a96`, `--amber #e9c46a`, `--moss linear-gradient(120deg, #0b2f22 0%, #125238 55%, #1d7a54 100%)`.
- Локально Karma запускать с `CHROME_BIN=/usr/bin/chromium-browser`. Единственный тестовый скрипт — `npm test` (`ng test --watch=false --browsers=ChromeHeadlessCI`).
- **Zoneless** (D23): `provideExperimentalZonelessChangeDetection()`; zone.js в проекте нет. Каждый TestBed-тест: `providers: [provideExperimentalZonelessChangeDetection()]`, ожидание через `await fixture.whenStable()`; `fakeAsync`/`tick` недоступны — таймеры только подставные.
- `tsconfig.json` — solution-style с `references`; новый tsconfig (например, `tsconfig.worker.json` в Task 7) добавляется в `references`.

## Review Focus

1. Ввод в поля настроек вида `" 12 "`, `"007"`, `"+5"`, `"1e3"`, `"2.5"`, `"-1"` — ожидается: пробелы по краям обрезаются, `"007"` = 7, остальные — ошибка «Enter a whole number.» (тест в Task 12, `whole-number validator`).
2. Imbalance, округляющийся до нуля с минусом (−0.001) — ожидается `0.00`, не `−0.00` (тест в Task 9).
3. Рост памяти Wasm между батчами (старый `ArrayBuffer` detached) — ожидается чтение из текущего `memory.buffer` на каждом батче (тест в Task 7).
4. Уход со страницы настроек с несохранёнными правками и возврат — ожидается форма со значениями активного прогона, Apply неактивна (тест в Task 12).
5. Apply до того, как воркер прислал `ready` (или во время паузы) — ожидается: `start` отправлен, статус остаётся `initializing` до `ready`; из паузы — сразу `running` (тесты в Task 8).

---

## Структура файлов

```
.node-version, .npmrc, .gitignore, README.md, angular.json, package.json, karma.conf.js
generator/                         Rust-крейт
  Cargo.toml, Cargo.lock
  src/lib.rs                       wasm-bindgen обёртка Generator
  src/market.rs                    чистая модель Market + тесты
  src/constants.rs                 константы модели
src/
  index.html, main.ts, styles.scss
  wasm/generator/                  вывод wasm-pack (в .gitignore)
  app/
    app.component.{ts,html,scss}   каркас: рельс + <router-outlet>
    config/app.config.ts, config/app.routes.ts
    shared/settings.ts             ProducerSettings, лимиты, дефолты, sameSettings, nominalRate
    shared/messages.ts             WorkerCommand, WorkerEvent, InstrumentMetrics
    shared/instruments.ts          INSTRUMENT_SYMBOLS, instrumentSymbol, emptyRows
    worker/batch-layout.ts         FIELDS_PER_UPDATE, BatchField
    worker/metrics-aggregator.ts   агрегатор
    worker/snapshot-throttle.ts     snapshotEvery
    worker/producer-engine.ts      движок
    worker/wasm-batch-source.ts    обёртка над Generator + memory
    worker/producer.worker.ts      точка входа воркера
    worker/testing/                fake-scheduler.ts, encode-updates.ts
    services/logger.service.ts
    services/producer.service.ts
    services/testing/fake-worker.ts
    pipes/cents.pipe.ts, pipes/imbalance.pipe.ts
    ui/status-indicator.component.ts
    dashboard/                     dashboard.component.*, price-trend.directive.ts
    settings/                      settings.component.*, settings-form.ts
.github/workflows/pipeline.yml
```

---

### Task 1: Каркас Angular 19 и инструменты

**Files:**
- Create: `.node-version`, `.npmrc`, `karma.conf.js`, `src/app/config/app.config.ts`, `src/app/config/app.routes.ts`, всё, что генерирует `ng new`
- Modify: `.gitignore`, `package.json`, `angular.json`, `src/main.ts`

**Interfaces:**
- Produces: npm-скрипты `start`, `build`, `test`, `test:ci`; `appConfig` в `src/app/config/app.config.ts`; `routes` в `src/app/config/app.routes.ts`.

- [ ] **Step 1: Файлы окружения.** `.node-version` = `22`; `.npmrc` = `save-exact=true`. Выполнить `fnm use` в корне → `node -v` начинается с `v22`.
- [ ] **Step 2: Сгенерировать проект во временной папке** (в корне уже есть файлы, `ng new` в непустую папку падает):
  `npx -y @angular/cli@19 new realtime-fintech-dashboard --directory=<scratchpad>/ng --style=scss --routing --ssr=false --skip-git --skip-install --defaults`
  Скопировать всё содержимое в корень репозитория, кроме `.gitignore` (его строки дописать к существующему `.gitignore`) и `README.md` (не нужен — свой в Task 13).
- [ ] **Step 3: Зафиксировать версии.** `npm install`; убедиться, что в `package.json` нет `^`/`~` (при необходимости `npm pkg set` с точными версиями из `package-lock.json` и повторный `npm install`). Angular-пакеты — одна версия 19.2.x.
- [ ] **Step 4: Перенести конфиг.** `app.config.ts` и `app.routes.ts` → `src/app/config/`; обновить импорты в `main.ts`. Маршруты пока пустые (`[]`).
- [ ] **Step 5: Karma для CI.** `npx ng generate config karma`; в `karma.conf.js` добавить `customLaunchers: { ChromeHeadlessCI: { base: 'ChromeHeadless', flags: ['--no-sandbox'] } }`. Скрипты: `"test:ci": "ng test --watch=false --browsers=ChromeHeadlessCI"`.
- [ ] **Step 6: Проверка.** `CHROME_BIN=/usr/bin/chromium-browser npm test` → дефолтные тесты `AppComponent` PASS. `npm run build` → успех.
- [ ] **Step 7: Commit** — `chore: scaffold Angular 19 workspace` (все новые файлы + `package-lock.json`).

---

### Task 2: Модель генератора на Rust

**Files:**
- Create: `generator/Cargo.toml`, `generator/src/lib.rs` (пока `mod market; mod constants;`), `generator/src/market.rs`, `generator/src/constants.rs`
- Modify: `.gitignore` (+ `generator/target/`)

**Interfaces:**
- Produces (Rust, используется в Task 3):
  ```rust
  pub const FIELDS_PER_UPDATE: usize = 7; // [index, price, tradeQty, bid, ask, bidQty, askQty]
  pub enum GeneratorError { InstrumentCount(u32), BatchSize(u32) } // + impl Display:
  //   "instrument count must be between 1 and 50, got {n}" / "batch size must be between 1 and 1000, got {n}"
  pub struct Market { .. }
  impl Market {
      pub fn new(instrument_count: u32, seed: u64) -> Result<Market, GeneratorError>;
      pub fn next_batch(&mut self, size: u32) -> Result<&[u32], GeneratorError>; // len = size * 7
  }
  ```

`Cargo.toml`: `crate-type = ["cdylib", "rlib"]`; зависимости `wasm-bindgen`, `rand_pcg`, `rand_core` (тот же major, что у `rand_pcg`) — без `getrandom`; `[profile.release] opt-level = "s"`. `Cargo.lock` коммитится.

`constants.rs` (значения из спеки/D13): `MAX_INSTRUMENTS = 50`, `MAX_BATCH_SIZE = 1000`, `START_PRICE_MIN_CENTS = 1_000`, `START_PRICE_MAX_CENTS = 50_000`, `STEP_MAX_FRACTION = 0.001`, `ANCHOR_PULL = 0.002`, `MIN_MID_CENTS = 100.0`, `SPREAD_MIN_CENTS = 1`, `SPREAD_MAX_CENTS = 4`, `BOOK_QTY_START_MIN = 100`, `BOOK_QTY_START_MAX = 1_000`, `BOOK_QTY_STEP = 40`, `TRADE_QTY_MIN = 1`, `TRADE_QTY_MAX = 500`.

Модель обновления — ровно шаги 1–6 из спеки §6 (`mid` в `f64`, наружу — целые). Случайные числа: `Pcg32::seed_from_u64(seed)`; диапазоны — свои хелперы поверх `next_u32()` (`range_inclusive(lo, hi)`, `unit_f64()`). Буфер `Vec<u32>` переиспользуется (`clear()` + `extend`/`push`, ёмкость под `MAX_BATCH_SIZE * 7`).

- [ ] **Step 1: Написать тесты в `market.rs` (`#[cfg(test)] mod tests`)**
  ```rust
  #[test] fn batch_has_requested_size()       // для 1, 100, 1000: next_batch(n).len() == n * 7
  #[test] fn rejects_invalid_instrument_count() // new(0, 1), new(51, 1) — Err; new(1, 1), new(50, 1) — Ok
  #[test] fn rejects_invalid_batch_size()     // next_batch(0), next_batch(1001) — Err
  #[test] fn generated_values_are_valid()     // Market::new(50, 42), 100 батчей по 1000:
      // index < 50; price > 0; bid >= 1; bid < ask; price == bid || price == ask;
      // TRADE_QTY_MIN <= qty <= TRADE_QTY_MAX
  #[test] fn prices_evolve_from_previous()    // Market::new(5, 7), 20 000 обновлений; для каждого инструмента
      // |bid_new − bid_prev| <= bid_prev * 0.005 + SPREAD_MAX_CENTS + 1
  #[test] fn state_carries_over_between_batches() // seed 9: [batch(10) ++ batch(10)] == batch(20) другого Market с тем же seed
  #[test] fn same_seed_same_output()          // две Market(5, 123) → одинаковые batch(1000); seed 124 → отличается
  #[test] fn every_instrument_eventually_trades() // Market(5, 3), batch(1000): все индексы 0..5 встречаются
  ```
- [ ] **Step 2:** `cargo test --manifest-path generator/Cargo.toml` → FAIL (нет реализации).
- [ ] **Step 3:** Реализовать `Market`, `GeneratorError`, константы.
- [ ] **Step 4:** `cargo test --manifest-path generator/Cargo.toml` → все 8 PASS.
- [ ] **Step 5: Commit** — `feat(generator): add seeded market model in Rust`.

---

### Task 3: Wasm-обёртка и подключение сборки

**Files:**
- Modify: `generator/src/lib.rs`, `package.json`, `angular.json`, `.gitignore` (+ `src/wasm/`)

**Interfaces:**
- Consumes: `Market`, `GeneratorError` (Task 2).
- Produces (JS API из `src/wasm/generator/generator.js`, `--target web`):
  ```rust
  #[wasm_bindgen] pub struct Generator { market: Market }
  #[wasm_bindgen] impl Generator {
      #[wasm_bindgen(constructor)] pub fn new(instrument_count: u32, seed: u32) -> Result<Generator, JsError>;
      pub fn next_batch(&mut self, size: u32) -> Result<u32, JsError>; // кол-во записанных u32 (= size * 7)
      pub fn batch_ptr(&self) -> *const u32;
  }
  // + сгенерированные default export init({ module_or_path }) → InitOutput с полем memory; Generator.free()
  ```
  В браузере `.wasm` доступен по URL `wasm/generator_bg.wasm` относительно корня приложения.

- [ ] **Step 1:** Реализовать `Generator` (ошибки `GeneratorError` → `JsError::new(&err.to_string())`).
- [ ] **Step 2: Скрипты.** `"build:wasm": "wasm-pack build generator --target web --release --out-dir ../src/wasm/generator --out-name generator"`, `"test:wasm": "cargo test --manifest-path generator/Cargo.toml"`, `"start": "npm run build:wasm && ng serve"`, `"build": "npm run build:wasm && ng build"`.
- [ ] **Step 3: Assets.** В `angular.json` (build → options → assets) добавить `{ "glob": "generator_bg.wasm", "input": "src/wasm/generator", "output": "wasm" }`.
- [ ] **Step 4: Проверка.** `npm run build` → существуют `src/wasm/generator/generator.js`, `generator.d.ts` и `dist/realtime-fintech-dashboard/browser/wasm/generator_bg.wasm`. `npm run test:wasm` → PASS.
- [ ] **Step 5: Commit** — `feat(generator): expose Generator to JS via wasm-bindgen`.

---

### Task 4: Общие контракты

**Files:**
- Create: `src/app/shared/settings.ts`, `messages.ts`, `instruments.ts`, `src/app/worker/batch-layout.ts`, `src/app/worker/snapshot-throttle.ts`
- Test: `src/app/shared/settings.spec.ts`, `instruments.spec.ts`, `src/app/worker/snapshot-throttle.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // settings.ts
  export interface ProducerSettings { instrumentCount: number; updatesPerBatch: number; batchIntervalMs: number; }
  export const DEFAULT_SETTINGS: ProducerSettings = { instrumentCount: 5, updatesPerBatch: 100, batchIntervalMs: 500 };
  export const SETTINGS_LIMITS: Record<keyof ProducerSettings, { min: number; max: number }>; // 1–50, 1–1000, 50–2000
  export function sameSettings(a: ProducerSettings, b: ProducerSettings): boolean;
  export function nominalRate(s: ProducerSettings): number; // updatesPerBatch * 1000 / batchIntervalMs
  // messages.ts
  export interface InstrumentMetrics { lastPriceCents: number | null; spreadCents: number | null; volume: number; vwapCents: number | null; imbalance: number | null; }
  export type WorkerCommand =
    | { type: 'start'; runId: number; settings: ProducerSettings }
    | { type: 'pause'; runId: number } | { type: 'resume'; runId: number } | { type: 'dispose' };
  export type WorkerEvent =
    | { type: 'ready' }
    | { type: 'snapshot'; runId: number; rows: InstrumentMetrics[]; tradesCounted: number }
    | { type: 'error'; runId: number | null; source: 'wasm' | 'worker'; message: string };
  // instruments.ts
  export const INSTRUMENT_SYMBOLS: readonly string[]; // ровно 50, см. ниже
  export function instrumentSymbol(index: number): string;
  export function emptyRows(count: number): InstrumentMetrics[]; // все null, volume 0
  // batch-layout.ts
  export const FIELDS_PER_UPDATE = 7;
  export const BatchField = { Instrument: 0, Price: 1, TradeQty: 2, Bid: 3, Ask: 4, BidQty: 5, AskQty: 6 } as const;
  // snapshot-throttle.ts
  export const DISPLAY_INTERVAL_MS = 250;
  export function snapshotEvery(batchIntervalMs: number, displayIntervalMs = DISPLAY_INTERVAL_MS): number;
  ```
  Тикеры (точный список, порядок важен):
  `ALFA BETA GAMA DLTA EPSI ZETA ETA THTA IOTA KAPA LMBD MU NU XI OMCR PI RHO SGMA TAU UPSL PHI CHI PSI OMGA ACRN BRCH CEDR DUNE ELMW FERN GROV HAZL IVYS JUNP KELP LARC MAPL NETL OAKS PINE QUIL REED SAGE TEAK UMBR VINE WILW XYLM YEWS ZINN`

- [ ] **Step 1: Тесты.**
  - `nominalRate(DEFAULT_SETTINGS)` → 200; `{1, 1, 2000}` → 0.5; `{50, 1000, 50}` → 20000.
  - `sameSettings` true для равных, false при отличии в любом поле.
  - `INSTRUMENT_SYMBOLS.length` = 50, все уникальны, длина ≤ 5, `[0]='ALFA'`, `[1]='BETA'`.
  - `emptyRows(3)` → 3 × `{ lastPriceCents: null, spreadCents: null, volume: 0, vwapCents: null, imbalance: null }`.
  - `snapshotEvery`: 50→5, 60→4, 100→3, 130→2, 150→2, 170→1, 200→1, 500→1, 600→1, 2000→1.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: add shared producer contracts`.

---

### Task 5: Агрегатор метрик

**Files:**
- Create: `src/app/worker/metrics-aggregator.ts`, `src/app/worker/testing/encode-updates.ts`
- Test: `src/app/worker/metrics-aggregator.spec.ts`

**Interfaces:**
- Consumes: `InstrumentMetrics`, `FIELDS_PER_UPDATE`, `BatchField` (Task 4).
- Produces:
  ```ts
  export class MetricsAggregator {
    constructor(instrumentCount: number);
    apply(batch: Uint32Array): void;           // читает поля по BatchField, без создания объектов на обновление
    snapshot(): { rows: InstrumentMetrics[]; tradesCounted: number };
  }
  // testing/encode-updates.ts
  export interface MarketUpdate { instrument: number; priceCents: number; tradeQuantity: number; bidCents: number; askCents: number; bidQuantity: number; askQuantity: number; }
  export function encodeUpdates(updates: MarketUpdate[]): Uint32Array;
  ```
  Отклонение от спеки §5.1: вместо декодера «7 чисел → объект» агрегатор читает поля по именованным смещениям `BatchField` — это сохраняет «без аллокаций на обновление» (D3); декодер для тестов — обратный `encodeUpdates`.

- [ ] **Step 1: Тесты.**
  - `worked example from the spec`: ALFA: (100.00$×10, bid 9996, ask 10000, 600/400), затем (102.00$×30, bid 10196, ask 10200, 600/400) → `lastPriceCents 10200`, `volume 40`, `vwapCents 10150`, `spreadCents 4`, `imbalance 0.2`, `tradesCounted 2`.
  - `starts empty`: новый агрегатор(3) → `rows` = `emptyRows(3)`, `tradesCounted 0`.
  - `imbalance is null when both book quantities are zero`.
  - `isolates instruments`: обновления только ALFA → строка BETA = пустая.
  - `keeps values for an instrument missing from a later batch`: батч 1 с ALFA и BETA, батч 2 только с ALFA → BETA как после батча 1.
  - `accumulates across batches`: volume и VWAP учитывают оба батча; `tradesCounted` = сумма размеров.
  - `snapshot returns copies`: изменение массива из `snapshot()` не влияет на следующий `snapshot()`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Реализовать (состояние — параллельные массивы/`Float64Array` на инструмент; `vwapCents = pv / volume` без округления).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(worker): aggregate market metrics per instrument`.

---

### Task 6: Движок воркера

**Files:**
- Create: `src/app/worker/producer-engine.ts`, `src/app/worker/testing/fake-scheduler.ts`
- Test: `src/app/worker/producer-engine.spec.ts`

**Interfaces:**
- Consumes: `WorkerCommand`, `WorkerEvent`, `ProducerSettings` (Task 4), `MetricsAggregator` (Task 5), `snapshotEvery` (Task 4).
- Produces:
  ```ts
  export interface BatchSource { nextBatch(size: number): Uint32Array; free(): void; }
  export interface Scheduler { setInterval(callback: () => void, ms: number): number; clearInterval(handle: number): void; }
  export interface EngineDeps {
    createSource(instrumentCount: number, seed: number): BatchSource;
    nextSeed(): number;                 // u32
    scheduler: Scheduler;
    post(event: WorkerEvent): void;
  }
  export class ProducerEngine { constructor(deps: EngineDeps); handle(command: WorkerCommand): void; }
  // testing/fake-scheduler.ts
  export class FakeScheduler implements Scheduler { tick(times?: number): void; readonly activeCount: number; readonly lastIntervalMs: number | null; }
  ```
  Поведение — таблица команд спеки §5.4. Исключение из `createSource`/`nextBatch` → таймер остановлен, `post({ type: 'error', runId, source: 'wasm', message: 'Generator stopped: <e.message>' })`.

- [ ] **Step 1: Тесты** (фейковый `BatchSource` возвращает `encodeUpdates` из N одинаковых обновлений и считает вызовы; `nextSeed` → 42).
  - `start creates a source with instrumentCount and seed and schedules batchIntervalMs`.
  - `each tick pulls updatesPerBatch updates`.
  - `publishes on every 5th batch at 50 ms` (5 тиков → 1 snapshot, 10 → 2) и `on every batch at 500 ms`.
  - `pause stops batches and publishes immediately` (снимок с текущим runId и итогами; дальнейшие `tick` ничего не вызывают).
  - `resume schedules a new interval, publishes nothing, keeps totals` (`tradesCounted` продолжает расти).
  - `start while paused runs a fresh run`: старый source `free()` вызван, новый создан, `tradesCounted` с нуля, таймер активен.
  - `ignores pause/resume for another runId`.
  - `reports generator failures`: `nextBatch` бросает → событие `error` с `source: 'wasm'`, `activeCount` = 0.
  - `dispose clears the timer and frees the source`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Реализовать `ProducerEngine` и `FakeScheduler`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(worker): drive batches, pause/resume and snapshot cadence`.

---

### Task 7: Точка входа воркера и источник из Wasm

**Files:**
- Create: `src/app/worker/wasm-batch-source.ts`, `src/app/worker/producer.worker.ts`, `tsconfig.worker.json`
- Modify: `angular.json` (`webWorkerTsConfig` для build и test), `tsconfig.app.json` (exclude `src/**/*.worker.ts`)
- Test: `src/app/worker/wasm-batch-source.spec.ts`

**Interfaces:**
- Consumes: `Generator`, `init` из `src/wasm/generator/generator.js` (Task 3); `ProducerEngine`, `BatchSource` (Task 6).
- Produces:
  ```ts
  export interface GeneratorHandle { next_batch(size: number): number; batch_ptr(): number; free(): void; }
  export class WasmBatchSource implements BatchSource {
    constructor(generator: GeneratorHandle, memory: { readonly buffer: ArrayBufferLike });
  }
  ```
  Воркер: `init({ module_or_path: new URL('wasm/generator_bg.wasm', <base>) })`, где `<base>` — каталог скрипта воркера (`new URL('.', self.location.href)`); при ошибке — `post({ type: 'error', runId: null, source: 'wasm', message: 'Generator failed to load: <e.message>' })`. Команды до готовности складываются в очередь и выполняются после `ready`. `nextSeed` — `crypto.getRandomValues(new Uint32Array(1))[0]`. Scheduler — `self.setInterval`/`self.clearInterval`. Конфигурация через `npx ng generate web-worker worker/producer --snippet=false`, затем заменить содержимое.

- [ ] **Step 1: Тест** `reads from the current memory buffer on every batch`: фейковая память, у которой между двумя вызовами `buffer` заменяется на новый `ArrayBuffer` с другими числами → второй `nextBatch` возвращает числа из нового буфера; длина = результат `next_batch`; `free()` проксируется.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Реализовать `WasmBatchSource` и `producer.worker.ts`.
- [ ] **Step 4:** `npm test` → PASS; `npm run build` → успех, в `dist/.../browser` есть worker-чанк и `wasm/generator_bg.wasm`.
- [ ] **Step 5: Commit** — `feat(worker): load the Wasm generator inside the web worker`.

---

### Task 8: LoggerService и ProducerService

**Files:**
- Create: `src/app/services/logger.service.ts`, `src/app/services/producer.service.ts`, `src/app/services/testing/fake-worker.ts`
- Test: `src/app/services/producer.service.spec.ts`

**Interfaces:**
- Consumes: всё из Task 4; `producer.worker.ts` (Task 7).
- Produces:
  ```ts
  export type LogSource = 'app' | 'worker' | 'wasm';
  @Injectable({ providedIn: 'root' }) export class LoggerService {
    info(source: LogSource, message: string, context?: Record<string, unknown>): void;
    warn(...same): void; error(...same): void;   // консоль, формат "[source] message" + context
  }
  export interface WorkerLike { postMessage(command: WorkerCommand): void; terminate(): void;
    onmessage: ((e: MessageEvent<WorkerEvent>) => void) | null; onerror: ((e: ErrorEvent) => void) | null; }
  export const PRODUCER_WORKER_FACTORY: InjectionToken<() => WorkerLike>;
  // default: () => new Worker(new URL('../worker/producer.worker', import.meta.url), { type: 'module' })
  export type ProducerStatus = 'initializing' | 'running' | 'paused' | 'error';
  @Injectable({ providedIn: 'root' }) export class ProducerService {
    readonly activeSettings: Signal<ProducerSettings>;
    readonly runId: Signal<number>;
    readonly status: Signal<ProducerStatus>;
    readonly rows: Signal<InstrumentMetrics[]>;
    readonly tradesCounted: Signal<number>;
    readonly errorMessage: Signal<string | null>;
    apply(settings: ProducerSettings): void;
    pause(): void; resume(): void; retry(): void;
  }
  // testing/fake-worker.ts
  export class FakeWorker implements WorkerLike { sent: WorkerCommand[]; terminated: boolean; emit(event: WorkerEvent): void; fail(message: string): void; }
  ```
  Поведение — спека §5.5 (runId начинается с 1; Apply в `error` = retry с новыми настройками; очистка через `ngOnDestroy`).

- [ ] **Step 1: Тесты** (factory возвращает новый `FakeWorker` на каждый вызов; `LoggerService` — spy).
  - `starts run 1 with defaults`: отправлен `start {runId: 1, settings: DEFAULT_SETTINGS}`; `status` = initializing; `rows` = `emptyRows(5)`; `tradesCounted` 0.
  - `becomes running on ready`.
  - `applies snapshots of the current run`.
  - `apply resets and drops results from the previous run`: после snapshot run 1 → `apply({12,200,250})` → runId 2, `rows` = `emptyRows(12)`, `activeSettings` обновлён, отправлен `start` run 2; затем `emit` snapshot run 1 → `rows` всё ещё пустые.
  - `apply before ready keeps initializing` и `apply while paused resumes generation` (status running).
  - `pause and resume send commands and update status`.
  - `error event switches to error and logs`; `worker onerror does the same`.
  - `retry replaces the worker`: старый `terminated`, factory вызвана снова, новый получил `start` с новым runId и `activeSettings`, статус initializing.
  - `apply in error state replaces the worker with new settings`.
  - `destroy disposes and terminates the worker` (`TestBed.resetTestingModule()` → отправлен `dispose`, `terminated`).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: add producer service with run lifecycle and logger`.

---

### Task 9: Pipes форматирования

**Files:**
- Create: `src/app/pipes/cents.pipe.ts`, `src/app/pipes/imbalance.pipe.ts`
- Test: `src/app/pipes/cents.pipe.spec.ts`, `src/app/pipes/imbalance.pipe.spec.ts`

**Interfaces:**
- Produces: `CentsPipe` (`cents`): `number | null → string`; `ImbalancePipe` (`imbalance`): `number | null → string`. Оба standalone, pure.

- [ ] **Step 1: Тесты.**
  - cents: `10200` → `$102.00`; `10150` → `$101.50`; `10150.4` → `$101.50`; `4` → `$0.04`; `123456789` → `$1,234,567.89`; `null` → `—`.
  - imbalance: `0.2` → `+0.20`; `-0.35` → `−0.35` (U+2212); `0` → `0.00`; `-0.001` → `0.00`; `1` → `+1.00`; `-1` → `−1.00`; `null` → `—`.
- [ ] **Step 2:** FAIL. **Step 3:** Реализовать (`Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` создаётся один раз на модуль). **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat: add price and imbalance formatting pipes`.

---

### Task 10: Каркас приложения и стили

**Files:**
- Create: `src/app/ui/status-indicator.component.ts` (+ `.scss`)
- Modify: `src/index.html` (Manrope: `<link>` Google Fonts, weights 400–800; `<title>Market feed</title>`), `src/styles.scss` (токены Global Constraints, фон `--ink`, шрифт, `tabular-nums`, `:focus-visible` с `--mint`, `prefers-reduced-motion`), `src/app/app.component.*`, `src/app/config/app.routes.ts`
- Test: `src/app/app.component.spec.ts`, `src/app/ui/status-indicator.component.spec.ts`

**Interfaces:**
- Consumes: `ProducerStatus` (Task 8).
- Produces:
  - Маршруты (`loadComponent`): `''` → redirect `'dashboard'`; `'dashboard'` → `DashboardComponent` (`title: 'Live market'`), `'settings'` → `SettingsComponent` (`title: 'Producer settings'`), `'**'` → redirect `'dashboard'`. Компоненты страниц в этой задаче — заглушки, наполняются в Task 11/12.
  - `StatusIndicatorComponent` (`app-status-indicator`): inputs `status: ProducerStatus`; текст `Initializing | Running | Paused | Error`, точка с классом статуса (running — пульсирует, отключается при reduced motion).
  - Каркас по макету B: рельс 64px (знак-градиент, иконки Dashboard/Settings с `title`/`aria-label`, `routerLinkActive`), справа `<router-outlet>`.

- [ ] **Step 1: Тесты.** Рельс содержит ссылки `aria-label="Dashboard"` → `/` и `aria-label="Settings"` → `/settings`; `StatusIndicator` рендерит `Paused` для `'paused'` и класс `paused`.
- [ ] **Step 2:** FAIL. **Step 3:** Реализовать. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(ui): add app shell, theme tokens and status indicator`.

---

### Task 11: Дашборд

**Files:**
- Create/Modify: `src/app/dashboard/dashboard.component.{ts,html,scss}`, `src/app/dashboard/price-trend.directive.ts`, `src/app/pipes/instrument.pipe.ts`
- Test: `dashboard.component.spec.ts`, `price-trend.directive.spec.ts`, `instrument.pipe.spec.ts`

**Interfaces:**
- Consumes: `ProducerService` (Task 8), `nominalRate`, `instrumentSymbol` (Task 4), pipes (Task 9), `StatusIndicatorComponent` (Task 10).
- Produces: `InstrumentPipe` (`instrument`): индекс → тикер. `PriceTrendDirective` (`[appPriceTrend]`): цвет last price по последнему движению, без вспышки (DECISIONS D24), `track $index` (D25).

Разметка и копирайт — по макету B (`docs/superpowers/mockups/dashboard.html`): плашка `Live market`; stats `Status`, `Run` (`#N`), `Nominal rate` (`200 / s`, DecimalPipe `1.0-1`), `Trades counted` (с разделителями); кнопка `Pause`/`Resume` (disabled в initializing и error); таблица `Instrument | Last price | Spread | Volume | VWAP | Imbalance`; imbalance — число + шкала 84px с риской в центре (ширина `|v| × 50%`, вправо `--mint`, влево `--rose`); при ошибке — баннер `<errorMessage> Retry to start a new run.` с кнопкой `Retry`. Таблица в контейнере с `overflow-x: auto`, фиксированные ширины колонок (`table-layout: fixed`). `@for` с `track $index`.

- [ ] **Step 1: Тесты** (фейковый `ProducerService` на сигналах через `{ provide: ProducerService, useValue: fake }`).
  - `renders one row per instrument with placeholders`: 5 строк `ALFA…EPSI`, в цене/спреде/VWAP/imbalance `—`, объём `0`.
  - `renders formatted metrics`: строка с примером из задания → `$102.00`, `$0.04`, `40`, `$101.50`, `+0.20`.
  - `shows run stats`: `#3`, `200 / s`, `Trades counted` `3,400`.
  - `pause button`: в running текст `Pause` → клик вызывает `pause()`; в paused `Resume` → `resume()`; в initializing и error — disabled.
  - `error banner`: в error видна строка `errorMessage`, `Retry` вызывает `retry()`.
- [ ] **Step 2:** FAIL. **Step 3:** Реализовать. **Step 4:** PASS.
- [ ] **Step 5: Ручная проверка.** `npm start` → на `http://localhost:4200` таблица оживает (~4 обновления/с), Pause/Resume работают, переход на Settings и обратно не сбрасывает данные, в DevTools → Sources один воркер.
- [ ] **Step 6: Commit** — `feat(dashboard): live market table with pause control`.

---

### Task 12: Страница настроек

**Files:**
- Create/Modify: `src/app/settings/settings.component.{ts,html,scss}`, `src/app/settings/settings-form.ts`
- Test: `settings.component.spec.ts`, `settings-form.spec.ts`

**Interfaces:**
- Consumes: `ProducerService`, `ProducerSettings`, `DEFAULT_SETTINGS`, `SETTINGS_LIMITS`, `sameSettings`, `nominalRate` (Tasks 4, 8), `StatusIndicatorComponent`.
- Produces:
  ```ts
  export function wholeNumberInRange(min: number, max: number): ValidatorFn;
  // errors: { required: true } | { wholeNumber: true } | { range: { min, max } }; значение — строка; trim; /^\d+$/
  export function settingsErrorMessage(errors: ValidationErrors | null): string | null;
  // "Enter a value." | "Enter a whole number." | "Must be between 1 and 50." (числа через toLocaleString('en-US'): "1,000", "2,000")
  export function parseSettings(value: Record<keyof ProducerSettings, string>): ProducerSettings | null;
  ```

По макету B (`docs/superpowers/mockups/settings.html`): плашка `Producer settings` + `StatusIndicator` + `run #N`; слева три поля (`<input inputmode="numeric">`, label, описание, диапазон): `Instrument count` — «How many instruments to generate data for.», `Updates per batch` — «Market updates in each batch, across all instruments.», `Batch interval, ms` — «Requested time between batches.»; ошибка под полем после blur или попытки Apply; кнопки `Apply` (disabled, если форма невалидна или `sameSettings(parsed, activeSettings)`; `title="Change a setting to apply it"` в этом случае) и `Reset to defaults` (только меняет форму); справа панель `What Apply will change`: `Active run | After Apply` по трём настройкам + `Nominal rate, updates/s`, изменённые значения — `--mint`, невалидные — `—`; подпись «Apply starts a new run: values and totals on the dashboard reset to zero.»; после Apply — сообщение «Run #N started: X instruments, Y updates every Z ms. Dashboard values were reset.». Форма инициализируется из `activeSettings` при создании компонента. `Apply` вызывает `producer.apply(parsed)`.

- [ ] **Step 1: Тесты.**
  - Валидатор (`whole-number validator`): `""`→required; `"0"`,`"51"`→range; `"2.5"`,`"1e3"`,`"+5"`,`"-1"`,`"abc"`→wholeNumber; `" 12 "`→null; `"007"`→null; `"1"`,`"50"`→null (для 1–50).
  - `settingsErrorMessage` для каждой ошибки; `{range:{min:1,max:1000}}` → `Must be between 1 and 1,000.`
  - Компонент: `starts from the active run and Apply is disabled`; `enables Apply after a change and disables it when changed back`; `shows a field error only after blur`; `apply calls the service with parsed numbers and shows the confirmation`; `reset restores defaults without applying`; `re-created component shows the active run, not discarded edits`; `comparison panel marks changed values and nominal rate` (`12` и `400` с классом `changed`).
- [ ] **Step 2:** FAIL. **Step 3:** Реализовать (typed `FormGroup<{ instrumentCount: FormControl<string>; ... }>`, `updateOn: 'change'`, состояние формы в сигнал через `toSignal(form.valueChanges)`). **Step 4:** PASS.
- [ ] **Step 5: Ручная проверка.** `npm start`: Apply с новыми значениями → дашборд обнулён и показывает новые инструменты; Apply из паузы запускает генерацию.
- [ ] **Step 6: Commit** — `feat(settings): validated producer settings with apply preview`.

---

### Task 13: CI/CD и README

**Files:**
- Create: `.github/workflows/pipeline.yml`, `README.md`

**Interfaces:**
- Consumes: npm-скрипты `build`, `build:wasm`, `test`, `test:wasm`.

Пайплайн (спека §9): `name: Realtime Fintech Dashboard`; на уровне workflow `permissions: contents: read`; триггеры push `develop`, pull_request, workflow_dispatch. Jobs:
- `cache-deps`: `actions/checkout@v7` → `actions/setup-node@v7` (`node-version-file: .node-version`) → `npm ci --ignore-scripts` → `actions/cache/save@v6` (`node_modules`, ключ `${{ github.repository }}-${{ hashFiles('package-lock.json') }}`).
- `deploy` (needs `[cache-deps, build-wasm]`; `if: github.ref_name == 'develop' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')`; `permissions: pages: write, id-token: write`; `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`; `concurrency: { group: pages, cancel-in-progress: false }`): checkout → setup-node → `actions/cache/restore@v6` (`fail-on-cache-miss: true`) → `actions/download-artifact@v8` (Wasm из `build-wasm`) → `npm run build:app -- --base-href=/realtime-fintech-dashboard/` → `cp dist/realtime-fintech-dashboard/browser/index.html dist/realtime-fintech-dashboard/browser/404.html` (SPA-фолбэк, DECISIONS D20) → `actions/upload-pages-artifact@v5` (`path: dist/realtime-fintech-dashboard/browser`) → `actions/deploy-pages@v5` (`id: deployment`). Без ветки `gh-pages`: Pages Source = «GitHub Actions» (DECISIONS D20).
- `build-wasm` (без needs): rust toolchain + rust-cache + wasm-pack → `npm run build:wasm` → `actions/upload-artifact@v7` (`src/wasm/generator`); `deploy` и `test` (needs `[cache-deps, build-wasm]`) скачивают его `actions/download-artifact@v8` и зовут `npm run build:app` / `npm run test:app` — Rust в них не ставится. `test`: checkout → setup-node → cache restore → download-artifact → `npm run test:app`.
- `test-wasm` (needs `[cache-deps]`): checkout → rust toolchain + rust-cache → `npm run test:wasm`.
- Все шаги с `name`; `needs` — массивом; сторонние action по SHA (DECISIONS D26); deploy также по `workflow_dispatch` на `develop`.

README (английский): что это (одним абзацем), live demo `https://dkozachenko.github.io/realtime-fintech-dashboard/`, требования (Node 22, Rust stable + `wasm32-unknown-unknown`, wasm-pack 0.15.1, Chrome/Chromium), команды `npm ci`, `npm start`, `npm run build`, `npm run test:wasm`, `npm test` (с `CHROME_BIN`), схема архитектуры (диаграмма из спеки §5 в ASCII), раздел тестов → какие файлы что покрывают, ссылка на `DECISIONS.md`, деплой.

- [ ] **Step 1:** Написать workflow и README.
- [ ] **Step 2: Проверка локально.** `npx -y yaml-lint .github/workflows/pipeline.yml` (или `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/pipeline.yml'))"`) → без ошибок; `npm run build -- --base-href=/realtime-fintech-dashboard/` → в `dist/.../browser/index.html` `<base href="/realtime-fintech-dashboard/">`.
- [ ] **Step 3: Commit** — `ci: build, test and deploy to GitHub Pages` и `docs: add README`.
- [ ] **Step 4: Передать пользователю:** Settings → Pages → Source = «GitHub Actions» (окружение `github-pages` уже разрешает `develop`); после её push проверить вкладку Actions; открыть демо и убедиться, что таблица оживает (Wasm грузится под base-href), F5 на `/settings` работает (404.html).

---

### Task 14: Линтеры

**Files:**
- Create: `configs/eslint/` (eslint.config.ts + angular, javascript, typescript, import, prettier), `configs/stylelint/stylelint.config.js`, `configs/rust/rustfmt.toml`
- Modify: `package.json`, `.github/workflows/pipeline.yml`

- [ ] **Step 1:** `npx ng add @angular-eslint/schematics@19` (версия под Angular 19); stylelint + `stylelint-config-standard-scss` (точные версии). Скрипты `lint`, `stylelint` (`'src/**/*.scss'`), `lint:rust` (`cargo fmt --manifest-path generator/Cargo.toml --check && cargo clippy --manifest-path generator/Cargo.toml -- -D warnings`).
- [ ] **Step 2:** `npm run lint && npm run stylelint && npm run lint:rust` — исправить найденное, пока не будет чисто.
- [ ] **Step 3:** Jobs `lint` (ESLint + stylelint) и `lint-rust` (`components: rustfmt, clippy`; `npm run lint:rust`) в pipeline (needs cache-deps, параллельно deploy/test).
- [ ] **Step 4: Commit** — `chore: add ESLint, stylelint and clippy checks`.
