-- Owned evaluation page (golden path §4.2).
-- The server gets a candidate fix from a Vultr model; the page runs it against
-- fixed test cases INSIDE the runner's isolated browser, never on this server.
-- The page URL carries a short-lived random token (only its hash is stored).

ALTER TABLE eval_tasks ADD COLUMN tests jsonb NOT NULL DEFAULT '[]', ADD COLUMN entrypoint text NOT NULL DEFAULT '';

CREATE TABLE eval_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id         uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  token_hash     text NOT NULL UNIQUE,
  task_id        text NOT NULL REFERENCES eval_tasks(id),
  candidate_code text NOT NULL CHECK (length(candidate_code) <= 4000),
  model          text NOT NULL,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE eval_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON eval_sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON eval_sessions TO wallio_app;

-- The page is opened by the runner's browser, which has no session cookie. This
-- narrow lookup returns only what the page needs, for an unexpired token.
CREATE FUNCTION wallio_eval_page(p_token_hash text)
RETURNS TABLE (session_id uuid, title text, description text, entrypoint text, tests jsonb, candidate_code text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, t.title, t.description, t.entrypoint, t.tests, s.candidate_code
    FROM eval_sessions s JOIN eval_tasks t ON t.id = s.task_id
   WHERE s.token_hash = p_token_hash AND s.expires_at > now();
$$;
REVOKE ALL ON FUNCTION wallio_eval_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallio_eval_page(text) TO wallio_app;
