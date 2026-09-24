// Upstream prices, shared by the app's API routes and the bot.

const RATES_UPSTREAM = "https://iraqborsa.com/borsa-api/summary.php";
// Free, keyless gold spot price (USD per troy ounce). Its terms ask for no more than a
// request every few seconds, so the edge cache below keeps us to about one a minute.
const GOLD_UPSTREAM = "https://api.gold-api.com/price/XAU";
// Gold price history, as daily averages in USD per ounce. It needs a free API key
// (GOLD_API_KEY) and allows 10 requests an hour, so the scheduled job fetches it into D1
// at most hourly and the app reads it from there.
const GOLD_HISTORY_UPSTREAM = "https://api.gold-api.com/history";
const GOLD_HISTORY_CACHE_KEY = "gold_history";
const GOLD_HISTORY_DAYS = 70; // the longest chart range, 10 weeks
const GOLD_HISTORY_REFRESH_MS = 60 * 60_000; // today's average moves during the day
const GOLD_HISTORY_RETRY_MS = 15 * 60_000;
const GOLD_HISTORY_KARAT = 21; // the karat most bought in Iraq
// Iraq-wide parallel-market average and its gap from the official rate, updated every few minutes.
// Its responses ask for 60s caching (Cache-Control: max-age=60), which we match.
const MARKET_UPSTREAM = "https://usdiqd.com/api/rates";
// Price history for the same market. Ranges: 12h (14 days, every 12 hours), 1d (60 days,
// daily), 1w (weekly). Its responses ask for 5-minute caching.
const MARKET_HISTORY_UPSTREAM = "https://usdiqd.com/api/history";
export const HISTORY_RANGES = new Set(["12h", "1d", "1w"]);

export const CITY_KEYS = ["b", "s", "n"]; // Baghdad, Basra, Erbil
export const KARATS = [24, 21, 18];
const MITHQAL_GRAMS = 5;
const TROY_OUNCE_GRAMS = 31.1034768;

const UPSTREAM_HEADERS = { Accept: "application/json", "User-Agent": "BorsaMiniApp/1.0" };

