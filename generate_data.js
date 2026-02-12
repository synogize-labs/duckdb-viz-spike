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
