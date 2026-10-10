export function isWorkOriginAllowed(
  request: { url: string; headers: Headers },
  configuredOrigin = process.env.ROCKFOUNDRY_WORK_ORIGIN,
) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const supplied = request.headers.get("origin");
  if (!supplied) return true; // server-to-server callers still need the deployment access boundary
  try {
    const origin = new URL(supplied);
    const authority = request.headers.get("host") || new URL(request.url).host;
    if (origin.host !== authority) return false;
    if (configuredOrigin) {
      const expected = new URL(configuredOrigin);
      return (
        expected.origin === configuredOrigin &&
        origin.origin === expected.origin
      );
    }
    return origin.protocol === new URL(request.url).protocol;
  } catch {
    return false;
  }
}
