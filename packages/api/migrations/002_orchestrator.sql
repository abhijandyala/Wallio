-- P4: job queue, leases, spend accounting.
--
-- The worker needs a few cross-tenant reads (find the next queued run, find
-- stale runs, sum today's spend). Instead of giving the app role BYPASSRLS,
-- those reads are narrow SECURITY DEFINER functions owned by the migration
-- role (a superuser, so RLS does not bind it). They return only run and tenant
-- IDs; everything else the worker does happens in a tenant-scoped transaction.

ALTER TABLE runs
  ADD COLUMN actual_micro_usd bigint NOT NULL DEFAULT 0 CHECK (actual_micro_usd >= 0),
  ADD COLUMN runner_job_id    text,
  ADD COLUMN queued_at        timestamptz NOT NULL DEFAULT now();

CREATE INDEX runs_lease_idx ON runs (lease_expires_at) WHERE lease_owner IS NOT NULL;

-- Claim the oldest unleased queued run of a mode. FOR UPDATE SKIP LOCKED means
-- two workers never claim the same run. Sets the execution deadline at claim
-- time, so queue wait and execution time are bounded separately.
CREATE FUNCTION wallio_claim_run(p_owner text, p_mode text, p_lease_secs int, p_exec_secs int)
RETURNS TABLE (run_id uuid, tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE runs r
     SET lease_owner = p_owner,
         lease_expires_at = now() + make_interval(secs => p_lease_secs),
         deadline_at = now() + make_interval(secs => p_exec_secs),
         attempt = r.attempt + 1,
         updated_at = now()
   WHERE r.id = (
     SELECT id FROM runs
      WHERE status = 'QUEUED' AND mode = p_mode AND lease_owner IS NULL
      ORDER BY queued_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1)
  RETURNING r.id, r.tenant_id;
$$;

-- Runs that need recovery. Never used to re-execute: callers fail, time out or
-- re-queue (only when nothing has started yet).
CREATE FUNCTION wallio_stale_runs(p_queue_max_secs int, p_cleanup_max_secs int)
RETURNS TABLE (run_id uuid, tenant_id uuid, status text, mode text, lease_owner text, reason text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, tenant_id, status, mode, lease_owner,
         CASE
           WHEN status = 'QUEUED' AND lease_owner IS NOT NULL AND lease_expires_at < now() THEN 'requeue'
           WHEN status = 'QUEUED' AND queued_at < now() - make_interval(secs => p_queue_max_secs) THEN 'queue_timeout'
           WHEN status IN ('PREPARING','RUNNING','VERIFYING','AWAITING_APPROVAL') AND deadline_at < now() THEN 'deadline'
           WHEN status IN ('PREPARING','RUNNING','VERIFYING') AND (lease_owner IS NULL OR lease_expires_at < now()) THEN 'lease_expired'
           WHEN status = 'CLEANING' AND updated_at < now() - make_interval(secs => p_cleanup_max_secs) THEN 'cleanup_stuck'
         END AS reason
    FROM runs
   WHERE (status = 'QUEUED' AND ((lease_owner IS NOT NULL AND lease_expires_at < now()) OR queued_at < now() - make_interval(secs => p_queue_max_secs)))
      OR (status IN ('PREPARING','RUNNING','VERIFYING','AWAITING_APPROVAL') AND deadline_at < now())
      OR (status IN ('PREPARING','RUNNING','VERIFYING') AND (lease_owner IS NULL OR lease_expires_at < now()))
      OR (status = 'CLEANING' AND updated_at < now() - make_interval(secs => p_cleanup_max_secs));
$$;

CREATE FUNCTION wallio_queue_depth(p_mode text)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM runs WHERE mode = p_mode AND status = 'QUEUED';
$$;

-- Today's committed spend across all tenants (UTC day): the larger of reserved
-- and actual per run, so in-flight reservations count against the ceiling.
CREATE FUNCTION wallio_spend_today_minor()
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(GREATEST(reserved_minor, actual_minor)), 0)::bigint
    FROM runs WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
$$;

REVOKE ALL ON FUNCTION wallio_claim_run(text, text, int, int), wallio_stale_runs(int, int),
  wallio_queue_depth(text), wallio_spend_today_minor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallio_claim_run(text, text, int, int), wallio_stale_runs(int, int),
  wallio_queue_depth(text), wallio_spend_today_minor() TO wallio_app;
