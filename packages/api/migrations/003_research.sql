-- P5: research results and evidence screenshots.
-- Screenshots are copied out of the runner (whose container is destroyed after
-- each job) into tenant-scoped storage, with their sha256 checked on the way in.

ALTER TABLE runs ADD COLUMN knowledge jsonb;

CREATE TABLE evidence_screenshots (
  evidence_id uuid PRIMARY KEY REFERENCES evidence(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sha256      text NOT NULL CHECK (sha256 ~ '^sha256:[a-f0-9]{64}$'),
  mime        text NOT NULL CHECK (mime = 'image/png'),
  bytes       bytea NOT NULL CHECK (octet_length(bytes) <= 5242880),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evidence_screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_screenshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evidence_screenshots
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON evidence_screenshots TO wallio_app;
