// Serves the mini app from ./public and proxies the borsa API, which sends no CORS
// headers and so can't be called from the browser directly.

const UPSTREAM = "https://iraqborsa.com/borsa-api/summary.php";
const CITY_KEYS = ["b", "s", "n"]; // Baghdad, Basra, Erbil

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/rates") return getRates();
    return env.ASSETS.fetch(request);
  },
};

async function getRates() {
  try {
    const res = await fetch(UPSTREAM, {
      headers: { Accept: "application/json", "User-Agent": "BorsaMiniApp/1.0" },
      // Cache at the edge for 30s so many users opening the app don't hammer the source.
      cf: { cacheTtl: 30, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`upstream returned ${res.status}`);

    const data = await res.json();
    if (!CITY_KEYS.every((k) => data[k] && data[k].sell && data[k].buy)) {
      throw new Error("unexpected upstream response");
    }
    return json(data, 200);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
