// Telegram bot: commands, self-updating rates messages, inline mode, groups and channels,
// daily summaries and price alerts.
//
// Groups: the bot keeps Telegram's privacy mode on, so it only ever sees its own commands.
// Rates messages carry buttons that edit the message in place instead of posting new ones.

import { APP_LINK, BOT_PROFILE, BOT_USERNAME, COMMAND_MENUS, T, langOf } from "./texts.js";
import { CITY_KEYS, KARATS, bestCities, fetchGold, fetchRates, goldRate, goldUsd } from "./rates.js";
import { isGoneError, telegram } from "./telegram.js";
import { pruneEvents, recordEvent } from "./analytics.js";

const track = (ctx, fields) => recordEvent(ctx.env, { source: "bot", userKind: "telegram", ...fields });
const KNOWN_COMMANDS = new Set(["start", "help", "dollar", "usd", "gold", "subscribe", "unsubscribe", "alert"]);

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtUsd = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const VIEWS = ["usd", "gold", "all"];
const DEFAULT_SUMMARY_HOUR = 10;
// Workers allow ~50 outgoing requests per run; each scheduled task stays well under that.
const SCHEDULED_BATCH = 20;

/* ---------- Time (Baghdad, UTC+3, no daylight saving) ---------- */

function baghdadTime(date, lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-IQ-u-nu-latn" : "en-US", {
    timeZone: "Asia/Baghdad",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function baghdadClock(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { hour: Number(parts.hour), date: `${parts.year}-${parts.month}-${parts.day}` };
}

const hourLabel = (hour) => `${String(hour).padStart(2, "0")}:00`;

/* ---------- Messages ---------- */

export async function loadPrices(view) {
  const [rates, gold] = await Promise.all([
    fetchRates().catch(() => null),
    view === "usd" ? null : fetchGold().catch(() => null),
  ]);
  return { rates, gold };
}

function usdLines(rates, lang) {
  const s = T[lang];
  const best = { sell: bestCities(rates, "sell"), buy: bestCities(rates, "buy") };
  const price = (city, kind) => {
    const r = rates[city];
    const diff = Number(kind === "sell" ? r.sd : r.bd) || 0;
    const change = diff > 0 ? ` 🔺${fmt.format(diff)}` : diff < 0 ? ` 🔻${fmt.format(-diff)}` : "";
    return `${s[kind]} <b>${fmt.format(Number(r[kind]))}</b>${change}${best[kind].has(city) ? " ⭐" : ""}`;
  };
  const cities = CITY_KEYS.map((city) => `<b>${s.cities[city]}</b>\n${price(city, "sell")} · ${price(city, "buy")}`);
  return [cities.join("\n\n"), ...(best.sell.size || best.buy.size ? ["", s.bestNote] : [])];
}

function goldLines(gold, rates, lang) {
  const s = T[lang];
  const rate = rates ? goldRate(rates) : null;
  const karats = KARATS.map((k) => {
    const usd = goldUsd(gold.price, k);
    const iqd = rate ? fmtInt.format(Math.round(usd * rate)) : "—";
    return `${s.karat(k)}: <b>${iqd}</b> ${s.iqd} · $${fmtUsd.format(usd)}`;
  });
  return [...karats, "", s.goldNote(fmtUsd.format(gold.price), rate ? fmt.format(rate) : "—")];
}

// Throws when the data the view needs is missing, so callers can show the error text.
export function renderView(view, { rates, gold }, lang, now = new Date()) {
  const s = T[lang];
  let lines;
  if (view === "usd") {
    if (!rates) throw new Error("dollar rates unavailable");
    lines = [s.usdTitle, "", ...usdLines(rates, lang)];
  } else if (view === "gold") {
    if (!gold) throw new Error("gold price unavailable");
    lines = [s.goldTitle, "", ...goldLines(gold, rates, lang)];
  } else {
    if (!rates && !gold) throw new Error("prices unavailable");
    lines = [s.summaryTitle];
    if (rates) lines.push("", s.usdTitle, "", ...usdLines(rates, lang));
    if (gold) lines.push("", s.goldTitle, "", ...goldLines(gold, rates, lang));
  }
  lines.push("", s.updated(baghdadTime(now, lang)));
  return lines.join("\n");
}

// Where a message lives decides which "Open the app" button is allowed: web_app buttons
// only work in private chats, so groups, channels and inline messages get a t.me link.
const placeOf = (chat) => (chat.type === "private" ? "private" : "group");

function openButton(lang, place, appUrl) {
  const text = T[lang].btnOpen;
  return place === "private" ? { text, web_app: { url: `${appUrl}/?from=bot` } } : { text, url: APP_LINK };
}

function viewKeyboard(view, lang, place, appUrl) {
  const s = T[lang];
  const cb = (v) => `v:${v}:${lang}`;
  const actions = {
    usd: [{ text: s.btnRefresh, callback_data: cb("usd") }, { text: s.btnGold, callback_data: cb("gold") }],
    gold: [{ text: s.btnRefresh, callback_data: cb("gold") }, { text: s.btnUsd, callback_data: cb("usd") }],
    all: [{ text: s.btnRefresh, callback_data: cb("all") }],
  }[view];
  return { inline_keyboard: [actions, [openButton(lang, place, appUrl)]] };
}

const welcomeText = (lang) => {
  const s = T[lang];
  return [s.welcome, "", ...s.commands, "", s.inlineTip].join("\n");
};

const groupHelpText = (lang) => {
  const s = T[lang];
  return [s.groupIntro, "", s.inlineTip].join("\n");
};

/* ---------- Sending ---------- */

function send(ctx, chatId, text, extra = {}) {
  return telegram(ctx.env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

// In groups, answer as a reply so it's clear which command the message is for.
const replyTo = (msg) =>
  msg.chat.type === "private" ? {} : { reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } };

async function sendView(ctx, msg, view, lang) {
  let text;
  try {
    text = renderView(view, await loadPrices(view), lang);
  } catch {
    return send(ctx, msg.chat.id, T[lang].ratesError, replyTo(msg));
  }
  return send(ctx, msg.chat.id, text, { reply_markup: viewKeyboard(view, lang, placeOf(msg.chat), ctx.appUrl), ...replyTo(msg) });
}

async function sendWelcome(ctx, chat, lang) {
  const s = T[lang];
  await send(ctx, chat.id, welcomeText(lang), {
    reply_markup: {
      inline_keyboard: [
        [{ text: s.btnUsd, callback_data: `v:usd:${lang}` }, { text: s.btnGold, callback_data: `v:gold:${lang}` }],
        [openButton(lang, "private", ctx.appUrl)],
      ],
    },
  });
  // The chat's menu button (next to the message box) opens the app, labelled in the user's language.
  await telegram(ctx.env, "setChatMenuButton", {
    chat_id: chat.id,
    menu_button: { type: "web_app", text: s.menu, web_app: { url: `${ctx.appUrl}/?from=menu` } },
  }).catch(() => {});
}

/* ---------- Updates ---------- */

export async function handleUpdate(update, env, origin) {
  const ctx = { env, appUrl: env.APP_URL || origin };
  if (update.message) return onMessage(ctx, update.message, false);
  if (update.channel_post) return onMessage(ctx, update.channel_post, true);
  if (update.callback_query) return onCallback(ctx, update.callback_query);
  if (update.inline_query) return onInline(ctx, update.inline_query);
  if (update.my_chat_member) return onMembership(ctx, update.my_chat_member);
}

function parseCommand(text) {
  if (!text.startsWith("/")) return null;
  const [head, ...args] = text.split(/\s+/);
  const [name, target] = head.slice(1).split("@");
  // In groups with several bots, "/dollar@OtherBot" isn't for us.
  if (target && target.toLowerCase() !== BOT_USERNAME.toLowerCase()) return null;
  return { name: name.toLowerCase(), args };
}

async function onMessage(ctx, msg, isChannel) {
  const text = msg.text?.trim();
  if (!text) return;
  const isPrivate = msg.chat.type === "private";
  const lang = langOf(msg.from?.language_code);
  const command = parseCommand(text);
  if (command ? KNOWN_COMMANDS.has(command.name) : isPrivate) {
    await track(ctx, {
      event: command ? "command" : "text",
      platform: msg.chat.type,
      lang,
      detail: command ? (command.name === "usd" ? "dollar" : command.name) : null,
      userId: msg.from?.id,
    });
  }

  if (!command) {
    // Groups and channels: only our own commands. Private chats: guess from the words used.
    if (!isPrivate) return;
    if (/ذهب|gold/i.test(text)) return sendView(ctx, msg, "gold", lang);
    if (/دولار|dollar|usd|سعر|price|rate/i.test(text)) return sendView(ctx, msg, "usd", lang);
    return sendWelcome(ctx, msg.chat, lang);
  }

  switch (command.name) {
    case "start":
      if (!isPrivate) return send(ctx, msg.chat.id, groupHelpText(lang), replyTo(msg));
      if (command.args[0] === "alert") return send(ctx, msg.chat.id, T[lang].alertUsage);
      return sendWelcome(ctx, msg.chat, lang);
    case "help":
      return isPrivate ? sendWelcome(ctx, msg.chat, lang) : send(ctx, msg.chat.id, groupHelpText(lang), replyTo(msg));
    case "dollar":
    case "usd":
      return sendView(ctx, msg, "usd", lang);
    case "gold":
      return sendView(ctx, msg, "gold", lang);
    case "subscribe":
      return subscribe(ctx, msg, command.args, lang, isChannel);
    case "unsubscribe":
      return unsubscribe(ctx, msg, lang, isChannel);
    case "alert":
      return setAlert(ctx, msg, command.args, lang);
  }
}

async function onCallback(ctx, cb) {
  const [kind, view, code] = String(cb.data || "").split(":");
  const lang = code === "en" || code === "ar" ? code : langOf(cb.from?.language_code);
  const s = T[lang];
  const answer = (text) =>
    telegram(ctx.env, "answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text } : {}) }).catch(() => {});

  await track(ctx, {
    event: "button",
    platform: cb.inline_message_id ? "inline" : cb.message?.chat?.type,
    lang,
    detail: kind === "alert" ? "alert_off" : view,
    userId: cb.from?.id,
  });

  if (kind === "alert" && view === "off" && cb.message) {
    await ctx.env.DB.prepare("DELETE FROM alerts WHERE chat_id = ?1").bind(cb.message.chat.id).run();
    await telegram(ctx.env, "editMessageText", {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: s.alertRemoved,
    }).catch(() => {});
    return answer(s.alertRemoved);
  }

  if (kind !== "v" || !VIEWS.includes(view)) return answer();

  // Buttons on messages sent via inline mode come with inline_message_id instead of a chat.
  const place = cb.inline_message_id ? "inline" : placeOf(cb.message.chat);
  const target = cb.inline_message_id
    ? { inline_message_id: cb.inline_message_id }
    : { chat_id: cb.message.chat.id, message_id: cb.message.message_id };
  try {
    await telegram(ctx.env, "editMessageText", {
      ...target,
      text: renderView(view, await loadPrices(view), lang),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: viewKeyboard(view, lang, place, ctx.appUrl),
    });
    return answer(s.refreshed);
  } catch (err) {
    return answer(/not modified/i.test(err.message) ? s.notChanged : s.ratesError);
  }
}

// Typing @IraqDollarExchangeBot in any chat offers dollar and gold messages to send.
async function onInline(ctx, query) {
  const lang = langOf(query.from?.language_code);
  const s = T[lang];
  await track(ctx, { event: "inline", platform: "inline", lang, userId: query.from?.id });
  const prices = await loadPrices("all");
  const result = (view, title, description, thumb) => ({
    type: "article",
    id: `${view}-${lang}`,
    title,
    description,
    thumbnail_url: `${ctx.appUrl}/bot/${thumb}.png`,
    input_message_content: {
      message_text: renderView(view, prices, lang),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    },
    reply_markup: viewKeyboard(view, lang, "inline", ctx.appUrl),
  });

  const results = [];
  if (prices.rates) {
    const b = prices.rates.b;
    results.push(result("usd", s.inlineUsdTitle, s.inlineUsdDesc(fmt.format(Number(b.sell)), fmt.format(Number(b.buy))), "usd"));
  }
  if (prices.gold) {
    const rate = prices.rates ? goldRate(prices.rates) : null;
    const iqd21 = rate ? fmtInt.format(Math.round(goldUsd(prices.gold.price, 21) * rate)) : "—";
    results.push(result("gold", s.inlineGoldTitle, s.inlineGoldDesc(iqd21), "gold"));
  }
  if (/ذهب|gold/i.test(query.query || "")) results.reverse();

  await telegram(ctx.env, "answerInlineQuery", {
    inline_query_id: query.id,
    results,
    cache_time: 30,
    is_personal: true, // results are in the asker's language
  });
}

// Joining a group: introduce once. Leaving or being blocked: stop anything scheduled there.
async function onMembership(ctx, change) {
  const inside = (status) => ["member", "administrator", "creator"].includes(status);
  const was = change.old_chat_member?.status;
  const now = change.new_chat_member?.status;
  const chat = change.chat;

  if (inside(now) !== inside(was)) {
    await track(ctx, { event: inside(now) ? "join" : "leave", platform: chat.type, lang: langOf(change.from?.language_code), userId: change.from?.id });
  }
  if (inside(now) && !inside(was) && (chat.type === "group" || chat.type === "supergroup")) {
    await send(ctx, chat.id, groupHelpText(langOf(change.from?.language_code))).catch(() => {});
  }
  if (!inside(now) && inside(was)) {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare("DELETE FROM subscriptions WHERE chat_id = ?1").bind(chat.id),
      ctx.env.DB.prepare("DELETE FROM alerts WHERE chat_id = ?1").bind(chat.id),
    ]);
  }
}

/* ---------- Daily summary ---------- */

async function isGroupAdmin(env, msg) {
  if (msg.sender_chat?.id === msg.chat.id) return true; // anonymous group admin
  if (!msg.from) return false;
  const member = await telegram(env, "getChatMember", { chat_id: msg.chat.id, user_id: msg.from.id });
  return member.status === "creator" || member.status === "administrator";
}

// Channels only let admins post, so a /subscribe there is already from an admin.
async function mayManage(ctx, msg, isChannel) {
  return isChannel || msg.chat.type === "private" || isGroupAdmin(ctx.env, msg);
}

async function subscribe(ctx, msg, args, lang, isChannel) {
  if (!(await mayManage(ctx, msg, isChannel))) return send(ctx, msg.chat.id, T[lang].adminsOnly, replyTo(msg));

  let hour = DEFAULT_SUMMARY_HOUR;
  const hourArg = args.find((a) => /^\d{1,2}$/.test(a));
  if (hourArg != null) {
    hour = Number(hourArg);
    if (hour > 23) return send(ctx, msg.chat.id, T[lang].badHour, replyTo(msg));
  }
  // Channels have no sender language; "/subscribe 18 en" picks English there.
  const langArg = args.find((a) => /^(ar|en)$/i.test(a))?.toLowerCase();
  const subLang = langArg || lang;

  await ctx.env.DB.prepare(
    `INSERT INTO subscriptions (chat_id, hour, lang, created_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (chat_id) DO UPDATE SET hour = excluded.hour, lang = excluded.lang`,
  ).bind(msg.chat.id, hour, subLang, Date.now()).run();
  return send(ctx, msg.chat.id, T[subLang].subscribed(hourLabel(hour)), replyTo(msg));
}

async function unsubscribe(ctx, msg, lang, isChannel) {
  if (!(await mayManage(ctx, msg, isChannel))) return send(ctx, msg.chat.id, T[lang].adminsOnly, replyTo(msg));
  const { meta } = await ctx.env.DB.prepare("DELETE FROM subscriptions WHERE chat_id = ?1").bind(msg.chat.id).run();
  return send(ctx, msg.chat.id, meta.changes ? T[lang].unsubscribed : T[lang].notSubscribed, replyTo(msg));
}

/* ---------- Price alerts ---------- */

const toAsciiDigits = (str) =>
  str
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[,،٬]/g, "")
    .replace(/٫/g, ".");

