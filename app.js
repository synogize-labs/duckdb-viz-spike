import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm";

let db = null;
let conn = null;

const state = {
  currentSql: "",
  pageSize: 50,
  currentPage: 1,
  mode: "table",
  views: [],
  lastResult: { columns: [], rows: [], fieldTypes: {} },
  chartConfig: {
    chartType: "line",
    xField: "",
    yField: "",
    agg: "sum",
    groupField: "",
    stackField: ""
  }
};

const el = {};
let resizeTimer = null;

function setStatus(text, isError = false) {
  el.status.textContent = text;
  el.status.className = isError ? "error" : "";
}

function setChartError(text) {
  el.chartError.textContent = text || "";
}

function clearChart() {
  el.chartTarget.innerHTML = "";
}

async function initDuckDB() {
  const logger = new duckdb.ConsoleLogger();
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
  );
  const worker = new Worker(workerUrl);
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();
  URL.revokeObjectURL(workerUrl);
  window.__duckdb = { db, conn };
}

function toViewName(filename) {
  const noExt = filename.replace(/\.csv$/i, "");
  const normalized = noExt.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_");
  return normalized.toLowerCase();
}

async function loadCSVsFromManifest() {
  const manifestResp = await fetch("./data/manifest.json");
  if (!manifestResp.ok) {
    throw new Error(`Failed to fetch manifest: HTTP ${manifestResp.status}`);
  }
  const manifest = await manifestResp.json();
  if (!manifest || !Array.isArray(manifest.files)) {
    throw new Error("Invalid manifest.json: expected { files: string[] }");
  }

  const views = [];
  for (const filename of manifest.files) {
    const fileResp = await fetch(`./data/${filename}`);
    if (!fileResp.ok) {
      throw new Error(`Failed to fetch CSV ${filename}: HTTP ${fileResp.status}`);
    }
    const arrayBuffer = await fileResp.arrayBuffer();
    await db.registerFileBuffer(filename, new Uint8Array(arrayBuffer));

    const viewName = toViewName(filename);
    const safeView = `"${viewName.replace(/"/g, "\"\"")}"`;
    const safeFile = filename.replace(/'/g, "''");
    await conn.query(
      `CREATE OR REPLACE VIEW ${safeView} AS SELECT * FROM read_csv_auto('${safeFile}', header=true);`
    );
    views.push(viewName);
  }

  return views;
}

function tableFromArrow(result) {
  const columns = result.schema.fields.map((field) => field.name);
  const fieldTypes = {};
  for (const field of result.schema.fields) {
    const arrowType = String(field.type);
    fieldTypes[field.name] = {
      arrowType,
      vegaType: mapArrowTypeToVegaType(arrowType)
    };
  }
  const rows = result.toArray().map((row) => {
    const json = row.toJSON();
    return columns.map((col) => json[col]);
  });
  return { columns, rows, fieldTypes };
}

async function runQuery(sql) {
  const result = await conn.query(sql);
  return tableFromArrow(result);
}

function normalizeUserSql(sql) {
  return String(sql).trim().replace(/;+$/g, "").trim();
}

async function runPagedQuery(userSql, page, pageSize) {
  const offset = (page - 1) * pageSize;
  const baseSql = normalizeUserSql(userSql);
  const pagedSql = `SELECT * FROM (${baseSql}) AS q LIMIT ${pageSize} OFFSET ${offset}`;
  return runQuery(pagedSql);
}

function renderTable(columns, rows) {
  if (!columns.length) {
    el.tableContainer.innerHTML = "<p>No columns returned.</p>";
    return;
  }

  const header = `<tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const body = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`
        )
        .join("")
    : `<tr><td colspan="${columns.length}">No rows.</td></tr>`;

  el.tableContainer.innerHTML = `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
}

function renderPagination(page) {
  el.pageIndicator.textContent = `Page ${page}`;
  el.prevPageBtn.disabled = page <= 1;
  const rowCount = state.lastResult.rows.length;
  el.nextPageBtn.disabled = rowCount < state.pageSize;
}

function setMode(mode) {
  state.mode = mode;
  const tableMode = mode === "table";
  el.tableContainer.style.display = tableMode ? "block" : "none";
  el.chartContainer.style.display = tableMode ? "none" : "block";
  el.paginationControls.style.display = tableMode ? "flex" : "none";
}

function setSelectOptions(selectEl, columns, includeEmpty = true) {
  const options = [];
  if (includeEmpty) {
    options.push(`<option value="">(none)</option>`);
  }
  for (const col of columns) {
    options.push(`<option value="${escapeHtml(col)}">${escapeHtml(col)}</option>`);
  }
  selectEl.innerHTML = options.join("");
}

function ensureRequiredChoiceOption(selectEl, label) {
  const hasEmpty = Array.from(selectEl.options).some((opt) => opt.value === "");
  if (!hasEmpty) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = label;
    selectEl.insertBefore(opt, selectEl.firstChild);
  } else {
    const firstEmpty = Array.from(selectEl.options).find((opt) => opt.value === "");
    if (firstEmpty) {
      firstEmpty.textContent = label;
    }
  }
  selectEl.value = "";
}

function hydrateChartFieldSelectors(columns) {
  setSelectOptions(el.xField, columns, true);
  setSelectOptions(el.yField, columns, true);
  setSelectOptions(el.groupField, columns, true);
  setSelectOptions(el.stackField, columns, true);

  el.xField.value = "";
  el.yField.value = "";
  el.groupField.value = "";
  el.stackField.value = "";
  state.chartConfig.xField = "";
  state.chartConfig.yField = "";
  state.chartConfig.groupField = "";
  state.chartConfig.stackField = "";
}

function escapeIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, "\"\"")}"`;
}

