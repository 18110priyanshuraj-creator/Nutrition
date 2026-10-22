import {GoogleGenAI, ThinkingLevel} from "@google/genai";
import {NextResponse} from "next/server";
import {
  classifyGeminiError,
  configuredGeminiKeys,
  configuredGeminiModel,
  getGeminiProviderStatus,
  getGeminiProviderTestResult,
  geminiRequestTimeoutMs,
  hasGeminiKey,
  recordGeminiProviderTest,
  withGeminiKeyFailover,
  type GeminiErrorCategory,
} from "@/lib/agent/gemini-provider";
import {requireOwner} from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function categoryMessage(category: GeminiErrorCategory): string {
  switch (category) {
    case "missing_key": return "No server-side Gemini API key is configured.";
    case "invalid_key": return "Gemini rejected the configured credential. Check or replace that private key.";
    case "permission": return "The configured Gemini key does not have access to this API or project.";
    case "rate_limit": return "Available Gemini keys are rate-limited or cooling down. Keys from one project share quotas.";
    case "project_quota": return "Gemini project-wide quota or billing limit was reached; key rotation cannot resolve this.";
    case "model_not_found": return "The configured Gemini model ID is invalid or unavailable to this project. Use an API model ID, not its display name.";
    case "invalid_request": return "Gemini rejected the request. Check the model ID and request configuration.";
    case "timeout": return "The Gemini request timed out across available key slots.";
    case "network": return "Gemini could not be reached across available key slots.";
    default: return "Gemini returned an unexpected response. Provider details and key values are hidden.";
  }
}

function statusPayload() {
  const provider = getGeminiProviderStatus();
  const model = configuredGeminiModel();
  const rawModelConfigured = Boolean(process.env.GEMINI_MODEL?.trim());
  const test = getGeminiProviderTestResult(model);
  const configuredSlotCount = configuredGeminiKeys().length;
  const health = !provider.configured || !rawModelConfigured
    ? "not_configured"
    : !model
      ? "invalid_model"
      : test
        ? test.ok ? "healthy" : "failed"
        : "untested";
  const message = health === "not_configured"
    ? "Configure at least one server-side Gemini key and GEMINI_MODEL."
    : health === "invalid_model"
      ? "GEMINI_MODEL must be an API model identifier without spaces; display names are not accepted."
      : !test
        ? "Gemini keys and model ID are configured, but a live provider test has not succeeded yet."
        : test.ok
        ? `Live Gemini test succeeded at ${test.checkedAt} with ${test.slot ?? "an available slot"} using ${test.model}; retries: ${test.retryCount}.`
        : `Live Gemini test at ${test.checkedAt} failed on ${test.slot ?? "an available slot"} after ${test.retryCount} retry(ies) (${test.category ?? "unknown"}): ${categoryMessage(test.category ?? "unknown")}`;
  return {
    ...provider,
    configuredSlotCount,
    modelId: model,
    health,
    liveTestSucceeded: health === "healthy",
    lastTestAt: test?.checkedAt ?? null,
    lastTestCategory: test?.category ?? null,
    lastTestSlot: test?.slot ?? null,
    retryCount: test?.retryCount ?? 0,
    cooldownRemainingMs: test?.slot
      ? provider.slots.find((slot) => slot.label === test.slot)?.cooldownRemainingMs ?? 0
      : 0,
    message,
  };
}

export async function GET(request: Request) {
  const unauthorized = await requireOwner(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json(statusPayload(), {headers: {"Cache-Control": "no-store"}});
}

export async function POST(request: Request) {
  const unauthorized = await requireOwner(request);
  if (unauthorized) return unauthorized;
  const model = configuredGeminiModel();
  if (!hasGeminiKey() || !model) {
    const category: GeminiErrorCategory = hasGeminiKey() ? "model_not_found" : "missing_key";
    const error = hasGeminiKey()
      ? "GEMINI_MODEL must be a valid API model identifier without spaces."
      : "At least one server-side Gemini key and a valid GEMINI_MODEL are required.";
    return NextResponse.json({...statusPayload(), ok: false, category, error}, {
      status: category === "model_not_found" ? 400 : 503,
      headers: {"Cache-Control": "no-store"},
    });
  }

  let usedSlot: string | null = null;
  let attemptCount = 0;
  try {
    await withGeminiKeyFailover(async (apiKey, slot) => {
      attemptCount += 1;
      usedSlot = slot;
      const ai = new GoogleGenAI({apiKey, httpOptions: {
        timeout: geminiRequestTimeoutMs(),
        retryOptions: {attempts: 1},
      }});
      return ai.models.generateContent({
        model,
        contents: "Reply with only OK. This is a simple connection test.",
        config: {maxOutputTokens: 128, thinkingConfig: {thinkingLevel: ThinkingLevel.LOW}},
      });
    });
    const checkedAt = new Date().toISOString();
    // A successful SDK request proves the key/model endpoint is reachable. Some
    // Gemini 3.8 responses may spend the output budget thinking and expose no text.
    recordGeminiProviderTest({ok: true, model, checkedAt, category: null, slot: usedSlot, retryCount: attemptCount - 1});
    return NextResponse.json({...statusPayload(), ok: true, checkedAt}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    const category = classifyGeminiError(error);
    const attempted = error && typeof error === "object" && "attemptedSlots" in error
      ? (error as {attemptedSlots?: unknown}).attemptedSlots
      : null;
    const attemptedSlots = Array.isArray(attempted) ? attempted.filter((slot): slot is string => typeof slot === "string") : [];
    const checkedAt = new Date().toISOString();
    recordGeminiProviderTest({
      ok: false,
      model,
      checkedAt,
      category,
      slot: attemptedSlots.at(-1) ?? usedSlot,
      retryCount: Math.max(0, attemptedSlots.length - 1),
    });
    const status = category === "project_quota" || category === "rate_limit"
      ? 503
      : category === "timeout" || category === "network"
        ? 504
        : category === "invalid_request" || category === "model_not_found"
          ? 400
          : 502;
    return NextResponse.json({
      ...statusPayload(),
      ok: false,
      checkedAt,
      category,
      error: categoryMessage(category),
    }, {status, headers: {"Cache-Control": "no-store"}});
  }
}
