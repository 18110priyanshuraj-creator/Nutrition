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
  it("uses numbered slots and never returns raw key values in status", () => {
    const env = {GEMINI_API_KEY_1: "secret-one", GEMINI_API_KEY_2: "secret-two", GEMINI_API_KEY_4: "secret-four", GEMINI_API_KEY: "legacy-secret"};
    expect(configuredGeminiKeys(env as unknown as NodeJS.ProcessEnv).map((slot) => slot.label)).toEqual(["Slot 1", "Slot 2", "Slot 4"]);
    const status = getGeminiProviderStatus(env as unknown as NodeJS.ProcessEnv);
    expect(status.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("secret-one");
    expect(JSON.stringify(status)).not.toContain("legacy-secret");
  });
  it("keeps legacy key configuration working when numbered slots are absent", () => {
    expect(configuredGeminiKeys({GEMINI_API_KEY: "legacy-secret"} as unknown as NodeJS.ProcessEnv)).toEqual([{label: "Legacy fallback", apiKey: "legacy-secret"}]);
  });
});
describe("Gemini failure classification", () => {
  it("distinguishes timeout, key, model and project quota errors", () => {
    expect(classifyGeminiError(new Error("request timed out"))).toBe("timeout");
    expect(classifyGeminiError({status: 429, message: "Too many requests"})).toBe("rate_limit");
    expect(classifyGeminiError({status: 401, message: "API key invalid"})).toBe("invalid_key");
    expect(classifyGeminiError({status: 400, message: "API_KEY_INVALID"})).toBe("invalid_key");
    expect(classifyGeminiError({status: 402, message: "payment required"})).toBe("project_quota");
    expect(classifyGeminiError({status: 503, message: "service unavailable"})).toBe("network");
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
  it("moves to a second slot after a timeout", async () => {
    const tried: string[] = [];
    const result = await withGeminiKeyFailover(async (apiKey) => {
      tried.push(apiKey);
      if (apiKey === "private-one") throw new Error("timeout");
      return "ok";
    }, {keys, cooldownMs: 1000, now: () => 1_800_000_000_000, maxAttempts: 4});
    expect(result).toBe("ok");
    expect(tried).toEqual(["private-one", "private-two"]);
    const status = getGeminiProviderStatus({
      GEMINI_API_KEY_1: "private-one", GEMINI_API_KEY_2: "private-two",
      GEMINI_API_KEY_3: "private-three", GEMINI_API_KEY_4: "private-four", GEMINI_MODEL: "test-model",
    } as unknown as NodeJS.ProcessEnv);
    expect(status.activeSlot).toBe("Slot 2");
    expect(JSON.stringify(status)).not.toContain("private-one");
  });
  it("stops on a missing model instead of rotating all keys", async () => {
    const tried: string[] = [];
    await expect(withGeminiKeyFailover(async (_key, slot) => {
      tried.push(slot);
      throw {status: 404, message: "model not found"};
    }, {keys, cooldownMs: 1000, now: () => 1_800_000_000_000})).rejects.toMatchObject({category: "model_not_found"});
    expect(tried).toEqual(["Slot 1"]);
  });
  it("does not rotate keys for an explicit project-wide quota error", async () => {
    const tried: string[] = [];
    await expect(withGeminiKeyFailover(async (_key, slot) => {
      tried.push(slot);
      throw new Error("project-wide quota exceeded");
    }, {keys, cooldownMs: 1000, now: () => 1_800_000_000_000})).rejects.toMatchObject({category: "project_quota"});
    expect(tried).toEqual(["Slot 1"]);
  });
  it("reports missing key configuration", async () => {
    await expect(withGeminiKeyFailover(async () => "unused", {keys: []})).rejects.toMatchObject({category: "missing_key"});
  });
});
