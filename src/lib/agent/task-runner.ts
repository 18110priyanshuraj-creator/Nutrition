import {randomUUID} from "node:crypto";
import {spawn, type ChildProcess} from "node:child_process";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {getDb} from "../db";
import {redactSecrets} from "./secret-redaction";

export type AgentTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
type TaskRow = {
  id: string;
  request: string;
  status: AgentTaskStatus;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  summary: string | null;
  progress: string;
  logs: string;
  changed_files_json: string;
  checks_json: string;
  branch: string;
  commit_sha: string;
  retry_count: number;
  resume_of: string | null;
  cancellation_requested: number;
  error: string | null;
};
export type AgentTask = {
  id: string;
  request: string;
  status: AgentTaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  exitCode: number | null;
  summary: string | null;
  progress: string;
  logs: string;
  changedFiles: string[];
  checks: Record<string, boolean>;
  branch: string;
  commitSha: string;
  retryCount: number;
  resumeOf: string | null;
  cancellationRequested: boolean;
  error: string | null;
};
type AgentRuntime = {
  workerId: string;
  running: boolean;
  active: Map<string, ChildProcess>;
};
type TaskDbRow = TaskRow & {baseline_files_json: string; worker_id: string | null; worker_pid: number | null};
type RuntimeGlobal = typeof globalThis & {__mynutriAgentRuntime?: AgentRuntime};

const MAX_LOG_LENGTH = 100_000;
const MAX_VISIBLE_LOG_LENGTH = 14_000;
const TASK_TIMEOUT_MS = 60 * 60_000;
const CANCEL_GRACE_MS = 20_000;
const resumableStatuses: AgentTaskStatus[] = ["failed", "cancelled", "interrupted"];
const runtimeGlobal = globalThis as RuntimeGlobal;
const runtime = runtimeGlobal.__mynutriAgentRuntime ??= {
  workerId: randomUUID(),
  running: false,
  active: new Map<string, ChildProcess>(),
};

function jsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
function jsonChecks(value: string): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  } catch {
    return {};
  }
}
function present(row: TaskRow): AgentTask {
  return {
    id: row.id,
    request: row.request,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    exitCode: row.exit_code,
    summary: row.summary,
    progress: row.progress,
    logs: redactSecrets(row.logs).slice(-MAX_VISIBLE_LOG_LENGTH),
    changedFiles: jsonArray(row.changed_files_json),
    checks: jsonChecks(row.checks_json),
    branch: row.branch,
    commitSha: row.commit_sha,
    retryCount: row.retry_count,
    resumeOf: row.resume_of,
    cancellationRequested: row.cancellation_requested === 1,
    error: row.error ? redactSecrets(row.error) : null,
  };
}
function git(args: string[]): string {
  try {
    return execFileSync("git", args, {cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000}).trim();
  } catch (error) {
    throw new Error(redactSecrets(error instanceof Error ? error.message : String(error)));
  }
}
function currentFiles(): string[] {
  return git(["status", "--porcelain=v1", "--untracked-files=all"]).split("\n").filter(Boolean).map((line) => line.slice(3).trim().replace(/^"(.*)"$/, "$1"));
}
function getTask(id: string): TaskDbRow | undefined {
  return getDb().prepare("SELECT * FROM agent_tasks WHERE id=?").get(id) as TaskDbRow | undefined;
}
function updateTask(id: string, values: {
  status?: AgentTaskStatus;
  exitCode?: number | null;
  summary?: string | null;
  progress?: string;
  logs?: string;
  changedFiles?: string[];
  checks?: Record<string, boolean>;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  workerId?: string | null;
  workerPid?: number | null;
  cancellationRequested?: boolean;
}): void {
  const entries: Array<[string, unknown]> = [];
  const add = (column: string, value: unknown) => entries.push([column, value]);
  if (values.status !== undefined) add("status", values.status);
  if (values.exitCode !== undefined) add("exit_code", values.exitCode);
  if (values.summary !== undefined) add("summary", values.summary);
  if (values.progress !== undefined) add("progress", values.progress);
  if (values.logs !== undefined) add("logs", redactSecrets(values.logs).slice(-MAX_LOG_LENGTH));
  if (values.changedFiles !== undefined) add("changed_files_json", JSON.stringify(values.changedFiles));
  if (values.checks !== undefined) add("checks_json", JSON.stringify(values.checks));
  if (values.error !== undefined) add("error", values.error ? redactSecrets(values.error).slice(0, 1500) : null);
  if (values.startedAt !== undefined) add("started_at", values.startedAt);
  if (values.completedAt !== undefined) add("completed_at", values.completedAt);
  if (values.workerId !== undefined) add("worker_id", values.workerId);
  if (values.workerPid !== undefined) add("worker_pid", values.workerPid);
  if (values.cancellationRequested !== undefined) add("cancellation_requested", values.cancellationRequested ? 1 : 0);
  add("updated_at", new Date().toISOString());
  const assignments = entries.map(([column]) => `${column}=?`).join(",");
  getDb().prepare(`UPDATE agent_tasks SET ${assignments} WHERE id=?`).run(...entries.map(([, value]) => value), id);
}
function pruneTaskHistory(): void {
  getDb().prepare(`
    DELETE FROM agent_tasks
    WHERE id IN (
      SELECT id FROM agent_tasks
      WHERE status IN ('succeeded','failed','cancelled','interrupted') AND worker_pid IS NULL
      ORDER BY created_at DESC LIMIT -1 OFFSET 50
    )
  `).run();
}
function checksFrom(logs: string): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  for (const match of logs.matchAll(/(?:PASS|FAIL):\s*(lint|typecheck|test|build)\b/g)) checks[match[1]] = match[0].startsWith("PASS");
  return checks;
}
function progressFrom(logs: string): string {
  const lines = logs.split(/\r?\n/).slice(-100);
  for (const line of lines.reverse()) {
    const check = line.match(/==========\s*npm run (lint|typecheck|test|build)\s*==========/);
    if (check) return `Running ${check[1]}`;
    const repair = line.match(/AI repair\s+(\d+\/\d+)/);
    if (repair) return `Reviewing a guarded repair proposal (${repair[1]})`;
    if (/All checks passed|VERIFIED:/.test(line)) return "Verifying completed changes";
  }
  return "Agent is analyzing the task";
}
function completionSummary(logs: string, code: number | null, cancelled: boolean): string {
  if (cancelled) return "Cancelled safely; inspect the verified changes and resume explicitly if needed.";
  const verified = logs.match(/VERIFIED:\s*(.{1,1000})/);
  if (verified) return redactSecrets(verified[1]).trim();
  if (code === 0 && /All checks passed/.test(logs)) return "Completed; all fixed checks passed.";
  return code === 0 ? "Completed without applying a code change." : `Agent exited with status ${String(code)}.`;
}
function failureReason(logs: string): string {
  const lines = redactSecrets(logs).split(/\r?\n/).filter(Boolean).reverse();
  return lines.find((line) => /^(?:Gemini unavailable:|Agent stopped safely:|FAIL:|Error:)/.test(line))?.slice(0, 1200)
    ?? "The agent failed. See the sanitized execution log for the command output.";
}
function agentProcessIsAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    const command = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
    return command.includes(join(process.cwd(), "scripts", "agent.ts"));
  } catch {
    return false;
  }
}
function reconcileAfterRestart(): void {
  const rows = getDb().prepare("SELECT * FROM agent_tasks WHERE status='running' AND worker_id<>?").all(runtime.workerId) as TaskDbRow[];
  for (const row of rows) {
    if (row.worker_pid && agentProcessIsAlive(row.worker_pid)) {
      try {
        process.kill(row.worker_pid, "SIGTERM");
      } catch {
        // The process may have exited after the liveness check.
      }
    }
    updateTask(row.id, {
      status: "interrupted",
      progress: "Interrupted by a worker restart",
      summary: "The worker stopped before it could record completion. Review the branch before resuming.",
      error: "Task execution was interrupted by a worker restart.",
      completedAt: new Date().toISOString(),
      workerId: null,
      workerPid: row.worker_pid && agentProcessIsAlive(row.worker_pid) ? row.worker_pid : null,
    });
  }
}
function claimNext(): TaskDbRow | undefined {
  const db = getDb();
  const claim = db.transaction(() => {
    const interrupted = db.prepare("SELECT id,worker_pid FROM agent_tasks WHERE status='interrupted' AND worker_pid IS NOT NULL").all() as Array<{id: string; worker_pid: number}>;
    for (const task of interrupted) {
      if (agentProcessIsAlive(task.worker_pid)) return undefined;
      updateTask(task.id, {workerPid: null});
    }
    const row = db.prepare("SELECT * FROM agent_tasks WHERE status='queued' ORDER BY created_at LIMIT 1").get() as TaskDbRow | undefined;
    if (!row) return undefined;
    const startedAt = new Date().toISOString();
    const changed = db.prepare("UPDATE agent_tasks SET status='running',worker_id=?,started_at=?,updated_at=?,progress='Starting guarded repository agent' WHERE id=? AND status='queued'")
      .run(runtime.workerId, startedAt, startedAt, row.id);
    return changed.changes === 1 ? {...row, status: "running" as const, worker_id: runtime.workerId, started_at: startedAt} : undefined;
  });
  return claim();
}
async function executeTask(task: TaskDbRow): Promise<void> {
  const root = process.cwd();
  const taskScript = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const script = join(root, "scripts", "agent.ts");
  let rawLogs = "";
  const append = (chunk: Buffer) => {
    rawLogs = (rawLogs + chunk.toString("utf8")).slice(-MAX_LOG_LENGTH);
    const logs = redactSecrets(rawLogs);
    updateTask(task.id, {logs, progress: progressFrom(logs), checks: checksFrom(logs)});
  };
  let child: ChildProcess;
  try {
    child = spawn(process.execPath, [taskScript, script, task.request], {
      cwd: root,
      env: {...process.env, AGENT_MAX_REPAIR_ATTEMPTS: "3", MYNUTRI_AGENT_TASK_SERVICE: "true"},
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    updateTask(task.id, {
      status: "failed",
      exitCode: 1,
      completedAt: new Date().toISOString(),
      summary: "The repository agent process could not be started.",
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
    });
    return;
  }
  runtime.active.set(task.id, child);
  updateTask(task.id, {workerPid: child.pid ?? null});
  if (getTask(task.id)?.cancellation_requested === 1) child.kill("SIGTERM");
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  let timeout = false;
  const timer = setTimeout(() => {
    timeout = true;
    updateTask(task.id, {progress: "Stopping after the one-hour task limit", cancellationRequested: true});
    child.kill("SIGTERM");
  }, TASK_TIMEOUT_MS);
  const forceTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, TASK_TIMEOUT_MS + CANCEL_GRACE_MS);
  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("error", (error) => {
      rawLogs += `\nAgent process error: ${error.message}`;
      resolve(1);
    });
    child.once("close", resolve);
  }).finally(() => {
    clearTimeout(timer);
    clearTimeout(forceTimer);
  });
  runtime.active.delete(task.id);
  const current = getTask(task.id);
  if (!current) return;
  const cancelled = current.cancellation_requested === 1;
  let files: string[] = [];
  let gitFailure: string | null = null;
  try {
    const baseline = new Set(jsonArray(task.baseline_files_json));
    files = currentFiles().filter((file) => !baseline.has(file) && !file.startsWith(".agent/"));
  } catch (error) {
    gitFailure = redactSecrets(error instanceof Error ? error.message : String(error));
  }
  const finalStatus: AgentTaskStatus = cancelled ? "cancelled" : exitCode === 0 && !timeout && !gitFailure ? "succeeded" : "failed";
  const summary = timeout ? "Stopped after reaching the one-hour task limit." : completionSummary(rawLogs, exitCode, cancelled);
  updateTask(task.id, {
    status: finalStatus,
    exitCode,
    completedAt: new Date().toISOString(),
    summary,
    progress: finalStatus === "succeeded" ? "Complete" : finalStatus === "cancelled" ? "Cancelled" : finalStatus === "failed" ? "Failed" : "Interrupted",
    logs: rawLogs,
    checks: checksFrom(rawLogs),
    changedFiles: files,
    error: timeout ? "Task exceeded its one-hour execution limit." : gitFailure ?? (finalStatus === "failed" ? failureReason(rawLogs) : null),
    workerId: null,
    workerPid: null,
  });
}
function wakeWorker(): void {
  queueMicrotask(() => {
    void pumpQueue().catch((error: unknown) => {
      runtime.running = false;
      console.error("Repository agent worker failed: " + redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 1000));
    });
  });
}
async function pumpQueue(): Promise<void> {
  if (runtime.running) return;
  runtime.running = true;
  try {
    for (;;) {
      const task = claimNext();
      if (!task) break;
      await executeTask(task);
    }
  } finally {
    runtime.running = false;
  }
}
export function inAppAgentEnabled(): boolean {
  return process.env.CODESPACES?.toLowerCase() === "true" || process.env.MYNUTRI_ENABLE_AGENT?.toLowerCase() === "true";
}
export function listAgentTasks(): AgentTask[] {
  reconcileAfterRestart();
  const rows = getDb().prepare("SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT 20").all() as TaskRow[];
  if (rows.some((row) => row.status === "queued")) wakeWorker();
  return rows.map(present);
}
export function createAgentTask(request: string): AgentTask {
  if (!inAppAgentEnabled()) throw new Error("The repository agent is available only from its authorized Codespace service.");
  reconcileAfterRestart();
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  const branch = git(["branch", "--show-current"]);
  const commitSha = git(["rev-parse", "HEAD"]);
  const baselineFiles = currentFiles();
  const insert = db.transaction(() => {
    const activeCount = (db.prepare("SELECT COUNT(*) AS count FROM agent_tasks WHERE status IN ('queued','running')").get() as {count: number}).count
      + (db.prepare("SELECT worker_pid FROM agent_tasks WHERE status='interrupted' AND worker_pid IS NOT NULL").all() as Array<{worker_pid: number}>).filter((task) => agentProcessIsAlive(task.worker_pid)).length;
    if (activeCount >= 2) throw new Error("The repository agent already has an active or queued task.");
    db.prepare("INSERT INTO agent_tasks (id,request,status,created_at,updated_at,progress,branch,commit_sha,baseline_files_json) VALUES(?,?,'queued',?,?,'Queued',?,?,?)")
      .run(id, request, now, now, branch, commitSha, JSON.stringify(baselineFiles));
  });
  insert();
  pruneTaskHistory();
  wakeWorker();
  const row = getTask(id);
  if (!row) throw new Error("The task was accepted but could not be read back from persistent storage.");
  return present(row);
}
export function resumeAgentTask(id: string): AgentTask {
  const original = getTask(id);
  if (!original) throw new Error("Task not found.");
  if (!resumableStatuses.includes(original.status) || original.retry_count >= 2) {
    throw new Error("Only a finished task with fewer than two retries can be resumed.");
  }
  if (original.worker_pid && agentProcessIsAlive(original.worker_pid)) {
    throw new Error("The previous worker is still stopping. Wait for it to exit before resuming.");
  }
  if (original.worker_pid) updateTask(id, {workerPid: null});
  return createResumedTask(original);
}
function createResumedTask(original: TaskDbRow): AgentTask {
  if (!inAppAgentEnabled()) throw new Error("The repository agent is available only from its authorized Codespace service.");
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  const branch = git(["branch", "--show-current"]);
  const commitSha = git(["rev-parse", "HEAD"]);
  const insert = db.transaction(() => {
    const activeCount = (db.prepare("SELECT COUNT(*) AS count FROM agent_tasks WHERE status IN ('queued','running')").get() as {count: number}).count
      + (db.prepare("SELECT worker_pid FROM agent_tasks WHERE status='interrupted' AND worker_pid IS NOT NULL").all() as Array<{worker_pid: number}>).filter((task) => agentProcessIsAlive(task.worker_pid)).length;
    if (activeCount >= 2) throw new Error("The repository agent already has an active or queued task.");
    db.prepare("INSERT INTO agent_tasks (id,request,status,created_at,updated_at,progress,branch,commit_sha,baseline_files_json,retry_count,resume_of) VALUES(?,?,'queued',?,?,'Queued to resume from saved project memory',?,?,?,?,?)")
      .run(id, original.request, now, now, branch, commitSha, JSON.stringify(currentFiles()), original.retry_count + 1, original.id);
  });
  insert();
  pruneTaskHistory();
  wakeWorker();
  const row = getTask(id);
  if (!row) throw new Error("The resumed task was accepted but could not be read back from persistent storage.");
  return present(row);
}
export function cancelAgentTask(id: string): AgentTask | null {
  const row = getTask(id);
  if (!row) return null;
  if (row.status === "queued") {
    updateTask(id, {status: "cancelled", completedAt: new Date().toISOString(), progress: "Cancelled before execution", summary: "Cancelled before the agent started.", cancellationRequested: true});
  } else if (row.status === "running") {
    updateTask(id, {cancellationRequested: true, progress: "Cancellation requested; finishing the current safe step"});
    const child = runtime.active.get(id);
    child?.kill("SIGTERM");
    if (child) {
      const forceTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, CANCEL_GRACE_MS);
      forceTimer.unref();
    }
  } else {
    throw new Error("Only queued or running tasks can be cancelled.");
  }
  const updated = getTask(id);
  return updated ? present(updated) : null;
}
