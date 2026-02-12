
# Codex Task Breakdown — Single-file `app.js` (DuckDB-WASM Query + Table + Chart Builder, GitHub Pages, CDN-only)

Implement the spike per `SPEC.md` (latest draft), but **collapse all JS into a single file**:
- `/index.html`
- `/app.js`  ✅ (ALL logic here)
- `/data/manifest.json` + CSVs
- `/README.md`
No npm, no bundler, no build. Runs entirely in-browser on GitHub Pages.

References:
- DuckDB-WASM browser instantiation pattern (jsDelivr bundles + selectBundle + Blob Worker): https://duckdb.org/docs/stable/clients/wasm/instantiation
- Vega-Lite embedding via vega-embed: https://vega.github.io/vega-lite/usage/embed.html

---

## 0) Files to create (exact paths)

Create these files:
- `/index.html`
- `/app.js`
- `/data/manifest.json`
- `/data/sample_sales.csv`
- `/data/sample_events.csv`
- `/README.md`

Create this file for data generation (Node-only, dev utility; NOT required at runtime):
- `/generate_data.js`

Do NOT create:
- `/js/`
- `/vendor/`
- `package.json`

Acceptance:
- Runtime is static-only: `index.html`, `app.js`, and `/data/*` are sufficient to run in GitHub Pages.
- `generate_data.js` is optional but should exist to reproducibly generate the CSVs.

---

## 1) Data setup

### 1.1 Create `/data/manifest.json`
```json
{ "files": ["sample_sales.csv", "sample_events.csv"] }
```

### 1.2 Generate sample data (approx 1,000 rows each) using Node.js

Goal: generate deterministic synthetic data for the spike and commit the resulting CSVs under `/data/`.

#### 1.2.1 Create `/generate_data.js`

Create a Node script at repo root: `/generate_data.js` with the exact contents below.

```js
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

// Deterministic PRNG
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------- sample_sales.csv --------
function generateSampleSalesCSV(rowCount = 1000, seed = 42) {
  const rand = mulberry32(seed);

  const regions = ["APAC", "EMEA", "NA"];
  const products = ["Widget", "Gadget", "Gizmo", "Doohickey"];
  const channels = ["Online", "Retail", "Partner"];

  const unitPrices = {
    Widget: 19.99,
    Gadget: 49.0,
    Gizmo: 99.0,
    Doohickey: 9.5,
  };

  const startDate = new Date("2026-01-01");

  const rows = [];
  rows.push("order_id,order_date,region,product,channel,quantity,unit_price,amount");

  for (let i = 1; i <= rowCount; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + Math.floor(rand() * 60));

    const region = regions[Math.floor(rand() * regions.length)];
    const product = products[Math.floor(rand() * products.length)];
    const channel = channels[Math.floor(rand() * channels.length)];

    const quantity = 1 + Math.floor(rand() * 10);
    const unitPrice = unitPrices[product];
    const amount = (quantity * unitPrice).toFixed(2);

    rows.push(
      [
        1000 + i,
        date.toISOString().split("T")[0],
        region,
        product,
        channel,
        quantity,
        unitPrice.toFixed(2),
        amount,
      ].join(",")
    );
  }

  return rows.join("\n");
}

// -------- sample_events.csv --------
function generateSampleEventsCSV(rowCount = 1000, seed = 99) {
  const rand = mulberry32(seed);

  const orgs = ["Synogize", "Acme", "Globex"];
  const plans = { Synogize: "Pro", Acme: "Free", Globex: "Team" };
  const eventTypes = ["login", "query_run", "chart_apply", "export_csv", "query_error"];
  const devices = ["web", "mobile"];

  const startDate = new Date("2026-01-01T00:00:00Z");

  const rows = [];
  rows.push("event_id,event_ts,user_id,org,plan,event_type,device,duration_ms");

  for (let i = 1; i <= rowCount; i++) {
    const ts = new Date(startDate);
    ts.setMinutes(startDate.getMinutes() + Math.floor(rand() * 60 * 24 * 30));

    const org = orgs[Math.floor(rand() * orgs.length)];
    const plan = plans[org];
    const eventType = eventTypes[Math.floor(rand() * eventTypes.length)];
    const device = devices[Math.floor(rand() * devices.length)];

    const duration =
      eventType === "login"
        ? 800 + Math.floor(rand() * 700)
        : 300 + Math.floor(rand() * 1200);

    rows.push(
      [
        `e${String(i).padStart(4, "0")}`,
        ts.toISOString(),
        `u${String(1 + Math.floor(rand() * 200)).padStart(3, "0")}`,
        org,
        plan,
        eventType,
        device,
        duration,
      ].join(",")
    );
  }

  return rows.join("\n");
}

// -------- write files --------
function main() {
  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

  fs.writeFileSync(path.join(dataDir, "sample_sales.csv"), generateSampleSalesCSV(1000));
  fs.writeFileSync(path.join(dataDir, "sample_events.csv"), generateSampleEventsCSV(1000));

  // Also ensure manifest exists and matches
  const manifestPath = path.join(dataDir, "manifest.json");
  const manifest = { files: ["sample_sales.csv", "sample_events.csv"] };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log("Generated:");
  console.log("- data/sample_sales.csv");
  console.log("- data/sample_events.csv");
  console.log("- data/manifest.json");
}

main();
```

