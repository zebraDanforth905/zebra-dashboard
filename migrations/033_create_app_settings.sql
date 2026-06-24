-- Manual deployment required.
-- Store application settings used by dashboard-managed runtime config.

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key text PRIMARY KEY,
  setting_value text,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
