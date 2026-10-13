import {describe, expect, it} from "vitest";
import {redactSecrets} from "../src/lib/agent/secret-redaction";

describe("redactSecrets", () => {
  it("redacts known provider, GitHub and API token shapes", () => {
    const source = [
      "Gemini: AIza123456789012345678901234567890123456",
      "Legacy slot: AQ.abcdefghijklmnopqrstuvwx123456",
      "OAuth: GOCSPX-abcdefghijklmnopqr123456",
      "GitHub: github_pat_abcdefghijklmnopqrstuvwxyz123456",
      "Classic GitHub: ghp_abcdefghijklmnopqrstuvwxyz1234567890",
      "API: sk-abcdefghijklmnopqrstuvwxyz1234567890",
    ].join("\n");
    const output = redactSecrets(source);
    expect(output).not.toContain("AIza123");
    expect(output).not.toContain("AQ.abcdefghijkl");
    expect(output).not.toContain("GOCSPX-");
    expect(output).not.toContain("github_pat_");
    expect(output).not.toContain("ghp_");
    expect(output).not.toContain("sk-abcdef");
    expect(output.match(/\[REDACTED_KEY\]/g)?.length).toBe(6);
  });

  it("redacts Bearer headers, credential assignments, and quoted values", () => {
    const source = [
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      "MY_API_KEY=super-secret-value",
      'ACCESS_TOKEN: "a token with spaces"',
      "SESSION_SECRET=very-secret",
      "DB_PASSWORD='dont-show-me'",
    ].join("\n");
    const output = redactSecrets(source);
    for (const secret of ["abcdefghijklmnopqrstuvwxyz123456", "super-secret-value", "a token with spaces", "very-secret", "dont-show-me"]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("Bearer [REDACTED]");
    expect(output).toContain("MY_API_KEY=[REDACTED]");
  });

  it("redacts private-key blocks but leaves ordinary text readable", () => {
    const source = "prefix -----BEGIN RSA PRIVATE KEY-----\nTOP-SECRET\n-----END RSA PRIVATE KEY----- suffix";
    expect(redactSecrets(source)).toBe("prefix [REDACTED_PRIVATE_KEY] suffix");
    expect(redactSecrets("Ordinary progress report: 8 tests passed")).toBe("Ordinary progress report: 8 tests passed");
  });
});
