// Everything the bot says, in Arabic (default) and English. Messages use Telegram HTML.

export const BOT_USERNAME = "IraqDollarExchangeBot";
// Opens the Mini App from anywhere (groups, channels and inline messages can't use web_app buttons).
// The start parameter tells analytics the app was opened from the bot.
export const APP_LINK = `https://t.me/${BOT_USERNAME}?startapp=bot`;

export const langOf = (code) => (String(code || "").toLowerCase().startsWith("en") ? "en" : "ar");

export const T = {
  ar: {
    welcome: "💵 <b>أهلاً بك في بورصة العراق</b>\nأسعار صرف الدولار مقابل الدينار العراقي مباشرة من بغداد والبصرة وأربيل، وأسعار الذهب لكل مثقال.",
    commands: [
      "/dollar — أسعار الدولار",
      "/gold — أسعار الذهب",
      "/alert 1580 — تنبيه عندما يصل سعر البيع في بغداد إلى رقم تحدده",
      "/subscribe — ملخص يومي للأسعار",
    ],
    inlineTip: `💡 في أي محادثة، اكتب @${BOT_USERNAME} لإرسال الأسعار.`,
    groupIntro: "👋 شكراً لإضافتي!\nأرسلوا /dollar لأسعار الدولار أو /gold لأسعار الذهب. ويمكن للمشرفين تفعيل ملخص يومي بـ /subscribe.",

    usdTitle: "💵 <b>أسعار الدولار في البورصة</b>",
    goldTitle: "🪙 <b>أسعار الذهب لكل مثقال</b>",
    summaryTitle: "📊 <b>ملخص الأسعار اليومي</b>",
    cities: { b: "بغداد", s: "البصرة", n: "أربيل" },
    sell: "بيع",
    buy: "شراء",
    karat: (k) => `عيار ${k}`,
    iqd: "د.ع",
    bestNote: "⭐ أفضل سعر بين المدن",
    goldNote: (spot, rate) => `السعر العالمي $${spot} للأونصة، محوّلاً بسعر بيع الدولار في بغداد (${rate}).`,
    updated: (time) => `🕐 آخر تحديث ${time}`,
    ratesError: "تعذّر جلب الأسعار حالياً، حاول بعد قليل.",

    btnRefresh: "🔄 تحديث",
    btnGold: "🪙 الذهب",
    btnUsd: "💵 الدولار",
    btnOpen: "📱 فتح التطبيق",
    btnRemoveAlert: "❌ إلغاء التنبيه",
    btnPrivate: "💬 المحادثة الخاصة",
    menu: "الأسعار",
    refreshed: "تم التحديث",
    notChanged: "الأسعار لم تتغير",

    subscribed: (hour) => `✅ سيصل ملخص الأسعار يومياً الساعة ${hour} بتوقيت بغداد.\nلتغيير الساعة: /subscribe 18\nللإيقاف: /unsubscribe`,
    unsubscribed: "تم إيقاف الملخص اليومي.",
    notSubscribed: "لا يوجد ملخص يومي مفعّل هنا.",
    adminsOnly: "هذا الأمر متاح لمشرفي المجموعة فقط.",
    badHour: "اكتب ساعة من 0 إلى 23 بتوقيت بغداد، مثلاً: /subscribe 18",

    alertUsage: "اكتب السعر الذي تريد التنبيه عنده، مثلاً:\n/alert 1580\n\nسأرسل لك رسالة عندما يصل سعر بيع الدولار في بغداد إليه.",
    alertSet: (target, up, now) => `🔔 سأنبهك عندما ${up ? "يرتفع" : "ينخفض"} سعر البيع في بغداد إلى <b>${target}</b>.\nالسعر الآن: ${now}`,
    alertCurrent: (target, up, now) => `🔔 لديك تنبيه عندما ${up ? "يرتفع" : "ينخفض"} سعر البيع في بغداد إلى <b>${target}</b>.\nالسعر الآن: ${now}`,
    alertSame: (now) => `سعر البيع في بغداد الآن ${now} بالفعل.`,
    alertRemoved: "تم إلغاء التنبيه.",
    alertPrivateOnly: "التنبيهات متاحة في المحادثة الخاصة مع البوت.",
    alertFired: (target, up, now) => `🔔 <b>${up ? "ارتفع" : "انخفض"} سعر البيع في بغداد إلى ${now}</b>\nوصل إلى السعر الذي حددته (${target}).`,

    inlineUsdTitle: "💵 أسعار الدولار",
    inlineUsdDesc: (sell, buy) => `بغداد: بيع ${sell} · شراء ${buy}`,
    inlineGoldTitle: "🪙 أسعار الذهب",
    inlineGoldDesc: (iqd) => `عيار 21: ${iqd} د.ع للمثقال`,
  },
  en: {
    welcome: "💵 <b>Welcome to Iraq Exchange</b>\nLive USD → IQD rates for Baghdad, Basra and Erbil, plus gold prices per mithqal.",
    commands: [
      "/dollar — dollar rates",
      "/gold — gold prices",
      "/alert 1580 — get a message when Baghdad's sell rate reaches a price you pick",
      "/subscribe — daily rates summary",
    ],
    inlineTip: `💡 In any chat, type @${BOT_USERNAME} to send the rates.`,
    groupIntro: "👋 Thanks for adding me!\nSend /dollar for dollar rates or /gold for gold prices. Admins can turn on a daily summary with /subscribe.",

    usdTitle: "💵 <b>Dollar borsa rates</b>",
    goldTitle: "🪙 <b>Gold prices per mithqal</b>",
    summaryTitle: "📊 <b>Daily rates summary</b>",
    cities: { b: "Baghdad", s: "Basra", n: "Erbil" },
    sell: "Sell",
    buy: "Buy",
    karat: (k) => `${k} karat`,
    iqd: "IQD",
    bestNote: "⭐ Best rate across cities",
    goldNote: (spot, rate) => `World price $${spot} per ounce, converted at Baghdad's dollar sell rate (${rate}).`,
    updated: (time) => `🕐 Updated ${time}`,
    ratesError: "Couldn't load the rates right now, try again shortly.",

    btnRefresh: "🔄 Refresh",
    btnGold: "🪙 Gold",
    btnUsd: "💵 Dollar",
    btnOpen: "📱 Open the app",
    btnRemoveAlert: "❌ Remove alert",
    btnPrivate: "💬 Private chat",
    menu: "Rates",
    refreshed: "Updated",
    notChanged: "No change in prices",

    subscribed: (hour) => `✅ The rates summary will arrive every day at ${hour} Baghdad time.\nTo change the time: /subscribe 18\nTo stop: /unsubscribe`,
    unsubscribed: "Daily summary turned off.",
    notSubscribed: "There's no daily summary set up here.",
    adminsOnly: "Only group admins can use this command.",
    badHour: "Pick an hour from 0 to 23, Baghdad time, e.g. /subscribe 18",

    alertUsage: "Send the price you want an alert at, e.g.:\n/alert 1580\n\nI'll message you when Baghdad's dollar sell rate reaches it.",
    alertSet: (target, up, now) => `🔔 I'll let you know when Baghdad's sell rate ${up ? "rises" : "falls"} to <b>${target}</b>.\nNow: ${now}`,
    alertCurrent: (target, up, now) => `🔔 You have an alert for when Baghdad's sell rate ${up ? "rises" : "falls"} to <b>${target}</b>.\nNow: ${now}`,
    alertSame: (now) => `Baghdad's sell rate is already ${now}.`,
    alertRemoved: "Alert removed.",
    alertPrivateOnly: "Alerts work in a private chat with the bot.",
    alertFired: (target, up, now) => `🔔 <b>Baghdad's sell rate ${up ? "rose" : "fell"} to ${now}</b>\nIt reached the price you set (${target}).`,

    inlineUsdTitle: "💵 Dollar rates",
    inlineUsdDesc: (sell, buy) => `Baghdad: Sell ${sell} · Buy ${buy}`,
    inlineGoldTitle: "🪙 Gold prices",
    inlineGoldDesc: (iqd) => `21 karat: ${iqd} IQD per mithqal`,
  },
};

// Shown in Telegram's profile screen. The default (no language_code) is Arabic.
export const BOT_PROFILE = [
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

// Command menus, per chat type and language.
const COMMAND_TEXT = {
  ar: { dollar: "أسعار الدولار", gold: "أسعار الذهب", alert: "تنبيه عند سعر تحدده", subscribe: "ملخص يومي للأسعار", unsubscribe: "إيقاف الملخص اليومي", help: "المساعدة" },
  en: { dollar: "Dollar rates", gold: "Gold prices", alert: "Alert at a price you pick", subscribe: "Daily rates summary", unsubscribe: "Stop the daily summary", help: "Help" },
};
const menu = (lang, names) => names.map((command) => ({ command, description: COMMAND_TEXT[lang][command] }));

export const COMMAND_MENUS = [
  { scope: { type: "all_private_chats" }, names: ["dollar", "gold", "alert", "subscribe", "unsubscribe", "help"] },
  { scope: { type: "all_group_chats" }, names: ["dollar", "gold", "subscribe", "unsubscribe", "help"] },
].flatMap(({ scope, names }) => [
  { scope, commands: menu("ar", names) },
  { scope, language_code: "en", commands: menu("en", names) },
]);
