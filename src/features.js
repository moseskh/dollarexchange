// Switches the /admin dashboard turns on and off without a deploy. A switch is on unless the
// settings table says otherwise. App switches are written into the page as it's served
// (worker.js), so the app knows them when it starts; the bot's are read by the scheduled job.

export const FEATURES = [
  {
    key: "market", area: "app", label: "Iraq market average",
    help: "The usdiqd.com card on the Dollar tab. While it's off, nothing is fetched from usdiqd.com and the gold chart converts at today's Baghdad rate.",
  },
  { key: "marketHistory", area: "app", parent: "market", label: "Dollar price history chart", help: "The chart inside the market card." },
  { key: "gold", area: "app", label: "Gold tab", help: "While it's off, the app shows only the dollar rates, without tabs." },
  { key: "goldHistory", area: "app", parent: "gold", label: "Gold price history chart", help: "The 21 karat chart on the Gold tab." },
  { key: "share", area: "app", label: "Share button", help: "Sharing the rates from the app into a Telegram chat." },
  {
    key: "summaries", area: "bot", label: "Daily summaries",
    help: "The bot's daily rates message. Subscriptions are kept while it's off; a summary due while it's off is skipped, not sent late.",
  },
  {
    key: "alerts", area: "bot", label: "Price alerts",
    help: "Saved alerts are kept while it's off and checked again once it's back on.",
  },
];
const KEYS = new Set(FEATURES.map((f) => f.key));

// Page loads and scheduled runs read the table at most every 30 seconds per Worker instance.
const CACHE_MS = 30_000;
let cache = null; // { at, rows: Map(key -> { enabled, updatedAt }) }

async function readRows(env, { fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  try {
    const { results } = await env.DB.prepare("SELECT key, enabled, updated_at FROM settings").all();
    const rows = new Map(results.map((r) => [r.key, { enabled: Boolean(r.enabled), updatedAt: r.updated_at }]));
    cache = { at: Date.now(), rows };
    return rows;
  } catch (err) {
    if (cache) return cache.rows; // keep the last known switches if the database is unreachable
    throw err;
  }
}

// { key: boolean } for every switch in `area` ("app" or "bot"), or all of them.
export async function getFeatures(env, area) {
  const rows = await readRows(env);
  return Object.fromEntries(FEATURES.filter((f) => !area || f.area === area).map((f) => [f.key, rows.get(f.key)?.enabled ?? true]));
}

// Every switch with its label and state, for the dashboard.
export async function listFeatures(env) {
  const rows = await readRows(env, { fresh: true });
  return FEATURES.map((f) => ({ ...f, enabled: rows.get(f.key)?.enabled ?? true, updatedAt: rows.get(f.key)?.updatedAt ?? null }));
}

export async function setFeature(env, key, enabled) {
  if (!KEYS.has(key) || typeof enabled !== "boolean") throw new RangeError("unknown switch or value");
  await env.DB.prepare(
    `INSERT INTO settings (key, enabled, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
  ).bind(key, enabled ? 1 : 0, Date.now()).run();
  return listFeatures(env);
}
