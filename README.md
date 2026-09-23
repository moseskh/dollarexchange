# Borsa Mini App

A Telegram Mini App that shows the USD → IQD borsa rates (sell / buy) for Baghdad, Basra and Erbil, using data from [iraqborsa.com](https://iraqborsa.com).

**Live:** https://dollarexchange.mosakh.workers.dev (Cloudflare Workers). To publish changes, run `npm run deploy`.

- **One card per city:** sell and buy for Baghdad, Basra and Erbil, each with the change since the previous price, the price of $100, and the buy/sell spread.
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
| `src/worker.js` | Cloudflare Worker that serves the page and `GET /api/rates` |
| `wrangler.jsonc` | Worker config |

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

You need a free Cloudflare account.

```sh
npx wrangler login
npm run deploy
```

The deploy prints your app URL, e.g. `https://dollarexchange.<your-subdomain>.workers.dev`.

## Connect it to Telegram

1. In Telegram, open [@BotFather](https://t.me/BotFather) and send `/newbot`. Pick a name and a username.
2. Send `/mybots`, choose your bot, then **Bot Settings → Menu Button → Configure menu button**.
3. Send your `workers.dev` URL, then a button label (e.g. `الأسعار`).
4. Open a chat with your bot and tap the menu button. The app opens inside Telegram.

Optional: send `/newapp` to BotFather to create a direct link (`t.me/<bot>/<app>`) you can share anywhere.

## Customising

There's no build step: edit the files and reload.

In `public/app.js`:

- `SHARE_URL`: the link added when users share rates. Set it to your bot's Mini App link (e.g. `https://t.me/YourBot/app`); by default it's the `workers.dev` address.
- `CITIES`: order and names of the cities
- `STR`: all UI text, Arabic and English
- `REFRESH_MS`: auto-refresh interval

In `public/styles.css`, the tokens at the top control the look: type scale, spacing, radii, motion timing, and the fallback colours used outside Telegram.
