/**
 * Writes JSON Schema files for teammates who don't use TypeScript/zod
 * (e.g. a Python runner). Run: npm run contracts:schema
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { api, runner, CONTRACT_VERSION } from "../src/index.ts";

const OUT = new URL("../json-schema/", import.meta.url);

const groups = {
  api: {
    ComparisonRequest: api.ComparisonRequest,
    ComparisonAccepted: api.ComparisonAccepted,
    Run: api.Run,
    RunEvent: api.RunEvent,
    InventoryResponse: api.InventoryResponse,
    SubscriptionInput: api.SubscriptionInput,
    ProfileVersionInput: api.ProfileVersionInput,
    ProfileVersion: api.ProfileVersion,
    Evidence: api.Evidence,
    Recommendation: api.Recommendation,
    ApprovalIntent: api.ApprovalIntent,
    ApprovalDecisionRequest: api.ApprovalDecisionRequest,
    DecisionRequest: api.DecisionRequest,
    Decision: api.Decision,
    DeferRequest: api.DeferRequest,
    DismissRequest: api.DismissRequest,
    DecisionOutcomeRequest: api.DecisionOutcomeRequest,
    DecisionLogEntry: api.DecisionLogEntry,
    DecisionsOverview: api.DecisionsOverview,
    ApiError: api.ApiError,
  },
  runner: {
    RunnerJobCreate: runner.RunnerJobCreate,
    RunnerJobStatus: runner.RunnerJobStatus,
    RunnerActionRequest: runner.RunnerActionRequest,
    RunnerActionResult: runner.RunnerActionResult,
    Observation: runner.Observation,
    RunnerCancelRequest: runner.RunnerCancelRequest,
    CleanupReport: runner.CleanupReport,
    RunnerHttpError: runner.RunnerHttpError,
  },
} as const;

for (const [group, schemas] of Object.entries(groups)) {
  const dir = new URL(`${group}/`, OUT);
  mkdirSync(dir, { recursive: true });
  for (const [name, schema] of Object.entries(schemas)) {
    const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    json.$id = `wallio/${group}/${name}@${CONTRACT_VERSION}`;
    writeFileSync(new URL(`${name}.schema.json`, dir), JSON.stringify(json, null, 2) + "\n");
  }
}
console.log(`Wrote JSON Schema for contract ${CONTRACT_VERSION} to packages/contracts/json-schema/`);
console.log("Note: cross-field rules (refine) are enforced only by the zod validators.");
