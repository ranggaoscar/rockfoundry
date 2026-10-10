import { createHash, timingSafeEqual } from "node:crypto";

/** Personal deployment access gate, not multi-tenant accounts or client-owned roles. */
export function workAccessResponse(
  request: { headers: Headers },
  env: Record<string, string | undefined> = process.env,
): Response | null {
  if (env.ROCKFOUNDRY_PUBLIC_DEMO === "true")
    return Response.json(
      { error: "Work OS is disabled in the public demo." },
      { status: 403 },
    );
  const password = env.ROCKFOUNDRY_WORK_ACCESS_KEY;
  const mustAuthenticate =
    env.NODE_ENV === "production" ||
    env.HERMES_EXECUTOR_ENABLED === "true" ||
    !!env.ROCKFOUNDRY_WORK_ORIGIN;
  if (!password && !mustAuthenticate) {
    try {
      const host = new URL(`http://${request.headers.get("host") || ""}`)
        .hostname;
      if (["localhost", "127.0.0.1", "[::1]"].includes(host)) return null;
    } catch {
      /* invalid authority fails closed */
    }
  }
  if (!password || password.length < 32)
    return Response.json(
      { error: "Owner access is not provisioned. Work OS remains locked." },
      { status: 503 },
    );
  let supplied = "";
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ") && header.length < 4096) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    if (decoded.startsWith("rockfoundry:"))
      supplied = decoded.slice("rockfoundry:".length);
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(password)))
    return Response.json(
      {
        error:
          "Owner sign-in required. Open /api/work to sign in using HTTP Basic authentication.",
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate":
            'Basic realm="Rock Foundry Work OS", charset="UTF-8"',
          "Cache-Control": "no-store",
        },
      },
    );
  return null;
}
