"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import {LoaderCircle, X} from "lucide-react";

type AgentTask = {
  id: string;
  request: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  createdAt: string;
  updatedAt: string;
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
type AgentStatus = {
  enabled: boolean;
  runtime: string;
  provider: "not_configured" | "untested" | "healthy" | "failed";
  providerError: string | null;
  tasks: AgentTask[];
};

const activeStatuses = new Set<AgentTask["status"]>(["queued", "running"]);
const statusLabels: Record<AgentTask["status"], string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Verified",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

export default function AgentWidget() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [taskText, setTaskText] = useState("");
  const [approved, setApproved] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/agent/tasks", {cache: "no-store"});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Repository agent status could not load.");
    setStatus(payload as AgentStatus);
    setSelectedId((current) => current && payload.tasks.some((task: AgentTask) => task.id === current)
      ? current
      : payload.tasks[0]?.id || "");
  }, []);
  const selected = useMemo(() => status?.tasks.find((task) => task.id === selectedId) ?? status?.tasks[0] ?? null, [selectedId, status]);
  const hasActive = Boolean(status?.tasks.some((task) => activeStatuses.has(task.status)));

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch("/api/agent/tasks", {cache: "no-store"});
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Repository agent status could not load.");
        if (!disposed) {
          setStatus(payload as AgentStatus);
          setSelectedId((current) => current && payload.tasks.some((task: AgentTask) => task.id === current)
            ? current
            : payload.tasks[0]?.id || "");
          setError("");
        }
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "Repository agent status could not load.");
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [open]);

  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!approved || !taskText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({request: taskText}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Task could not be queued.");
      setTaskText("");
      setApproved(false);
      setSelectedId(payload.task.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task could not be queued.");
    } finally {
      setBusy(false);
    }
  }

  async function controlTask(task: AgentTask, action: "cancel" | "resume") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/agent/tasks/${encodeURIComponent(task.id)}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({action}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Could not ${action} task.`);
      setSelectedId(payload.task.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${action} task.`);
    } finally {
      setBusy(false);
    }
  }

  const providerLabel = !status || status.provider === "untested"
    ? "Gemini configured; live health untested"
    : status.provider === "healthy"
      ? "Gemini live test passed"
      : status.provider === "failed"
        ? `Gemini live test failed${status.providerError ? ` (${status.providerError})` : ""}`
        : "Gemini provider not configured";

  return (
    <div className="agent-widget">
      {open ? (
        <section className="agent-panel" role="region" aria-label="Repository agent">
          <header className="agent-panel-header">
            <div>
              <strong>Repository agent</strong>
              <span>Guarded Codespace task runner</span>
            </div>
            <button className="small-icon-button" type="button" aria-label="Close repository agent" onClick={() => setOpen(false)}><X size={16}/></button>
          </header>
          {status ? <div className="agent-status-line" aria-live="polite"><span className={"agent-status-dot "+(status.enabled ? "ready" : "")}/>{status.enabled ? status.runtime : "Unavailable outside the configured Codespace service"}</div> : null}
          <div className="agent-provider-line">{providerLabel}</div>
          {error ? <div className="notice error-notice agent-error" role="alert">{error}</div> : null}
          {status?.enabled ? (
            <>
              <form className="agent-task-form" onSubmit={(event) => void submitTask(event)}>
                <label htmlFor="agent-task-request">Repository task</label>
                <textarea
                  id="agent-task-request"
                  className="textarea-control"
                  maxLength={1000}
                  minLength={5}
                  value={taskText}
                  onChange={(event) => setTaskText(event.target.value)}
                  placeholder="Describe a code change or a failing check to investigate…"
                  required
                />
                <label className="agent-approval">
                  <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)}/>
                  I authorize this task to edit code in the current repository.
                </label>
                <p className="agent-safety-copy">The existing CLI may edit up to four clean TypeScript files, runs only its fixed verification scripts, and never commits, pushes, deploys, or edits protected paths. Review its diff before keeping any changes.</p>
                <button className="primary-button" type="submit" disabled={busy || hasActive || !approved || taskText.trim().length < 5}>
                  {busy ? <LoaderCircle className="spin" size={15}/> : null}
                  {hasActive ? "Agent task already active" : "Run repository task"}
                </button>
              </form>
              <div className="agent-history">
                <div className="agent-history-title">Task history</div>
                {status.tasks.length ? (
                  <div className="agent-task-list">
                    {status.tasks.map((task) => (
                      <button
                        className={"agent-task-row "+(selected?.id === task.id ? "selected" : "")}
                        key={task.id}
                        type="button"
                        onClick={() => setSelectedId(task.id)}
                      >
                        <span>{statusLabels[task.status]}</span>
                        <span>{new Date(task.createdAt).toLocaleString("en-IN", {timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short"})}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="agent-empty">No repository tasks have been submitted.</p>}
                {selected ? (
                  <article className="agent-task-details">
                    <div className="agent-task-heading"><strong>{statusLabels[selected.status]}</strong><span>{selected.progress}</span></div>
                    <p className="agent-task-request">{selected.request}</p>
                    <p className="agent-git-info">Branch: {selected.branch || "unknown"} · commit {selected.commitSha.slice(0, 8) || "unknown"}</p>
                    {selected.summary ? <p className="agent-task-summary">{selected.summary}</p> : null}
                    {Object.keys(selected.checks).length ? <div className="agent-checks">{Object.entries(selected.checks).map(([name, ok]) => <span key={name} className={ok ? "passed" : "failed"}>{name}: {ok ? "pass" : "fail"}</span>)}</div> : null}
                    {selected.changedFiles.length ? <div className="agent-changed-files"><strong>Changed files</strong>{selected.changedFiles.map((file) => <code key={file}>{file}</code>)}</div> : null}
                    {selected.error ? <p className="agent-task-error" role="alert">{selected.error}</p> : null}
                    {selected.logs ? <details className="agent-log-details"><summary>Execution log</summary><pre>{selected.logs}</pre></details> : null}
                    {activeStatuses.has(selected.status) ? (
                      <button className="secondary-button agent-control-button" type="button" disabled={busy || selected.cancellationRequested} onClick={() => void controlTask(selected, "cancel")}>
                        {selected.cancellationRequested ? "Cancellation requested…" : "Cancel task"}
                      </button>
                    ) : ["failed", "cancelled", "interrupted"].includes(selected.status) && selected.retryCount < 2 ? (
                      <button className="secondary-button agent-control-button" type="button" disabled={busy} onClick={() => void controlTask(selected, "resume")}>Resume from saved project memory</button>
                    ) : null}
                  </article>
                ) : null}
              </div>
            </>
          ) : <p className="agent-unavailable">This browser cannot execute a Codespace task unless the authenticated app server is running inside the authorized Codespace.</p>}
          <p className="agent-assistant-note">This is separate from Nutrition Assistant. It uses Gemini through the existing guarded CLI, not the VS Code Copilot chat session.</p>
        </section>
      ) : null}
      <button className="agent-fab" type="button" aria-label={open ? "Close repository agent" : "Open repository agent"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>N</button>
    </div>
  );
}
