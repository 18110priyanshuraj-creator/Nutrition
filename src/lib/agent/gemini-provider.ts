export type GeminiErrorCategory =
  | "missing_key" | "timeout" | "network" | "rate_limit" | "invalid_key"
  | "permission" | "project_quota" | "model_not_found" | "invalid_request" | "unknown";

export interface GeminiKeySlot { label: string; apiKey: string }
export interface GeminiSlotStatus {
  label: string;
  configured: boolean;
  consecutiveFailures: number;
  totalFailures: number;
  cooldownRemainingMs: number;
  lastErrorCategory: GeminiErrorCategory | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
}
export interface GeminiProviderTestResult {
  ok: boolean;
  model: string;
  checkedAt: string;
  category: GeminiErrorCategory | null;
  slot: string | null;
  retryCount: number;
}
interface RuntimeState {
  consecutiveFailures: number;
  totalFailures: number;
  cooldownUntil: number;
  lastErrorCategory: GeminiErrorCategory | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
}
const stateByLabel = new Map<string, RuntimeState>();
let rotationCursor = 0;
let activeLabel: string | null = null;
let lastProviderTest: GeminiProviderTestResult | null = null;

function stateFor(label: string): RuntimeState {
  let state = stateByLabel.get(label);
  if (!state) {
    state = {consecutiveFailures: 0, totalFailures: 0, cooldownUntil: 0, lastErrorCategory: null, lastSuccessAt: null, lastAttemptAt: null};
    stateByLabel.set(label, state);
  }
  return state;
}
function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

