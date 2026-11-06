/**
 * Reset demo: forget this browser's guest workspace. The next API call creates a fresh one
 * with the demo data. The cookie name matches packages/api/src/http/session.ts.
 */
export function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(req.url).origin) {
    return Response.json({ code: "forbidden", message: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  const headers = new Headers();
  headers.append("set-cookie", `wallio_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  return new Response(null, { status: 204, headers });
}