export async function fetchRates() {
  const res = await fetch(RATES_UPSTREAM, {
    headers: UPSTREAM_HEADERS,
    // Cache at the edge for 30s so many users opening the app don't hammer the source.
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`upstream returned ${res.status}`);
  const data = await res.json();
  if (!CITY_KEYS.every((k) => data[k] && data[k].sell && data[k].buy)) {
    throw new Error("unexpected upstream response");
  }
  return data;
}

export async function fetchGold() {
  const res = await fetch(GOLD_UPSTREAM, {
    headers: UPSTREAM_HEADERS,
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`gold upstream returned ${res.status}`);
  const data = await res.json();
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("unexpected gold response");
  return { price, updatedAt: data.updatedAt ?? null };
}

// Trimmed to what the app shows. usdiqd.com's own site hides buy/sell (its "one price"
// policy), and its "buy" is the higher number, the opposite of iraqborsa's labels. So
// the two sides are mapped by value: the higher price is our sell (بيع), the lower our
// buy (شراء), matching the city cards.
export async function fetchMarket() {
  const res = await fetch(MARKET_UPSTREAM, {
    headers: UPSTREAM_HEADERS,
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`market upstream returned ${res.status}`);
  const data = await res.json();
  const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const m = data.market || {};
  const mid = num(m.mid);
  if (data.status !== "ok" || !(mid > 0)) throw new Error("unexpected market response");
  const sides = [num(m.buy), num(m.sell)].filter((v) => v > 0);
  return {
    updatedAt: data.updated_at ?? null,
    mid,
    sell: sides.length === 2 ? Math.max(...sides) : null,
    buy: sides.length === 2 ? Math.min(...sides) : null,
    spread: num(m.spread),
    spreadPct: num(m.spread_pct),
    gapPct: num(data.gap?.vs_official_pct),
    gapAbs: num(data.gap?.vs_official_abs),
    // Upstream reports the change per $100; the app works per dollar.
    change: num(data.change?.per_100) == null ? null : num(data.change.per_100) / 100,
    changePct: num(data.change?.pct),
  };
}

// Trimmed to [{ t: ms, mid }] in time order, since the chart plots the middle price.
export async function fetchMarketHistory(tf) {
  if (!HISTORY_RANGES.has(tf)) throw new RangeError(`unsupported range: ${tf}`);
  const res = await fetch(`${MARKET_HISTORY_UPSTREAM}?tf=${tf}`, {
    headers: UPSTREAM_HEADERS,
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`history upstream returned ${res.status}`);
  const data = await res.json();
  const points = (Array.isArray(data.points) ? data.points : [])
    .map((p) => ({ t: Date.parse(p.t), mid: Number(p.mid) }))
    .filter((p) => Number.isFinite(p.t) && p.mid > 0)
    .sort((a, b) => a.t - b.t);
  if (points.length < 2) throw new Error("not enough history");
  return { tf, points };
}

// Called by the scheduled job every 5 minutes; fetches only when the stored copy is an hour
// old, and waits 15 minutes after a failure.
export async function refreshGoldHistory(env) {
  if (!env.GOLD_API_KEY) return;
  const now = Date.now();
  const row = await env.DB.prepare("SELECT fetched_at, tried_at FROM cache WHERE key = ?1").bind(GOLD_HISTORY_CACHE_KEY).first();
  if (row && (now - (row.fetched_at ?? 0) < GOLD_HISTORY_REFRESH_MS || now - row.tried_at < GOLD_HISTORY_RETRY_MS)) return;

  let points;
  try {
    points = await fetchGoldHistoryUpstream(env.GOLD_API_KEY, now);
  } catch (err) {
    await env.DB.prepare(
      `INSERT INTO cache (key, tried_at, error) VALUES (?1, ?2, ?3)
       ON CONFLICT (key) DO UPDATE SET tried_at = excluded.tried_at, error = excluded.error`,
    ).bind(GOLD_HISTORY_CACHE_KEY, now, err.message).run();
    throw err;
  }
  await env.DB.prepare(
    `INSERT INTO cache (key, value, fetched_at, tried_at, error) VALUES (?1, ?2, ?3, ?3, NULL)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at,
       tried_at = excluded.tried_at, error = NULL`,
  ).bind(GOLD_HISTORY_CACHE_KEY, JSON.stringify(points), now).run();
}

async function fetchGoldHistoryUpstream(apiKey, now) {
  const end = Math.floor(now / 1000);
  const params = new URLSearchParams({
    symbol: "XAU",
    startTimestamp: String(end - (GOLD_HISTORY_DAYS + 1) * 86_400),
    endTimestamp: String(end),
    groupBy: "day",
    aggregation: "avg",
    orderBy: "asc",
  });
  const res = await fetch(`${GOLD_HISTORY_UPSTREAM}?${params}`, { headers: { ...UPSTREAM_HEADERS, "x-api-key": apiKey } });
  const body = await res.text();
  if (!res.ok) throw new Error(`gold history upstream returned ${res.status}: ${body.slice(0, 200)}`);
  let rows;
  try {
    rows = JSON.parse(body);
  } catch {
    throw new Error(`gold history upstream sent invalid JSON: ${body.slice(0, 200)}`);
  }
  // Rows look like { day: "2026-07-01", avg_price: 4200.5 }.
  const points = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ t: Date.parse(r.day), oz: Number(r.avg_price) }))
    .filter((p) => Number.isFinite(p.t) && p.oz > 0)
    .sort((a, b) => a.t - b.t);
  if (points.length < 2) throw new Error(`unexpected gold history response: ${body.slice(0, 200)}`);
  return points;
}

// The stored gold history as the app charts it: 21 karat per mithqal in dinars. The city
// rates have no history, so each day converts at that day's Iraq market average (daily
// points cover 60 days, weekly ones reach further back).
export async function fetchGoldHistory(env) {
  const row = await env.DB.prepare("SELECT value, fetched_at FROM cache WHERE key = ?1").bind(GOLD_HISTORY_CACHE_KEY).first();
  if (!row?.value) throw new Error("gold history not loaded yet");
  const [daily, weekly] = await Promise.all([
    fetchMarketHistory("1d"),
    fetchMarketHistory("1w").catch(() => ({ points: [] })),
  ]);
  const rates = [...daily.points, ...weekly.points];
  const points = [];
  for (const p of JSON.parse(row.value)) {
    let nearest = null;
    for (const r of rates) if (!nearest || Math.abs(r.t - p.t) < Math.abs(nearest.t - p.t)) nearest = r;
    if (!nearest || Math.abs(nearest.t - p.t) > 8 * 86_400_000) continue;
    points.push({ t: p.t, mid: Math.round(goldUsd(p.oz, GOLD_HISTORY_KARAT) * nearest.mid) });
  }
  if (points.length < 2) throw new Error("not enough gold history");
  return { karat: GOLD_HISTORY_KARAT, fetchedAt: row.fetched_at, points };
}

// USD price of one Iraqi mithqal (5 g) of gold at the given karat.
export function goldUsd(ouncePrice, karat) {
  return (ouncePrice / TROY_OUNCE_GRAMS) * MITHQAL_GRAMS * (karat / 24);
}

// The dinar value uses Baghdad's dollar sell rate, as in the app.
export const goldRate = (rates) => Number(rates?.b?.sell) || null;

// Lowest sell = cheapest place to buy dollars; highest buy = best place to sell them.
export function bestCities(rates, kind) {
  const values = CITY_KEYS.map((k) => Number(rates[k][kind]));
  const target = kind === "sell" ? Math.min(...values) : Math.max(...values);
  const keys = CITY_KEYS.filter((k) => Number(rates[k][kind]) === target);
  return keys.length === CITY_KEYS.length ? new Set() : new Set(keys);
}
