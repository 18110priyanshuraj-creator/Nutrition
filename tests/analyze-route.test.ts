import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import {POST} from "../app/api/analyze/route";

const mocked = vi.hoisted(() => ({generateContent: vi.fn()}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {generateContent: mocked.generateContent};
  },
}));

vi.mock("@/lib/server-auth", () => ({requireOwner: async () => null}));
vi.mock("@/lib/server-data", () => ({
  foodList: () => [{id: "banana-raw", name: "Banana, raw", aliases: ["banana"], nutrients: {kcal: 89}}],
}));

const envNames = [
  "GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
  "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6",
  "GEMINI_API_KEY_7", "GEMINI_API_KEY", "GEMINI_MODEL",
] as const;
const original = new Map<string, string | undefined>();

beforeEach(() => {
  original.clear();
  for (const name of envNames) {
    original.set(name, process.env[name]);
    delete process.env[name];
  }
  mocked.generateContent.mockReset();
});

afterEach(() => {
  for (const name of envNames) {
    const value = original.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function request(text: string): NextRequest {
  return new NextRequest("http://localhost/api/analyze", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({text}),
  });
}

describe("food analysis without Gemini credentials", () => {
  it("uses local catalog matching when possible and clearly reports when unavailable", async () => {
    const localMatch = await POST(request("banana"));
    const localBody = await localMatch.json();
    expect(localMatch.status).toBe(200);
    expect(localBody.mode).toBe("local_match");
    expect(localBody.summary).toContain("not a Gemini analysis");

    const unavailable = await POST(request("an unfamiliar food phrase"));
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).error).toContain("Gemini is not configured");
    expect(mocked.generateContent).not.toHaveBeenCalled();
  });
});
