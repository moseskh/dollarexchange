-- Switches the /admin dashboard turns on and off (see src/features.js). A switch without a
-- row is on.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,   -- 1 on, 0 off
  updated_at INTEGER NOT NULL -- unix time, ms
);
-- usdiqd.com was sending wrong prices when the switches were added, so its card starts off.
INSERT INTO settings (key, enabled, updated_at) VALUES ('market', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
