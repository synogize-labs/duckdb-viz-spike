# Spike: Result Set Visualization (Table + Chart Builder)
## DuckDB-WASM + Vega/Vega-Lite (Browser-only, GitHub Pages Compatible)

## Goal
Build a **fully static, browser-only** spike that runs on **GitHub Pages** with **no backend, no npm, and no build step**, and that:

- Loads **CSV files from a `/data` directory in the GitHub repo**
- Provides a **SQL query editor** backed by **DuckDB-WASM**
- Displays results as a **paginated table**
- Offers a **Table / Chart** toggle (default: Table)
- Includes a **basic chart builder** that:
  - Supports **line, bar, stacked bar, pie**
  - Lets the user select X, Y, aggregation, and grouping
  - Generates **Vega-Lite specs**
  - Renders charts using **Vega (via vega-embed)**
- Executes **entirely in the browser**

This is a spike: optimize for simplicity, determinism, and end-to-end feasibility.

---

## Deployment Constraints (Explicit)
- Must run on **GitHub Pages**
- Must be **pure static hosting**
- Must work with **relative paths** under `/<repo-name>/`
- Must not require:
  - Node.js at runtime
  - npm/yarn/pnpm
  - a build or bundling step

---

## Non-goals (for spike)
- Auth, persistence, saved dashboards
- Large-scale datasets or performance tuning
- Advanced chart configuration
- Multi-table joins beyond what the user writes in SQL
- Full schema/type inference UX

---

## Technical Approach Summary
- **DuckDB-WASM** executes SQL directly in the browser
- CSVs are fetched from `/data` and registered into DuckDB’s virtual filesystem
- The UI consists of:
  1. SQL Query Editor
  2. Run button
  3. Results area with Table | Chart toggle
- Query execution:
  - Uses the user SQL verbatim
  - Wraps it for pagination using `LIMIT / OFFSET`
- Chart builder:
  - Treats the user query as a virtual table via `WITH q AS (...)`
  - Pushes aggregation back to DuckDB (default)
- Chart rendering:
  - Vega-Lite spec generation
  - Rendered via `vega-embed`

---

## Repo Layout (Static, No Build)
```

/
├── index.html
├── js/
│   ├── app.js              # main app logic
│   ├── duckdb.js           # DuckDB init + helpers
│   ├── charts.js           # Vega-Lite spec builder
│   └── ui.js               # UI wiring
├── data/
│   ├── manifest.json
│   ├── sample_sales.csv
│   └── sample_events.csv
└── vendor/
├── vega.min.js
├── vega-lite.min.js
├── vega-embed.min.js

```

All JS files are **native ES modules** loaded via `<script type="module">`.

---

## Dependencies (No npm)
Loaded via CDN **or** committed under `/vendor`:

- DuckDB-WASM (ESM)
- Vega
- Vega-Lite
- Vega-Embed

### DuckDB-WASM (validated pattern)
Use the **jsDelivr ESM + bundle selection + Blob worker** pattern proven to work on GitHub Pages.

---

## DuckDB-WASM Initialization (Required Pattern)

### Why this pattern
- Works on GitHub Pages
- Avoids worker path issues
- Automatically selects threaded or non-threaded bundles
- No COOP/COEP required for small CSVs

### Required steps
1. Import DuckDB-WASM as an ES module from CDN
2. Call `getJsDelivrBundles()`
3. Select bundle via `selectBundle(...)`
4. Create Worker via `Blob + importScripts`
5. Instantiate DuckDB
6. Open a single connection

### Responsibilities
Expose:
- `initDuckDB()`
- `loadCSVsFromManifest()`
- `runPagedQuery(sql, page, pageSize)`
- `runAggregationQuery(sql)`

---

## Data Source Requirements
- CSVs live under `/data`
- CSVs are **small** (spike assumption)
- Headers included
- UTF-8 encoding

---

## CSV Discovery (Required)
Browsers cannot list directories.

### Use a manifest
`/data/manifest.json`
```json
{
  "files": ["sample_sales.csv", "sample_events.csv"]
}
````

### Load flow

For each file in the manifest:

1. `fetch('./data/<file>.csv')`
2. Convert to `Uint8Array`
3. `db.registerFileBuffer('<file>.csv', buffer)`
4. Create a DuckDB view:

   ```sql
   CREATE VIEW sample_sales AS
   SELECT * FROM read_csv_auto('sample_sales.csv', header=true);
   ```

### Naming convention

* View name = CSV filename without extension
* Normalize to snake_case

---

## Query Editor Specs

### UI

* `<textarea>` SQL editor (CodeMirror optional, not required)
* Buttons:

  * Run
* Status line:

  * Loaded tables
  * Query errors

### Behavior

On Run:

1. Validate SQL
2. Store as current query
3. Reset pagination
4. Execute paged query

---

## Result Set: Table View

### Pagination

* Page size: 50
* Controls: Prev / Next

### SQL wrapping

```sql
SELECT *
FROM ( <USER_SQL> ) AS q
LIMIT {pageSize}
OFFSET {(page-1)*pageSize}
```

### Optional total count

```sql
SELECT COUNT(*) FROM ( <USER_SQL> ) AS q
```

(skip if slow)

---

## Results Toggle

* Segmented control: **Table | Chart**
* Default: Table
* Toggle does not re-run base query

---

## Chart Builder Specs

### Supported charts

* Line
* Bar
* Stacked bar
* Pie

### User inputs

* Chart type
* X field
* Y field
* Aggregation: `sum | avg | min | max | count`
* Group-by (optional)
* Stack-by (required for stacked bar)

### Data model

Charts always operate on:

```sql
WITH q AS ( <USER_SQL> )
SELECT ...
FROM q
```

No direct coupling to raw CSV tables.

---

## Aggregation Pushdown (Default)

### Line / Bar

```sql
WITH q AS ( <USER_SQL> )
SELECT
  x,
  g,
  AGG(y) AS value
FROM q
GROUP BY x, g
ORDER BY x;
```

### Stacked Bar

```sql
WITH q AS ( <USER_SQL> )
SELECT
  x,
  s,
  AGG(y) AS value
FROM q
GROUP BY x, s
ORDER BY x;
```

### Pie

```sql
WITH q AS ( <USER_SQL> )
SELECT
  x AS category,
  AGG(y) AS value
FROM q
GROUP BY x
ORDER BY value DESC;
```

### COUNT behavior

If `count`:

```sql
COUNT(*) AS value
```

---

## Vega-Lite Spec Generation

### Line / Bar

* `x`: nominal
* `y`: quantitative
* `color`: optional grouping

### Stacked Bar

* `color` encodes stack dimension

### Pie

* `theta`: value
* `color`: category

Specs are generated as JSON and rendered via:

```js
vegaEmbed(container, spec, { actions: false });
```

---

## GitHub Pages Compatibility Notes

* Use **relative paths** (`./data/...`)
* Avoid absolute `/` paths
* Do not rely on directory listing
* Default to **non-threaded DuckDB bundles**
* COOP/COEP is **optional**, not required for spike

---

## Acceptance Criteria

### Must-have

* Runs entirely in browser
* Deployable on GitHub Pages
* No npm or build step
* SQL against CSVs via DuckDB-WASM
* Paginated table results
* Table / Chart toggle
* Chart builder with Vega-Lite output

### Nice-to-have

* Vega spec preview
* Copy-to-clipboard
* Sensible defaults

---

## Proven Reference

DuckDB-WASM initialization and static deployment model validated against a known working GitHub Pages implementation using the same bundle-selection and worker bootstrap strategy .

---


