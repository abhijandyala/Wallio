-- One runner job per purpose (research per tool, eval, form, containment), run one
-- at a time. Every job id is recorded BEFORE the job is created, so cleanup can
-- always find and verify each one (PRD §15). runner_job_id stays as the latest.
ALTER TABLE runs ADD COLUMN runner_job_ids text[] NOT NULL DEFAULT '{}';
UPDATE runs SET runner_job_ids = ARRAY[runner_job_id] WHERE runner_job_id IS NOT NULL;
