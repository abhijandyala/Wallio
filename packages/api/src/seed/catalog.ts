/**
 * Curated catalog: one category (coding assistants), ~15 tools.
 * Every homepage and pricing URL was fetched on 2026-11-05 and returned HTTP 200
 * (no login wall). Tools are not given capability claims here: claims come only
 * from runner captures, never from memory.
 *
 * Left out on 2026-11-05: Windsurf (pricing redirects to devin.ai), Tabnine
 * (pricing redirects to a Tricentis contact form), Gemini Code Assist for
 * individuals (redirects to a deprecation notice), OpenAI Codex (403 to
 * automated browsers), JetBrains AI (redirects to /air/), Sourcegraph Cody
 * (redirects to docs).
 */
import type { Query } from "../db/pool.ts";

export const URLS_CHECKED_AT = "2026-11-05T15:50:00Z";

export interface CatalogSeed {
  id: string;
  name: string;
  provider: string;
  homepageUrl: string;
  pricingUrl: string | null;
}

export const CATALOG: CatalogSeed[] = [
  { id: "tool_copilot", name: "GitHub Copilot", provider: "GitHub", homepageUrl: "https://github.com/features/copilot", pricingUrl: "https://github.com/features/copilot/plans" },
  { id: "tool_zed", name: "Zed", provider: "Zed Industries", homepageUrl: "https://zed.dev/", pricingUrl: "https://zed.dev/pricing" },
  { id: "tool_cursor", name: "Cursor", provider: "Cursor", homepageUrl: "https://cursor.com/", pricingUrl: "https://cursor.com/pricing" },
  { id: "tool_claude_code", name: "Claude Code", provider: "Anthropic", homepageUrl: "https://claude.com/product/claude-code", pricingUrl: "https://claude.com/pricing" },
  { id: "tool_augment", name: "Augment Code", provider: "Augment", homepageUrl: "https://www.augmentcode.com/", pricingUrl: "https://www.augmentcode.com/pricing" },
  { id: "tool_replit", name: "Replit", provider: "Replit", homepageUrl: "https://replit.com/", pricingUrl: "https://replit.com/pricing" },
  { id: "tool_amazon_q", name: "Amazon Q Developer", provider: "Amazon Web Services", homepageUrl: "https://aws.amazon.com/q/developer/", pricingUrl: "https://aws.amazon.com/q/developer/pricing/" },
  { id: "tool_amp", name: "Amp", provider: "Amp", homepageUrl: "https://ampcode.com/", pricingUrl: "https://ampcode.com/pricing" },
  { id: "tool_cline", name: "Cline", provider: "Cline", homepageUrl: "https://cline.bot/", pricingUrl: "https://cline.bot/pricing" },
  { id: "tool_kilo", name: "Kilo Code", provider: "Kilo", homepageUrl: "https://kilo.ai/", pricingUrl: "https://kilo.ai/pricing" },
  { id: "tool_qodo", name: "Qodo", provider: "Qodo", homepageUrl: "https://www.qodo.ai/", pricingUrl: "https://www.qodo.ai/pricing/" },
  { id: "tool_continue", name: "Continue", provider: "Continue", homepageUrl: "https://continue.dev/", pricingUrl: null },
  { id: "tool_aider", name: "Aider", provider: "Aider (open source)", homepageUrl: "https://aider.chat/", pricingUrl: null },
  { id: "tool_bolt", name: "Bolt", provider: "StackBlitz", homepageUrl: "https://bolt.new/", pricingUrl: "https://bolt.new/pricing" },
  { id: "tool_v0", name: "v0", provider: "Vercel", homepageUrl: "https://v0.app/", pricingUrl: "https://v0.app/pricing" },
];

export const EVAL_TASKS = [
  {
    id: "task_js_offbyone_v1",
    title: "Fix an off-by-one bug",
    description: "A small JavaScript function that should return the last N items of a list drops one item. Diagnose and fix it.",
    rubricVersion: "rubric-v1",
    sanitizedInput:
      "function lastN(items, n) {\n  return items.slice(items.length - n + 1);\n}\n// lastN([1,2,3,4,5], 2) should be [4,5]",
    expected: "lastN([1,2,3,4,5], 2) deep-equals [4,5]; lastN([1,2,3], 3) deep-equals [1,2,3]; lastN([1], 0) deep-equals []",
  },
];

/** Idempotent upsert of the global catalog. Run as the DB owner. */
export async function seedCatalog(q: Query): Promise<number> {
  for (const t of CATALOG) {
    await q(
      `INSERT INTO catalog_tools (id, name, provider, category, homepage_url, pricing_url, review_status, url_checked_at)
       VALUES ($1,$2,$3,'coding_assistant',$4,$5,'curated',$6)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, provider=EXCLUDED.provider, homepage_url=EXCLUDED.homepage_url,
         pricing_url=EXCLUDED.pricing_url, url_checked_at=EXCLUDED.url_checked_at, updated_at=now()`,
      [t.id, t.name, t.provider, t.homepageUrl, t.pricingUrl, URLS_CHECKED_AT],
    );
  }
  for (const t of EVAL_TASKS) {
    await q(
      `INSERT INTO eval_tasks (id, title, description, rubric_version, sanitized_input, expected)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
         rubric_version=EXCLUDED.rubric_version, sanitized_input=EXCLUDED.sanitized_input, expected=EXCLUDED.expected`,
      [t.id, t.title, t.description, t.rubricVersion, t.sanitizedInput, t.expected],
    );
  }
  return CATALOG.length;
}
