import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {isSameOriginRequest} from "../src/lib/server-origin";

const envNames = [
  "CODESPACES",
  "CODESPACE_NAME",
  "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN",
] as const;
const original = new Map<string, string | undefined>();

beforeEach(() => {
  original.clear();
  for (const name of envNames) {
    original.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of envNames) {
    const value = original.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function request(origin: string | null, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/meals", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      ...(origin === null ? {} : {origin}),
      ...headers,
    },
  });
}

describe("same-origin request validation", () => {
  it("accepts a configured GitHub Codespaces forwarded preview", () => {
    process.env.CODESPACES = "true";
    process.env.CODESPACE_NAME = "nutrition";
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";

    const previewOrigin = "https://nutrition-3000.app.github.dev";
    expect(isSameOriginRequest(request(previewOrigin, {
      "x-forwarded-host": "nutrition-3000.app.github.dev",
      "x-forwarded-proto": "https",
    }))).toBe(true);
    expect(isSameOriginRequest(request(previewOrigin, {
      "x-forwarded-host": "nutrition-3000.app.github.dev",
    }))).toBe(true);
    expect(isSameOriginRequest(request(previewOrigin))).toBe(true);
    expect(isSameOriginRequest(new Request("http://0.0.0.0:3000/api/meals", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: previewOrigin,
        "x-forwarded-host": "nutrition-3000.app.github.dev",
        "x-forwarded-proto": "https",
      },
    }))).toBe(true);
  });

  it("accepts a Render HTTPS origin when TLS terminates before the internal HTTP handler", () => {
    const publicHost = "mynutri-ai-nutrition-tracker.onrender.com";
    const proxied = new Request(`http://localhost:10000/api/meals`, {
      method: "POST",
      headers: {
        host: publicHost,
        origin: `https://${publicHost}`,
        "x-forwarded-host": publicHost,
        "x-forwarded-proto": "https",
      },
    });
    expect(isSameOriginRequest(proxied)).toBe(true);
  });

  it("accepts a same-origin local development request", () => {
    expect(isSameOriginRequest(request("http://localhost:3000"))).toBe(true);
  });

  it("rejects a genuine cross-origin request", () => {
    expect(isSameOriginRequest(request("https://attacker.example"))).toBe(false);
  });

  it.each([
    "not a url",
    "https://nutrition-3000.app.github.dev/path",
    "https://user@nutrition-3000.app.github.dev",
    "https://nutrition-3000.app.github.dev, https://attacker.example",
  ])("rejects malformed Origin %s", origin => {
    expect(isSameOriginRequest(request(origin))).toBe(false);
  });

  it("rejects a missing Origin header", () => {
    expect(isSameOriginRequest(request(null))).toBe(false);
  });

  it("does not trust an arbitrary forwarded host or protocol", () => {
    expect(isSameOriginRequest(request("https://attacker.example", {
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    }))).toBe(false);
  });

  it("rejects incorrect forwarding values even in Codespaces", () => {
    process.env.CODESPACES = "true";
    process.env.CODESPACE_NAME = "nutrition";

    expect(isSameOriginRequest(request("https://nutrition-3000.app.github.dev", {
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    }))).toBe(false);
    expect(isSameOriginRequest(request("https://nutrition-3000.app.github.dev", {
      "x-forwarded-host": "nutrition-3000.app.github.dev",
      "x-forwarded-proto": "ftp",
    }))).toBe(false);
  });

  it("rejects ambiguous forwarded headers", () => {
    process.env.CODESPACES = "true";
    process.env.CODESPACE_NAME = "nutrition";

    expect(isSameOriginRequest(request("https://nutrition-3000.app.github.dev", {
      "x-forwarded-host": "nutrition-3000.app.github.dev, attacker.example",
      "x-forwarded-proto": "https",
    }))).toBe(false);
  });
});
