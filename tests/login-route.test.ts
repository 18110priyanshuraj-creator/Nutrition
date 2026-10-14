import {afterEach, describe, expect, it} from "vitest";
import {NextRequest} from "next/server";
import {POST} from "../app/api/auth/login/route";
import {SESSION_COOKIE} from "../src/lib/auth";

const environment = {
  APP_PASSWORD: process.env.APP_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function loginRequest(password: string, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: {"content-type": "application/json", "x-forwarded-for": ip},
    body: JSON.stringify({password}),
  });
}

describe("owner login route", () => {
  it("rejects an incorrect password and accepts the configured password with a protected cookie", async () => {
    process.env.APP_PASSWORD = "test-only-owner-password";
    process.env.SESSION_SECRET = "test-only-session-secret-at-least-32-characters";
    Reflect.set(process.env, "NODE_ENV", "test");

    const rejected = await POST(loginRequest("wrong-test-password", "192.0.2.11"));
    expect(rejected.status).toBe(401);

    const accepted = await POST(loginRequest("test-only-owner-password", "192.0.2.12"));
    expect(accepted.status).toBe(200);
    const setCookie = accepted.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=strict");
    expect(setCookie).not.toContain("test-only-owner-password");
  });
});
