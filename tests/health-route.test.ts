import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {GET} from "../app/api/health/route";

vi.mock("../src/lib/db", () => ({
  getDb: () => ({prepare: () => ({get: () => ({ok: 1})})}),
}));

const envKeys = [
  "GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
  "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6",
  "GEMINI_API_KEY_7", "GEMINI_API_KEY", "GEMINI_MODEL",
] as const;
const original = new Map<string, string | undefined>();

beforeEach(() => {
  original.clear();
  for (const name of envKeys) {
    original.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of envKeys) {
    const value = original.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("health endpoint Gemini configuration", () => {
  it("reports numbered key-slot configuration", async () => {
    process.env.GEMINI_API_KEY_7 = "test-only-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.geminiConfigured).toBe(true);
    expect(JSON.stringify(body)).not.toContain("test-only-key");
  });

  it("does not call Gemini configured when the model or all keys are missing", async () => {
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const response = await GET();
    expect((await response.json()).geminiConfigured).toBe(false);
  });

  it("retains legacy key compatibility", async () => {
    process.env.GEMINI_API_KEY = "legacy-test-only-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const response = await GET();
    expect((await response.json()).geminiConfigured).toBe(true);
  });
});
