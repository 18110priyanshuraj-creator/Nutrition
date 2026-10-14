import {NextResponse} from "next/server";
import {z} from "zod";
import {requireOwner} from "@/lib/server-auth";
import {isSameOriginRequest} from "@/lib/server-origin";
import {cancelAgentTask, resumeAgentTask} from "@/lib/agent/task-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const actionSchema = z.object({action: z.enum(["cancel", "resume"])}).strict();

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  const unauthorized = await requireOwner(request);
  if (unauthorized) return unauthorized;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({error: "Cross-origin task controls are not allowed."}, {status: 403});
  }
  const body = actionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({error: "Choose a valid task action."}, {status: 400});
  const {id} = await context.params;
  try {
    const task = body.data.action === "cancel" ? cancelAgentTask(id) : resumeAgentTask(id);
    if (!task) return NextResponse.json({error: "Task not found."}, {status: 404});
    return NextResponse.json({task}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : "Task action failed."}, {status: 409});
  }
}
