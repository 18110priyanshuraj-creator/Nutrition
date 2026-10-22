import {afterEach, describe, expect, it} from "vitest";
import {
  classifyGeminiError,
  configuredGeminiKeys,
  getGeminiProviderStatus,
  resetGeminiProviderStateForTests,
  withGeminiKeyFailover,
  type GeminiKeySlot,
} from "../src/lib/agent/gemini-provider";

afterEach(() => resetGeminiProviderStateForTests());

describe("Gemini key configuration", () => {
  it("supports numbered slots without leaking key values in the status", () => {
    const env: NodeJS.ProcessEnv = {NODE_ENV: "test", GEMINI_API_KEY_1: "secret-one", GEMINI_API_KEY_2: "secret-two", GEMINI_API_KEY_4: "secret-four", GEMINI_API_KEY: "legacy-secret"};
    expect(configuredGeminiKeys(env).map((key) => key.label)).toEqual(["Slot 1", "Slot 2", "Slot 4"]);
    const status = getGeminiProviderStatus(env);
    expect(status.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("secret-one");
    expect(JSON.stringify(status)).not.toContain("legacy-secret");
  });
  it("preserves legacy single-key configuration", () => {
    expect(configuredGeminiKeys({NODE_ENV: "test", GEMINI_API_KEY: "legacy-secret"}).map(({label}) => label)).toEqual(["Legacy fallback"]);
  });
});
describe("Gemini error classification", () => {
  it("separates timeout, throttling, invalid key, missing model and project-wide quota", () => {
    expect(classifyGeminiError(new Error("request timed out"))).toBe("timeout");
    expect(classifyGeminiError({status: 429, message: "too many requests"})).toBe("rate_limit");
    expect(classifyGeminiError({status: 401, message: "API key invalid"})).toBe("invalid_key");
    expect(classifyGeminiError({status: 404, message: "model not found"})).toBe("model_not_found");
    expect(classifyGeminiError(new Error("project-wide quota exceeded"))).toBe("project_quota");
  });
});
describe("Gemini key failover", () => {
  const keys: GeminiKeySlot[] = [
    {label: "Slot 1", apiKey: "private-one"},
    {label: "Slot 2", apiKey: "private-two"},
    {label: "Slot 3", apiKey: "private-three"},
    {label: "Slot 4", apiKey: "private-four"},
  ];
  it("moves to another slot after a timeout", async () => {
    const tried: string[] = [];
    const result = await withGeminiKeyFailover(async (key) => {
      tried.push(key);
      if (key === "private-one") throw new Error("timeout");
      return "ok";
    }, {keys, cooldownMs: 1000, now: () => 1800000000000, maxAttempts: 4});
    expect(result).toBe("ok");
    expect(tried).toEqual(["private-one", "private-two"]);
    const status = getGeminiProviderStatus({NODE_ENV: "test", GEMINI_API_KEY_1: "private-one", GEMINI_API_KEY_2: "private-two", GEMINI_MODEL: "model"});
    expect(status.activeSlot).toBe("Slot 2");
    expect(JSON.stringify(status)).not.toContain("private-one");
  });
  it("tries the next configured key when one key is invalid", async () => {
    const tried: string[] = [];
    const result = await withGeminiKeyFailover(async (key) => {
      tried.push(key);
      if (key === "private-one") throw {status: 401, message: "API key invalid"};
      return "ok";
    }, {keys, cooldownMs: 1000, now: () => 1800000000000, maxAttempts: 4});
    expect(result).toBe("ok");
    expect(tried).toEqual(["private-one", "private-two"]);
  });
  it("stops at model configuration failures instead of cycling keys", async () => {
    const tried: string[] = [];
    await expect(withGeminiKeyFailover(async (_key, slot) => { tried.push(slot); throw {status: 404, message: "model not found"}; }, {keys, cooldownMs: 1000, now: () => 1800000000000})).rejects.toMatchObject({category: "model_not_found"});
    expect(tried).toEqual(["Slot 1"]);
  });
  it("reports when no key is configured", async () => {
    await expect(withGeminiKeyFailover(async () => "unused", {keys: []})).rejects.toMatchObject({category: "missing_key"});
  });
});
