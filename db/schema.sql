-- Smart Trainer schema (idempotent).

CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider      TEXT PRIMARY KEY,          -- 'strava' | 'whoop'
  athlete_id    TEXT,                      -- provider-side user id
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  scope         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activities (
  id               TEXT PRIMARY KEY,       -- 'strava:<id>' or 'whoop:<uuid>'
  source           TEXT NOT NULL,
  sport            TEXT NOT NULL,
  name             TEXT,
  start_time       TIMESTAMPTZ NOT NULL,
  duration_s       INTEGER,
  distance_m       DOUBLE PRECISION,
  elevation_m      DOUBLE PRECISION,
  avg_hr           DOUBLE PRECISION,
  max_hr           DOUBLE PRECISION,
  avg_watts        DOUBLE PRECISION,
  suffer_score     DOUBLE PRECISION,       -- Strava relative effort
  strain           DOUBLE PRECISION,       -- WHOOP strain (0-21)
  kilojoules       DOUBLE PRECISION,
  raw              JSONB,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activities_start_idx ON activities (start_time DESC);

CREATE TABLE IF NOT EXISTS recovery (
  day                DATE PRIMARY KEY,     -- local day the recovery applies to
  sleep_id           TEXT,
  recovery_score     DOUBLE PRECISION,     -- 0-100
  hrv_rmssd_ms       DOUBLE PRECISION,
  resting_hr         DOUBLE PRECISION,
  spo2               DOUBLE PRECISION,
  skin_temp_c        DOUBLE PRECISION,
  raw                JSONB,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sleep (
  id                   TEXT PRIMARY KEY,
  day                  DATE NOT NULL,       -- local day of wake-up
  start_time           TIMESTAMPTZ,
  end_time             TIMESTAMPTZ,
  is_nap               BOOLEAN DEFAULT false,
  performance_pct      DOUBLE PRECISION,
  efficiency_pct       DOUBLE PRECISION,
  total_sleep_min      DOUBLE PRECISION,
  rem_min              DOUBLE PRECISION,
  deep_min             DOUBLE PRECISION,
  respiratory_rate     DOUBLE PRECISION,
  raw                  JSONB,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sleep_day_idx ON sleep (day DESC);

CREATE TABLE IF NOT EXISTS cycles (
  id          TEXT PRIMARY KEY,
  day         DATE NOT NULL,
  strain      DOUBLE PRECISION,
  kilojoules  DOUBLE PRECISION,
  avg_hr      DOUBLE PRECISION,
  raw         JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cycles_day_idx ON cycles (day DESC);

CREATE TABLE IF NOT EXISTS daily_plans (
  day         DATE PRIMARY KEY,
  plan        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  thread_id   TEXT NOT NULL,
  role        TEXT NOT NULL,               -- 'user' | 'assistant'
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_thread_idx ON chat_messages (thread_id, id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint    TEXT PRIMARY KEY,
  keys        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);
