"use strict";

/* ---------- Config ---------- */

const API_URL = "/api/rates";
const GOLD_API_URL = "/api/gold";
const MARKET_API_URL = "/api/market";
const REFRESH_MS = 60_000;
const STALE_MS = 3 * 60_000;
const CACHE_MAX_AGE_MS = 24 * 60 * 60_000;
const CACHE_KEY = "borsa:last";
const GOLD_CACHE_KEY = "borsa:gold";
const MARKET_CACHE_KEY = "borsa:market";
const HISTORY_API_URL = "/api/market/history";
const HISTORY_TFS = ["12h", "1d", "1w"]; // 14 days every 12h · 60 days daily · ~10 weeks weekly
const HISTORY_MAX_AGE_MS = 5 * 60_000; // the source updates its history every few minutes at most
const PREFS_KEY = "borsa:prefs";
// Link included when sharing rates; opens the Mini App directly in Telegram.
// The start parameter lets analytics count opens that came from a share.
const SHARE_URL = "https://t.me/IraqDollarExchangeBot?startapp=share";

const CITIES = [
  { key: "b", ar: "بغداد", en: "Baghdad" },
  { key: "s", ar: "البصرة", en: "Basra" },
  { key: "n", ar: "أربيل", en: "Erbil" },
];
const KINDS = ["sell", "buy"];

// Gold: world spot price (USD per troy ounce) converted to an Iraqi mithqal (5 g),
// and to dinars at Baghdad's dollar sell rate.
const KARATS = [24, 21, 18];
const MITHQAL_GRAMS = 5;
const TROY_OUNCE_GRAMS = 31.1034768;
const GOLD_RATE_CITY = "b";

const STR = {
  ar: {
    appName: "بورصة العراق",
    langToggle: "EN",
    langLabel: "English",
    theme: "الوضع الداكن",
    refresh: "تحديث الأسعار",
    tabUsd: "الدولار",
    tabGold: "الذهب",
    live: "مباشر",
    loading: "جارٍ جلب الأسعار…",
    updating: "جارٍ التحديث…",
    offline: "غير متصل",
    lastUpdate: "آخر تحديث",
    justNow: "الآن",
    sell: "بيع",
    buy: "شراء",
    per100: ["100 دولار = ", " د.ع"],
    unchanged: "ثابت",
    spread: "الفرق",
    iqd: "د.ع",
    goldTitle: "أسعار الذهب",
    perMithqal: "لكل مثقال",
    karat: (k) => `عيار ${k}`,
    spotLabel: "السعر العالمي للأونصة",
    rateLabel: "سعر صرف الدولار (بغداد، بيع)",
    goldError: "تعذّر جلب سعر الذهب.",
    shareAll: "مشاركة الأسعار",
    bestLegend: "أفضل سعر بين المدن",
    footnote: "الأسعار بالدينار العراقي لكل 1 دولار أمريكي",
    marketTitle: "متوسط السوق في العراق",
    marketSpread: "الفرق بين البيع والشراء",
    gapOfficial: "الفرق عن السعر الرسمي",
    marketUpdated: "تحديث المصدر",
    historyTitle: "تاريخ السعر",
    historyRanges: { "12h": "14 يوم", "1d": "60 يوم", "1w": "10 أسابيع" },
    historySpan: (days) => `خلال ${days} يوم`,
    historyError: "تعذّر تحميل تاريخ السعر.",
    historyLabel: (from, to, low, high) => `سعر السوق من ${from} إلى ${to}، بين ${low} و ${high} دينار`,
    shareMarket: (mid, gap) => `متوسط السوق: ${mid}${gap ? ` · ${gap} عن السعر الرسمي` : ""}`,
    goldFootnote: "السعر العالمي للذهب لكل مثقال (5 غرامات)، محوّلاً إلى الدينار بسعر بيع الدولار في بغداد. قد يختلف عن أسعار محلات الذهب.",
    source: "المصدر:",
    disclaimerLabel: "تنبيه:",
    disclaimer: "يعرض هذا التطبيق أسعاراً منشورة في مصادر عامة للاطلاع فقط، ولا يعمل في تداول العملات أو الذهب أو صرفها.",
    legalOpen: "اقرأ إخلاء المسؤولية الكامل",
    legalTitle: "إخلاء مسؤولية قانوني وتقني",
    close: "إغلاق",
    legal: [
      {
        title: "طبيعة الخدمة",
        text: "هذا التطبيق أداة برمجية رقمية مؤتمتة (API Aggregator) تجمع وتنقل المؤشرات المتداولة في السوق تلقائياً دون أي تدخل بشري. التطبيق ليس طرفاً مصرفياً، ولا يمثل أي بورصة (الكفاح، الحارثية، أو غيرها)، ولا يعمل كشركة صرافة أو وسيط مالي أو جهة تسعير.",
      },
      {
        title: "نفي تحريك الأسعار والمضاربة",
        text: "تنفي إدارة التطبيق نفياً قاطعاً قيامها بـ:",
        items: [
          "صياغة أو تثبيت أو توجيه أو تحريك أي من الأسعار المعروضة.",
          "الدعوة إلى الشراء أو البيع أو المضاربة أو تداول العملات أو الذهب خارج الأطر المصرفية الرسمية المقرة من البنك المركزي العراقي.",
        ],
      },
      {
        title: "مصدر البيانات ودقتها",
        text: "أسعار الدولار في المدن تُجلب آلياً وبصورة حية من موقع iraqborsa.com العام، ومتوسط السوق من موقع usdiqd.com، وأسعار الذهب محسوبة من السعر العالمي (gold-api.com) ومحوّلة بسعر صرف الدولار، وقد تختلف عن أسعار السوق المحلي ومحلات الذهب التي تضيف أجور الصياغة وهامش الربح. لا تضمن الإدارة مطابقة هذه الأسعار للواقع اللحظي، ولا تتحمل أي مسؤولية ناتجة عن التذبذبات السريعة أو أخطاء المصدر أو تأخر وصول التحديثات.",
      },
      {
        title: "حدود المسؤولية وإسقاط المطالبات",
        text: "يُقر المستخدم بأن اعتماده على أي رقم أو معلومة معروضة هو قرار شخصي يتحمل مسؤوليته كاملة، ويُسقط حقه في أي مطالبة تجاه إدارة التطبيق عن أي خسارة أو ضرر مباشر أو غير مباشر ناتج عن استخدامه.",
      },
      {
        title: "الخصوصية",
        text: "يسجّل التطبيق إحصاءات استخدام مجهولة الهوية، مثل عدد مرات الفتح ونوع الجهاز والدولة واللغة، لتحسين الخدمة. لا يحتفظ التطبيق بأسماء المستخدمين أو أرقامهم أو معرّفاتهم في تيليجرام، وتُحذف هذه الإحصاءات تلقائياً بعد 90 يوماً.",
      },
    ],
    errorTitle: "تعذّر جلب الأسعار",
    errorBody: "تحقق من اتصالك بالإنترنت ثم حاول مجدداً",
    retry: "إعادة المحاولة",
    refreshed: "تم تحديث الأسعار",
    refreshFailed: "تعذّر التحديث، حاول بعد قليل",
    copied: "تم نسخ الأسعار",
    shareTitle: "💵 سعر الدولار في البورصة",
    shareLine: (city, sell, buy) => `${city}: بيع ${sell} · شراء ${buy}`,
    goldShareTitle: "🪙 أسعار الذهب لكل مثقال",
    goldShareLine: (k, iqd, usd) => `عيار ${k}: ${iqd} د.ع ($${usd})`,
    goldShareNote: "السعر العالمي محوّلاً بسعر صرف بغداد",
  },
  en: {
    appName: "Iraq Exchange",
    langToggle: "ع",
    langLabel: "العربية",
    theme: "Dark mode",
    refresh: "Refresh rates",
    tabUsd: "Dollar",
    tabGold: "Gold",
    live: "Live",
    loading: "Fetching rates…",
    updating: "Updating…",
    offline: "Offline",
    lastUpdate: "Updated",
    justNow: "just now",
    sell: "Sell",
    buy: "Buy",
    per100: ["$100 = ", " IQD"],
    unchanged: "No change",
    spread: "Spread",
    iqd: "IQD",
    goldTitle: "Gold prices",
    perMithqal: "per mithqal",
    karat: (k) => `${k} karat`,
    spotLabel: "World price per ounce",
    rateLabel: "Dollar rate (Baghdad, sell)",
    goldError: "Couldn't load the gold price.",
    shareAll: "Share rates",
    bestLegend: "Best rate across cities",
    footnote: "Rates in Iraqi dinar per 1 US dollar",
    marketTitle: "Iraq market average",
    marketSpread: "Buy/sell spread",
    gapOfficial: "Gap vs official rate",
    marketUpdated: "Source updated",
    historyTitle: "Price history",
    historyRanges: { "12h": "14 days", "1d": "60 days", "1w": "10 weeks" },
    historySpan: (days) => `over ${days} days`,
    historyError: "Couldn't load the price history.",
    historyLabel: (from, to, low, high) => `Market price from ${from} to ${to}, between ${low} and ${high} dinars`,
    shareMarket: (mid, gap) => `Market average: ${mid}${gap ? ` · ${gap} vs the official rate` : ""}`,
    goldFootnote: "World gold price per mithqal (5 g), converted to dinars at Baghdad's dollar sell rate. Gold shops may charge more.",
    source: "Source:",
    disclaimerLabel: "Disclaimer:",
    disclaimer: "This app only shows prices published by public sources, for information only. It doesn't trade or exchange currencies or gold.",
    legalOpen: "Read the full disclaimer",
    legalTitle: "Legal and technical disclaimer",
    close: "Close",
    legal: [
      {
        title: "Nature of the service",
        text: "This app is an automated software tool (API aggregator) that collects and relays market indicators automatically, with no human involvement. It is not a bank, does not represent any exchange (Al-Kifah, Al-Harithiya or others), and is not a currency exchange, financial broker or price-setting body.",
      },
      {
        title: "No price-setting or speculation",
        text: "The app's operators firmly deny:",
        items: [
          "Creating, fixing, steering or moving any of the prices shown.",
          "Encouraging buying, selling, speculating or trading currencies or gold outside the official banking channels approved by the Central Bank of Iraq.",
        ],
      },
      {
        title: "Data source and accuracy",
        text: "City dollar rates are fetched automatically and live from the public website iraqborsa.com, and the market average from usdiqd.com. Gold prices are calculated from the world price (gold-api.com) and converted at the dollar rate, so they may differ from local market and gold shop prices, which add making charges and a margin. The operators don't guarantee that these prices match the market at any given moment, and accept no liability for rapid fluctuations, errors at the source, or delayed updates.",
      },
      {
        title: "Limitation of liability",
        text: "By using the app, you acknowledge that relying on any figure or information shown is your own decision and responsibility, and you waive any claim against the app's operators for any direct or indirect loss or damage arising from its use.",
      },
      {
        title: "Privacy",
        text: "The app records anonymous usage statistics, such as how often it's opened and the device type, country and language, to improve the service. It doesn't keep users' names, phone numbers or Telegram ids, and these statistics are deleted automatically after 90 days.",
      },
    ],
    errorTitle: "Couldn't load rates",
    errorBody: "Check your internet connection and try again",
    retry: "Try again",
    refreshed: "Rates updated",
    refreshFailed: "Couldn't refresh, try again shortly",
    copied: "Rates copied",
    shareTitle: "💵 Dollar borsa rates",
    shareLine: (city, sell, buy) => `${city}: Sell ${sell} · Buy ${buy}`,
    goldShareTitle: "🪙 Gold prices per mithqal",
    goldShareLine: (k, iqd, usd) => `${k} karat: ${iqd} IQD ($${usd})`,
    goldShareNote: "World price converted at Baghdad's dollar rate",
  },
};