const removeAlertKeyboard = (lang) => ({ inline_keyboard: [[{ text: T[lang].btnRemoveAlert, callback_data: `alert:off:${lang}` }]] });

async function setAlert(ctx, msg, args, lang) {
  const s = T[lang];
  if (msg.chat.type !== "private") {
    return send(ctx, msg.chat.id, s.alertPrivateOnly, {
      reply_markup: { inline_keyboard: [[{ text: s.btnPrivate, url: `https://t.me/${BOT_USERNAME}?start=alert` }]] },
      ...replyTo(msg),
    });
  }

  const rates = await fetchRates().catch(() => null);
  const now = rates ? Number(rates.b.sell) : null;

  if (!args.length) {
    const existing = await ctx.env.DB.prepare("SELECT target, direction FROM alerts WHERE chat_id = ?1").bind(msg.chat.id).first();
    if (!existing) return send(ctx, msg.chat.id, s.alertUsage);
    return send(ctx, msg.chat.id, s.alertCurrent(fmt.format(existing.target), existing.direction === "above", now ? fmt.format(now) : "—"), {
      reply_markup: removeAlertKeyboard(lang),
    });
  }

  let target = Number(toAsciiDigits(args[0]));
  // Prices are often quoted per $100 (e.g. 158000); treat those as per-dollar.
  if (target >= 50_000) target /= 100;
  if (!Number.isFinite(target) || target < 500 || target > 5_000) return send(ctx, msg.chat.id, s.alertUsage);
  if (now == null) return send(ctx, msg.chat.id, s.ratesError);
  if (target === now) return send(ctx, msg.chat.id, s.alertSame(fmt.format(now)));

  const up = target > now;
  await ctx.env.DB.prepare(
    "INSERT OR REPLACE INTO alerts (chat_id, target, direction, lang, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
  ).bind(msg.chat.id, target, up ? "above" : "below", lang, Date.now()).run();
  return send(ctx, msg.chat.id, s.alertSet(fmt.format(target), up, fmt.format(now)), { reply_markup: removeAlertKeyboard(lang) });
}

