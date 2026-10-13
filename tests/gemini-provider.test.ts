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
  it("discovers every numbered slot in order", () => {
    const env = Object.fromEntries(
      Array.from({length: 7}, (_, index) => [`GEMINI_API_KEY_${index + 1}`, `private-slot-${index + 1}`]),
    );
    expect(configuredGeminiKeys(env as unknown as NodeJS.ProcessEnv).map((slot) => slot.label)).toEqual([
      "Slot 1", "Slot 2", "Slot 3", "Slot 4", "Slot 5", "Slot 6", "Slot 7",
    ]);
  });
  it("discovers all seven numbered slots and skips empty values", () => {
    const env = {
      GEMINI_API_KEY_1: "secret-one",
      GEMINI_API_KEY_2: "  ",
      GEMINI_API_KEY_3: "secret-three",
      GEMINI_API_KEY_4: "",
      GEMINI_API_KEY_5: "secret-five",
      GEMINI_API_KEY_6: undefined,
      GEMINI_API_KEY_7: "secret-seven",
      GEMINI_API_KEY: "legacy-secret",
    };
    expect(configuredGeminiKeys(env as unknown as NodeJS.ProcessEnv).map((slot) => slot.label)).toEqual([
      "Slot 1", "Slot 3", "Slot 5", "Slot 7",
    ]);
  });
  it("uses numbered slots and never returns raw key values in status", () => {
    const env = {GEMINI_API_KEY_1: "secret-one", GEMINI_API_KEY_2: "secret-two", GEMINI_API_KEY_4: "secret-four", GEMINI_API_KEY: "legacy-secret"};
    expect(configuredGeminiKeys(env as unknown as NodeJS.ProcessEnv).map((slot) => slot.label)).toEqual(["Slot 1", "Slot 2", "Slot 4"]);
    const status = getGeminiProviderStatus(env as unknown as NodeJS.ProcessEnv);
    expect(status.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("secret-one");
    expect(JSON.stringify(status)).not.toContain("legacy-secret");
  });
  it("supports slots five through seven without exposing key material", () => {
    const env = {
      GEMINI_API_KEY_5: "secret-five",
      GEMINI_API_KEY_6: "secret-six",
      GEMINI_API_KEY_7: "secret-seven",
      GEMINI_API_KEY: "legacy-secret",
      GEMINI_MODEL: "test-model",
    };
    const processEnv = env as unknown as NodeJS.ProcessEnv;
    expect(configuredGeminiKeys(processEnv).map((slot) => slot.label)).toEqual(["Slot 5", "Slot 6", "Slot 7"]);
    const status = getGeminiProviderStatus(processEnv);
    expect(status.slots.filter((slot) => slot.configured).map((slot) => slot.label)).toEqual(["Slot 5", "Slot 6", "Slot 7"]);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("secret-five");
    expect(serialized).not.toContain("secret-six");
    expect(serialized).not.toContain("secret-seven");
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
    expect(classifyGeminiError(new Error("HTTP 401 unauthorized"))).toBe("invalid_key");
    expect(classifyGeminiError(new Error("HTTP 429 rate limited"))).toBe("rate_limit");
    expect(classifyGeminiError({status: 403, message: "permission denied"})).toBe("permission");
    expect(classifyGeminiError({status: 503, message: "temporary network failure"})).toBe("network");
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
  it("can try all seven configured slots when six retries are allowed", async () => {
    const priorRetries = process.env.GEMINI_MAX_RETRIES;
    process.env.GEMINI_MAX_RETRIES = "6";
    const sevenKeys: GeminiKeySlot[] = [
      ...keys,
      {label: "Slot 5", apiKey: "private-five"},
      {label: "Slot 6", apiKey: "private-six"},
      {label: "Slot 7", apiKey: "private-seven"},
    ];
    const tried: string[] = [];
    try {
      await expect(withGeminiKeyFailover(async (_key, slot) => {
        tried.push(slot);
        throw new Error("timeout");
      }, {keys: sevenKeys, cooldownMs: 1000, now: () => 1_800_000_000_000})).rejects.toMatchObject({category: "timeout"});
      expect(tried).toEqual(["Slot 1", "Slot 2", "Slot 3", "Slot 4", "Slot 5", "Slot 6", "Slot 7"]);
    } finally {
      if (priorRetries === undefined) delete process.env.GEMINI_MAX_RETRIES;
      else process.env.GEMINI_MAX_RETRIES = priorRetries;
    }
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
  it("places a failed slot in a bounded cooldown and does not retry it early", async () => {
    let attempts = 0;
    const options = {keys: [keys[0]], cooldownMs: 1000, now: () => 1_800_000_000_000, maxAttempts: 1};
    await expect(withGeminiKeyFailover(async () => {
      attempts += 1;
      throw new Error("request timed out");
    }, options)).rejects.toMatchObject({category: "timeout"});
    await expect(withGeminiKeyFailover(async () => {
      attempts += 1;
      return "unexpected";
    }, options)).rejects.toMatchObject({category: "rate_limit", retryAfterMs: 1000});
    expect(attempts).toBe(1);
  });
  it("returns bounded generic errors without reflecting a rejected key", async () => {
    const secretKey = "AIzaSyDUMMY0123456789abcdefghijklmnop";
    const error = await withGeminiKeyFailover(async () => {
      throw new Error("provider rejected " + secretKey);
    }, {keys: [{label: "Slot 1", apiKey: secretKey}], cooldownMs: 1000, now: () => 1_800_000_000_000, maxAttempts: 1})
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(secretKey);
  });
  it("reports missing key configuration", async () => {
    await expect(withGeminiKeyFailover(async () => "unused", {keys: []})).rejects.toMatchObject({category: "missing_key"});
  });
});