function buildAggregationSql(userSql, cfg) {
  const baseSql = normalizeUserSql(userSql);
  const x = escapeIdentifier(cfg.xField);
  const y = cfg.yField ? escapeIdentifier(cfg.yField) : null;
  const g = cfg.groupField ? escapeIdentifier(cfg.groupField) : null;
  const s = cfg.stackField ? escapeIdentifier(cfg.stackField) : null;

  const valueExpr =
    cfg.agg === "count"
      ? "CAST(COUNT(*) AS DOUBLE)"
      : `CAST(${cfg.agg.toUpperCase()}(${y}) AS DOUBLE)`;

  if (cfg.chartType === "stacked_bar") {
    return `
      WITH q AS (${baseSql})
      SELECT ${x} AS x, ${s} AS stack, ${valueExpr} AS value
      FROM q
      GROUP BY ${x}, ${s}
      ORDER BY ${x};
    `;
  }

  if (cfg.chartType === "pie") {
    return `
      WITH q AS (${baseSql})
      SELECT ${x} AS category, ${valueExpr} AS value
      FROM q
      GROUP BY ${x}
      ORDER BY value DESC;
    `;
  }

  if (g) {
    return `
      WITH q AS (${baseSql})
      SELECT ${x} AS x, ${g} AS g, ${valueExpr} AS value
      FROM q
      GROUP BY ${x}, ${g}
      ORDER BY ${x};
    `;
  }

  return `
    WITH q AS (${baseSql})
    SELECT ${x} AS x, ${valueExpr} AS value
    FROM q
    GROUP BY ${x}
    ORDER BY ${x};
  `;
}

function buildVegaLiteSpec(cfg) {
  const xMeta = state.lastResult.fieldTypes[cfg.xField];
  const xType = xMeta ? xMeta.vegaType : "nominal";
  const categoryType = xType === "temporal" ? "temporal" : "nominal";
  const barXType = xType === "temporal" || xType === "quantitative" ? "ordinal" : xType;
  const xAxisTitle = cfg.xField;
  const yAxisTitle = cfg.yField || "value";
  const baseSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: 900,
    height: 460,
    autosize: { type: "fit-x", contains: "padding" },
    padding: { left: 10, right: 10, top: 12, bottom: 8 },
    config: {
      view: { stroke: null },
      axis: {
        labelFontSize: 12,
        titleFontSize: 13,
        gridColor: "#e6edf8",
        tickColor: "#c8d5ea",
        domainColor: "#b7c8e4"
      },
      legend: {
        labelFontSize: 12,
        titleFontSize: 13,
        orient: "bottom",
        direction: "horizontal",
        labelLimit: 140,
        symbolLimit: 40
      }
    }
  };

  if (cfg.chartType === "pie") {
    return {
      ...baseSpec,
      mark: {
        type: "arc",
        innerRadius: 58,
        stroke: "#ffffff",
        strokeWidth: 1.2
      },
      encoding: {
        theta: { field: "value", type: "quantitative" },
        color: { field: "category", type: categoryType }
      }
    };
  }

  if (cfg.chartType === "stacked_bar") {
    return {
      ...baseSpec,
      mark: { type: "bar", cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 },
      encoding: {
        x: { field: "x", type: barXType, scale: { range: "width" }, axis: { title: xAxisTitle } },
        y: { field: "value", type: "quantitative", axis: { title: yAxisTitle } },
        color: { field: "stack", type: "nominal" }
      }
    };
  }

  const base = {
    ...baseSpec,
    mark:
      cfg.chartType === "line"
        ? { type: "line", point: true, strokeWidth: 2.4 }
        : { type: "bar", cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 },
    encoding: {
      x: {
        field: "x",
        type: cfg.chartType === "line" ? xType : barXType,
        scale: { range: "width" },
        axis: { title: xAxisTitle }
      },
      y: { field: "value", type: "quantitative", axis: { title: yAxisTitle } }
    }
  };
  if (cfg.groupField) {
    base.encoding.color = { field: "g", type: "nominal" };
  }
  return base;
}