/* ---------- Telegram ---------- */

const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg && tg.platform !== "unknown");
const hasHaptics = inTelegram && tg.isVersionAtLeast("6.1");

const haptic = {
  tap: () => hasHaptics && tg.HapticFeedback.impactOccurred("light"),
  soft: () => hasHaptics && tg.HapticFeedback.impactOccurred("soft"),
  select: () => hasHaptics && tg.HapticFeedback.selectionChanged(),
  success: () => hasHaptics && tg.HapticFeedback.notificationOccurred("success"),
  error: () => hasHaptics && tg.HapticFeedback.notificationOccurred("error"),
};

/* ---------- Analytics ---------- */

// How this session was opened: from a shared message, the bot, the chat menu, or directly.
const entryRef = (() => {
  const start = tg?.initDataUnsafe?.start_param;
  if (start) return start === "share" || start === "bot" ? start : "link";
  const from = new URLSearchParams(location.search).get("from");
  return from === "bot" || from === "menu" ? from : "direct";
})();

function anonId() {
  try {
    let id = localStorage.getItem("borsa:anon");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("borsa:anon", id);
    }
    return id;
  } catch {
    return null;
  }
}

// Fire-and-forget usage event. The server verifies Telegram's signed initData, so only
// real Telegram users count as such; ids are stored hashed.
function track(event, fields = {}) {
  const payload = {
    event,
    platform: inTelegram ? tg.platform : "browser",
    lang: state.lang,
    theme: document.documentElement.dataset.scheme,
    initData: inTelegram ? tg.initData : "",
    anon: anonId(),
    ...fields,
  };
  try {
    const body = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/event", body)) {
      fetch("/api/event", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {}
}

/* ---------- State ---------- */

const prefs = readJSON(PREFS_KEY) || {};
const state = {
  lang: prefs.lang === "ar" || prefs.lang === "en" ? prefs.lang : detectLang(),
  theme: prefs.theme === "light" || prefs.theme === "dark" ? prefs.theme : null, // null = follow Telegram/system
  tab: prefs.tab === "gold" ? "gold" : "usd",
  data: null, // dollar rates from iraqborsa.com
  updatedAt: 0,
  failed: false,
  gold: null, // { price: USD per troy ounce, updatedAt }
  market: null, // Iraq market average from usdiqd.com (see src/rates.js fetchMarket)
  marketFailed: false,
  historyTf: HISTORY_TFS.includes(prefs.historyTf) ? prefs.historyTf : "1d",
  history: {}, // tf -> { points: [{ t, mid }], at }
  historyFailed: {},
  goldAt: 0,
  goldFailed: false,
  loading: false,
  offline: navigator.onLine === false,
};

function detectLang() {
  const code = tg?.initDataUnsafe?.user?.language_code || navigator.language || "";
  return code.toLowerCase().startsWith("en") ? "en" : "ar";
}

function savePrefs() {
  writeJSON(PREFS_KEY, { lang: state.lang, theme: state.theme, tab: state.tab, historyTf: state.historyTf });
}

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* ---------- Helpers ---------- */

const $ = (id) => document.getElementById(id);
const t = () => STR[state.lang];
const isRTL = () => state.lang === "ar";
const isGoldTab = () => state.tab === "gold";
const cityName = (key) => CITIES.find((c) => c.key === key)[state.lang];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtUsd = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function rateOf(city, kind) {
  const v = Number(state.data?.[city]?.[kind]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function deltaOf(city, kind) {
  const r = state.data?.[city] || {};
  return {
    diff: Number(kind === "sell" ? r.sd : r.bd) || 0,
    pct: Number(kind === "sell" ? r.sp : r.bp) || 0,
  };
}

// Lowest sell = cheapest place to buy dollars; highest buy = best place to sell them.
function bestCities(kind) {
  const values = CITIES.map((c) => rateOf(c.key, kind)).filter((v) => v != null);
  if (values.length < 2) return new Set();
  const target = kind === "sell" ? Math.min(...values) : Math.max(...values);
  const keys = CITIES.filter((c) => rateOf(c.key, kind) === target).map((c) => c.key);
  return keys.length === CITIES.length ? new Set() : new Set(keys);
}

function spotPrice() {
  const v = Number(state.gold?.price);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function goldUsd(karat) {
  const oz = spotPrice();
  return oz == null ? null : (oz / TROY_OUNCE_GRAMS) * MITHQAL_GRAMS * (karat / 24);
}

function goldIqd(karat) {
  const usd = goldUsd(karat);
  const rate = rateOf(GOLD_RATE_CITY, "sell");
  return usd == null || rate == null ? null : Math.round(usd * rate);
}

const arrow = (dir) =>
  `<svg class="tri" viewBox="0 0 10 10" aria-hidden="true"><path fill="currentColor" d="${dir > 0 ? "M5 1.2 9.4 8.3H.6z" : "M5 8.8.6 1.7h8.8z"}"/></svg>`;

const STAR = `<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8Z"/></svg>`;

// Tween a number from its previous value, ticking in fixed steps like a real quote.
function setNumber(el, value, { animate = false, format = fmt.format, step = 0.5 } = {}) {
  const from = el._value;
  el._value = value;
  cancelAnimationFrame(el._raf);
  if (!animate || from == null || from === value || reducedMotion.matches) {
    el.textContent = format(value);
    return;
  }
  const start = performance.now();
  const duration = 750;
  const tick = (now) => {
    const k = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - k, 3);
    const v = k < 1 ? Math.round((from + (value - from) * eased) / step) * step : value;
    el.textContent = format(v);
    if (k < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}

// Show a skeleton while a value is still loading, or a dash once loading has failed.
function setPlaceholder(el, placeholder, failed) {
  el._value = null;
  el.classList.toggle("sk", !failed);
  el.textContent = failed ? "—" : placeholder;
}

function restartAnimation(el, className) {
  if (!el || reducedMotion.matches) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
}

/* ---------- Elements ---------- */

const els = {
  app: $("app"),
  content: $("content"),
  status: $("status"),
  statusText: $("statusText"),
  langBtn: $("langBtn"),
  themeBtn: $("themeBtn"),
  refreshBtn: $("refreshBtn"),
  tabs: $("tabs"),
  tabThumb: $("tabThumb"),
  tabButtons: [...document.querySelectorAll("#tabs [data-tab]")],
  usdPanel: $("usdPanel"),
  goldPanel: $("goldPanel"),
  karats: $("karats"),
  spot: $("spot"),
  goldRate: $("goldRate"),
  goldError: $("goldError"),
  goldRetry: $("goldRetry"),
  shareBtn: $("shareBtn"),
  errorView: $("errorView"),
  retryBtn: $("retryBtn"),
  foot: $("foot"),
  legend: $("legend"),
  footnote: $("footnote"),
  goldSource: $("goldSource"),
  marketSource: $("marketSource"),
  toast: $("toast"),
  legalBtn: $("legalBtn"),
  legalSheet: $("legalSheet"),
  legalBody: $("legalBody"),
};

function buildCards() {
  // The market average leads: one Iraq-wide price is what most people look for first.
  els.usdPanel.innerHTML = `
    <section class="card market-card" id="marketCard" style="--i:1">
      <div class="city-head">
        <h2 class="city-name" data-i18n="marketTitle"></h2>
        <a class="spread source-pill ext-link" href="https://usdiqd.com" target="_blank" rel="noopener">usdiqd.com</a>
      </div>
      <div class="market-main">
        <div>
          <div class="price-value"><span class="num" data-role="mid"></span> <span class="unit" data-i18n="iqd"></span></div>
          <div class="price-sub"><span data-role="pre"></span><span class="num" data-role="per100"></span><span data-role="post"></span></div>
        </div>
        <div class="delta" data-role="change"></div>
      </div>
      <div class="prices market-sides">
        <div class="price"><div class="price-label" data-i18n="sell"></div><div class="price-value"><span class="num" data-role="sell"></span></div></div>
        <div class="price"><div class="price-label" data-i18n="buy"></div><div class="price-value"><span class="num" data-role="buy"></span></div></div>
      </div>
      <div class="market-stats">
        <div class="stat-row">
          <span data-i18n="marketSpread"></span>
          <strong class="stat-amount"><span class="num" data-role="spread"></span> <span data-i18n="iqd"></span></strong>
          <strong class="stat-pct num" data-role="spreadPct"></strong>
        </div>
        <div class="stat-row">
          <span data-i18n="gapOfficial"></span>
          <strong class="stat-amount"><span class="num" data-role="gap"></span> <span data-i18n="iqd"></span></strong>
          <strong class="stat-pct num" data-role="gapPct"></strong>
        </div>
      </div>
      <div class="market-history">
        <div class="history-head">
          <span class="history-title" data-i18n="historyTitle"></span>
          <div class="history-tfs" role="radiogroup">
            ${HISTORY_TFS.map((tf) => `<button type="button" role="radio" data-tf="${tf}"></button>`).join("")}
          </div>
        </div>
        <div class="history-chart" data-role="hchart"></div>
        <div class="history-foot">
          <span class="history-change" data-role="hchange"></span>
        </div>
      </div>
      <div class="market-updated" data-role="updated"></div>
    </section>` + CITIES.map((c, i) => `
    <section class="card city" data-city="${c.key}" style="--i:${i + 2}">
      <div class="city-head">
        <h2 class="city-name" data-role="name"></h2>
        <span class="spread"><span data-i18n="spread"></span> <strong class="num" data-role="spread"></strong> <span data-i18n="iqd"></span></span>
      </div>
      <div class="prices">
        ${KINDS.map((kind) => `
          <div class="price" data-kind="${kind}">
            <div class="price-label"><span data-i18n="${kind}"></span>${STAR}</div>
            <div class="price-value"><span class="num" data-role="value"></span></div>
            <div class="delta" data-role="delta"></div>
            <div class="price-sub"><span data-role="pre"></span><span class="num" data-role="per100"></span><span data-role="post"></span></div>
          </div>`).join("")}
      </div>
    </section>`).join("");

  const marketCard = els.usdPanel.querySelector("#marketCard");
  const mq = (r) => marketCard.querySelector(`[data-role="${r}"]`);
  els.market = {
    card: marketCard,
    main: marketCard.querySelector(".market-main"),
    tfButtons: [...marketCard.querySelectorAll(".history-tfs button")],
    ...Object.fromEntries(["mid", "per100", "pre", "post", "change", "sell", "buy", "spread", "spreadPct", "gap", "gapPct", "updated", "hchart", "hchange"].map((r) => [r, mq(r)])),
  };

  els.cardEls = Object.fromEntries(CITIES.map((c) => {
    const card = els.usdPanel.querySelector(`[data-city="${c.key}"]`);
    const prices = Object.fromEntries(KINDS.map((kind) => {
      const col = card.querySelector(`.price[data-kind="${kind}"]`);
      const q = (r) => col.querySelector(`[data-role="${r}"]`);
      return [kind, { col, value: q("value"), delta: q("delta"), per100: q("per100"), pre: q("pre"), post: q("post") }];
    }));
    return [c.key, { card, name: card.querySelector('[data-role="name"]'), spread: card.querySelector('[data-role="spread"]'), prices }];
  }));

  els.karats.innerHTML = KARATS.map((k) => `
    <div class="karat-row" data-karat="${k}">
      <span class="karat-badge num" aria-hidden="true">${k}</span>
      <span class="karat-label" data-role="label"></span>
      <div class="karat-prices">
        <div class="karat-iqd"><span class="num" data-role="iqd"></span> <span class="unit" data-i18n="iqd"></span></div>
        <div class="karat-usd"><span class="num" data-role="usd"></span></div>
      </div>
    </div>`).join("");

  els.karatEls = Object.fromEntries(KARATS.map((k) => {
    const row = els.karats.querySelector(`[data-karat="${k}"]`);
    const q = (r) => row.querySelector(`[data-role="${r}"]`);
    return [k, { row, label: q("label"), iqd: q("iqd"), usd: q("usd") }];
  }));
}

/* ---------- Rendering ---------- */

function applyLanguage() {
  const s = t();
  const root = document.documentElement;
  root.lang = state.lang;
  root.dir = isRTL() ? "rtl" : "ltr";
  document.title = s.appName;

  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = s[el.dataset.i18n];
  for (const el of document.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", s[el.dataset.i18nLabel]);

  els.langBtn.textContent = s.langToggle;
  els.langBtn.setAttribute("aria-label", s.langLabel);
  els.legalBody.innerHTML = s.legal.map((section, i) => `
    <section class="legal-section">
      <h3><span class="legal-n num">${i + 1}</span>${section.title}</h3>
      <p>${section.text}</p>
      ${section.items ? `<ul>${section.items.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}
    </section>`).join("");
  for (const c of CITIES) {
    const card = els.cardEls[c.key];
    card.name.textContent = cityName(c.key);
    for (const kind of KINDS) {
      card.prices[kind].pre.textContent = s.per100[0];
      card.prices[kind].post.textContent = s.per100[1];
    }
  }
  for (const k of KARATS) els.karatEls[k].label.textContent = s.karat(k);
}

function renderCards({ animate = false } = {}) {
  const s = t();
  const best = Object.fromEntries(KINDS.map((k) => [k, bestCities(k)]));

  for (const c of CITIES) {
    const card = els.cardEls[c.key];

    for (const kind of KINDS) {
      const p = card.prices[kind];
      const value = rateOf(c.key, kind);
      const loading = value == null;
      p.value.classList.toggle("sk", loading);
      p.per100.classList.toggle("sk", loading);
      p.col.classList.toggle("best", best[kind].has(c.key));

      if (loading) {
        p.value.textContent = "0,000.0";
        p.per100.textContent = "000,000";
        p.value._value = p.per100._value = null;
        p.delta.className = "delta sk";
        p.delta.innerHTML = "<span>00 · 0.00%</span>";
        continue;
      }

      setNumber(p.value, value, { animate });
      setNumber(p.per100, Math.round(value * 100), { animate, format: fmtInt.format, step: 50 });

      const { diff, pct } = deltaOf(c.key, kind);
      const dir = Math.sign(diff);
      p.delta.className = `delta ${dir > 0 ? "up" : dir < 0 ? "down" : "flat"}`;
      p.delta.innerHTML = dir
        ? `${arrow(dir)}<span class="num">${fmt.format(Math.abs(diff))}</span><span class="d-sep">·</span><span class="num">${Math.abs(pct).toFixed(2)}%</span>`
        : `<span>${s.unchanged}</span>`;
    }

    const sell = rateOf(c.key, "sell");
    const buy = rateOf(c.key, "buy");
    const hasSpread = sell != null && buy != null;
    card.spread.classList.toggle("sk", !hasSpread);
    card.spread.textContent = hasSpread ? fmt.format(sell - buy) : "00";
  }
}

function renderGold({ animate = false } = {}) {
  const goldDown = !state.gold && state.goldFailed;
  const rateDown = !state.data && state.failed;

  for (const k of KARATS) {
    const r = els.karatEls[k];
    const usd = goldUsd(k);
    const iqd = goldIqd(k);
    const before = r.iqd._value;

    if (usd == null) setPlaceholder(r.usd, "000.00", goldDown);
    else {
      r.usd.classList.remove("sk");
      setNumber(r.usd, usd, { animate, format: (v) => `$${fmtUsd.format(v)}`, step: 0.01 });
    }

    if (iqd == null) setPlaceholder(r.iqd, "0,000,000", goldDown || rateDown);
    else {
      r.iqd.classList.remove("sk");
      setNumber(r.iqd, iqd, { animate, format: fmtInt.format, step: 1 });
      if (animate && before != null && before !== iqd) {
        restartAnimation(r.row, iqd > before ? "flash-up" : "flash-down");
      }
    }
  }

  const spot = spotPrice();
  if (spot == null) setPlaceholder(els.spot, "$0,000.00", goldDown);
  else {
    els.spot.classList.remove("sk");
    setNumber(els.spot, spot, { animate, format: (v) => `$${fmtUsd.format(v)}`, step: 0.01 });
  }
  const rate = rateOf(GOLD_RATE_CITY, "sell");
  if (rate == null) setPlaceholder(els.goldRate, "0,000.0", rateDown);
  else {
    els.goldRate.classList.remove("sk");
    setNumber(els.goldRate, rate, { animate });
  }

  els.goldError.hidden = !goldDown;
}

// Which panel, footer notes and share state go with the current tab.
function renderMarket({ animate = false } = {}) {
  const s = t();
  const m = state.market;
  const r = els.market;
  // A supplementary source: hide the card rather than show an error when it's down.
  r.card.hidden = !m && state.marketFailed;
  r.pre.textContent = s.per100[0];
  r.post.textContent = s.per100[1];
  if (!m) {
    for (const [el, placeholder] of [[r.mid, "0,000.00"], [r.per100, "000,000"], [r.sell, "0,000.00"], [r.buy, "0,000.00"], [r.spread, "0.00"], [r.spreadPct, "0.00%"], [r.gap, "000.00"], [r.gapPct, "00.00%"]]) {
      setPlaceholder(el, placeholder, false);
    }
    r.change.className = "delta sk";
    r.change.innerHTML = "<span>00 · 0.00%</span>";
    r.updated.textContent = "";
    renderHistory();
    return;
  }

  const before = r.mid._value;
  const show = (el, value, opts = {}) => {
    if (value == null) return setPlaceholder(el, "—", true);
    el.classList.remove("sk");
    setNumber(el, value, { animate, step: 0.01, ...opts });
  };
  show(r.mid, m.mid);
  show(r.per100, Math.round(m.mid * 100), { format: fmtInt.format, step: 1 });
  show(r.sell, m.sell);
  show(r.buy, m.buy);
  // Both stat rows read the same way: amount + currency, then the percentage.
  const pctText = (v, signed) => (v == null ? "—" : `${signed ? (v >= 0 ? "+" : "−") : ""}${Math.abs(v).toFixed(2)}%`);
  show(r.spread, m.spread);
  show(r.gap, m.gapAbs == null ? null : Math.abs(m.gapAbs));
  for (const [el, text] of [[r.spreadPct, pctText(m.spreadPct, false)], [r.gapPct, pctText(m.gapPct, true)]]) {
    el.classList.remove("sk");
    el.textContent = text;
  }

  const dir = Math.sign(m.change || 0);
  r.change.className = `delta ${dir > 0 ? "up" : dir < 0 ? "down" : "flat"}`;
  r.change.innerHTML = dir
    ? `${arrow(dir)}<span class="num">${fmt.format(Math.abs(m.change))}</span><span class="d-sep">·</span><span class="num">${Math.abs(m.changePct || 0).toFixed(2)}%</span>`
    : `<span>${s.unchanged}</span>`;
  renderMarketUpdated();
  renderHistory();
  if (animate && before != null && before !== m.mid) restartAnimation(r.main, m.mid > before ? "flash-up" : "flash-down");
}

// The source's own timestamp, so "updated" means the market price, not our fetch.
function renderMarketUpdated() {
  const at = Date.parse(state.market?.updatedAt || "");
  els.market.updated.textContent = Number.isFinite(at) ? `🕐 ${t().marketUpdated} ${relativeTime(at)}` : "";
}

/* ---------- Market price history (usdiqd.com) ---------- */

const historyLoading = {};

async function loadHistory(tf = state.historyTf, { force = false } = {}) {
  const entry = state.history[tf];
  if ((!force && entry && Date.now() - entry.at < HISTORY_MAX_AGE_MS) || historyLoading[tf]) return;
  historyLoading[tf] = true;
  try {
    const json = await getJSON(`${HISTORY_API_URL}?tf=${tf}`);
    if (!(json.points?.length >= 2)) throw new Error("not enough history");
    state.history[tf] = { points: json.points, at: Date.now() };
    state.historyFailed[tf] = false;
    writeJSON(`borsa:history:${tf}`, state.history[tf]);
  } catch (err) {
    console.error("Failed to load price history:", err);
    state.historyFailed[tf] = true;
  } finally {
    historyLoading[tf] = false;
    if (tf === state.historyTf) renderHistory();
  }
}

function selectHistoryTf(tf) {
  if (tf === state.historyTf) return;
  haptic.select();
  state.historyTf = tf;
  savePrefs();
  renderHistory();
  loadHistory(tf);
}

const historyDate = (t, withTime) => new Intl.DateTimeFormat(isRTL() ? "ar-IQ-u-nu-latn" : "en-GB", {
  timeZone: "Asia/Baghdad",
  day: "numeric",
  month: "short",
  ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
}).format(t);

function renderHistory() {
  const s = t();
  const r = els.market;
  const tf = state.historyTf;
  const entry = state.history[tf];
  r.tfButtons.forEach((b) => {
    b.textContent = s.historyRanges[b.dataset.tf];
    b.setAttribute("aria-checked", String(b.dataset.tf === tf));
  });

  if (!entry) {
    r.hchange.textContent = state.historyFailed[tf] ? s.historyError : "";
    r.hchange.className = "history-change";
    r.hchart.replaceChildren(Object.assign(document.createElement("div"), { className: state.historyFailed[tf] ? "history-empty" : "history-empty sk" }));
    return;
  }

  const pts = entry.points;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const diff = last.mid - first.mid;
  const pct = (diff / first.mid) * 100;
  const days = Math.max(1, Math.round((last.t - first.t) / 86_400_000));
  const dir = Math.sign(Math.round(diff * 100));
  r.hchange.className = `history-change ${dir > 0 ? "up" : dir < 0 ? "down" : ""}`;
  // Amount, currency and percentage as separate pieces so each keeps its own direction
  // (an Arabic currency inside a left-to-right number span gets reordered).
  const sign = dir > 0 ? "+" : dir < 0 ? "−" : "";
  r.hchange.innerHTML = `<span class="h-val">${dir ? arrow(dir) : ""}<span class="num">${sign}${fmt.format(Math.abs(diff))}</span><span>${s.iqd}</span><span class="d-sep">·</span><span class="num">${sign}${Math.abs(pct).toFixed(2)}%</span></span><span>${s.historySpan(days)}</span>`;

  drawHistory();
}

// One series (the market middle price): 2px line over a soft wash, clean ticks, end dot,
// and a crosshair readout that follows the pointer or finger. Time runs left to right in
// both languages, as in any price chart.
function drawHistory() {
  const box = els.market.hchart;
  const entry = state.history[state.historyTf];
  const width = Math.round(box.clientWidth);
  if (!entry || !width) return;
  const s = t();
  const pts = entry.points;
  const withTime = state.historyTf === "12h";
  const height = 150;
  const m = { top: 10, right: 10, bottom: 22, left: 46 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const values = pts.map((p) => p.mid);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const rawStep = Math.max(1, (hi - lo) / 3);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= rawStep) || 10 * mag;
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.max(yMin + step, Math.ceil(hi / step) * step);
  const x = (i) => m.left + (i / (pts.length - 1)) * iw;
  const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };
  const svg = el("svg", {
    class: "history-svg", viewBox: `0 0 ${width} ${height}`, width, height, role: "img", tabindex: "0",
    "aria-label": s.historyLabel(historyDate(pts[0].t, withTime), historyDate(pts[pts.length - 1].t, withTime), fmt.format(lo), fmt.format(hi)),
  });
  for (let v = yMin; v <= yMax + step / 2; v += step) {
    svg.append(el("line", { class: "h-grid", x1: m.left, x2: m.left + iw, y1: y(v), y2: y(v) }));
    svg.append(el("text", { class: "h-tick", x: m.left - 6, y: y(v) + 4, "text-anchor": "end" }, fmtInt.format(v)));
  }
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  svg.append(el("path", { class: "h-area", d: `${line}L${x(pts.length - 1).toFixed(1)},${m.top + ih}L${m.left},${m.top + ih}Z` }));
  svg.append(el("path", { class: "h-line", d: line }));
  svg.append(el("text", { class: "h-tick", x: m.left, y: height - 5, "text-anchor": "start" }, historyDate(pts[0].t, false)));
  svg.append(el("text", { class: "h-tick", x: m.left + iw, y: height - 5, "text-anchor": "end" }, historyDate(pts[pts.length - 1].t, false)));
  const li = pts.length - 1;
  svg.append(el("circle", { class: "h-dot", cx: x(li), cy: y(values[li]), r: 4 }));

  // Readout
  const hair = el("line", { class: "h-hair", y1: m.top, y2: m.top + ih, visibility: "hidden" });
  const focus = el("circle", { class: "h-dot", r: 4, visibility: "hidden" });
  svg.append(hair, focus);
  const tip = document.createElement("div");
  tip.className = "history-tip";
  tip.hidden = true;
  let index = li;
  const show = (i) => {
    index = i;
    hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i)); hair.setAttribute("visibility", "visible");
    focus.setAttribute("cx", x(i)); focus.setAttribute("cy", y(values[i])); focus.setAttribute("visibility", "visible");
    tip.replaceChildren(
      Object.assign(document.createElement("strong"), { className: "num", textContent: `${fmt.format(values[i])} ${s.iqd}` }),
      Object.assign(document.createElement("span"), { textContent: historyDate(pts[i].t, withTime) }),
    );
    tip.hidden = false;
    const left = Math.min(Math.max(x(i) - tip.offsetWidth / 2, 0), width - tip.offsetWidth);
    tip.style.left = `${left}px`;
  };
  const hide = () => { hair.setAttribute("visibility", "hidden"); focus.setAttribute("visibility", "hidden"); tip.hidden = true; };
  const indexAt = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    return Math.max(0, Math.min(li, Math.round(((px - m.left) / iw) * li)));
  };
  svg.addEventListener("pointerdown", (e) => show(indexAt(e.clientX)));
  svg.addEventListener("pointermove", (e) => show(indexAt(e.clientX)));
  svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
  svg.addEventListener("focus", () => show(index));
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    show(Math.max(0, Math.min(li, index + (e.key === "ArrowRight" ? 1 : -1))));
  });
  box.replaceChildren(svg, tip);
}

function applyTab() {
  const gold = isGoldTab();
  const usdDown = !state.data && state.failed;
  for (const b of els.tabButtons) b.setAttribute("aria-selected", String(b.dataset.tab === state.tab));
  els.tabs.dataset.active = state.tab;
  els.goldPanel.hidden = !gold;
  els.usdPanel.hidden = gold || usdDown;
  els.errorView.hidden = gold || !usdDown;
  els.legend.hidden = gold;
  els.goldSource.hidden = !gold;
  els.marketSource.hidden = gold;
  els.footnote.textContent = gold ? t().goldFootnote : t().footnote;
  els.shareBtn.disabled = gold ? !state.gold : !state.data;
}

function moveThumb({ instant = false } = {}) {
  const btn = els.tabButtons.find((b) => b.dataset.tab === state.tab);
  if (!btn || !btn.offsetWidth) return;
  const thumb = els.tabThumb;
  if (instant) thumb.style.transition = "none";
  thumb.style.width = `${btn.offsetWidth}px`;
  thumb.style.transform = `translateX(${btn.offsetLeft}px)`;
  if (instant) {
    void thumb.offsetWidth;
    thumb.style.transition = "";
  }
}

function renderStatus() {
  const s = t();
  const gold = isGoldTab();
  const hasData = gold ? Boolean(state.gold) : Boolean(state.data);
  const failed = gold ? state.goldFailed : state.failed;
  const updatedAt = gold ? state.goldAt : state.updatedAt;
  let st;
  let text;
  if (state.offline) {
    st = "offline";
    text = updatedAt ? `${s.offline} · ${relativeTime(updatedAt)}` : s.offline;
  } else if (state.loading) {
    st = "loading";
    text = hasData ? s.updating : s.loading;
  } else if (!hasData) {
    st = "stale";
    text = gold ? s.goldError : s.errorTitle;
  } else if (failed || Date.now() - updatedAt > STALE_MS) {
    st = "stale";
    text = `${s.lastUpdate} ${relativeTime(updatedAt)}`;
  } else {
    st = "live";
    text = `${s.live} · ${relativeTime(updatedAt)}`;
  }
  els.status.dataset.state = st;
  els.statusText.textContent = text;
}

function relativeTime(ts) {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 15) return t().justNow;
  const rtf = new Intl.RelativeTimeFormat(isRTL() ? "ar-u-nu-latn" : "en", { numeric: "auto" });
  if (sec < 60) return rtf.format(-Math.floor(sec / 15) * 15, "second");
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hours = Math.round(min / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

function renderAll(opts) {
  renderCards(opts);
  renderMarket(opts);
  renderGold(opts);
  applyTab();
  renderStatus();
}

/* ---------- Data ---------- */

let refreshTimer = 0;

function scheduleRefresh(delay = REFRESH_MS) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => load(), delay);
  const btn = els.refreshBtn;
  btn.style.setProperty("--refresh-ms", `${REFRESH_MS}ms`);
  btn.style.setProperty("--refresh-delay", `${delay - REFRESH_MS}ms`);
  btn.classList.remove("counting");
  void btn.offsetWidth;
  btn.classList.add("counting");
}

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function load({ manual = false } = {}) {
  if (state.loading) return;
  if (manual) haptic.tap();
  clearTimeout(refreshTimer);
  state.loading = true;
  els.refreshBtn.classList.add("loading");
  els.refreshBtn.classList.remove("counting");
  renderStatus();

  // The sources load independently: one failing doesn't blank the others.
  const [usd, gold, market] = await Promise.allSettled([getJSON(API_URL), getJSON(GOLD_API_URL), getJSON(MARKET_API_URL)]);
  if (manual) await sleep(600);
  const previous = state.data;
  const hadGold = Boolean(state.gold);

  if (usd.status === "fulfilled" && CITIES.every((c) => usd.value[c.key])) {
    state.data = usd.value;
    state.updatedAt = Date.now();
    state.failed = false;
    writeJSON(CACHE_KEY, { data: state.data, t: state.updatedAt });
  } else {
    console.error("Failed to load rates:", usd.reason || "unexpected response");
    state.failed = true;
  }

  if (gold.status === "fulfilled" && Number(gold.value.price) > 0) {
    state.gold = gold.value;
    state.goldAt = Date.now();
    state.goldFailed = false;
    writeJSON(GOLD_CACHE_KEY, { gold: state.gold, t: state.goldAt });
  } else {
    console.error("Failed to load gold:", gold.reason || "unexpected response");
    state.goldFailed = true;
  }

  if (market.status === "fulfilled" && Number(market.value.mid) > 0) {
    state.market = market.value;
    state.marketFailed = false;
    writeJSON(MARKET_CACHE_KEY, { market: state.market, t: Date.now() });
  } else {
    console.error("Failed to load market average:", market.reason || "unexpected response");
    state.marketFailed = true;
  }

  if (!state.failed || !state.goldFailed) state.offline = false;
  state.loading = false;
  els.refreshBtn.classList.remove("loading");
  onFreshData(previous, hadGold);

  const tabFailed = isGoldTab() ? state.goldFailed : state.failed;
  if (manual) {
    if (tabFailed) {
      haptic.error();
      toast(t().refreshFailed);
    } else {
      haptic.success();
      toast(t().refreshed);
    }
  } else if (!state.data && state.failed) {
    haptic.error();
  }
  if (!document.hidden) scheduleRefresh();
  if (state.market) loadHistory();
}

function onFreshData(previous, hadGold) {
  renderAll({ animate: true });

  if (!previous && state.data) {
    for (const el of els.usdPanel.querySelectorAll(".price-value .num, .delta, .price-sub .num, [data-role='spread']")) {
      restartAnimation(el, "appear");
    }
  }
  if (!hadGold && state.gold) {
    for (const el of els.goldPanel.querySelectorAll(".karat-iqd .num, .karat-usd .num, #spot")) {
      restartAnimation(el, "appear");
    }
  }

  let changed = 0;
  if (previous) {
    for (const c of CITIES) {
      for (const kind of KINDS) {
        const before = Number(previous[c.key]?.[kind]);
        const after = rateOf(c.key, kind);
        if (after == null || before === after) continue;
        changed++;
        restartAnimation(els.cardEls[c.key].prices[kind].col, after > before ? "flash-up" : "flash-down");
      }
    }
  }
  if (changed) haptic.soft();
}

/* ---------- Share & toast ---------- */

function shareText() {
  const s = t();
  if (isGoldTab()) {
    if (!state.gold) return null;
    const lines = KARATS.map((k) => {
      const iqd = goldIqd(k);
      return s.goldShareLine(k, iqd == null ? "—" : fmtInt.format(iqd), fmtUsd.format(goldUsd(k)));
    });
    return `${s.goldShareTitle}\n\n${lines.join("\n")}\n\n${s.goldShareNote}`;
  }
  if (!state.data) return null;
  const lines = CITIES.map((c) =>
    s.shareLine(cityName(c.key), fmt.format(rateOf(c.key, "sell")), fmt.format(rateOf(c.key, "buy"))));
  const m = state.market;
  if (m) {
    const gap = m.gapPct == null ? "" : `${m.gapPct >= 0 ? "+" : "−"}${Math.abs(m.gapPct).toFixed(1)}%`;
    lines.push("", s.shareMarket(fmt.format(m.mid), gap));
  }
  return `${s.shareTitle}\n\n${lines.join("\n")}`;
}

async function share() {
  haptic.tap();
  track("share", { detail: state.tab });
  const text = shareText();
  if (!text) return;
  const url = SHARE_URL || location.origin;

  if (inTelegram && tg.isVersionAtLeast("6.1")) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    return;
  }
  if (navigator.share) {
    try { await navigator.share({ text, url }); } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n\n${url}`);
    toast(t().copied);
  } catch (err) {
    console.error("Copy failed:", err);
  }
}

let toastTimer = 0;

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

/* ---------- Disclaimer sheet ---------- */

const SHEET_MS = 420;
const hasBackButton = inTelegram && tg.isVersionAtLeast("6.1");
let sheetTimer = 0;

function openLegal() {
  haptic.tap();
  track("legal");
  const sheet = els.legalSheet;
  clearTimeout(sheetTimer);
  sheet.hidden = false;
  els.legalBody.scrollTop = 0;
  document.body.style.overflow = "hidden";
  // Let the closed position render first so the slide-up transition runs.
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("open")));
  if (hasBackButton) {
    tg.BackButton.onClick(closeLegal);
    tg.BackButton.show();
  }
}

function closeLegal() {
  const sheet = els.legalSheet;
  if (sheet.hidden || !sheet.classList.contains("open")) return;
  sheet.classList.remove("open");
  document.body.style.overflow = "";
  if (hasBackButton) {
    tg.BackButton.offClick(closeLegal);
    tg.BackButton.hide();
  }
  sheetTimer = setTimeout(() => { sheet.hidden = true; }, reducedMotion.matches ? 0 : SHEET_MS);
}

/* ---------- Pop transition (language and tabs) ---------- */

let switching = false;

// Blocks shrink away, `swap` changes the page while nothing is visible, then the blocks
// returned by `rowsAfter` pop back in row by row, in reading order.
async function popTransition(rowsBefore, swap, rowsAfter) {
  if (reducedMotion.matches || !els.app.animate) {
    swap();
    return;
  }
  switching = true;
  const popOut = rowsBefore.flat().map((el) => el.animate(
    [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.6)" }],
    { duration: 120, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
  ));
  await Promise.all(popOut.map((a) => a.finished.catch(() => {})));

  swap();
  popOut.forEach((a) => a.cancel());
  rowsAfter().forEach((row, r) => row.forEach((el, k) => el.animate(
    [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }],
    { duration: 460, delay: 100 + r * 70 + k * 45, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)", fill: "backwards" },
  )));

  await sleep(150);
  switching = false;
}

const qAll = (sel, root = els.app) => [...root.querySelectorAll(sel)];

function contentRows(tab) {
  if (tab === "gold") {
    return [
      qAll("#goldCard .city-head"),
      ...qAll("#goldCard .karat-row").map((row) => [row]),
      qAll("#goldCard .gold-foot, #goldError:not([hidden])"),
    ];
  }
  if (!els.errorView.hidden) return [[els.errorView]];
  const rows = [];
  if (!els.market.card.hidden) {
    rows.push(
      qAll("#marketCard .city-head"),
      qAll("#marketCard .market-main"),
      qAll("#marketCard .market-sides .price"),
      qAll("#marketCard .market-stats"),
      qAll("#marketCard .market-history, #marketCard .market-updated"),
    );
  }
  rows.push(...qAll(".city").map((card) => qAll(".city-head, .price", card)));
  return rows;
}

function langPopRows() {
  return [
    qAll(".appbar .logo, .appbar .brand > div:not(.logo), .appbar .icon-btn"),
    [els.tabs],
    ...contentRows(state.tab),
    [els.shareBtn],
    [els.foot],
  ];
}

function toggleLanguage() {
  if (switching) return;
  haptic.select();
  track("lang", { detail: state.lang === "ar" ? "en" : "ar" });
  popTransition(langPopRows(), () => {
    state.lang = state.lang === "ar" ? "en" : "ar";
    savePrefs();
    applyLanguage();
    renderAll();
    moveThumb({ instant: true });
  }, langPopRows);
}

function selectTab(tab) {
  if (tab === state.tab || switching) return;
  haptic.select();
  track("tab", { detail: tab });
  const rows = () => [...contentRows(state.tab), [els.foot]];
  const before = rows();
  state.tab = tab;
  savePrefs();
  for (const b of els.tabButtons) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  els.tabs.dataset.active = tab;
  moveThumb();
  popTransition(before, () => {
    applyTab();
    renderStatus();
  }, rows);
}

/* ---------- Theme ---------- */

const systemScheme = () => {
  if (inTelegram) return tg.colorScheme === "dark" ? "dark" : "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

function applyScheme() {
  const scheme = state.theme || systemScheme();
  const root = document.documentElement;
  root.dataset.scheme = scheme;
  root.dataset.palette = inTelegram && scheme === systemScheme() ? "telegram" : "app";
  guardAccent(scheme);
  els.themeBtn.setAttribute("aria-pressed", String(scheme === "dark"));
  syncTelegramChrome();
}

// Some Telegram themes give a colourless accent (white, black or grey). Every tint and
// gradient is mixed from the accent, so they would come out white or grey; use the app's
// own blue instead.
function guardAccent(scheme) {
  const root = document.documentElement;
  root.style.removeProperty("--c-accent");
  const accent = getComputedStyle(root).getPropertyValue("--c-accent").trim();
  if (isColourless(accent)) root.style.setProperty("--c-accent", scheme === "dark" ? "#4c9ce6" : "#2481cc");
}

function isColourless(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  return sat < 0.25 || light > 0.9 || light < 0.1;
}

// Paint Telegram's header, background and bottom bar to match the page.
function syncTelegramChrome() {
  if (!inTelegram) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim();
  const hex = /^#[0-9a-f]{6}$/i.test(bg) ? bg : null;
  if (tg.isVersionAtLeast("6.9") && hex) tg.setHeaderColor(hex);
  else if (tg.isVersionAtLeast("6.1")) tg.setHeaderColor("secondary_bg_color");
  if (tg.isVersionAtLeast("6.1")) tg.setBackgroundColor(hex || "secondary_bg_color");
  if (tg.isVersionAtLeast("7.10")) tg.setBottomBarColor(hex || "secondary_bg_color");
}

function toggleTheme() {
  haptic.tap();
  const next = document.documentElement.dataset.scheme === "dark" ? "light" : "dark";
  // Picking the scheme Telegram/the system already uses goes back to following it.
  state.theme = next === systemScheme() ? null : next;
  savePrefs();
  track("theme", { detail: next });

  if (reducedMotion.matches) {
    applyScheme();
    return;
  }

  if (!document.startViewTransition) {
    const root = document.documentElement;
    root.classList.add("theme-fade");
    applyScheme();
    setTimeout(() => root.classList.remove("theme-fade"), 400);
    return;
  }

  // Reveal the new theme as a circle growing out of the toggle.
  const r = els.themeBtn.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const transition = document.startViewTransition(applyScheme);
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 600, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => {});
}

/* ---------- Events ---------- */

function bindEvents() {
  els.refreshBtn.addEventListener("click", () => {
    track("refresh");
    load({ manual: true });
  });
  for (const btn of [els.retryBtn, els.goldRetry]) {
    btn.addEventListener("click", () => {
      state.failed = state.goldFailed = false;
      renderAll();
      load({ manual: true });
    });
  }
  els.langBtn.addEventListener("click", toggleLanguage);
  els.themeBtn.addEventListener("click", toggleTheme);
  els.tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (btn) selectTab(btn.dataset.tab);
  });
  els.shareBtn.addEventListener("click", share);
  els.market.tfButtons.forEach((b) => b.addEventListener("click", () => selectHistoryTf(b.dataset.tf)));
  // Redraw the chart to the card's width (first layout, rotation, desktop resize).
  let chartWidth = 0;
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w && w !== chartWidth) {
      chartWidth = w;
      drawHistory();
    }
  }).observe(els.market.hchart);
  els.legalBtn.addEventListener("click", openLegal);
  els.legalSheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeLegal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLegal();
  });

  // Inside Telegram, external links open in the phone's browser.
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a.ext-link");
    if (!link || !inTelegram) return;
    e.preventDefault();
    tg.openLink(link.href);
  });

  window.addEventListener("resize", () => moveThumb({ instant: true }));
  window.addEventListener("online", () => { state.offline = false; load(); });
  window.addEventListener("offline", () => { state.offline = true; renderStatus(); });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(refreshTimer);
      return;
    }
    const age = Date.now() - state.updatedAt;
    if (age > REFRESH_MS / 2) load();
    else scheduleRefresh(REFRESH_MS - age);
    renderStatus();
  });

  setInterval(() => {
    renderStatus();
    renderMarketUpdated();
  }, 5_000);

  if (inTelegram) {
    tg.onEvent("themeChanged", applyScheme);
  } else {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyScheme);
  }
}