/* ---------- Scheduled (every 5 minutes) ---------- */

export async function runScheduled(env) {
  const ctx = { env, appUrl: env.APP_URL };
  const now = new Date();
  const prices = await loadPrices("all");
  const alertsSent = prices.rates ? await fireAlerts(ctx, prices, now) : 0;
  const summariesSent = prices.rates || prices.gold ? await sendSummaries(ctx, prices, now) : 0;
  if (alertsSent) await recordEvent(env, { source: "cron", event: "alert_sent", value: alertsSent });
  if (summariesSent) await recordEvent(env, { source: "cron", event: "summary_sent", value: summariesSent });
  // Once an hour, drop analytics older than the retention window.
  if (now.getUTCMinutes() < 5) await pruneEvents(env).catch((err) => console.error("Prune failed:", err.message));
}

async function fireAlerts(ctx, prices, now) {
  const sell = Number(prices.rates.b.sell);
  const { results } = await ctx.env.DB.prepare(
    `SELECT chat_id, target, direction, lang FROM alerts
     WHERE (direction = 'above' AND target <= ?1) OR (direction = 'below' AND target >= ?1)
     LIMIT ${SCHEDULED_BATCH}`,
  ).bind(sell).all();

  const done = [];
  let sent = 0;
  for (const alert of results) {
    const s = T[alert.lang];
    try {
      await send(ctx, alert.chat_id, s.alertFired(fmt.format(alert.target), alert.direction === "above", fmt.format(sell)), {
        reply_markup: viewKeyboard("usd", alert.lang, "private", ctx.appUrl),
      });
      sent++;
    } catch (err) {
      if (!isGoneError(err)) {
        console.error("Alert send failed:", err.message);
        continue; // keep it and retry next run
      }
    }
    done.push(alert.chat_id);
  }
  if (done.length) {
    await ctx.env.DB.batch(done.map((id) => ctx.env.DB.prepare("DELETE FROM alerts WHERE chat_id = ?1").bind(id)));
  }
  return sent;
}

