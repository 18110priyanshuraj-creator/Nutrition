import {NextResponse} from "next/server";
import {z} from "zod";
import {requireOwner} from "@/lib/server-auth";
import {isSameOriginRequest} from "@/lib/server-origin";
import {configuredGeminiModel, getGeminiProviderTestResult} from "@/lib/agent/gemini-provider";
import {createAgentTask, inAppAgentEnabled, listAgentTasks} from "@/lib/agent/task-runner";
import {redactSecrets} from "@/lib/agent/secret-redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const taskSchema = z.object({
  request: z.string().trim().min(5).max(1000).refine((value) => !value.includes("\0"), "Task contains an unsupported control character."),
}).strict();
const submissions = new Map<string, {count: number; startedAt: number}>();

function taskPayload() {
  const model = configuredGeminiModel();
  const test = getGeminiProviderTestResult(model);
  return {
    enabled: inAppAgentEnabled(),
    runtime: "Gemini-backed guarded Codespace CLI",
    provider: !model ? "not_configured" : test ? (test.ok ? "healthy" : "failed") : "untested",
    providerError: test?.category ?? null,
    tasks: listAgentTasks(),
  };
}
function rateLimited(): boolean {
  const key = "owner";
  const now = Date.now();
  const previous = submissions.get(key);
  if (previous && now - previous.startedAt < 60_000 && previous.count >= 4) return true;
  submissions.set(key, previous && now - previous.startedAt < 60_000
    ? {count: previous.count + 1, startedAt: previous.startedAt}
    : {count: 1, startedAt: now});
  return false;
}

export async function GET(request: Request) {
  const unauthorized = await requireOwner(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json(taskPayload(), {headers: {"Cache-Control": "no-store"}});
}

export async function POST(request: Request) {
  const unauthorized = await requireOwner(request);
  if (unauthorized) return unauthorized;
  if (!isSameOriginRequest(request)) return NextResponse.json({error: "Cross-origin task submission is not allowed."}, {status: 403});
  if (!inAppAgentEnabled()) return NextResponse.json({error: "The repository agent is available only from its authorized Codespace service."}, {status: 503});
  if (rateLimited()) return NextResponse.json({error: "Too many agent tasks. Wait a minute and try again."}, {status: 429});
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) return NextResponse.json({error: "Task request is too large."}, {status: 413});
  const body = taskSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({error: "Enter a task between 5 and 1,000 characters."}, {status: 400});
  const sanitized = redactSecrets(body.data.request);
  if (sanitized !== body.data.request) return NextResponse.json({error: "Remove credentials or secret values from the task request before submitting."}, {status: 400});
  try {
    const task = createAgentTask(sanitized);
    return NextResponse.json({task}, {status: 202, headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "Task could not be queued.");
    const status = /active or queued/.test(message) ? 429 : 500;
    return NextResponse.json({error: message}, {status, headers: {"Cache-Control": "no-store"}});
  }
}
