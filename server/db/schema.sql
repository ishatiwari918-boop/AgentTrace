CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          SERIAL PRIMARY KEY,
  project_id  INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_hash    TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spans (
  id          BIGSERIAL PRIMARY KEY,
  project_id  INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trace_id    TEXT NOT NULL,
  span_id     TEXT NOT NULL,
  parent_id   TEXT,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'chain',
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  input       JSONB,
  output      JSONB,
  model       TEXT,
  tokens_in   INT,
  tokens_out  INT,
  cost_usd    NUMERIC(12, 6),
  status      TEXT NOT NULL DEFAULT 'ok',
  error       TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  UNIQUE (project_id, span_id)
);

CREATE INDEX IF NOT EXISTS idx_spans_project_trace ON spans (project_id, trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_project_time  ON spans (project_id, start_time DESC);