"use strict";

/* ---------- Config ---------- */

const API_URL = "/api/rates";
const REFRESH_MS = 60_000;
const STALE_MS = 3 * 60_000;
const CACHE_MAX_AGE_MS = 24 * 60 * 60_000;
const CACHE_KEY = "borsa:last";
const PREFS_KEY = "borsa:prefs";
// Link included when sharing rates; opens the Mini App directly in Telegram.
const SHARE_URL = "https://t.me/IraqDollarExchangeBot?startapp";

const CITIES = [
  { key: "b", ar: "بغداد", en: "Baghdad" },
  { key: "s", ar: "البصرة", en: "Basra" },
  { key: "n", ar: "أربيل", en: "Erbil" },
];
const KINDS = ["sell", "buy"];

const STR = {
  ar: {
    appName: "بورصة الدولار",
    langToggle: "EN",
    langLabel: "English",
    theme: "الوضع الداكن",
    refresh: "تحديث الأسعار",
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
    shareAll: "مشاركة الأسعار",
    bestLegend: "أفضل سعر بين المدن",
    footnote: "الأسعار بالدينار العراقي لكل 1 دولار أمريكي",
    source: "المصدر:",
    disclaimerLabel: "تنبيه:",
    disclaimer: "يعرض هذا التطبيق الأسعار المنشورة على موقع iraqborsa.com العام للاطلاع فقط، ولا يعمل في تداول العملات أو صرفها.",
    errorTitle: "تعذّر جلب الأسعار",
    errorBody: "تحقق من اتصالك بالإنترنت ثم حاول مجدداً",
    retry: "إعادة المحاولة",
    refreshed: "تم تحديث الأسعار",
    refreshFailed: "تعذّر التحديث، حاول بعد قليل",
    copied: "تم نسخ الأسعار",
    shareTitle: "💵 سعر الدولار في البورصة",
    shareLine: (city, sell, buy) => `${city}: بيع ${sell} · شراء ${buy}`,
  },
  en: {
    appName: "Dollar Borsa",
    langToggle: "ع",
    langLabel: "العربية",
    theme: "Dark mode",
    refresh: "Refresh rates",
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
    shareAll: "Share rates",
    bestLegend: "Best rate across cities",
    footnote: "Rates in Iraqi dinar per 1 US dollar",
    source: "Source:",
    disclaimerLabel: "Disclaimer:",
    disclaimer: "This app only shows prices published on the public website iraqborsa.com, for information only. It doesn't trade or exchange currencies.",
    errorTitle: "Couldn't load rates",
    errorBody: "Check your internet connection and try again",
    retry: "Try again",
    refreshed: "Rates updated",
    refreshFailed: "Couldn't refresh, try again shortly",
    copied: "Rates copied",
    shareTitle: "💵 Dollar borsa rates",
    shareLine: (city, sell, buy) => `${city}: Sell ${sell} · Buy ${buy}`,
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

/* ---------- State ---------- */

const prefs = readJSON(PREFS_KEY) || {};
const state = {
  lang: prefs.lang === "ar" || prefs.lang === "en" ? prefs.lang : detectLang(),
  theme: prefs.theme === "light" || prefs.theme === "dark" ? prefs.theme : null, // null = follow Telegram/system
  data: null,
  updatedAt: 0,
  loading: false,
  failed: false,
  offline: navigator.onLine === false,
};

function detectLang() {
  const code = tg?.initDataUnsafe?.user?.language_code || navigator.language || "";
  return code.toLowerCase().startsWith("en") ? "en" : "ar";
}

function savePrefs() {
  writeJSON(PREFS_KEY, { lang: state.lang, theme: state.theme });
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
const cityName = (key) => CITIES.find((c) => c.key === key)[state.lang];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

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
  shareBtn: $("shareBtn"),
  errorView: $("errorView"),
  retryBtn: $("retryBtn"),
  toast: $("toast"),
};

function buildCards() {
  els.content.insertAdjacentHTML("afterbegin", CITIES.map((c, i) => `
    <section class="card city" data-city="${c.key}" style="--i:${i}">
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
    </section>`).join(""));

  els.cardEls = Object.fromEntries(CITIES.map((c) => {
    const card = els.content.querySelector(`[data-city="${c.key}"]`);
    const prices = Object.fromEntries(KINDS.map((kind) => {
      const col = card.querySelector(`.price[data-kind="${kind}"]`);
      const q = (r) => col.querySelector(`[data-role="${r}"]`);
      return [kind, { col, value: q("value"), delta: q("delta"), per100: q("per100"), pre: q("pre"), post: q("post") }];
    }));
    return [c.key, { card, name: card.querySelector('[data-role="name"]'), spread: card.querySelector('[data-role="spread"]'), prices }];
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
  for (const c of CITIES) {
    const card = els.cardEls[c.key];
    card.name.textContent = cityName(c.key);
    for (const kind of KINDS) {
      card.prices[kind].pre.textContent = s.per100[0];
      card.prices[kind].post.textContent = s.per100[1];
    }
  }
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

function renderStatus() {
  const s = t();
  const age = Date.now() - state.updatedAt;
  let st;
  let text;
  if (state.offline) {
    st = "offline";
    text = state.updatedAt ? `${s.offline} · ${relativeTime(state.updatedAt)}` : s.offline;
  } else if (state.loading) {
    st = "loading";
    text = state.data ? s.updating : s.loading;
  } else if (!state.data) {
    st = "stale";
    text = s.errorTitle;
  } else if (state.failed || age > STALE_MS) {
    st = "stale";
    text = `${s.lastUpdate} ${relativeTime(state.updatedAt)}`;
  } else {
    st = "live";
    text = `${s.live} · ${relativeTime(state.updatedAt)}`;
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
  renderStatus();
  els.shareBtn.disabled = !state.data;
  els.content.hidden = !state.data && state.failed;
  els.errorView.hidden = !els.content.hidden;
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

async function load({ manual = false } = {}) {
  if (state.loading) return;
  if (manual) haptic.tap();
  clearTimeout(refreshTimer);
  state.loading = true;
  els.refreshBtn.classList.add("loading");
  els.refreshBtn.classList.remove("counting");
  renderStatus();
  const minSpin = sleep(manual ? 600 : 0);

  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!CITIES.every((c) => json[c.key])) throw new Error("Unexpected response");
    await minSpin;
    const previous = state.data;
    state.data = json;
    state.updatedAt = Date.now();
    state.failed = false;
    state.offline = false;
    writeJSON(CACHE_KEY, { data: json, t: state.updatedAt });
    onFreshData(previous);
    if (manual) {
      haptic.success();
      toast(t().refreshed);
    }
  } catch (err) {
    console.error("Failed to load rates:", err);
    await minSpin;
    state.failed = true;
    if (manual || !state.data) haptic.error();
    if (manual && state.data) toast(t().refreshFailed);
    renderAll();
  } finally {
    state.loading = false;
    els.refreshBtn.classList.remove("loading");
    renderStatus();
    if (!document.hidden) scheduleRefresh();
  }
}

function onFreshData(previous) {
  if (!previous) {
    renderAll();
    for (const el of els.content.querySelectorAll(".price-value .num, .delta, .price-sub .num, [data-role='spread']")) {
      restartAnimation(el, "appear");
    }
    return;
  }

  let changed = 0;
  renderAll({ animate: true });
  for (const c of CITIES) {
    for (const kind of KINDS) {
      const before = Number(previous[c.key]?.[kind]);
      const after = rateOf(c.key, kind);
      if (after == null || before === after) continue;
      changed++;
      restartAnimation(els.cardEls[c.key].prices[kind].col, after > before ? "flash-up" : "flash-down");
    }
  }
  if (changed) haptic.soft();
}

/* ---------- Share & toast ---------- */

async function share() {
  haptic.tap();
  if (!state.data) return;
  const s = t();
  const lines = CITIES.map((c) =>
    s.shareLine(cityName(c.key), fmt.format(rateOf(c.key, "sell")), fmt.format(rateOf(c.key, "buy"))));
  const text = `${s.shareTitle}\n\n${lines.join("\n")}`;
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
    toast(s.copied);
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

/* ---------- Language & theme ---------- */

// Every block shrinks away, the layout mirrors while nothing is visible, then the blocks
// pop back in row by row, in the new reading order.
let switchingLang = false;

function langPopRows() {
  const q = (sel, root = els.app) => [...root.querySelectorAll(sel)];
  return [
    q(".appbar .logo, .appbar .brand > div:not(.logo), .appbar .icon-btn"),
    ...q(".city").map((card) => q(".city-head, .price", card)),
    [els.shareBtn],
    q(".foot"),
  ];
}

async function toggleLanguage() {
  if (switchingLang) return;
  haptic.select();
  const swap = () => {
    state.lang = state.lang === "ar" ? "en" : "ar";
    savePrefs();
    applyLanguage();
    renderAll();
  };
  if (reducedMotion.matches || !els.app.animate) {
    swap();
    return;
  }

  switchingLang = true;
  const rows = langPopRows();
  const popOut = rows.flat().map((el) => el.animate(
    [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.6)" }],
    { duration: 120, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
  ));
  await Promise.all(popOut.map((a) => a.finished.catch(() => {})));

  swap();
  popOut.forEach((a) => a.cancel());
  rows.forEach((row, r) => row.forEach((el, k) => el.animate(
    [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }],
    { duration: 460, delay: 100 + r * 70 + k * 45, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)", fill: "backwards" },
  )));

  await sleep(900);
  switchingLang = false;
}

const systemScheme = () => {
  if (inTelegram) return tg.colorScheme === "dark" ? "dark" : "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

function applyScheme() {
  const scheme = state.theme || systemScheme();
  const root = document.documentElement;
  root.dataset.scheme = scheme;
  root.dataset.palette = inTelegram && scheme === systemScheme() ? "telegram" : "app";
  els.themeBtn.setAttribute("aria-pressed", String(scheme === "dark"));
  syncTelegramChrome();
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
  els.refreshBtn.addEventListener("click", () => load({ manual: true }));
  els.retryBtn.addEventListener("click", () => {
    state.failed = false;
    renderAll();
    load({ manual: true });
  });
  els.langBtn.addEventListener("click", toggleLanguage);
  els.themeBtn.addEventListener("click", toggleTheme);
  els.shareBtn.addEventListener("click", share);

  // Inside Telegram, external links open in the phone's browser.
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a.ext-link");
    if (!link || !inTelegram) return;
    e.preventDefault();
    tg.openLink(link.href);
  });

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

  setInterval(renderStatus, 5_000);

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

  // Show the last known rates instantly, then refresh in the background.
  const cached = readJSON(CACHE_KEY);
  if (cached?.data && Date.now() - cached.t < CACHE_MAX_AGE_MS) {
    state.data = cached.data;
    state.updatedAt = cached.t;
  }
  renderAll();
  bindEvents();

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
