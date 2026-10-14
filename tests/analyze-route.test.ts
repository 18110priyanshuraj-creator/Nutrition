import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import {resetGeminiProviderStateForTests} from "../src/lib/agent/gemini-provider";
import {POST} from "../app/api/analyze/route";

const mocked = vi.hoisted(() => ({generateContent: vi.fn()}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {generateContent: mocked.generateContent};
  },
}));

vi.mock("@/lib/server-auth", () => ({requireOwner: async () => null}));
vi.mock("@/lib/server-data", () => ({
  foodList: () => [
    {id: "banana-raw", name: "Banana, raw", aliases: ["banana"], nutrients: {kcal: 89}},
    {id: "almonds", name: "Almonds", aliases: ["almonds", "badam", "बादाम"], nutrients: {kcal: 579}},
    {id: "moringa", name: "Moringa leaves, dry powder", aliases: ["moringa dry powder"], nutrients: {}},
  ],
}));

const envNames = [
  "GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
  "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6",
  "GEMINI_API_KEY_7", "GEMINI_API_KEY", "GEMINI_MODEL",
  "GEMINI_MAX_RETRIES", "GEMINI_KEY_COOLDOWN_MS", "GEMINI_REQUEST_TIMEOUT_MS",
] as const;
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

function request(text: string): NextRequest {
  return new NextRequest("http://localhost/api/analyze", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({text}),
  });
}

function imageRequest(): NextRequest {
  const form = new FormData();
  const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  form.append("image", new File([pngSignature], "meal.png", {type: "image/png"}));
  form.append("description", "A banana");
  return new NextRequest("http://localhost/api/analyze", {method: "POST", body: form});
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

describe("food analysis through the shared Gemini keyring", () => {
  it("uses supported text portions instead of implausible model weights", async () => {
    process.env.GEMINI_API_KEY_1 = "private-photo-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    mocked.generateContent.mockResolvedValue({
      text: JSON.stringify({
        items: [
          {foodName: "Almonds", amount: 240, unit: "g", preparation: "raw", confidence: "high", notes: ""},
          {foodName: "Moringa leaves, dry powder", amount: 400, unit: "g", preparation: "dry powder", confidence: "high", notes: ""},
        ],
        summary: "Two foods",
      }),
    });

    const response = await POST(request("6 almonds and 20 g moringa dry powder"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidates).toMatchObject([
      {foodId: "almonds", grams: 7.2, amount: 6, unit: "piece", portionEstimated: true},
      {foodId: "moringa", grams: 20, amount: 20, unit: "g", portionEstimated: false},
    ]);
    expect(body.candidates[0].portionNote).toContain("USDA FoodData Central");
    expect(body.warning).toContain("take precedence over model portions");
  });

  it("sends validated image bytes to Gemini and returns an editable proposal without saving", async () => {
    process.env.GEMINI_API_KEY_1 = "private-photo-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    mocked.generateContent.mockResolvedValue({
      text: JSON.stringify({
        items: [{foodName: "Banana, raw", amount: 1, unit: "piece", preparation: "raw", confidence: "medium", notes: "Piece size is uncertain."}],
        summary: "One likely banana",
      }),
    });

    const response = await POST(imageRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("gemini");
    expect(body.candidates[0]).toMatchObject({foodId: "banana-raw", foodName: "Banana, raw", confidence: "medium"});
    expect(body.warning).toContain("Review every food");
    expect(mocked.generateContent).toHaveBeenCalledTimes(1);
    const parameters = mocked.generateContent.mock.calls[0][0];
    expect(parameters.contents[1].inlineData).toEqual({
      mimeType: "image/png",
      data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
    });
  });

  it("rejects content that is not a supported image before contacting Gemini", async () => {
    process.env.GEMINI_API_KEY_1 = "private-photo-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const form = new FormData();
    form.append("image", new File(["not an image"], "meal.png", {type: "image/png"}));

    const response = await POST(new NextRequest("http://localhost/api/analyze", {method: "POST", body: form}));

    expect(response.status).toBe(415);
    expect(mocked.generateContent).not.toHaveBeenCalled();
  });

  it("returns an explicit safe error when Gemini's structured proposal is invalid", async () => {
    process.env.GEMINI_API_KEY_1 = "private-photo-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    mocked.generateContent.mockResolvedValue({text: JSON.stringify({
      items: [{foodName: "Banana, raw", amount: -1, unit: "piece", preparation: "raw", confidence: "high", notes: ""}],
      summary: "Invalid amount",
    })});

    const response = await POST(imageRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("did not pass validation");
    expect(body.candidates).toBeUndefined();
    expect(body.mode).toBeUndefined();
  });

  it("does not return a successful photo proposal when Gemini is unreachable", async () => {
    process.env.GEMINI_API_KEY_1 = "private-photo-test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    mocked.generateContent.mockRejectedValueOnce(new Error("fetch failed"));

    const response = await POST(imageRequest());
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.category).toBe("network");
    expect(body.manualEntryAvailable).toBe(true);
    expect(body.candidates).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("private-photo-test-key");
    expect(JSON.stringify(body)).not.toContain("fetch failed");
  });
});
