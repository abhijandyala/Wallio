-- P8: one correlation ID follows a run everywhere: the HTTP request that created it,
-- runner jobs, inference usage rows, evidence, approvals, errors and logs.
ALTER TABLE runs ADD COLUMN correlation_id text;
UPDATE runs SET correlation_id = 'run_' || replace(id::text, '-', '') WHERE correlation_id IS NULL;

ALTER TABLE evidence ADD COLUMN correlation_id text;
ALTER TABLE approvals ADD COLUMN correlation_id text;

-- Filled from the run on insert, so every writer gets it without passing it around.
CREATE FUNCTION wallio_inherit_correlation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.correlation_id IS NULL AND NEW.run_id IS NOT NULL THEN
    SELECT correlation_id INTO NEW.correlation_id FROM runs WHERE id = NEW.run_id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evidence_correlation BEFORE INSERT ON evidence FOR EACH ROW EXECUTE FUNCTION wallio_inherit_correlation();
CREATE TRIGGER approvals_correlation BEFORE INSERT ON approvals FOR EACH ROW EXECUTE FUNCTION wallio_inherit_correlation();