/* ---------- Boot ---------- */

function init() {
  applyScheme();
  buildCards();
  applyLanguage();

  // Show the last known prices instantly, then refresh in the background.
  const cached = readJSON(CACHE_KEY);
  if (cached?.data && Date.now() - cached.t < CACHE_MAX_AGE_MS) {
    state.data = cached.data;
    state.updatedAt = cached.t;
  }
  for (const tf of HISTORY_TFS) {
    const cachedHistory = readJSON(`borsa:history:${tf}`);
    if (cachedHistory?.points?.length >= 2 && Date.now() - cachedHistory.at < CACHE_MAX_AGE_MS) state.history[tf] = cachedHistory;
  }
  const cachedMarket = readJSON(MARKET_CACHE_KEY);
  if (cachedMarket?.market && Date.now() - cachedMarket.t < CACHE_MAX_AGE_MS) state.market = cachedMarket.market;
  const cachedGold = readJSON(GOLD_CACHE_KEY);
  if (cachedGold?.gold && Date.now() - cachedGold.t < CACHE_MAX_AGE_MS) {
    state.gold = cachedGold.gold;
    state.goldAt = cachedGold.t;
  }
  renderAll();
  moveThumb({ instant: true });
  bindEvents();
  track("open", { detail: state.tab, ref: entryRef });

  if (inTelegram) {
    tg.ready();
    tg.expand();
  }

  if (!reducedMotion.matches) {
    els.content.classList.add("enter");
    setTimeout(() => els.content.classList.remove("enter"), 1200);
  }

  load();
}

init();