#### 1.2.2 Run the generator (local dev)

From repo root:

```bash
node generate_data.js
```

#### 1.2.3 Commit generated files

Commit:

* `/data/sample_sales.csv`
* `/data/sample_events.csv`
* `/data/manifest.json`
* `/generate_data.js`

Acceptance:

* `fetch('./data/manifest.json')` works
* `fetch('./data/sample_sales.csv')` works
* `fetch('./data/sample_events.csv')` works

---

## 2) `index.html` (static UI + CDN libs)

### 2.1 UI elements (IDs must match exactly)

Create a minimal HTML page containing:

Query:

* `<textarea id="sqlEditor"></textarea>`
* `<button id="runBtn">Run</button>`

Status:

* `<div id="status"></div>`

Toggle:

* `<button id="toggleTable">Table</button>`
* `<button id="toggleChart">Chart</button>`

Table:

* `<div id="tableContainer"></div>`

Chart:

* `<div id="chartContainer" style="display:none"></div>`

Pagination:

* `<button id="prevPageBtn">Prev</button>`
* `<span id="pageIndicator"></span>`
* `<button id="nextPageBtn">Next</button>`

Acceptance:

* Page loads and all elements exist.

### 2.2 Add Vega libs via CDN script tags (pin versions)

Add script tags in this order:

```html
<script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
<script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
<script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
```

Acceptance:

* `window.vegaEmbed` exists.

### 2.3 Load `/app.js` as ES module

```html
<script type="module" src="./app.js"></script>
```

Acceptance:

* `app.js` executes on load.

### 2.4 Minimal CSS (inline OK)

Add minimal styles in `<style>`:

* monospace for SQL editor
* table styling
* `.error` class for status

Acceptance:

* Table readable; errors visible.

---

## 3) Implement `/app.js` (ALL logic here)

### 3.1 In `app.js`, import DuckDB-WASM ESM from jsDelivr

At top of `app.js`:

* `import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';`

Acceptance:

* Module imports successfully.

---

## 4) DuckDB init (must use bundle selection + Blob Worker)

### 4.1 Implement `async function initDuckDB()`

Implement the exact approach:

1. Create logger:

* `const logger = new duckdb.ConsoleLogger();`

2. Get bundles + select:

* `const bundles = duckdb.getJsDelivrBundles();`
* `const bundle = await duckdb.selectBundle(bundles);`

3. Create worker using Blob + importScripts:

