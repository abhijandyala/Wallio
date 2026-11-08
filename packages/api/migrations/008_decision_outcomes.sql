-- Decisions page: whether a decision helped, recorded at its check-in.
-- Append-only like decisions: the latest outcome per decision wins.
CREATE TABLE decision_outcomes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  result      text NOT NULL CHECK (result IN ('helped', 'no_change')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decision_outcomes_decision ON decision_outcomes (tenant_id, decision_id, created_at DESC);
CREATE INDEX decisions_tenant_rec ON decisions (tenant_id, recommendation_id, created_at DESC);
ALTER TABLE decision_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_outcomes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON decision_outcomes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON decision_outcomes TO wallio_app;
