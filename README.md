# Iraq Exchange (بورصة العراق)

A Telegram Mini App that shows the USD → IQD borsa rates (sell / buy) for Baghdad, Basra and Erbil, using data from [iraqborsa.com](https://iraqborsa.com), plus gold prices per mithqal.

**Live:** https://dollarexchange.mosakh.workers.dev. Every push to `main` deploys automatically.

- **Two tabs:** Dollar and Gold, with the last one used remembered.
- **Iraq market average:** a second source, [usdiqd.com](https://usdiqd.com), below the city cards. It shows the market middle price and its change, buy/sell and spread, and the gap from the official rate. It updates every few minutes and shows when the source last updated. It includes a price history chart of the middle price (14 days, 60 days or 10 weeks), with a touch readout, the change over the range, and a table view. usdiqd.com's own site shows only the middle price. Its `buy` is the higher number, so the Worker maps the sides by value: the higher price is بيع (sell), as on the city cards.
- **One card per city:** sell and buy for Baghdad, Basra and Erbil, each with the change since the previous price, the price of $100, and the buy/sell spread.
- **Gold:** 24, 21 and 18 karat per mithqal (5 g), in dinars and dollars. Calculated from the world gold price ([gold-api.com](https://gold-api.com)) and converted at Baghdad's dollar sell rate, so gold shops may charge more.
- **Best rate:** ★ marks the cheapest place to buy dollars (lowest sell) and the best place to sell them (highest buy).
- **Share:** sends all three cities' rates to any Telegram chat.
- **Always fresh:** refreshes every minute (the ring on the refresh button counts down), and again when the user comes back to the app. The last rates are saved on the device, so they appear instantly on the next open.
- **Light/dark toggle:** a sun/moon button in the header. The icon morphs and the new theme spreads from the button as a growing circle. Follows Telegram's (or the system's) theme until the user picks one, and the choice is remembered.
- **Native feel:** uses the user's Telegram theme colours, Telegram haptics, and animates rate changes. Respects the system "reduce motion" setting.
- **Languages:** Arabic (RTL) by default, English if the user's Telegram is set to English, with a toggle in the header.

## How it works

| File | What it does |
| --- | --- |
| `public/index.html` | Page markup |
| `public/styles.css` | Design system: colour, type, spacing and motion tokens, then components |
| `public/app.js` | App logic: data, rendering, sharing, Telegram integration |
| `public/fonts/` | IBM Plex Sans Arabic, self-hosted (SIL Open Font License, see `OFL.txt`) |
| `public/_headers` | Caches font files for a year |
| `public/bot/` | Thumbnails for the bot's inline results |
| `src/worker.js` | Cloudflare Worker entry: serves the page, `GET /api/rates` (city dollar rates), `GET /api/market` (Iraq market average), `GET /api/market/history?tf=12h|1d|1w`, `GET /api/gold` (world gold price), the bot webhook, and the 5-minute cron |
| `src/rates.js` | Fetches and caches the upstream prices; gold-per-mithqal math |
| `src/bot.js` | The Telegram bot: commands, action buttons, inline mode, groups, summaries and alerts |
| `src/texts.js` | Everything the bot says (Arabic and English), its profile and command menus |
| `src/telegram.js` | Small Bot API client |
| `src/analytics.js` | Usage events (app, bot, cron) and the dashboard's numbers |
| `src/dashboard.html` | The `/admin` analytics dashboard |
| `migrations/` | Database schema (Cloudflare D1): subscriptions, alerts, analytics events |
| `wrangler.jsonc` | Worker config: static files, database, cron trigger |

`/api/rates` proxies `https://iraqborsa.com/borsa-api/summary.php`. The page can't call that API directly because it sends no CORS headers, so browsers block the request. The Worker caches the upstream response for 30 seconds, so the source isn't hit on every app open.

Upstream response fields:

| Key | Meaning |
| --- | --- |
| `b`, `s`, `n` | Baghdad, Basra, Erbil |
| `sell`, `buy` | Current rate, IQD per 1 USD |
| `psell`, `pbuy` | Previous rate |
| `sd`, `bd` | Change since previous (IQD) |
| `sp`, `bp` | Change since previous (%) |

## Run locally

```sh
npm install
npm run dev
```

Open http://127.0.0.1:8787. Outside Telegram the page falls back to the system light/dark theme.

If `npm install` warns that `esbuild` and `workerd` install scripts weren't run, you can ignore it. Wrangler works without them.

## Deploy

The app runs on Cloudflare Workers and deploys from GitHub through [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/): every push to `main` runs `npx wrangler deploy` on Cloudflare. Build status shows as a check on each commit.

To set it up on a new Cloudflare account, create the Worker once (`npx wrangler login && npm run deploy`), then connect this repo under **Workers & Pages → dollarexchange → Settings → Build**.

## Telegram

The app runs as the Main Mini App of [@IraqDollarExchangeBot](https://t.me/IraqDollarExchangeBot). Direct link: https://t.me/IraqDollarExchangeBot?startapp

### What the bot does

| Command | What it does | Where |
| --- | --- | --- |
| `/dollar` | Dollar rates for the three cities | Private, groups, channels |
| `/gold` | Gold per mithqal, in dinars and dollars | Private, groups, channels |
| `/alert 1580` | Messages you once when Baghdad's sell rate reaches the price (Arabic digits and per-$100 quotes like `158000` work) | Private |
| `/subscribe [hour]` | Daily summary at that hour, Baghdad time (default 10). In groups, admins only. In channels, add `en` for English | Private, groups, channels |
| `/unsubscribe` | Stops the daily summary | Private, groups, channels |
| `/help`, `/start` | Welcome and commands | Anywhere |

- **Action buttons:** every rates message has 🔄 Refresh and a Dollar/Gold switch that edit the message in place, plus an "Open the app" button. That's a `web_app` button in private chats, and a `t.me/...?startapp` link elsewhere, because Telegram only allows `web_app` buttons in private chats.
- **Inline mode:** typing `@IraqDollarExchangeBot` in any chat offers dollar and gold messages to send.
- **Groups:** privacy mode stays on, so the bot only sees its own commands. It replies to the command, posts a short intro when added, and drops that chat's subscription when removed.
- **Scheduled:** a cron trigger runs every 5 minutes. It sends alerts that have been reached and daily summaries that are due, up to 20 of each per run (Workers' outgoing-request limit), then removes alerts and subscriptions for chats that blocked or removed the bot.
- **Language:** replies follow the user's Telegram language (Arabic by default). Summaries and alerts keep the language they were set up in.

### Setup

The bot needs two secrets on the Worker (**Workers & Pages → dollarexchange → Settings → Variables and Secrets**, type *Secret*). They're never stored in the repo:

| Secret | Value |
| --- | --- |
| `BOT_TOKEN` | The token from @BotFather |
| `WEBHOOK_SECRET` | Any random string (letters, digits, `_`, `-`) |

After setting them, register the bot once. This sets the webhook, command menus, and the bot's name and descriptions from `src/texts.js`:

```sh
curl -X POST https://dollarexchange.mosakh.workers.dev/telegram/setup -H "Authorization: Bearer <WEBHOOK_SECRET>"
```

Inline mode must be switched on once in @BotFather (`/setinline`).

### Database

Subscriptions and alerts live in the Cloudflare D1 database `iraq-exchange`. Pushes don't change its schema: after adding a file to `migrations/`, apply it with:

```sh
npx wrangler d1 migrations apply iraq-exchange --remote
```

## Analytics dashboard

https://dollarexchange.mosakh.workers.dev/admin: any username, and the `DASHBOARD_PASSWORD` secret as the password.

It shows unique users (with the change against the previous period), app opens, Telegram vs browser visitors, bot users and actions, and shares. Charts: daily activity, platforms, countries, how the app is opened (shared link, bot, chat menu, direct), tab, language and theme, bot commands and where they're used, busiest hours (Baghdad time), and daily summaries and alerts sent. Every chart has a table view.

How it's collected:

- **App:** sends small events (open, tab switch, share, language, theme, refresh, disclaimer) to `POST /api/event` with `navigator.sendBeacon`.
- **Bot and cron:** the Worker records bot commands, button taps, inline searches, joins and leaves, and scheduled sends.
- **Unique users:** counted by Telegram account, but only when Telegram's signed `initData` verifies against the bot token, so they can't be faked. Visits outside Telegram count as browser visitors, one per device.
- **Privacy:** users are stored as `HMAC(ANALYTICS_SALT, id)`, never the raw id. Events are kept 90 days.

Secrets:

| Secret | Value |
| --- | --- |
| `ANALYTICS_SALT` | Random string for hashing user ids. Changing it resets unique-user counting |
| `DASHBOARD_PASSWORD` | Password for `/admin` |

## Customising

There's no build step: edit the files and reload.

In `public/app.js`:

- `SHARE_URL`: the link added when users share rates. Set it to your bot's Mini App link (e.g. `https://t.me/YourBot/app`); by default it's the `workers.dev` address.
- `CITIES`: order and names of the cities
- `STR`: all UI text, Arabic and English
- `REFRESH_MS`: auto-refresh interval

In `public/styles.css`, the tokens at the top control the look: type scale, spacing, radii, motion timing, and the fallback colours used outside Telegram.
