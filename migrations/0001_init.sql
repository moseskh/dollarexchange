-- Chats (private, groups, channels) that get a daily rates summary.
CREATE TABLE subscriptions (
  chat_id INTEGER PRIMARY KEY,
  hour INTEGER NOT NULL DEFAULT 10 CHECK (hour BETWEEN 0 AND 23), -- Baghdad time
  lang TEXT NOT NULL DEFAULT 'ar' CHECK (lang IN ('ar', 'en')),
  last_sent TEXT,                                                  -- Baghdad date, YYYY-MM-DD
  created_at INTEGER NOT NULL
);
CREATE INDEX subscriptions_due ON subscriptions (hour, last_sent);

-- One price alert per private chat, on Baghdad's dollar sell rate. Removed once it fires.
CREATE TABLE alerts (
  chat_id INTEGER PRIMARY KEY,
  target REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  lang TEXT NOT NULL DEFAULT 'ar' CHECK (lang IN ('ar', 'en')),
  created_at INTEGER NOT NULL
);
