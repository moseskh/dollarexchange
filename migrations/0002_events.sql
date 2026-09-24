-- Usage events from the app, the bot and the scheduled job, for the /admin dashboard.
-- Users are stored only as a salted hash; raw Telegram ids never reach the database.
-- The scheduled job deletes rows older than 90 days.
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,       -- unix time, ms
  source TEXT NOT NULL,      -- app | bot | cron
  event TEXT NOT NULL,       -- app: open, tab, share, lang, theme, refresh, legal
                             -- bot: command, text, button, inline, join, leave
                             -- cron: alert_sent, summary_sent
  platform TEXT,             -- app: Telegram platform (ios, android, tdesktop, ...) or 'browser'; bot: chat type
  lang TEXT,                 -- ar | en
  theme TEXT,                -- light | dark (app)
  detail TEXT,               -- tab (usd | gold), bot command or button view
  ref TEXT,                  -- app open: how it was opened (share, bot, menu, direct)
  country TEXT,              -- ISO code from Cloudflare
  user TEXT,                 -- salted hash of the Telegram user id, or of a browser id
  user_kind TEXT,            -- telegram | browser
  value REAL                 -- cron: messages sent in that run
);
CREATE INDEX events_ts ON events (ts);
CREATE INDEX events_kind_ts ON events (source, event, ts);
