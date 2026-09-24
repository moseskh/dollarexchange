// Upstream prices, shared by the app's API routes and the bot.

const RATES_UPSTREAM = "https://iraqborsa.com/borsa-api/summary.php";
// Free, keyless gold spot price (USD per troy ounce). Its terms ask for no more than a
// request every few seconds, so the edge cache below keeps us to about one a minute.
const GOLD_UPSTREAM = "https://api.gold-api.com/price/XAU";

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
