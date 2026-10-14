export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsedOrigin = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || requestUrl.host;
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    const protocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;
    return Boolean(host && parsedOrigin.pathname === "/" && !parsedOrigin.search && !parsedOrigin.hash
      && !parsedOrigin.username && !parsedOrigin.password && ["http:", "https:"].includes(parsedOrigin.protocol)
      && parsedOrigin.host.toLowerCase() === host.toLowerCase()
      && parsedOrigin.protocol === protocol);
  } catch {
    return false;
  }
}