* `const workerUrl = URL.createObjectURL(new Blob([ \`importScripts("${bundle.mainWorker}");` ], { type: 'text/javascript' }));`
* `const worker = new Worker(workerUrl);`

4. Instantiate DB:

* `const db = new duckdb.AsyncDuckDB(logger, worker);`
* `await db.instantiate(bundle.mainModule, bundle.pthreadWorker);`

5. Create one connection:

* `const conn = await db.connect();`

6. Store globals:

* `window.__duckdb = { db, conn };` (or module-level vars)

Acceptance:

* On load, status shows “DuckDB ready”.
* A trivial query like `SELECT 1 AS x;` works.

---

## 5) CSV loading from manifest (registerFileBuffer + read_csv_auto)

### 5.1 Implement `async function loadCSVsFromManifest()`

Steps:

1. Fetch manifest:

* `const manifest = await fetch('./data/manifest.json').then(r => r.json());`
* Validate `manifest.files` is an array.

2. For each filename:

* Fetch CSV:

  * `const buf = await fetch('./data/' + filename).then(r => r.arrayBuffer());`
* Register with DuckDB:

  * `await db.registerFileBuffer(filename, new Uint8Array(buf));`
* Derive view name:

  * strip `.csv`
  * replace non `[A-Za-z0-9_]` with `_`
* Create view:

  ```sql
  CREATE OR REPLACE VIEW <viewName> AS
  SELECT * FROM read_csv_auto('<filename>', header=true);
  ```

3. Return list of view names.

Acceptance:

* After load, `SELECT COUNT(*) FROM <viewName>` works for each view.

---

## 6) Query execution utilities

### 6.1 Implement `async function runQuery(sql)`

Execute on DuckDB connection and return:

* `columns: string[]`
* `rows: any[][]`

Acceptance:

* For any query, returns correct columns/rows.

### 6.2 Implement `async function runPagedQuery(userSql, page, pageSize)`

Compute `offset = (page - 1) * pageSize`

Execute:

```sql
SELECT *
FROM ( <USER_SQL> ) AS q
LIMIT <pageSize> OFFSET <offset>
```

Return `{ columns, rows }`.

Acceptance:

* Next/Prev returns different subsets.

---

## 7) UI rendering functions (in app.js)

Implement:

* `setStatus(text, isError=false)`
* `setMode(mode)`
* `renderTable(columns, rows)`
* `renderPagination(page)`

Acceptance:

* Rendering works for arbitrary result sets.

---

## 8) State model (in app.js)

Define `state`:

* `currentSql`
* `pageSize=50`
* `currentPage=1`
* `mode='table'`
* `views`
* `lastResult`
* `chartConfig` with:

  * `chartType: 'line'|'bar'|'stacked_bar'|'pie'`
  * `xField`
  * `yField`
  * `agg: 'sum'|'avg'|'min'|'max'|'count'`
  * `groupField`
  * `stackField`

Acceptance:

* State updates on run/toggle/pagination/apply.

---

## 9) Boot sequence

On `DOMContentLoaded`:

1. init DuckDB
2. load CSVs from manifest
3. set default SQL to `SELECT * FROM <first view> LIMIT 100;`
4. show Ready status

Acceptance:

* Page loads to Ready with default SQL.

---

## 10) Run + Pagination + Toggle + Chart Builder

(Keep the remainder of the original tasks as-is: Run button, pagination, toggle logic, chart builder UI, aggregation SQL generation, Vega-Lite spec generation, vegaEmbed rendering, error handling, and README instructions.)

---

## Final Acceptance Test (manual)

1. Open GitHub Pages URL
2. Confirm status: “Ready. Loaded: …”
3. Click Run on default SQL → table shows rows
4. Click Next/Prev → pagination changes rows
5. Toggle Chart → builder appears
6. Configure bar chart:

   * x = region (or event_type), agg = count, apply
7. Chart renders via Vega