/** Reads server-side environment variables only. Raw key values are never returned by status APIs. */
export function configuredGeminiKeys(env: NodeJS.ProcessEnv = process.env): GeminiKeySlot[] {
  const slots: GeminiKeySlot[] = [];
  for (let index = 1; index <= 7; index += 1) {
    const apiKey = env["GEMINI_API_KEY_" + index]?.trim();
    if (apiKey) slots.push({label: "Slot " + index, apiKey});
  }
  if (slots.length === 0 && env.GEMINI_API_KEY?.trim()) {
    slots.push({label: "Legacy fallback", apiKey: env.GEMINI_API_KEY.trim()});
  }
  return slots;
}
export function hasGeminiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return configuredGeminiKeys(env).length > 0;
}
export function configuredGeminiModel(env: NodeJS.ProcessEnv = process.env): string | null {
  const model = env.GEMINI_MODEL?.trim();
  if (!model || model.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(model)) return null;
  if (configuredGeminiKeys(env).some((slot) => slot.apiKey === model)) return null;
  if (/^(?:AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_-]{20,}|GOCSPX-[0-9A-Za-z_-]{18,})$/.test(model)) return null;
  return model;
}
export function geminiRequestTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return boundedInteger(env.GEMINI_REQUEST_TIMEOUT_MS, 60_000, 3000, 120_000);
}
export function recordGeminiProviderTest(result: GeminiProviderTestResult): void {
  lastProviderTest = result;
}
export function getGeminiProviderTestResult(model: string | null): GeminiProviderTestResult | null {
  return model && lastProviderTest?.model === model ? lastProviderTest : null;
}
function errorFacts(error: unknown): {message: string; status: number | null; code: string} {
  if (typeof error === "string") return {message: error.toLowerCase(), status: null, code: ""};
  if (!error || typeof error !== "object") return {message: String(error).toLowerCase(), status: null, code: ""};
  const record = error as {message?: unknown; status?: unknown; code?: unknown; name?: unknown; cause?: unknown};
  const causeMessage = record.cause && typeof record.cause === "object"
    ? String((record.cause as {message?: unknown}).message ?? "")
    : "";
  const parsedStatus = Number(record.status);
  return {
    message: [record.message, record.name, causeMessage].map((part) => String(part ?? "")).join(" ").toLowerCase(),
    status: Number.isFinite(parsedStatus) ? parsedStatus : null,
    code: String(record.code ?? "").toLowerCase(),
  };
}
function structuredErrorText(value: unknown, seen = new WeakSet<object>(), depth = 0): string {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).toLowerCase();
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => structuredErrorText(item, seen, depth + 1)).join(" ");
  const record = value as Record<string, unknown>;
  return [
    "message", "status", "code", "reason", "quotaMetric", "quotaId",
    "quota_metric", "quota_id", "metadata", "details", "violations", "error", "cause",
  ].map((key) => {
    const text = structuredErrorText(record[key], seen, depth + 1);
    return text ? `${key.toLowerCase()} ${text}` : "";
  }).join(" ");
}
export function classifyGeminiError(error: unknown): GeminiErrorCategory {
  if (error instanceof GeminiFailoverError) return error.category;
  const facts = errorFacts(error);
  const message = `${facts.message} ${facts.code} ${structuredErrorText(error)}`;
  if (facts.status === 402 || /payment_required|prepay credit.{0,40}(depleted|empty)|billing.{0,30}(limit|quota|depleted)|project-wide quota|quota.{0,120}project|project.{0,120}quota|per[_ -]?project.{0,100}quota|quota.{0,100}per[_ -]?project|exceeded.{0,30}current quota.{0,60}(billing|plan)|current quota.{0,60}(billing|plan)/.test(message)) {
    return "project_quota";
  }
  if (facts.status === 401 || /invalid[_ -]?api[_ -]?key|api[_ -]?key.{0,20}(invalid|not valid)|key.{0,15}(revoked|invalid)|unauthenticated|status.?401|\b401\b/.test(message)) {
    return "invalid_key";
  }
  if (facts.status === 403 || /permission denied|permission_denied|forbidden|access denied/.test(message)) return "permission";
  if (facts.status === 404 || /model.{0,40}(not found|does not exist|unavailable|invalid|unsupported|name format)|not_found.*model/.test(message)) return "model_not_found";
  if (facts.status === 400 || /invalid_argument|invalid request|bad request|unsupported parameter/.test(message)) return "invalid_request";
  if (facts.status === 429 || /rate.?limit|rate_limit_exceeded|quota_exceeded|resource_exhausted|quota exceeded|too many requests|\b429\b/.test(message)) return "rate_limit";
  if (facts.status === 408 || facts.status === 504 || /timed? ?out|timeout|deadline exceeded|aborterror|aborted/.test(message)) return "timeout";
  if (facts.status === 500 || facts.status === 502 || facts.status === 503 || /econnreset|econnrefused|enotfound|eai_again|fetch failed|network error|socket hang up|temporary failure|service unavailable|server overloaded/.test(message)) return "network";
  return "unknown";
}
export class GeminiFailoverError extends Error {
  readonly category: GeminiErrorCategory;
  readonly attemptedSlots: string[];
  readonly retryAfterMs: number;
  constructor(message: string, category: GeminiErrorCategory, attemptedSlots: string[] = [], retryAfterMs = 0) {
    super(message);
    this.name = "GeminiFailoverError";
    this.category = category;
    this.attemptedSlots = attemptedSlots;
    this.retryAfterMs = retryAfterMs;
  }
}
export interface FailoverOptions {
  keys?: GeminiKeySlot[];
  maxAttempts?: number;
  cooldownMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}