// Runs every 5 minutes, so a busy hour is sent in batches across that hour.
async function sendSummaries(ctx, prices, now) {
  const { hour, date } = baghdadClock(now);
  const { results } = await ctx.env.DB.prepare(
    `SELECT chat_id, lang FROM subscriptions
     WHERE hour = ?1 AND (last_sent IS NULL OR last_sent <> ?2)
     LIMIT ${SCHEDULED_BATCH}`,
  ).bind(hour, date).all();

  const texts = {};
  const updates = [];
  let sent = 0;
  for (const sub of results) {
    texts[sub.lang] ??= renderView("all", prices, sub.lang, now);
    const place = sub.chat_id > 0 ? "private" : "group"; // group and channel ids are negative
    try {
      await send(ctx, sub.chat_id, texts[sub.lang], { reply_markup: viewKeyboard("all", sub.lang, place, ctx.appUrl) });
      updates.push(ctx.env.DB.prepare("UPDATE subscriptions SET last_sent = ?2 WHERE chat_id = ?1").bind(sub.chat_id, date));
      sent++;
    } catch (err) {
      if (isGoneError(err)) updates.push(ctx.env.DB.prepare("DELETE FROM subscriptions WHERE chat_id = ?1").bind(sub.chat_id));
      else console.error("Summary send failed:", err.message);
    }
  }
  if (updates.length) await ctx.env.DB.batch(updates);
  return sent;
}

