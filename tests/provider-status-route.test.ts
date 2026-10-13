import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {GET} from "../app/api/provider-status/route";
import {resetGeminiProviderStateForTests} from "../src/lib/agent/gemini-provider";

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
});
