// Serves the mini app from ./public, proxies the borsa API (which sends no CORS headers
// and so can't be called from the browser directly) and the world gold price, and answers
// the Telegram bot.

const UPSTREAM = "https://iraqborsa.com/borsa-api/summary.php";
const CITY_KEYS = ["b", "s", "n"]; // Baghdad, Basra, Erbil
// Free, keyless gold spot price (USD per troy ounce). Its terms ask for no more than a
// request every few seconds, so the edge cache below keeps us to about one a minute.
const GOLD_UPSTREAM = "https://api.gold-api.com/price/XAU";

// Bot replies. Secrets (set in Cloudflare, never in the repo):
//   BOT_TOKEN       token from @BotFather
//   WEBHOOK_SECRET  random string Telegram sends back with every update
const BOT_TEXT = {
  ar: {
    welcome: "💵 أهلاً بك في بورصة العراق\nأسعار صرف الدولار مقابل الدينار العراقي مباشرة من بغداد والبصرة وأربيل، وأسعار الذهب لكل مثقال.\n\nاضغط الزر أدناه لفتح التطبيق 👇",
    button: "افتح التطبيق",
    menu: "الأسعار",
  },
  en: {
    welcome: "💵 Welcome to Iraq Exchange\nLive USD → IQD rates for Baghdad, Basra and Erbil, plus gold prices per mithqal.\n\nTap the button below to open the app 👇",
    button: "Open the app",
    menu: "Rates",
  },
};

// Bot profile in Telegram: the default (no language_code) is Arabic, with an English
// version for users whose Telegram is in English. Applied by /telegram/setup.
const BOT_PROFILE = [
  {
    language_code: "",
    name: "بورصة العراق",
    short_description: "أسعار صرف الدولار والذهب في العراق مباشرة",
    description: "💵 أسعار صرف الدولار مقابل الدينار العراقي مباشرة من بغداد والبصرة وأربيل.\n🪙 أسعار الذهب لكل مثقال بالدينار والدولار.",
  },
  {
    language_code: "en",
    name: "Iraq Exchange",
    short_description: "Live dollar and gold rates in Iraq",
    description: "💵 Live USD → IQD rates for Baghdad, Basra and Erbil.\n🪙 Gold prices per mithqal in dinars and dollars.",
  },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/rates") return getRates();
    if (url.pathname === "/api/gold") return getGold();
    if (url.pathname === "/telegram/webhook" && request.method === "POST") return handleUpdate(request, env);
    if (url.pathname === "/telegram/setup" && request.method === "POST") return setupBot(request, env);
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

async function getGold() {
  try {
    const res = await fetch(GOLD_UPSTREAM, {
      headers: { Accept: "application/json", "User-Agent": "BorsaMiniApp/1.0" },
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`gold upstream returned ${res.status}`);

    const data = await res.json();
    const price = Number(data.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error("unexpected gold response");
    return json({ price, updatedAt: data.updatedAt ?? null }, 200);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

// Any private message (including the Start button's /start) gets a welcome with an
// "Open the app" button, and the chat's menu button is set to open the app too.
async function handleUpdate(request, env) {
  if (!env.WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  const update = await request.json().catch(() => null);
  const message = update?.message;
  if (message?.chat?.type === "private") {
    const text = message.from?.language_code?.startsWith("en") ? BOT_TEXT.en : BOT_TEXT.ar;
    const app = { url: new URL(request.url).origin };
    try {
      await Promise.all([
        telegram(env, "sendMessage", {
          chat_id: message.chat.id,
          text: text.welcome,
          reply_markup: { inline_keyboard: [[{ text: text.button, web_app: app }]] },
        }),
        telegram(env, "setChatMenuButton", {
          chat_id: message.chat.id,
          menu_button: { type: "web_app", text: text.menu, web_app: app },
        }),
      ]);
    } catch (err) {
      console.error("Bot reply failed:", err.message);
    }
  }
  // Always acknowledge, or Telegram keeps retrying the same update.
  return new Response("ok");
}

// One-off registration: points Telegram at the webhook, sets the default menu button,
// and applies the bot's name and descriptions.
// Call with: POST /telegram/setup, header "Authorization: Bearer <WEBHOOK_SECRET>".
async function setupBot(request, env) {
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
    return json({ error: "Set the BOT_TOKEN and WEBHOOK_SECRET secrets first" }, 500);
  }
  if (request.headers.get("Authorization") !== `Bearer ${env.WEBHOOK_SECRET}`) {
    return json({ error: "Forbidden" }, 403);
  }
  try {
    const origin = new URL(request.url).origin;
    await telegram(env, "setWebhook", {
      url: `${origin}/telegram/webhook`,
      secret_token: env.WEBHOOK_SECRET,
      allowed_updates: ["message"],
    });
    await telegram(env, "setChatMenuButton", {
      menu_button: { type: "web_app", text: BOT_TEXT.ar.menu, web_app: { url: origin } },
    });
    // Telegram rate-limits profile changes, so a failure here is reported, not fatal.
    let profile = "updated";
    try {
      for (const { language_code, name, short_description, description } of BOT_PROFILE) {
        const lang = language_code ? { language_code } : {};
        await telegram(env, "setMyName", { name, ...lang });
        await telegram(env, "setMyShortDescription", { short_description, ...lang });
        await telegram(env, "setMyDescription", { description, ...lang });
      }
    } catch (err) {
      profile = err.message;
    }
    const [me, info] = await Promise.all([telegram(env, "getMe", {}), telegram(env, "getWebhookInfo", {})]);
    return json({ ok: true, bot: me.username, name: me.first_name, webhook: info.url, pending: info.pending_update_count, profile }, 200);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

async function telegram(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
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
