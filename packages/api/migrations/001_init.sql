-- Wallio core schema (P2).
-- Every tenant-owned table carries tenant_id and is protected twice:
--   1. every query filters on tenant_id explicitly, and
--   2. row-level security (FORCE'd, so it also binds the table owner) using app.tenant_id,
--      which the API sets per transaction. The app connects as the non-superuser role wallio_app.
-- Money is integer minor units (cents). Never floats.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────── identity ─────────────

CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('guest', 'user')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);

-- Session tokens are random; only their sha256 is stored.
CREATE TABLE sessions (
  token_hash   text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_workspace_idx ON sessions (workspace_id);

-- ───────────── global curated data (not tenant-owned) ─────────────

CREATE TABLE catalog_tools (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  provider      text NOT NULL,
  category      text NOT NULL,
  homepage_url  text NOT NULL,
  pricing_url   text,
  review_status text NOT NULL CHECK (review_status IN ('curated', 'pending_review')),
  url_checked_at timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_claims (
  id           text PRIMARY KEY,
  tool_id      text NOT NULL REFERENCES catalog_tools(id) ON DELETE CASCADE,
  text         text NOT NULL,
  status       text NOT NULL CHECK (status IN ('supported', 'contradicted', 'unknown')),
  source_url   text NOT NULL,
  captured_at  timestamptz NOT NULL,
  evidence_ids text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE eval_tasks (
  id             text PRIMARY KEY,
  title          text NOT NULL,
  description    text NOT NULL,
  rubric_version text NOT NULL,
  sanitized_input text NOT NULL,
  expected       text NOT NULL
);

-- ───────────── tenant-owned ─────────────

CREATE TABLE profile_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version    integer NOT NULL CHECK (version > 0),
  body       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version)
);

CREATE TABLE subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tool_id         text NOT NULL REFERENCES catalog_tools(id),
  plan            text NOT NULL,
  price_known     boolean NOT NULL,
  amount_minor    bigint CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency        char(3),
  unknown_reason  text,
  cadence         text NOT NULL CHECK (cadence IN ('monthly', 'annual', 'usage_based', 'free')),
  seats           integer NOT NULL DEFAULT 1 CHECK (seats > 0),
  renewal_date    date,
  tax_included    boolean,
  source          text NOT NULL CHECK (source IN ('user_entered', 'imported', 'seed')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  last_verified_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (price_known AND amount_minor IS NOT NULL AND currency IS NOT NULL AND unknown_reason IS NULL)
    OR (NOT price_known AND amount_minor IS NULL AND unknown_reason IS NOT NULL)
  )
);
CREATE INDEX subscriptions_tenant_idx ON subscriptions (tenant_id);

CREATE TABLE comparisons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  request_hash    text NOT NULL,
  request         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  comparison_id       uuid NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
  mode                text NOT NULL CHECK (mode IN ('mock', 'live')),
  -- lifecycle and outcome are separate on purpose (PRD §15)
  status              text NOT NULL CHECK (status IN ('CREATED','QUEUED','PREPARING','RUNNING','AWAITING_APPROVAL','VERIFYING','SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','CLEANING','CLEANED','CLEANUP_FAILED')),
  outcome             text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','succeeded','partial','failed','timed_out','cancelled')),
  stage               text NOT NULL DEFAULT 'planning' CHECK (stage IN ('planning','researching','testing','verifying','reporting','done')),
  cleanup             text NOT NULL DEFAULT 'not_started' CHECK (cleanup IN ('not_started','pending','cleaned','failed')),
  deadline_at         timestamptz NOT NULL,
  spend_currency      char(3) NOT NULL DEFAULT 'USD',
  reserved_minor      bigint NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  actual_minor        bigint NOT NULL DEFAULT 0 CHECK (actual_minor >= 0),
  cap_minor           bigint NOT NULL CHECK (cap_minor > 0),
  evidence_count      integer NOT NULL DEFAULT 0,
  candidates_researched integer NOT NULL DEFAULT 0,
  candidates_tested   integer NOT NULL DEFAULT 0,
  pending_approval_id uuid,
  recommendation_id   uuid,
  error               jsonb,
  last_event_seq      integer NOT NULL DEFAULT 0,
  -- worker lease (used by the P4 orchestrator)
  lease_owner         text,
  lease_expires_at    timestamptz,
  attempt             integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX runs_tenant_idx ON runs (tenant_id);
