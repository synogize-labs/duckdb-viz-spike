You are operating inside a local git repository that contains SPEC.md,  tasks.md and prompt.md.

You are sandboxed to this repository only.


EXECUTION POLICY:
This repo includes codex/rules/spike.rules. Do not request to run blocked commands or use shell wrappers.
Only request command execution for: node generate_data.js (and expect it to require approval).

========================
STRICT SAFETY CONSTRAINTS
========================

You MUST obey the following constraints:

1) FILE SYSTEM SAFETY
- You may ONLY read and write files inside the current repository directory.
- You may NOT delete any files or directories.
- You may NOT modify any files outside this repository.
- If you need to overwrite an existing file (index.html, app.js, README.md, generate_data.js, data/*):
    - First create a backup copy next to it with extension ".bak"
      (example: app.js.bak)
    - Then write the new version.
- You may NOT rename directories.
- You may NOT move files outside the repo.

2) COMMAND EXECUTION SAFETY
- You may NOT execute any shell commands except:
      node generate_data.js
- You may NOT run:
      git
      rm
      mv
      cp
      npm
      npx
      yarn
      pnpm
      curl
      wget
      brew
      apt
      sudo
      bash scripts
      background processes
- You may NOT install dependencies.
- You may NOT create package.json or node_modules.
- You may NOT spawn any subprocess except the single allowed Node command.

3) NETWORK SAFETY
- You may NOT make any network write operations.
- CDN script tags in index.html are allowed.
- You may NOT download or install runtime dependencies.

4) RUNTIME TOOLING SAFETY
- No bundlers.
- No build tools.
- No /vendor directory.
- No package.json.
- No TypeScript.
- No transpilation.
- No external CSS frameworks.

5) SCOPE SAFETY
- Everything must run in the browser at runtime.
- Node.js is allowed ONLY for generate_data.js to create CSV files.
- Do not introduce additional scripts, utilities, or automation beyond what tasks.md requires.

If any step would violate these rules, STOP and explain why instead of proceeding.

========================
PROJECT CONTEXT
========================

This repository is a static GitHub Pages spike for:

DuckDB-WASM SQL query editor + paginated table + chart builder
with Vega-Lite rendering.

SPEC.md defines the functional requirements.
tasks.md defines the implementation requirements.
These documents are the single source of truth.

Do not invent new requirements.
Do not simplify or remove required behavior.

========================
IMPLEMENTATION STEPS
========================

Execute the following steps IN ORDER:

1) Read SPEC.md and tasks.md completely.

2) Create required files if they do not exist:
   - index.html
   - app.js  (single-file implementation)
   - README.md
   - generate_data.js
   - data/ (directory)
   - data/manifest.json

3) Implement index.html:
   - Include all DOM element IDs required by tasks.md.
   - Load Vega, Vega-Lite, Vega-Embed via CDN script tags.
   - Load app.js via:
         <script type="module" src="./app.js">
   - Include minimal inline CSS for:
         table formatting
         SQL editor
         error styling
   - Use only relative paths (./...) to support GitHub Pages.

4) Implement app.js:
   - Import DuckDB-WASM from jsDelivr using +esm.
   - Use required initialization pattern:
         getJsDelivrBundles()
         selectBundle()
         Blob Worker using importScripts(bundle.mainWorker)
         instantiate(bundle.mainModule, bundle.pthreadWorker)
         single connection
   - Load CSVs using:
         fetch('./data/manifest.json')
         registerFileBuffer
         read_csv_auto(header=true)
         create views matching filenames
   - Implement SQL editor + Run button.
   - Implement paginated table using LIMIT/OFFSET wrapper.
   - Implement Table/Chart toggle (default Table).
   - Implement chart builder:
         chart types: line, bar, stacked_bar, pie
         xField, yField, agg, groupField, stackField
   - Push aggregation to DuckDB using:
         WITH q AS (<USER_SQL>) ...
   - Generate Vega-Lite JSON spec.
   - Render using:
         vegaEmbed(target, spec, { actions: false })
   - Add explicit error handling:
         SQL errors
         chart config validation errors
   - Ensure all file paths are relative.

5) Implement generate_data.js exactly per tasks.md:
   - Deterministic ~1000-row synthetic generators
   - Write:
         data/sample_sales.csv
         data/sample_events.csv
         data/manifest.json

6) Execute ONLY:
      node generate_data.js

7) Confirm:
   - data/sample_sales.csv exists
   - data/sample_events.csv exists
   - data/manifest.json references both

8) Implement README.md:
   - How to run locally via static server
   - How to deploy to GitHub Pages
   - How to regenerate data via:
         node generate_data.js

========================
FINAL OUTPUT REQUIREMENTS
========================

When complete:

- Provide a concise summary of:
      files created
      files modified
      backup files created (.bak)
- Confirm explicitly:
      No files were deleted
      No commands were executed except `node generate_data.js`
- Do not include unnecessary narrative explanation.

Proceed.
