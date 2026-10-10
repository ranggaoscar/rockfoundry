export const OWNER_COOKIE = "__Secure-rockfoundry.session-token";
export const OWNER_SESSION_SECONDS = 8 * 60 * 60;
type Env = Record<string, string | undefined>;
export function ownerAuthReady(env: Env = process.env) {
  return (
    !!env.GOOGLE_CLIENT_ID &&
    !!env.GOOGLE_CLIENT_SECRET &&
    (env.NEXTAUTH_SECRET?.length || 0) >= 32 &&
    !!env.ROCKFOUNDRY_OWNER_EMAILS &&
    !!env.NEXTAUTH_URL &&
    (env.NODE_ENV !== "production" ||
      env.NEXTAUTH_URL === "https://foundry.rockbase.web.id")
  );
}
/** Local-first dev stays usable only on loopback; production always requires a provisioned owner session. */
export function ownerDevFallbackAllowed(
  request: { headers: Headers },
  env: Env = process.env,
) {
  if (env.NODE_ENV === "production" || ownerAuthReady(env)) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(`http://${request.headers.get("host") || ""}`).hostname,
    );
  } catch {
    return false;
  }
}
export function isOwnerIdentity(
  identity: {
    email?: unknown;
    sub?: unknown;
    verified?: unknown;
    provider?: unknown;
  },
  env: Env = process.env,
) {
  const emails = (env.ROCKFOUNDRY_OWNER_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const subjects = (env.ROCKFOUNDRY_OWNER_GOOGLE_SUBS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    identity.provider === "google" &&
    identity.verified === true &&
    typeof identity.sub === "string" &&
    !!identity.sub &&
    typeof identity.email === "string" &&
    emails.includes(identity.email.toLowerCase()) &&
    (!subjects.length || subjects.includes(identity.sub))
  );
}
export function isOwnerToken(
  token: Record<string, unknown> | null,
  env: Env = process.env,
  now = Date.now(),
) {
  return (
    !!token &&
    typeof token.exp === "number" &&
    token.exp * 1000 > now &&
    typeof token.ownerUntil === "number" &&
    token.ownerUntil * 1000 > now &&
    isOwnerIdentity(
      {
        email: token.email,
        sub: token.googleSub,
        verified: token.googleVerified,
        provider: token.ownerProvider,
      },
      env,
    )
  );
}
