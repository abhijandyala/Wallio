import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to the Wallio API (Anish's service on Vultr).
 *
 * The browser talks to /api on this site, so the guest-session cookie is first-party.
 * The API refuses cross-origin writes, so this proxy only forwards requests that came
 * from this site, and presents itself to the API with the API's own origin.
 *
 * When the web app is served behind the same Caddy as the API, Caddy sends /api straight
 * to the API and this route is never used.
 */
const UPSTREAM = (process.env.WALLIO_API_ORIGIN ?? "https://149-28-76-16.sslip.io").replace(/\/$/, "");

const PASS_REQUEST = ["accept", "content-type", "cookie", "last-event-id"];
const PASS_RESPONSE = ["content-type", "cache-control", "retry-after", "x-correlation-id"];

async function forward(req: NextRequest, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;

  // Keep the API's cross-site protection: writes must come from a page on this site.
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin !== null && origin !== req.nextUrl.origin) {
    return Response.json(
      { code: "forbidden", message: "Cross-origin requests are not allowed.", retryable: false },
      { status: 403 },
    );
  }

  const target = `${UPSTREAM}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of PASS_REQUEST) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("origin", UPSTREAM);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      redirect: "manual",
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return Response.json(
      { code: "runner_unavailable", message: "The Wallio API can't be reached right now.", retryable: true },
      { status: 502 },
    );
  }

  const out = new Headers();
  for (const h of PASS_RESPONSE) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  // Session cookie: keep it first-party. On plain-http local dev, drop Secure so every browser keeps it.
  const insecure = req.nextUrl.protocol === "http:";
  for (const c of upstream.headers.getSetCookie()) {
    let v = c.replace(/;\s*Domain=[^;]*/i, "");
    if (insecure) v = v.replace(/;\s*Secure/i, "");
    out.append("set-cookie", v);
  }
  if ((upstream.headers.get("content-type") ?? "").includes("text/event-stream")) {
    out.set("cache-control", "no-cache, no-transform");
    out.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
