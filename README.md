# DuckDB-WASM Visualization Spike

Static GitHub Pages spike: SQL editor + paginated table + chart builder (Vega-Lite), fully browser-based with DuckDB-WASM.

## Files

- `index.html`
- `app.js`
- `data/manifest.json`
- `data/sample_sales.csv`
- `data/sample_events.csv`
- `generate_data.js`

## Run Locally

Serve the repository with any static web server and open the served URL for `index.html`.

Examples:

- VS Code Live Server extension
- Python: `python3 -m http.server 8000` then open `http://localhost:8000`

## GitHub Pages Deploy

1. Push this repository to GitHub.
2. In GitHub repository settings, enable Pages.
3. Set source to deploy from the default branch root.
4. Open the published Pages URL.

All runtime paths are relative (`./...`) for Pages compatibility.

## Regenerate Sample Data

From repository root:

```bash
node generate_data.js
```
