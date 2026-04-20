CREATE TABLE personas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  archetype       TEXT,
  industry        TEXT,
  description     TEXT NOT NULL,
  responsibilities TEXT,
  concerns        TEXT NOT NULL,        -- JSON array
  quotes          TEXT,                 -- JSON array
  decision_criteria TEXT,              -- JSON array
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE runs (
  id                    TEXT PRIMARY KEY,  -- ULID
  input_type            TEXT NOT NULL,     -- 'url' | 'file' | 'text'
  input_url             TEXT,
  input_filename        TEXT,
  input_r2_key          TEXT,
  input_word_count      INTEGER,
  persona_ids           TEXT NOT NULL,     -- JSON array of persona IDs
  status                TEXT NOT NULL,     -- 'running' | 'completed' | 'failed'
  started_at            INTEGER NOT NULL,
  completed_at          INTEGER,
  total_duration_ms     INTEGER,
  total_cost_usd_micros INTEGER,
  error                 TEXT,
  created_by            TEXT NOT NULL
);

CREATE TABLE scorecards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  persona_id      INTEGER NOT NULL REFERENCES personas(id),
  overall_score   INTEGER NOT NULL,       -- 0-100
  relevance       TEXT NOT NULL,          -- 'high' | 'medium' | 'low' | 'none'
  summary         TEXT NOT NULL,
  raw_response    TEXT,                   -- full Claude JSON for debugging
  created_at      INTEGER NOT NULL
);

CREATE TABLE findings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  scorecard_id    INTEGER NOT NULL REFERENCES scorecards(id),
  category_id     TEXT NOT NULL,          -- messaging_fit, trust_credibility, etc.
  severity        TEXT NOT NULL,          -- critical, high, medium, low
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  evidence        TEXT,
  recommendation  TEXT NOT NULL,
  reasoning       TEXT NOT NULL
);

CREATE TABLE audit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  seq             INTEGER NOT NULL,
  event_type      TEXT NOT NULL,
  step_id         TEXT,
  payload_json    TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE(run_id, seq)
);
