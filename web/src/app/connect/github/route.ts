import type { NextRequest } from "next/server";
import { GithubImportError, parseRepo, readPublicRepo } from "@/lib/github-import";

/**
 * GET /connect/github?repo=owner/name — read a public repository and return suggestions.
 * Read-only, public repositories only, nothing stored here: the person reviews the result
 * and only what they keep is saved, as a profile version through the Wallio API.
 */
export async function GET(req: NextRequest) {
  const parsed = parseRepo(req.nextUrl.searchParams.get("repo") ?? "");
  if (!parsed) {
    return Response.json({ message: "Enter a public repository as owner/name or a github.com link." }, { status: 400 });
  }
  try {
    return Response.json(await readPublicRepo(parsed.owner, parsed.repo), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof GithubImportError) return Response.json({ message: e.message }, { status: e.status });
    return Response.json({ message: "Couldn't reach GitHub. Try again in a moment." }, { status: 502 });
  }
}
