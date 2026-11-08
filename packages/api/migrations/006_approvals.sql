-- P7: approval gate, synthetic trial form, containment run.

-- Run kinds. The comparisons row is the stored, idempotent request for every kind.
ALTER TABLE comparisons ADD COLUMN kind text NOT NULL DEFAULT 'comparison'
  CHECK (kind IN ('comparison', 'trial_request', 'containment'));

-- ───────────── approvals: the only path to an external effect ─────────────
-- intent is the canonical record the user saw; intent_hash = sha256 of its canonical JSON.
-- The row is immutable except for its status and timestamps, and status may only move
-- forward along the allowed edges. Nothing can approve a row except the user's decision
-- (the API's decision endpoint); the worker can only consume, expire or invalidate.
CREATE INDEX approvals_run_idx ON approvals (run_id);

CREATE FUNCTION wallio_approvals_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.run_id <> OLD.run_id
     OR NEW.intent <> OLD.intent OR NEW.intent_hash <> OLD.intent_hash
     OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'approval intents are immutable';
  END IF;
  IF OLD.status IN ('consumed', 'declined', 'expired', 'invalidated') THEN
    RAISE EXCEPTION 'approval % is final and cannot change (status %)', OLD.id, OLD.status;
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'pending'  AND NEW.status IN ('approved', 'declined', 'expired', 'invalidated')) OR
       (OLD.status = 'approved' AND NEW.status IN ('consumed', 'expired', 'invalidated'))
     ) THEN
    RAISE EXCEPTION 'approval status cannot move from % to %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'consumed' AND OLD.status = 'approved' AND OLD.expires_at <= now() THEN
    RAISE EXCEPTION 'an expired approval cannot be consumed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approvals_guard BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION wallio_approvals_guard();
REVOKE DELETE ON approvals FROM wallio_app;

-- ───────────── owned synthetic trial-request form (forms.<domain>) ─────────────
-- Opened by the runner's browser, which has no session. The URL token is the only
-- credential (only its hash is stored); a token accepts exactly one submission.
CREATE TABLE form_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id       uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  tool_name    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  submitted_at timestamptz,
  submission   jsonb,
  reference    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE form_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON form_sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON form_sessions TO wallio_app;

CREATE FUNCTION wallio_form_page(p_token_hash text)
RETURNS TABLE (tool_name text, submitted boolean, reference text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT f.tool_name, f.submitted_at IS NOT NULL, f.reference
    FROM form_sessions f WHERE f.token_hash = p_token_hash AND f.expires_at > now();
$$;

-- Accepts the first submission only. Returns accepted | duplicate | unknown.
CREATE FUNCTION wallio_form_submit(p_token_hash text, p_submission jsonb, p_reference text)
RETURNS TABLE (result text, reference text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f form_sessions%ROWTYPE;
BEGIN
  SELECT * INTO f FROM form_sessions WHERE token_hash = p_token_hash AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unknown'::text, NULL::text; RETURN; END IF;
  IF f.submitted_at IS NOT NULL THEN RETURN QUERY SELECT 'duplicate'::text, f.reference; RETURN; END IF;
  UPDATE form_sessions SET submitted_at = now(), submission = p_submission, reference = p_reference WHERE id = f.id;
  RETURN QUERY SELECT 'accepted'::text, p_reference;
END $$;

REVOKE ALL ON FUNCTION wallio_form_page(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION wallio_form_submit(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallio_form_page(text) TO wallio_app;
GRANT EXECUTE ON FUNCTION wallio_form_submit(text, jsonb, text) TO wallio_app;
