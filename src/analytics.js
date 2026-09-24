// Usage analytics for the /admin dashboard, stored in D1 (see migrations/0002_events.sql).
//
// Privacy: users are recorded as HMAC(ANALYTICS_SALT, id), so the database never holds a
// Telegram id. App events count as Telegram users only when Telegram's signed initData
// verifies against the bot token; anything else is an anonymous browser visitor.

const APP_EVENTS = new Set(["open", "tab", "share", "lang", "theme", "refresh", "legal"]);
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const INIT_DATA_MAX_AGE_S = 48 * 60 * 60;
const BAGHDAD_OFFSET_S = 3 * 60 * 60; // UTC+3, no daylight saving

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const short = (v, max = 32) => (typeof v === "string" && v ? v.slice(0, max) : null);

async function hmac(key, message) {
  const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(message));
}

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export async function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = await hmac("WebAppData", botToken);
  if (toHex(await hmac(secret, checkString)) !== hash) return null;
  if (Date.now() / 1000 - Number(params.get("auth_date")) > INIT_DATA_MAX_AGE_S) return null;
  try {
    const user = JSON.parse(params.get("user") || "null");
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

async function hashUser(env, id) {
  if (!env.ANALYTICS_SALT || id == null) return null;
  return toHex(await hmac(env.ANALYTICS_SALT, String(id))).slice(0, 24);
}

// Never throws: analytics must not break the app or the bot.
export async function recordEvent(env, e) {
  if (!env.DB) return;
  try {
    const user = e.userId != null ? await hashUser(env, `${e.userKind}:${e.userId}`) : null;
    await env.DB.prepare(
      `INSERT INTO events (ts, source, event, platform, lang, theme, detail, ref, country, user, user_kind, value)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    ).bind(
      Date.now(), e.source, e.event, short(e.platform), short(e.lang, 5), short(e.theme, 8), short(e.detail),
      short(e.ref), short(e.country, 4), user, user ? e.userKind : null, e.value ?? null,
    ).run();
  } catch (err) {
    console.error("Analytics write failed:", err.message);
  }
}

// POST /api/event from the app (navigator.sendBeacon).
export async function handleAppEvent(request, env) {
  const body = await request.json().catch(() => null);
  if (body && APP_EVENTS.has(body.event)) {
    const tgUser = await verifyInitData(body.initData, env.BOT_TOKEN).catch(() => null);
    const anon = short(body.anon, 64);
    await recordEvent(env, {
      source: "app",
      event: body.event,
      platform: tgUser ? short(body.platform) || "unknown" : "browser",
      lang: body.lang,
      theme: body.theme,
      detail: body.detail,
      ref: body.ref,
      country: request.cf?.country,
      userId: tgUser ? tgUser.id : anon,
      userKind: tgUser ? "telegram" : "browser",
    });
  }
  return new Response(null, { status: 204 });
}

export async function pruneEvents(env) {
  await env.DB.prepare("DELETE FROM events WHERE ts < ?1").bind(Date.now() - RETENTION_MS).run();
}

/* ---------- Dashboard numbers ---------- */

const RANGES = { today: null, "7d": 7, "30d": 30, "90d": 90 };

// Range boundaries in Baghdad days. "today" starts at Baghdad midnight.
function rangeBounds(range, now = Date.now()) {
  const dayMs = 86_400_000;
  const offsetMs = BAGHDAD_OFFSET_S * 1000;
  const todayStart = Math.floor((now + offsetMs) / dayMs) * dayMs - offsetMs;
  const days = RANGES[range];
  const start = days == null ? todayStart : todayStart - (days - 1) * dayMs;
  const length = now - start;
  return { start, end: now, prevStart: start - length, prevEnd: start, days: days ?? 1 };
}

const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;

const KPI_SQL = `
  SELECT
    COUNT(DISTINCT user) AS users,
    COUNT(DISTINCT CASE WHEN user_kind = 'telegram' THEN user END) AS telegram_users,
    COUNT(DISTINCT CASE WHEN user_kind = 'browser' THEN user END) AS browser_users,
    COALESCE(SUM(source = 'app' AND event = 'open'), 0) AS opens,
    COUNT(DISTINCT CASE WHEN source = 'bot' THEN user END) AS bot_users,
    COALESCE(SUM(source = 'bot' AND event IN ('command', 'text', 'button', 'inline')), 0) AS bot_actions,
    COALESCE(SUM(source = 'app' AND event = 'share'), 0) AS shares
  FROM events WHERE ts >= ?1 AND ts < ?2`;

export async function dashboardStats(env, range) {
  if (!(range in RANGES)) range = "7d";
  const db = env.DB;
  const b = rangeBounds(range);
  const shift = `ts / 1000 + ${BAGHDAD_OFFSET_S}`;
  const bucket = range === "today" ? `CAST(strftime('%H', ${shift}, 'unixepoch') AS INTEGER)` : `strftime('%Y-%m-%d', ${shift}, 'unixepoch')`;
  const opens = "source = 'app' AND event = 'open' AND ts >= ?1";

  const [kpi, prev, trend, platforms, countries, prefs, bot, hours, cron, current] = await Promise.all([
    all(db, KPI_SQL, b.start, b.end),
    all(db, KPI_SQL, b.prevStart, b.prevEnd),
    all(db, `SELECT ${bucket} AS bucket, COUNT(DISTINCT user) AS users, COALESCE(SUM(source = 'app' AND event = 'open'), 0) AS opens
             FROM events WHERE ts >= ?1 AND source IN ('app', 'bot') GROUP BY bucket ORDER BY bucket`, b.start),
    all(db, `SELECT platform AS k, COUNT(DISTINCT user) AS users, COUNT(*) AS n FROM events WHERE ${opens} GROUP BY k ORDER BY users DESC`, b.start),
    all(db, `SELECT country AS k, COUNT(DISTINCT user) AS users, COUNT(*) AS n FROM events WHERE ${opens} GROUP BY k ORDER BY users DESC`, b.start),
    all(db, `SELECT 'lang' AS dim, lang AS k, COUNT(*) AS n FROM events WHERE ${opens} GROUP BY k
             UNION ALL SELECT 'theme', theme, COUNT(*) FROM events WHERE ${opens} GROUP BY theme
             UNION ALL SELECT 'ref', ref, COUNT(*) FROM events WHERE ${opens} GROUP BY ref
             UNION ALL SELECT 'tab', detail, COUNT(*) FROM events WHERE source = 'app' AND event IN ('open', 'tab') AND ts >= ?1 GROUP BY detail`, b.start),
    all(db, `SELECT event, detail, platform, COUNT(*) AS n, COUNT(DISTINCT user) AS users FROM events
             WHERE source = 'bot' AND ts >= ?1 GROUP BY event, detail, platform`, b.start),
    all(db, `SELECT CAST(strftime('%H', ${shift}, 'unixepoch') AS INTEGER) AS hour, COUNT(*) AS n FROM events
             WHERE ts >= ?1 AND source IN ('app', 'bot') GROUP BY hour`, b.start),
    all(db, `SELECT event, COALESCE(SUM(value), 0) AS n FROM events WHERE source = 'cron' AND ts >= ?1 GROUP BY event`, b.start),
    all(db, `SELECT
               (SELECT COUNT(*) FROM subscriptions WHERE chat_id > 0) AS private_subscriptions,
               (SELECT COUNT(*) FROM subscriptions WHERE chat_id < 0) AS group_subscriptions,
               (SELECT COUNT(*) FROM alerts) AS alerts`),
  ]);

  return {
    range,
    start: b.start,
    end: b.end,
    days: b.days,
    generatedAt: Date.now(),
    kpi: kpi[0],
    previous: prev[0],
    trend,
    platforms,
    countries,
    prefs,
    bot,
    hours,
    cron,
    current: current[0],
  };
}
