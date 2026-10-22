import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import {resetGeminiProviderStateForTests} from "../src/lib/agent/gemini-provider";
import {POST} from "../app/api/label-analysis/route";

const mocked = vi.hoisted(() => ({
  generateContent: vi.fn(),
  apiKeys: [] as string[],
}));

vi.mock("@google/genai", () => ({
  ThinkingLevel: {LOW: "LOW"},
  GoogleGenAI: class {
    models = {generateContent: mocked.generateContent};
    constructor(options: {apiKey: string}) {
      mocked.apiKeys.push(options.apiKey);
    }
  },
}));

vi.mock("@/lib/server-auth", () => ({
  requireOwner: vi.fn(async () => null),
}));

const ENV_KEYS = [
  "GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
  "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6",
  "GEMINI_API_KEY_7", "GEMINI_API_KEY", "GEMINI_MODEL",
  "GEMINI_MAX_RETRIES", "GEMINI_KEY_COOLDOWN_MS", "GEMINI_REQUEST_TIMEOUT_MS",
] as const;
const savedEnvironment = new Map<string, string | undefined>();

function makeRequest(): NextRequest {
  const form = new FormData();
  const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  form.append("image", new File([pngSignature], "label.png", {type: "image/png"}));
  return new NextRequest("http://localhost/api/label-analysis", {method: "POST", body: form});
}

beforeEach(() => {
  savedEnvironment.clear();
  for (const name of ENV_KEYS) {
    savedEnvironment.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.GEMINI_MODEL = "test-model";
  process.env.GEMINI_KEY_COOLDOWN_MS = "1000";
  process.env.GEMINI_MAX_RETRIES = "6";
  mocked.generateContent.mockReset();
  mocked.apiKeys.length = 0;
  resetGeminiProviderStateForTests();
});

afterEach(() => {
  for (const name of ENV_KEYS) {
    const value = savedEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetGeminiProviderStateForTests();
});

const validLabelResponse = JSON.stringify({
  productName: "Example packet",
  servingSizeText: "100 g",
  servingGrams: 100,
  basis: "per_100g",
  nutrients: [],
  overallConfidence: "high",
  issues: [],
});

describe("nutrition label analysis Gemini failover", () => {
  it("tries another configured key after a network failure and validates the returned proposal", async () => {
    process.env.GEMINI_API_KEY_1 = "fake-slot-one-key";
    process.env.GEMINI_API_KEY_2 = "fake-slot-two-key";
    mocked.generateContent
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({text: validLabelResponse});

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("gemini");
    expect(body.productName).toBe("Example packet");
    expect(mocked.apiKeys).toEqual(["fake-slot-one-key", "fake-slot-two-key"]);
    expect(mocked.generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not call Gemini or save anything when no key slot is configured", async () => {
    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("GEMINI_API_KEY_1 through GEMINI_API_KEY_7");
    expect(body.error).toContain("Nothing was saved");
    expect(mocked.generateContent).not.toHaveBeenCalled();
  });
});