function getChartPixelWidth() {
  const getInnerWidth = (node) => {
    if (!node) {
      return 0;
    }
    const rect = node.getBoundingClientRect();
    if (!rect.width) {
      return 0;
    }
    const styles = window.getComputedStyle(node);
    const paddingX = parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0");
    return Math.max(0, rect.width - paddingX);
  };

  const resultsInner = getInnerWidth(el.resultsBox);
  const targetPaddingX =
    parseFloat(window.getComputedStyle(el.chartTarget).paddingLeft || "0") +
    parseFloat(window.getComputedStyle(el.chartTarget).paddingRight || "0");
  const available = resultsInner > 0 ? resultsInner - targetPaddingX - 2 : 760;
  const constrainedWidth = Math.max(240, Math.floor(available));
  return Math.min(constrainedWidth, 1200);
}

function getChartPixelHeight() {
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
  const resultsHeight = el.resultsBox ? el.resultsBox.clientHeight : 0;
  const basedOnViewport = Math.round(viewportHeight * 0.56);
  const basedOnResults = resultsHeight > 0 ? Math.round(resultsHeight * 0.62) : 0;
  const preferred = Math.max(basedOnViewport, basedOnResults, 320);
  return Math.max(320, Math.min(preferred, 720));
}

function toVegaSafeValue(value) {
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function mapArrowTypeToVegaType(arrowType) {
  const t = String(arrowType).toLowerCase();
  if (t.includes("date") || t.includes("time") || t.includes("timestamp")) {
    return "temporal";
  }
  if (
    t.includes("int") ||
    t.includes("uint") ||
    t.includes("float") ||
    t.includes("double") ||
    t.includes("decimal")
  ) {
    return "quantitative";
  }
  return "nominal";
}

function isQuantitativeArrowType(arrowType) {
  return mapArrowTypeToVegaType(arrowType) === "quantitative";
}

function validateChartConfig(cfg, fieldTypes) {
  const allowedChartTypes = new Set(["line", "bar", "stacked_bar", "pie"]);
  const allowedAggs = new Set(["sum", "avg", "min", "max", "count"]);

  if (!cfg.chartType) {
    throw new Error("Choose a chart type.");
  }
  if (!allowedChartTypes.has(cfg.chartType)) {
    throw new Error("Invalid chart type.");
  }
  if (!cfg.agg) {
    throw new Error("Choose an aggregation.");
  }
  if (!allowedAggs.has(cfg.agg)) {
    throw new Error("Invalid aggregation.");
  }
  if (!cfg.xField) {
    throw new Error("X field is required.");
  }
  if (!fieldTypes[cfg.xField]) {
    throw new Error(`X field not found in result set: ${cfg.xField}`);
  }
  if (cfg.agg !== "count" && !cfg.yField) {
    throw new Error("Y field is required for non-count aggregations.");
  }
  if (cfg.yField && !fieldTypes[cfg.yField]) {
    throw new Error(`Y field not found in result set: ${cfg.yField}`);
  }
  if (cfg.agg !== "count" && !isQuantitativeArrowType(fieldTypes[cfg.yField].arrowType)) {
    throw new Error("Y field must be numeric for sum/avg/min/max.");
  }
  if (cfg.groupField && !fieldTypes[cfg.groupField]) {
    throw new Error(`Group field not found in result set: ${cfg.groupField}`);
  }
  if (cfg.stackField && !fieldTypes[cfg.stackField]) {
    throw new Error(`Stack field not found in result set: ${cfg.stackField}`);
  }
  if (cfg.chartType === "stacked_bar" && !cfg.stackField) {
    throw new Error("Stack field is required for stacked_bar.");
  }
  if (cfg.chartType !== "stacked_bar" && cfg.stackField) {
    throw new Error("Stack field can only be set for stacked_bar.");
  }
  if (cfg.chartType === "stacked_bar" && cfg.groupField) {
    throw new Error("Group field is not supported for stacked_bar.");
  }
  if (cfg.chartType === "pie" && cfg.groupField) {
    throw new Error("Group field is not supported for pie.");
  }
}

async function runCurrentPage() {
  const result = await runPagedQuery(state.currentSql, state.currentPage, state.pageSize);
  state.lastResult = result;
  renderTable(result.columns, result.rows);
  renderPagination(state.currentPage);
  hydrateChartFieldSelectors(result.columns);
}

async function applyChart() {
  try {
    setChartError("");
    clearChart();
    const cfg = {
      chartType: el.chartType.value,
      xField: el.xField.value,
      yField: el.yField.value,
      agg: el.agg.value,
      groupField: el.groupField.value,
      stackField: el.stackField.value
    };
    state.chartConfig = cfg;

    validateChartConfig(cfg, state.lastResult.fieldTypes);
    const sql = buildAggregationSql(state.currentSql, cfg);
    const aggResult = await runQuery(sql);
    if (!aggResult.rows.length) {
      throw new Error("Chart query returned no rows.");
    }
    const columns = aggResult.columns;
    const values = aggResult.rows.map((row) => {
      const obj = {};
      for (let i = 0; i < columns.length; i += 1) {
        obj[columns[i]] = toVegaSafeValue(row[i]);
      }
      return obj;
    });

    const spec = buildVegaLiteSpec(cfg);
    spec.width = getChartPixelWidth();
    spec.height = getChartPixelHeight();
    spec.data = { values };
    await window.vegaEmbed(el.chartTarget, spec, { actions: false });
  } catch (err) {
    clearChart();
    setChartError(`Chart error: ${err.message}`);
  }
}

function bindEvents() {
  el.runBtn.addEventListener("click", async () => {
    const sql = normalizeUserSql(el.sqlEditor.value);
    if (!sql) {
      setStatus("SQL cannot be empty.", true);
      return;
    }
    state.currentSql = sql;
    state.currentPage = 1;
    try {
      await runCurrentPage();
      setStatus("Query executed.");
    } catch (err) {
      setStatus(`SQL error: ${err.message}`, true);
    }
  });

  el.prevPageBtn.addEventListener("click", async () => {
    if (state.currentPage <= 1 || !state.currentSql) {
      return;
    }
    state.currentPage -= 1;
    try {
      await runCurrentPage();
      setStatus("Query executed.");
    } catch (err) {
      state.currentPage += 1;
      setStatus(`SQL error: ${err.message}`, true);
    }
  });

  el.nextPageBtn.addEventListener("click", async () => {
    if (!state.currentSql || state.lastResult.rows.length < state.pageSize) {
      return;
    }
    state.currentPage += 1;
    try {
      await runCurrentPage();
      setStatus("Query executed.");
    } catch (err) {
      state.currentPage -= 1;
      setStatus(`SQL error: ${err.message}`, true);
    }
  });

  el.toggleTable.addEventListener("click", () => {
    setMode("table");
  });

  el.toggleChart.addEventListener("click", () => {
    setMode("chart");
  });

  el.applyChartBtn.addEventListener("click", async () => {
    if (!state.currentSql) {
      setChartError("Run a SQL query first.");
      return;
    }
    await applyChart();
  });

  window.addEventListener("resize", () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(async () => {
      if (state.mode === "chart" && state.currentSql) {
        await applyChart();
      }
    }, 150);
  });
}

