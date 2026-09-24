-- Data the scheduled job fetches from rate-limited sources, so their request count stays
-- the same however many people open the app. One row per source.
CREATE TABLE cache (
  key TEXT PRIMARY KEY,       -- gold_history
  value TEXT,                 -- JSON; null until the first successful fetch
  fetched_at INTEGER,         -- unix time, ms, of the last successful fetch
  tried_at INTEGER NOT NULL,  -- unix time, ms, of the last attempt
  error TEXT                  -- why the last attempt failed, if it did
);
