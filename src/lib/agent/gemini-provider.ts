import type {ProcessEnv} from "node:process";

export type GeminiErrorCategory = "missing_key" | "timeout" | "network" | "rate_limit" | "invalid_key" | "permission" | "project_quota" | "model_not_found" | "invalid_request" | "unknown";
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

function stateFor(label: string): RuntimeState {
  let state = stateByLabel.get(label);
  if (!state) {
    state = {consecutiveFailures: 0, totalFailures: 0, cooldownUntil: 0, lastErrorCategory: null, lastSuccessAt: null, lastAttemptAt: null};
    stateByLabel.set(label, state);
  }
  return state;
}
function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
/** Reads server-only keys. Never return, log, or persist their values from a status response. */
export function configuredGeminiKeys(env: ProcessEnv = process.env): GeminiKeySlot[] {
  const slots: GeminiKeySlot[] = [];
  for (let index = 1; index <= 4; index += 1) {
    const apiKey = env["GEMINI_API_KEY_" + index]?.trim();
    if (apiKey) slots.push({label: "Slot " + index, apiKey});
  }
  if (slots.length === 0 && env.GEMINI_API_KEY?.trim()) slots.push({label: "Legacy fallback", apiKey: env.GEMINI_API_KEY.trim()});
  return slots;
}
export function hasGeminiKey(env: ProcessEnv = process.env): boolean {
  return configuredGeminiKeys(env).length > 0;
}
function errorFacts(error: unknown): {message: string; status: number | null; code: string} {
  if (typeof error === "string") return {message: error.toLowerCase(), status: null, code: ""};
  if (!error || typeof error !== "object") return {message: String(error).toLowerCase(), status: null, code: ""};
  const record = error as {message?: unknown; status?: unknown; code?: unknown; name?: unknown; cause?: unknown};
  const nested = record.cause && typeof record.cause === "object" ? String((record.cause as {message?: unknown}).message ?? "") : "";
  const rawStatus = Number(record.status);
  return {
    message: [record.message, record.name, nested].map((part) => String(part ?? "")).join(" ").toLowerCase(),
    status: Number.isFinite(rawStatus) ? rawStatus : null,
    code: String(record.code ?? "").toLowerCase(),
  };
}
export function classifyGeminiError(error: unknown): GeminiErrorCategory {
  if (error instanceof GeminiFailoverError) return error.category;
  const facts = errorFacts(error);
  const value = facts.message + " " + facts.code;
  if (/project.{0,30}quota|quota.{0,30}project|billing.{0,30}(limit|quota)|project-wide quota/.test(value)) return "project_quota";
  if (facts.status === 404 || /model.{0,24}(not found|does not exist|unavailable)|not_found.*model/.test(value)) return "model_not_found";
  if (facts.status === 400 || /invalid_argument|invalid request|bad request|unsupported parameter/.test(value)) return "invalid_request";
  if (/invalid[_ -]?api[_ -]?key|api[_ -]?key.{0,24}(invalid|not valid)|key.{0,15}(revoked|invalid)|unauthenticated|status.?401|\b401\b/.test(value)) return "invalid_key";
  if (facts.status === 403 || /permission denied|permission_denied|forbidden|access denied/.test(value)) return "permission";
  if (facts.status === 429 || /rate.?limit|resource_exhausted|quota exceeded|too many requests|\b429\b/.test(value)) return "rate_limit";
  if (facts.status === 408 || /timed? ?out|timeout|deadline exceeded|aborterror|aborted/.test(value)) return "timeout";
  if (/econnreset|econnrefused|enotfound|eai_again|fetch failed|network error|socket hang up|temporary failure/.test(value)) return "network";
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
export interface FailoverOptions { keys?: GeminiKeySlot[]; maxAttempts?: number; cooldownMs?: number; now?: () => number }
/** Run one provider operation on successive available keys, with a bounded retry budget. */
export async function withGeminiKeyFailover<T>(
  operation: (apiKey: string, slotLabel: string) => Promise<T>,
  options: FailoverOptions = {},
): Promise<T> {
  const keys = options.keys ?? configuredGeminiKeys();
  if (keys.length === 0) throw new GeminiFailoverError("No Gemini API key is configured. Set GEMINI_API_KEY_1 through GEMINI_API_KEY_4.", "missing_key");
  const now = options.now ?? Date.now;
  const cooldownMs = Math.max(1000, Math.min(900000, options.cooldownMs ?? intFromEnv(process.env.GEMINI_KEY_COOLDOWN_MS, 60000, 1000, 900000)));
  const retries = intFromEnv(process.env.GEMINI_MAX_RETRIES, 3, 0, 3);
  const maxAttempts = Math.max(1, Math.min(keys.length, options.maxAttempts ?? retries + 1));
  const start = rotationCursor % keys.length;
  const ordered = [...keys.slice(start), ...keys.slice(0, start)];
  const available = ordered.filter((slot) => stateFor(slot.label).cooldownUntil <= now());
  if (available.length === 0) {
    const retryAfter = Math.min(...keys.map((slot) => Math.max(0, stateFor(slot.label).cooldownUntil - now())));
    throw new GeminiFailoverError("All configured Gemini keys are cooling down. Retry after the cooldown.", "rate_limit", keys.map((slot) => slot.label), retryAfter);
  }
  const candidates = available.slice(0, maxAttempts);
  const tried: string[] = [];
  let finalCategory: GeminiErrorCategory = "unknown";
  let retryAfter = 0;
  for (const slot of candidates) {
    const state = stateFor(slot.label);
    tried.push(slot.label);
    state.lastAttemptAt = new Date(now()).toISOString();
    try {
      const result = await operation(slot.apiKey, slot.label);
      state.consecutiveFailures = 0;
      state.cooldownUntil = 0;
      state.lastErrorCategory = null;
      state.lastSuccessAt = new Date(now()).toISOString();
      activeLabel = slot.label;
      rotationCursor = (keys.findIndex((item) => item.label === slot.label) + 1) % keys.length;
      return result;
    } catch (error) {
      const category = classifyGeminiError(error);
      finalCategory = category;
      state.consecutiveFailures += 1;
      state.totalFailures += 1;
      state.lastErrorCategory = category;
      // These faults are not solved by another API key from the same project/request.
      if (category === "project_quota" || category === "model_not_found" || category === "invalid_request") {
        const message = category === "project_quota"
          ? "Gemini project-wide quota or billing limit reached; rotating keys cannot resolve it."
          : category === "model_not_found" ? "Configured GEMINI_MODEL was not found or is unavailable." : "Gemini rejected the request parameters.";
        throw new GeminiFailoverError(message, category, tried);
      }
      const perKeyCooldown = category === "invalid_key" || category === "permission" ? Math.min(900000, cooldownMs * 5)
        : category === "rate_limit" || category === "timeout" || category === "network" ? cooldownMs
        : Math.min(900000, cooldownMs * 2);
      state.cooldownUntil = now() + perKeyCooldown;
      retryAfter = perKeyCooldown;
    }
  }
  throw new GeminiFailoverError("Gemini request failed after trying " + tried.length + " key slot(s). Category: " + finalCategory + ".", finalCategory, tried, retryAfter);
}
export function getGeminiProviderStatus(env: ProcessEnv = process.env) {
  const keys = configuredGeminiKeys(env);
  const labels = ["Slot 1", "Slot 2", "Slot 3", "Slot 4"];
  if (keys.some((item) => item.label === "Legacy fallback")) labels.push("Legacy fallback");
  const configured = new Set(keys.map((item) => item.label));
  return {
    provider: "Google Gemini" as const,
    configured: keys.length > 0,
    modelConfigured: Boolean(env.GEMINI_MODEL?.trim()),
    activeSlot: activeLabel,
    slots: labels.map((label) => {
      const state = stateFor(label);
      return {
        label, configured: configured.has(label),
        consecutiveFailures: state.consecutiveFailures, totalFailures: state.totalFailures,
        cooldownRemainingMs: Math.max(0, state.cooldownUntil - Date.now()),
        lastErrorCategory: state.lastErrorCategory, lastSuccessAt: state.lastSuccessAt, lastAttemptAt: state.lastAttemptAt,
      };
    }),
  };
}
export function resetGeminiProviderStateForTests(): void {
  stateByLabel.clear();
  rotationCursor = 0;
  activeLabel = null;
}