/* ---------- One-off setup ---------- */

// Points Telegram at the webhook, sets the default menu button, the command menus,
// and the bot's name and descriptions (only where they changed: Telegram rate-limits these).
export async function setupBot(env, origin) {
  await telegram(env, "setWebhook", {
    url: `${origin}/telegram/webhook`,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "channel_post", "callback_query", "inline_query", "my_chat_member"],
  });
  await telegram(env, "setChatMenuButton", {
    menu_button: { type: "web_app", text: T.ar.menu, web_app: { url: `${origin}/?from=menu` } },
  });

  const report = { profile: "updated", commands: "updated" };
  try {
    for (const { language_code, name, short_description, description } of BOT_PROFILE) {
      const lang = language_code ? { language_code } : {};
      const [n, sd, d] = await Promise.all([
        telegram(env, "getMyName", lang),
        telegram(env, "getMyShortDescription", lang),
        telegram(env, "getMyDescription", lang),
      ]);
      if (n.name !== name) await telegram(env, "setMyName", { name, ...lang });
      if (sd.short_description !== short_description) await telegram(env, "setMyShortDescription", { short_description, ...lang });
      if (d.description !== description) await telegram(env, "setMyDescription", { description, ...lang });
    }
  } catch (err) {
    report.profile = err.message;
  }
  try {
    for (const menu of COMMAND_MENUS) await telegram(env, "setMyCommands", menu);
  } catch (err) {
    report.commands = err.message;
  }

  const [me, info] = await Promise.all([telegram(env, "getMe"), telegram(env, "getWebhookInfo")]);
  return {
    ok: true,
    bot: me.username,
    name: me.first_name,
    inline_mode: me.supports_inline_queries,
    webhook: info.url,
    updates: info.allowed_updates,
    pending: info.pending_update_count,
    ...report,
  };
}
