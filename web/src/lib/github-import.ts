/**
 * GitHub connector (PRD Flow B), server side only. Reads a PUBLIC repository's metadata,
 * language mix, file names and root package.json through GitHub's REST API, and turns them
 * into suggestions the person reviews before anything is saved. It never reads other file
 * contents, private repositories, issues or secrets, and never writes to GitHub.
 */

export interface GithubFinding {
  repo: { fullName: string; url: string; description: string | null; defaultBranch: string; pushedAt: string | null };
  languages: { name: string; share: number }[];
  frameworks: string[];
  /** AI coding tools whose config files are in the repo. toolId is set when the tool is in Wallio's catalog. */
  tools: { toolId: string | null; name: string; evidence: string }[];
  /** Suggested main tasks (Wallio workflow ids) and why. */
  workflows: { id: string; reason: string }[];
  filesScanned: number;
  truncated: boolean;
  readAt: string;
}

export class GithubImportError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** "owner/repo", or a github.com URL to it. Anything else is refused before any request is made. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const t = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?:\/.*)?$/.exec(t) ??
    /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/.exec(t);
  if (!m || m[2] === "." || m[2] === "..") return null;
  return { owner: m[1]!, repo: m[2]! };
}

/** Config files that show which AI coding tool a repository is set up for. */
const TOOL_FILES: { test: (path: string) => boolean; toolId: string | null; name: string }[] = [
  { test: (p) => p === ".github/copilot-instructions.md" || p.startsWith(".github/instructions/") || p.startsWith(".github/prompts/"), toolId: "tool_copilot", name: "GitHub Copilot" },
  { test: (p) => p === ".cursorrules" || p.startsWith(".cursor/"), toolId: "tool_cursor", name: "Cursor" },
  { test: (p) => p === "CLAUDE.md" || p.endsWith("/CLAUDE.md") || p.startsWith(".claude/"), toolId: "tool_claude_code", name: "Claude Code" },
  { test: (p) => p === ".aider.conf.yml" || p === ".aiderignore", toolId: "tool_aider", name: "Aider" },
  { test: (p) => p.startsWith(".continue/") || p === ".continuerc.json", toolId: "tool_continue", name: "Continue" },
  { test: (p) => p === ".clinerules" || p.startsWith(".clinerules/") || p.startsWith(".cline/"), toolId: "tool_cline", name: "Cline" },
  { test: (p) => p.startsWith(".kilocode/"), toolId: "tool_kilo", name: "Kilo Code" },
  { test: (p) => p.startsWith(".zed/"), toolId: "tool_zed", name: "Zed" },
  { test: (p) => p.startsWith(".amazonq/"), toolId: "tool_amazon_q", name: "Amazon Q Developer" },
  { test: (p) => p.startsWith(".augment/") || p === ".augment-guidelines", toolId: "tool_augment", name: "Augment Code" },
  { test: (p) => p === ".pr_agent.toml" || p.startsWith(".qodo/"), toolId: "tool_qodo", name: "Qodo" },
  { test: (p) => p === ".replit" || p === "replit.nix", toolId: "tool_replit", name: "Replit" },
  { test: (p) => p.startsWith(".bolt/"), toolId: "tool_bolt", name: "Bolt" },
  { test: (p) => p === ".windsurfrules" || p.startsWith(".windsurf/"), toolId: null, name: "Windsurf" },
  { test: (p) => p === "AGENTS.md", toolId: null, name: "AGENTS.md (read by several coding agents)" },
];

const FRAMEWORKS: [string, string][] = [
  ["next", "Next.js"], ["react", "React"], ["vue", "Vue"], ["svelte", "Svelte"], ["@angular/core", "Angular"],
  ["express", "Express"], ["hono", "Hono"], ["fastify", "Fastify"], ["vite", "Vite"], ["tailwindcss", "Tailwind CSS"],
  ["typescript", "TypeScript"], ["vitest", "Vitest"], ["jest", "Jest"], ["@playwright/test", "Playwright"], ["playwright-core", "Playwright"],
];
const FRONTEND = new Set(["Next.js", "React", "Vue", "Svelte", "Angular", "Vite"]);

const API = "https://api.github.com";
const cache = new Map<string, { at: number; finding: GithubFinding }>();
const TTL_MS = 10 * 60_000;

async function gh<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "wallio-web", "x-github-api-version": "2022-11-28" };
  // Optional server-side token, only to raise GitHub's rate limit. Never sent to the browser.
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`${API}${path}`, { headers, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (res.status === 404) throw new GithubImportError(404, "That repository doesn't exist or isn't public. Wallio only reads public repositories.");
  if (res.status === 403 || res.status === 429) throw new GithubImportError(429, "GitHub is limiting requests right now. Try again in a few minutes.");
  if (!res.ok) throw new GithubImportError(502, `GitHub answered ${res.status}.`);
  return (await res.json()) as T;
}

export async function readPublicRepo(owner: string, repo: string): Promise<GithubFinding> {
  const key = `${owner}/${repo}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.finding;

  const meta = await gh<{ full_name: string; html_url: string; description: string | null; default_branch: string; pushed_at: string | null; private: boolean; archived: boolean; size: number }>(`/repos/${owner}/${repo}`);
  if (meta.private) throw new GithubImportError(404, "That repository is private. Wallio only reads public repositories.");
  const [langs, tree] = await Promise.all([
    gh<Record<string, number>>(`/repos/${owner}/${repo}/languages`),
    gh<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`),
  ]);

  const total = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({ name, share: Math.round((bytes / total) * 100) / 100 }));

  const paths = tree.tree.map((t) => t.path);
  const tools: GithubFinding["tools"] = [];
  for (const t of TOOL_FILES) {
    const evidence = paths.find(t.test);
    if (evidence) tools.push({ toolId: t.toolId, name: t.name, evidence });
  }

  // The root package.json is the only file content read, and only if it's small.
  let frameworks: string[] = [];
  const pkg = tree.tree.find((t) => t.path === "package.json" && t.type === "blob");
  if (pkg && (pkg.size ?? 0) < 200_000) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(meta.default_branch)}/package.json`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const json = (await res.json()) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        const deps = new Set([...Object.keys(json.dependencies ?? {}), ...Object.keys(json.devDependencies ?? {})]);
        frameworks = [...new Set(FRAMEWORKS.filter(([d]) => deps.has(d)).map(([, n]) => n))];
      }
    } catch {
      // A malformed package.json just means no framework hints.
    }
  }

  const workflows: GithubFinding["workflows"] = [];
  const isWeb = frameworks.some((f) => FRONTEND.has(f)) || languages.some((l) => ["TypeScript", "JavaScript"].includes(l.name) && l.share >= 0.3);
  if (isWeb) workflows.push({ id: "wf_debugging", reason: "A web front end in TypeScript or JavaScript" });
  if (paths.some((p) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$/.test(p))) workflows.push({ id: "wf_tests", reason: "The repository has a test suite" });
  if (paths.some((p) => /^\.github\/(pull_request_template\.md|PULL_REQUEST_TEMPLATE)/i.test(p) || p === ".github/CODEOWNERS" || p === "CODEOWNERS")) {
    workflows.push({ id: "wf_review", reason: "Pull request templates or code owners" });
  }

  const finding: GithubFinding = {
    repo: { fullName: meta.full_name, url: meta.html_url, description: meta.description, defaultBranch: meta.default_branch, pushedAt: meta.pushed_at },
    languages,
    frameworks,
    tools,
    workflows: workflows.slice(0, 3),
    filesScanned: paths.length,
    truncated: tree.truncated,
    readAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), finding });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return finding;
}
