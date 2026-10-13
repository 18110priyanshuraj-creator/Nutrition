const SECRET_TOKEN_PATTERNS = /(?:AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_-]{20,}|GOCSPX-[0-9A-Za-z_-]{18,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{25,}|sk-[A-Za-z0-9_-]{20,})/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}={0,2}/gi;
const CREDENTIAL_ASSIGNMENT_PATTERN = /(\b[A-Z0-9_]*(?:API[_-]?KEY|APIKEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE[_-]?KEY)[A-Z0-9_]*\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s"'\x60,;]+)/gi;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

/** Remove common credentials from logs, model context, and reports. */
export function redactSecrets(value: string): string {
  return value
    .replace(SECRET_TOKEN_PATTERNS, "[REDACTED_KEY]")
    .replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED]")
    .replace(CREDENTIAL_ASSIGNMENT_PATTERN, "$1[REDACTED]")
    .replace(PRIVATE_KEY_PATTERN, "[REDACTED_PRIVATE_KEY]");
}