CREATE INDEX runs_queue_idx ON runs (status, created_at) WHERE status IN ('QUEUED', 'PREPARING', 'RUNNING');

CREATE TABLE run_events (
  tenant_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id     uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq        integer NOT NULL CHECK (seq > 0),
  ts         timestamptz NOT NULL DEFAULT now(),
  type       text NOT NULL,
  stage      text NOT NULL,
  message    text NOT NULL CHECK (length(message) BETWEEN 1 AND 300),
  data       jsonb NOT NULL,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE evidence (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id            uuid REFERENCES runs(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('vendor_claim','observed_behavior','executed_test','user_input')),
  candidate_tool_id text REFERENCES catalog_tools(id),
  access_mode       text CHECK (access_mode IN ('researched','tested_integration','tested_owned_demo')),
  url               text,
  canonical_url     text,
  captured_at       timestamptz NOT NULL,
  content_hash      text CHECK (content_hash IS NULL OR content_hash ~ '^sha256:[a-f0-9]{64}$'),
  screenshot_key    text,
  extraction_method text NOT NULL CHECK (extraction_method IN ('dom','vision','api','manual')),
  excerpt           text NOT NULL DEFAULT '' CHECK (length(excerpt) <= 2000),
  limitation        text NOT NULL CHECK (length(limitation) > 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_run_idx ON evidence (tenant_id, run_id);

CREATE TABLE recommendations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id             uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  profile_version_id uuid NOT NULL REFERENCES profile_versions(id),
  body               jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recommendation_id     uuid NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  profile_version_id    uuid NOT NULL REFERENCES profile_versions(id),
  choice                text NOT NULL CHECK (choice IN ('accept','dismiss','defer','disagree')),
  reason                text,
  review_date           date,
  evidence_snapshot_ids uuid[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id      uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  intent      jsonb NOT NULL,
  intent_hash text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','expired','consumed','invalidated')),
  expires_at  timestamptz NOT NULL,
  decided_at  timestamptz,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Append-only: the app role gets INSERT and SELECT, never UPDATE or DELETE.
CREATE TABLE audit_events (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor      text NOT NULL,
  action     text NOT NULL,
  target     text,
  details    jsonb NOT NULL DEFAULT '{}',
  correlation_id text,
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inference_usage (
  id                 bigserial PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id             uuid REFERENCES runs(id) ON DELETE SET NULL,
  correlation_id     text NOT NULL,
  purpose            text NOT NULL,
  model              text NOT NULL,
  ok                 boolean NOT NULL,
  error_code         text,
  attempts           integer NOT NULL,
  repair_attempted   boolean NOT NULL,
  latency_ms         integer NOT NULL,
  prompt_tokens      integer,
  completion_tokens  integer,
  est_cost_micro_usd bigint,
  at                 timestamptz NOT NULL
);

-- ───────────── row-level security ─────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profile_versions','subscriptions','comparisons','runs','run_events','evidence',
                           'recommendations','decisions','approvals','audit_events','inference_usage']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- ───────────── grants for the app role ─────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON workspaces, sessions, profile_versions, subscriptions, comparisons, runs,
  run_events, evidence, recommendations, decisions, approvals, inference_usage TO wallio_app;
GRANT SELECT ON catalog_tools, catalog_claims, eval_tasks TO wallio_app;
GRANT SELECT, INSERT ON audit_events TO wallio_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO wallio_app;