/** Retries a single operation through distinct available keys; never returns or logs key values. */
export async function withGeminiKeyFailover<T>(
  operation: (apiKey: string, slotLabel: string) => Promise<T>,
  options: FailoverOptions = {},
): Promise<T> {
  const keys = options.keys ?? configuredGeminiKeys();
  if (keys.length === 0) {
    throw new GeminiFailoverError("No Gemini API key is configured. Set GEMINI_API_KEY_1 through GEMINI_API_KEY_7.", "missing_key");
  }
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const cooldownMs = Math.max(1000, Math.min(15 * 60_000, options.cooldownMs ?? boundedInteger(
    process.env.GEMINI_KEY_COOLDOWN_MS, 60_000, 1000, 15 * 60_000,
  )));
  const retries = boundedInteger(process.env.GEMINI_MAX_RETRIES, 3, 0, 6);
  const maxAttempts = Math.max(1, Math.min(keys.length, options.maxAttempts ?? retries + 1));
  const activeIndex = activeLabel === null ? -1 : keys.findIndex((slot) => slot.label === activeLabel);
  const start = activeIndex >= 0 && stateFor(keys[activeIndex].label).cooldownUntil <= now()
    ? activeIndex
    : rotationCursor % keys.length;
  const rotated = [...keys.slice(start), ...keys.slice(0, start)];
  const available = rotated.filter((slot) => stateFor(slot.label).cooldownUntil <= now());
  if (available.length === 0) {
    const retryAfterMs = Math.max(0, Math.min(...keys.map((slot) => Math.max(0, stateFor(slot.label).cooldownUntil - now()))));
    throw new GeminiFailoverError("All configured Gemini key slots are cooling down. Retry after the cooldown.", "rate_limit", keys.map((slot) => slot.label), retryAfterMs);
  }
  const candidates = available.slice(0, maxAttempts);
  const attemptedSlots: string[] = [];
  let lastCategory: GeminiErrorCategory = "unknown";
  let lastRetryAfter = 0;
  for (const slot of candidates) {
    const state = stateFor(slot.label);
    attemptedSlots.push(slot.label);
    state.lastAttemptAt = new Date(now()).toISOString();
    try {
      const value = await operation(slot.apiKey, slot.label);
      state.consecutiveFailures = 0;
      state.cooldownUntil = 0;
      state.lastErrorCategory = null;
      state.lastSuccessAt = new Date(now()).toISOString();
      activeLabel = slot.label;
      rotationCursor = keys.findIndex((candidate) => candidate.label === slot.label);
      return value;
    } catch (error) {
      const category = classifyGeminiError(error);
      lastCategory = category;
      state.consecutiveFailures += 1;
      state.totalFailures += 1;
      state.lastErrorCategory = category;
      if (category === "project_quota" || category === "model_not_found" || category === "invalid_request") {
        const message = category === "project_quota"
          ? "Gemini project-wide quota or billing limit was reached; key rotation cannot resolve it."
          : category === "model_not_found"
            ? "The configured Gemini model was not found or is unavailable to this project."
            : "Gemini rejected the request. Check its parameters and configured model.";
        throw new GeminiFailoverError(message, category, attemptedSlots);
      }
      const slotCooldown = category === "invalid_key" || category === "permission"
        ? Math.min(15 * 60_000, cooldownMs * 5)
        : category === "rate_limit" || category === "timeout" || category === "network"
          ? cooldownMs
          : Math.min(15 * 60_000, cooldownMs * 2);
      state.cooldownUntil = now() + slotCooldown;
      lastRetryAfter = slotCooldown;
      if (
        attemptedSlots.length < candidates.length
        && (category === "rate_limit" || category === "timeout" || category === "network"
          || category === "invalid_key" || category === "permission" || category === "unknown")
      ) {
        await sleep(Math.min(2000, 250 * 2 ** (attemptedSlots.length - 1)));
      }
    }
  }
  throw new GeminiFailoverError(
    "Gemini request failed after trying " + attemptedSlots.length + " available key slot(s). Category: " + lastCategory + ".",
    lastCategory, attemptedSlots, lastRetryAfter,
  );
}
export function getGeminiProviderStatus(env: NodeJS.ProcessEnv = process.env): {
  provider: "Google Gemini";
  configured: boolean;
  modelConfigured: boolean;
  activeSlot: string | null;
  slots: GeminiSlotStatus[];
} {
  const configured = configuredGeminiKeys(env);
  const configuredLabels = new Set(configured.map((slot) => slot.label));
  const statusLabels = ["Slot 1", "Slot 2", "Slot 3", "Slot 4", "Slot 5", "Slot 6", "Slot 7"];
  if (configured.some((slot) => slot.label === "Legacy fallback")) statusLabels.push("Legacy fallback");
  return {
    provider: "Google Gemini",
    configured: configured.length > 0,
    modelConfigured: Boolean(configuredGeminiModel(env)),
    activeSlot: activeLabel,
    slots: statusLabels.map((label) => {
      const state = stateFor(label);
      return {
        label,
        configured: configuredLabels.has(label),
        consecutiveFailures: state.consecutiveFailures,
        totalFailures: state.totalFailures,
        cooldownRemainingMs: Math.max(0, state.cooldownUntil - Date.now()),
        lastErrorCategory: state.lastErrorCategory,
        lastSuccessAt: state.lastSuccessAt,
        lastAttemptAt: state.lastAttemptAt,
      };
    }),
  };
}
export function resetGeminiProviderStateForTests(): void {
  stateByLabel.clear();
  rotationCursor = 0;
  activeLabel = null;
  lastProviderTest = null;
}
