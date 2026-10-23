function singleHeaderValue(request: Request, name: string): string | null | undefined {
  const value = request.headers.get(name);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed && !trimmed.includes(",") ? trimmed : undefined;
}

function configuredCodespaceHost(): string | null {
  if (process.env.CODESPACES?.toLowerCase() !== "true") return null;
  const name = process.env.CODESPACE_NAME?.toLowerCase();
  const domain = (process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev").toLowerCase();
  if (!name || !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(name)) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*app\.github\.dev$/.test(domain)) return null;
  return `${name}-3000.${domain}`;
}

function isOriginUrl(value: string): URL | null {
  if (value !== value.trim() || value.includes(",")) return null;
  try {
    const origin = new URL(value);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.username ||
      origin.password ||
      origin.origin === "null"
    ) return null;
    return origin;
  } catch {
    return null;
  }
}

function parseAuthority(value: string, protocol: string): URL | null {
  if (!value || value !== value.trim() || /[/\\@\s,]/.test(value)) return null;
  try {
    const authority = new URL(`${protocol}//${value}`);
    if (authority.pathname !== "/" || authority.search || authority.hash || authority.username || authority.password) return null;
    return authority;
  } catch {
    return null;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname.toLowerCase() === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]";
}

export function isSameOriginRequest(request: Request): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;
  const origin = isOriginUrl(originHeader);
  if (!origin) return false;

  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }

  const forwardedHost = singleHeaderValue(request, "x-forwarded-host");
  const forwardedProtocol = singleHeaderValue(request, "x-forwarded-proto");
  if (forwardedHost === undefined || forwardedProtocol === undefined) return false;

  const hostHeader = singleHeaderValue(request, "host");
  if (hostHeader === undefined) return false;
  const requestHost = hostHeader ?? requestUrl.host;
  const requestAuthority = parseAuthority(requestHost, requestUrl.protocol);
  if (!requestAuthority) return false;
  const sameInternalTarget = requestAuthority.host.toLowerCase() === requestUrl.host.toLowerCase() ||
    (isLoopback(requestAuthority.hostname) && isLoopback(requestUrl.hostname));

  // Render terminates HTTPS at its proxy, so the app can receive an internal
  // HTTP request URL even though the browser's Origin is HTTPS. Use the trusted
  // forwarded protocol when it is present, while still requiring the Origin host
  // to match the actual Host header received by this service.
  const normalizedForwardedProtocol = forwardedProtocol?.toLowerCase() ?? null;
  const forwardedProtocolMatchesOrigin =
    normalizedForwardedProtocol !== null &&
    ["http", "https"].includes(normalizedForwardedProtocol) &&
    origin.protocol === `${normalizedForwardedProtocol}:`;

  if (
    origin.host.toLowerCase() === requestAuthority.host.toLowerCase() &&
    (origin.protocol === requestUrl.protocol || forwardedProtocolMatchesOrigin)
  ) {
    return true;
  }

  const codespaceHost = configuredCodespaceHost();
  if (!codespaceHost) return false;
  const isConfiguredCodespaceTarget = requestAuthority.host.toLowerCase() === codespaceHost ||
    sameInternalTarget;
  if (!isConfiguredCodespaceTarget) return false;

  if (forwardedHost !== null) {
    const parsedForwardedHost = parseAuthority(forwardedHost, "https:");
    if (!parsedForwardedHost) return false;
    const isTrustedForwardedHost = parsedForwardedHost.host.toLowerCase() === codespaceHost;
    const isInternalRewrite = sameInternalTarget &&
      (parsedForwardedHost.host.toLowerCase() === requestAuthority.host.toLowerCase() ||
       parsedForwardedHost.host.toLowerCase() === requestUrl.host.toLowerCase());
    if (!isTrustedForwardedHost && !isInternalRewrite) return false;
  }
  if (forwardedProtocol !== null) {
    const isTrustedForwardedProtocol = forwardedProtocol.toLowerCase() === "https";
    const isInternalRewrite = sameInternalTarget &&
      forwardedProtocol.toLowerCase() === requestUrl.protocol.slice(0, -1);
    if (!isTrustedForwardedProtocol && !isInternalRewrite) return false;
  }

  return origin.protocol === "https:" && origin.host.toLowerCase() === codespaceHost;
}
