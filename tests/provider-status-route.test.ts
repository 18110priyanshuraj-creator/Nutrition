import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {GET, POST} from "../app/api/provider-status/route";
import {resetGeminiProviderStateForTests} from "../src/lib/agent/gemini-provider";

const mocked = vi.hoisted(() => ({generateContent: vi.fn()}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {generateContent: mocked.generateContent};
  },
}));
vi.mock("@/lib/server-auth", () => ({requireOwner: async () => null}));

const keyNames = Array.from({length: 7}, (_, index) => `GEMINI_API_KEY_${index + 1}`);
const envNames = [...keyNames, "GEMINI_API_KEY", "GEMINI_MODEL"];
const original = new Map<string, string | undefined>();

beforeEach(() => {
  original.clear();
  for (const name of envNames) {
    original.set(name, process.env[name]);
    delete process.env[name];
  }
  mocked.generateContent.mockReset();
  resetGeminiProviderStateForTests();
});

afterEach(() => {
  for (const name of envNames) {
    const value = original.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetGeminiProviderStateForTests();
});

describe("Gemini provider status endpoint", () => {
  it("reports every configured slot without exposing key values", async () => {
    const secrets = keyNames.map((key, index) => {
      const secret = `private-test-key-${index + 1}`;
      process.env[key] = secret;
      return secret;
    });
    process.env.GEMINI_MODEL = "test-model";

    const response = await GET(new Request("http://localhost/api/provider-status"));
    const body = await response.text();

    expect(response.status).toBe(200);
    for (let index = 1; index <= 7; index += 1) expect(body).toContain(`Slot ${index}`);
    for (const secret of secrets) expect(body).not.toContain(secret);
  });

  it("does not report health until a real provider test succeeds", async () => {
    process.env.GEMINI_API_KEY_1 = "private-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";

    const response = await GET(new Request("http://localhost/api/provider-status"));
    const body = await response.json();

    expect(body.health).toBe("untested");
    expect(body.liveTestSucceeded).toBe(false);
    expect(body.lastTestAt).toBeNull();
    expect(body.configuredSlotCount).toBe(1);
    expect(body.message).toContain("has not succeeded");
    expect(mocked.generateContent).not.toHaveBeenCalled();
  });

  it("reports a successful live test with a safe slot label and model ID", async () => {
    process.env.GEMINI_API_KEY_2 = "private-test-key";
    process.env.GEMINI_API_KEY_3 = "another-private-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    mocked.generateContent
      .mockRejectedValueOnce({status: 503, message: "temporary network failure"})
      .mockResolvedValueOnce({text: "MyNutri AI connection check"});

    const response = await POST(new Request("http://localhost/api/provider-status", {method: "POST"}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.health).toBe("healthy");
    expect(body.liveTestSucceeded).toBe(true);
    expect(body.lastTestSlot).toBe("Slot 3");
    expect(body.retryCount).toBe(1);
    expect(body.modelId).toBe("gemini-3.5-flash-lite");
    expect(JSON.stringify(body)).not.toContain("private-test-key");
    expect(JSON.stringify(body)).not.toContain("another-private-test-key");
    const refreshed = await GET(new Request("http://localhost/api/provider-status"));
    expect((await refreshed.json()).health).toBe("healthy");
    expect(mocked.generateContent).toHaveBeenCalledTimes(2);
    const requestConfig = mocked.generateContent.mock.calls[0][0].config;
    expect(requestConfig.maxOutputTokens).toBe(128);
    expect(requestConfig.thinkingConfig.thinkingLevel).toBeTruthy();
    expect(requestConfig).not.toHaveProperty("temperature");
  });

  it("keeps configured keys unhealthy after a provider network failure", async () => {
    process.env.GEMINI_API_KEY_1 = "private-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    mocked.generateContent.mockRejectedValueOnce(new Error("fetch failed"));

    const response = await POST(new Request("http://localhost/api/provider-status", {method: "POST"}));
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.ok).toBe(false);
    expect(body.configured).toBe(true);
    expect(body.health).toBe("failed");
    expect(body.liveTestSucceeded).toBe(false);
    expect(body.lastTestCategory).toBe("network");
    expect(body.error).toContain("could not be reached");
    expect(JSON.stringify(body)).not.toContain("private-test-key");
    expect(JSON.stringify(body)).not.toContain("fetch failed");
  });

  it("does not retry a structured project quota failure through other keys", async () => {
    process.env.GEMINI_API_KEY_1 = "private-test-key";
    process.env.GEMINI_API_KEY_2 = "another-private-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    mocked.generateContent.mockRejectedValueOnce({
      status: 429,
      message: "Quota exceeded.",
      details: [{
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}],
      }],
    });

    const response = await POST(new Request("http://localhost/api/provider-status", {method: "POST"}));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.health).toBe("failed");
    expect(body.category).toBe("project_quota");
    expect(body.retryCount).toBe(0);
    expect(mocked.generateContent).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain("private-test-key");
    expect(JSON.stringify(body)).not.toContain("GenerateRequestsPerDayPerProjectPerModel");
  });

  it("identifies a display name as invalid model configuration without calling Gemini", async () => {
    process.env.GEMINI_API_KEY_1 = "private-test-key";
    process.env.GEMINI_MODEL = "Gemini 3.5 Flash-Lite";

    const response = await POST(new Request("http://localhost/api/provider-status", {method: "POST"}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.health).toBe("invalid_model");
    expect(body.category).toBe("model_not_found");
    expect(body.error).toContain("API model identifier");
    expect(mocked.generateContent).not.toHaveBeenCalled();
  });

  it("reports model-format failures without exposing upstream dumps or credentials", async () => {
    process.env.GEMINI_API_KEY_1 = "private-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    mocked.generateContent.mockRejectedValueOnce({
      status: 400,
      message: "GenerateContentRequest.model: unexpected model name format",
    });

    const response = await POST(new Request("http://localhost/api/provider-status", {method: "POST"}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.category).toBe("model_not_found");
    expect(body.health).toBe("failed");
    expect(body.error).toContain("API model ID");
    expect(JSON.stringify(body)).not.toContain("private-test-key");
    expect(JSON.stringify(body)).not.toContain("unexpected model name format");
  });
});
