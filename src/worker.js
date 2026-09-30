// Serves the mini app from ./public, the price APIs it uses (the borsa API sends no CORS
// headers, so the browser can't call it directly), and the Telegram bot's webhook.
// A cron trigger (see wrangler.jsonc) sends price alerts and daily summaries, and refreshes
// the stored gold price history.
//
// Secrets (set in Cloudflare, never in the repo):
//   BOT_TOKEN           token from @BotFather
//   WEBHOOK_SECRET      random string Telegram sends back with every update
//   ANALYTICS_SALT      random string used to hash user ids in analytics
//   DASHBOARD_PASSWORD  password for the /admin dashboard
//   GOLD_API_KEY        free key from gold-api.com, for the gold price history

import { fetchGold, fetchGoldHistory, fetchMarket, fetchMarketHistory, fetchRates, refreshGoldHistory } from "./rates.js";
import { handleUpdate, runScheduled, setupBot } from "./bot.js";
import { dashboardStats, handleAppEvent } from "./analytics.js";
import { getFeatures, listFeatures, setFeature } from "./features.js";
import dashboardHtml from "./dashboard.html";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") return appPage(request, env);
    if (url.pathname === "/api/rates") return priceRoute(fetchRates);
    if (url.pathname === "/api/gold") return priceRoute(fetchGold);
    if (url.pathname === "/api/gold/history") return priceRoute(() => fetchGoldHistory(env));
    if (url.pathname === "/api/market") return priceRoute(fetchMarket);
    if (url.pathname === "/api/market/history") return priceRoute(() => fetchMarketHistory(url.searchParams.get("tf") || "1d"));
    if (url.pathname === "/api/event" && request.method === "POST") return handleAppEvent(request, env);
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return admin(request, env, url);
    if (url.pathname === "/telegram/webhook" && request.method === "POST") return webhook(request, env);
    if (url.pathname === "/telegram/setup" && request.method === "POST") return setup(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env).catch((err) => console.error("Scheduled run failed:", err.message)));
    ctx.waitUntil(refreshGoldHistory(env).catch((err) => console.error("Gold history refresh failed:", err.message)));
  },
};

// The app page, with the dashboard's switches written into it so the app knows them as it
// starts. wrangler.jsonc routes "/" here before the static files.
async function appPage(request, env) {
  // A plain request (no If-None-Match), so there's always a page to rewrite.
  const page = await env.ASSETS.fetch(new Request(new URL("/", request.url)));
  if (!page.ok) return page;
  let features = null;
  try {
    features = await getFeatures(env, "app");
  } catch (err) {
    console.error("Switches unavailable:", err.message);
  }
  const headers = new Headers(page.headers);
  // The page now changes with the switches, so it can't be revalidated by the file's ETag.
  headers.delete("ETag");
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-store");
  return new HTMLRewriter().on("head", {
    element(head) {
      if (features) head.prepend(`<script>window.APP_CONFIG = ${JSON.stringify({ features })};</script>`, { html: true });
    },
  }).transform(new Response(page.body, { status: page.status, headers }));
}

async function priceRoute(load) {
  try {
    return json(await load(), 200);
  } catch (err) {
    return json({ error: err.message }, err instanceof RangeError ? 400 : 502);
  }
}

async function webhook(request, env) {
  if (!env.WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  const update = await request.json().catch(() => null);
  if (update) {
    try {
      await handleUpdate(update, env, new URL(request.url).origin);
    } catch (err) {
      console.error("Update failed:", err.message);
    }
  }
  // Always acknowledge, or Telegram keeps retrying the same update.
  return new Response("ok");
}

// One-off: POST /telegram/setup with header "Authorization: Bearer <WEBHOOK_SECRET>".
async function setup(request, env) {
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
    return json({ error: "Set the BOT_TOKEN and WEBHOOK_SECRET secrets first" }, 500);
  }
  if (request.headers.get("Authorization") !== `Bearer ${env.WEBHOOK_SECRET}`) {
    return json({ error: "Forbidden" }, 403);
  }
  try {
    return json(await setupBot(env, new URL(request.url).origin), 200);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

// The analytics dashboard, behind HTTP Basic auth (any username, DASHBOARD_PASSWORD).
async function admin(request, env, url) {
  if (!env.DASHBOARD_PASSWORD) {
    return new Response("Set the DASHBOARD_PASSWORD secret to open the dashboard.", { status: 503 });
  }
  if (!(await passwordMatches(request, env.DASHBOARD_PASSWORD))) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Iraq Exchange dashboard", charset="UTF-8"', "Cache-Control": "no-store" },
    });
  }
  const privateHeaders = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "X-Frame-Options": "DENY" };
  const privateJson = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...privateHeaders } });
  if (url.pathname === "/admin/api/stats") {
    return privateJson(await dashboardStats(env, url.searchParams.get("range")));
  }
  if (url.pathname === "/admin/api/settings") {
    if (request.method !== "POST") return privateJson({ features: await listFeatures(env) });
    // Browsers send saved Basic credentials with cross-site requests too, so only accept
    // JSON posted from the dashboard itself.
    if (!fromDashboard(request, url)) return privateJson({ error: "Forbidden" }, 403);
    const body = await request.json().catch(() => null);
    try {
      return privateJson({ features: await setFeature(env, body?.key, body?.enabled) });
    } catch (err) {
      return privateJson({ error: err.message }, err instanceof RangeError ? 400 : 500);
    }
  }
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    return new Response(dashboardHtml, { headers: { "Content-Type": "text/html; charset=utf-8", ...privateHeaders } });
  }
  return new Response("Not found", { status: 404 });
}

function fromDashboard(request, url) {
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  return (request.headers.get("Content-Type") || "").startsWith("application/json")
    && (!origin || origin === url.origin)
    && (!site || site === "same-origin");
}

async function passwordMatches(request, expected) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const given = new TextEncoder().encode(decoded.slice(decoded.indexOf(":") + 1));
  const wanted = new TextEncoder().encode(expected);
  return given.byteLength === wanted.byteLength && crypto.subtle.timingSafeEqual(given, wanted);
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