function cacheDom() {
  el.sqlEditor = document.getElementById("sqlEditor");
  el.runBtn = document.getElementById("runBtn");
  el.status = document.getElementById("status");
  el.resultsBox = document.getElementById("resultsBox");
  el.toggleTable = document.getElementById("toggleTable");
  el.toggleChart = document.getElementById("toggleChart");
  el.tableContainer = document.getElementById("tableContainer");
  el.chartContainer = document.getElementById("chartContainer");
  el.paginationControls = document.getElementById("paginationControls");
  el.prevPageBtn = document.getElementById("prevPageBtn");
  el.pageIndicator = document.getElementById("pageIndicator");
  el.nextPageBtn = document.getElementById("nextPageBtn");

  el.chartType = document.getElementById("chartType");
  el.xField = document.getElementById("xField");
  el.yField = document.getElementById("yField");
  el.agg = document.getElementById("agg");
  el.groupField = document.getElementById("groupField");
  el.stackField = document.getElementById("stackField");
  el.applyChartBtn = document.getElementById("applyChartBtn");
  el.chartError = document.getElementById("chartError");
  el.chartTarget = document.getElementById("chartTarget");
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function boot() {
  cacheDom();
  bindEvents();
  renderPagination(1);
  setMode("table");
  setStatus("Initializing DuckDB...");

  try {
    await initDuckDB();
    state.views = await loadCSVsFromManifest();

    if (!state.views.length) {
      throw new Error("No CSV views loaded from manifest.");
    }

    state.currentSql = `SELECT * FROM ${escapeIdentifier(state.views[0])} LIMIT 100;`;
    el.sqlEditor.value = state.currentSql;

    ensureRequiredChoiceOption(el.chartType, "(select chart type)");
    ensureRequiredChoiceOption(el.agg, "(select aggregation)");

    setStatus(`Ready. Loaded: ${state.views.join(", ")}`);
  } catch (err) {
    setStatus(`Initialization error: ${err.message}`, true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  boot();
});
