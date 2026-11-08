/**
 * Data every new guest workspace starts with (golden path §3).
 * Amounts are the synthetic demo user's own statements (source "seed"), matched
 * to public prices seen on 2026-11-05. Vendor prices used in a recommendation
 * always come from runner captures, never from here.
 */
import type { Query } from "../db/pool.ts";

export const DEMO_PROFILE = {
  primaryRole: "Independent web developer",
  workflows: [{ id: "wf_debugging", name: "Debugging a small web app", description: "Find and fix front-end bugs in a TypeScript project", priority: 1 }],
  budget: { currency: "USD", maxMonthlyMinor: 4000 },
  deploymentPreference: "cloud",
  dataSensitivity: "medium",
  willingnessToSwitch: "medium",
  requiredIntegrations: [] as string[],
  attributes: [
    { key: "top_workflow", value: "debugging", origin: "user_stated", source: null, confidence: null, confirmed: true },
    { key: "primary_language", value: "TypeScript", origin: "inferred", source: "public demo repository", confidence: "medium", confirmed: false },
  ],
};

function inDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function seedDemoWorkspace(q: Query, tenantId: string): Promise<void> {
  const now = new Date().toISOString();
  const profile = { ...DEMO_PROFILE, attributes: DEMO_PROFILE.attributes.map((a) => ({ ...a, updatedAt: now })) };
  await q("INSERT INTO profile_versions (tenant_id, version, body) VALUES ($1, 1, $2)", [tenantId, profile]);

  const subs: Array<[string, string, boolean, number | null, string | null, string | null, string, string]> = [
    ["tool_copilot", "Pro", true, 1000, "USD", null, "monthly", inDays(15)],
    ["tool_claude_code", "Pro (billed monthly)", true, 2000, "USD", null, "monthly", inDays(23)],
    ["tool_replit", "Core (billed annually)", false, null, null, "You haven't entered the annual amount yet", "annual", inDays(116)],
  ];
  for (const [tool, plan, known, amt, cur, reason, cadence, renewal] of subs) {
    await q(
      `INSERT INTO subscriptions (tenant_id, tool_id, plan, price_known, amount_minor, currency, unknown_reason, cadence, seats, renewal_date, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,'seed')`,
      [tenantId, tool, plan, known, amt, cur, reason, cadence, renewal],
    );
  }
}
