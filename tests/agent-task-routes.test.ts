import {beforeEach, describe, expect, it, vi} from "vitest";
import {GET, POST} from "../app/api/agent/tasks/route";
import {POST as controlTask} from "../app/api/agent/tasks/[id]/route";

const mocked = vi.hoisted(() => ({
  owner: true,
  enabled: true,
  create: vi.fn(),
  list: vi.fn(),
  cancel: vi.fn(),
  resume: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  requireOwner: async () => mocked.owner ? null : Response.json({error: "Authentication required."}, {status: 401}),
}));
vi.mock("@/lib/agent/task-runner", () => ({
  inAppAgentEnabled: () => mocked.enabled,
  createAgentTask: mocked.create,
  listAgentTasks: mocked.list,
  cancelAgentTask: mocked.cancel,
  resumeAgentTask: mocked.resume,
}));
vi.mock("@/lib/agent/gemini-provider", () => ({
  configuredGeminiModel: () => "test-model",
  getGeminiProviderTestResult: () => null,
  classifyGeminiError: (error: unknown) => error,
}));

const sameOrigin = {origin: "http://localhost"};
const syntheticApiKey = "AIza" + "012345678901234567890123456789";

beforeEach(() => {
  mocked.owner = true;
  mocked.enabled = true;
  mocked.create.mockReset();
  mocked.list.mockReset().mockReturnValue([]);
  mocked.cancel.mockReset();
  mocked.resume.mockReset();
});

describe("owner-authorized repository agent routes", () => {
  it("requires owner authorization before returning task history", async () => {
    mocked.owner = false;
    const response = await GET(new Request("http://localhost/api/agent/tasks"));
    expect(response.status).toBe(401);
    expect(mocked.list).not.toHaveBeenCalled();
  });

  it("reports the existing guarded runtime and its honest provider state", async () => {
    const response = await GET(new Request("http://localhost/api/agent/tasks"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.runtime).toContain("guarded");
    expect(body.provider).toBe("untested");
    expect(body.tasks).toEqual([]);
  });

  it("requires a same-origin explicit repository task", async () => {
    const crossOrigin = await POST(new Request("http://localhost/api/agent/tasks", {
      method: "POST",
      headers: {"content-type": "application/json", origin: "https://attacker.invalid"},
      body: JSON.stringify({request: "Fix the dashboard"}),
    }));
    const missingOrigin = await POST(new Request("http://localhost/api/agent/tasks", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({request: "Fix the dashboard"}),
    }));
    const malformedOrigin = await POST(new Request("http://localhost/api/agent/tasks", {
      method: "POST",
      headers: {"content-type": "application/json", origin: "http://localhost/untrusted-path"},
      body: JSON.stringify({request: "Fix the dashboard"}),
    }));
    expect(crossOrigin.status).toBe(403);
    expect(missingOrigin.status).toBe(403);
    expect(malformedOrigin.status).toBe(403);
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it("accepts the browser origin forwarded by a Codespace reverse proxy", async () => {
    const response = await POST(new Request("http://127.0.0.1:3100/api/agent/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://nutrition-3000.app.github.dev",
        host: "127.0.0.1:3100",
        "x-forwarded-host": "nutrition-3000.app.github.dev",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({request: "Debug GEMINI_API_KEY=" + syntheticApiKey}),
    }));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(syntheticApiKey);
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it("rejects secret-bearing and malformed tasks without passing them to the agent", async () => {
    const secret = await POST(new Request("http://localhost/api/agent/tasks", {
      method: "POST",
      headers: {"content-type": "application/json", ...sameOrigin},
      body: JSON.stringify({request: "Debug GEMINI_API_KEY=" + syntheticApiKey}),
    }));
    const malformed = await POST(new Request("http://localhost/api/agent/tasks", {
      method: "POST",
      headers: {"content-type": "application/json", ...sameOrigin},
      body: JSON.stringify({request: "fix"}),
    }));
    expect(secret.status).toBe(400);
    expect(await secret.text()).not.toContain(syntheticApiKey);
    expect(malformed.status).toBe(400);
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it("queues an approved task using the existing CLI service", async () => {
    mocked.create.mockReturnValue({id: "task-1", status: "queued"});
    const response = await POST(new Request("http://localhost/api/agent/tasks", {
      method: "POST",
      headers: {"content-type": "application/json", ...sameOrigin},
      body: JSON.stringify({request: "Investigate and fix the settings provider test"}),
    }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({task: {id: "task-1", status: "queued"}});
    expect(mocked.create).toHaveBeenCalledWith("Investigate and fix the settings provider test");
  });

  it("does not queue tasks when the Codespace execution service is disabled", async () => {
    mocked.enabled = false;
    const response = await POST(new Request("http://localhost/api/agent/tasks", {
      method: "POST",
      headers: {"content-type": "application/json", ...sameOrigin},
      body: JSON.stringify({request: "Investigate the current type errors"}),
    }));
    expect(response.status).toBe(503);
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it("authorizes cancel and resume controls and rejects malformed actions", async () => {
    mocked.owner = false;
    const unauthorized = await controlTask(new Request("http://localhost/api/agent/tasks/task-1", {
      method: "POST", headers: {"content-type": "application/json", ...sameOrigin}, body: JSON.stringify({action: "cancel"}),
    }), {params: Promise.resolve({id: "task-1"})});
    mocked.owner = true;
    const malformed = await controlTask(new Request("http://localhost/api/agent/tasks/task-1", {
      method: "POST", headers: {"content-type": "application/json", ...sameOrigin}, body: JSON.stringify({action: "run"}),
    }), {params: Promise.resolve({id: "task-1"})});
    mocked.cancel.mockReturnValue({id: "task-1", status: "running", cancellationRequested: true});
    const cancelled = await controlTask(new Request("http://localhost/api/agent/tasks/task-1", {
      method: "POST", headers: {"content-type": "application/json", ...sameOrigin}, body: JSON.stringify({action: "cancel"}),
    }), {params: Promise.resolve({id: "task-1"})});
    expect(unauthorized.status).toBe(401);
    expect(malformed.status).toBe(400);
    expect(cancelled.status).toBe(200);
    expect(mocked.cancel).toHaveBeenCalledWith("task-1");
    expect(mocked.resume).not.toHaveBeenCalled();
  });

  it("blocks cross-origin cancellation before touching the task", async () => {
    const response = await controlTask(new Request("http://localhost/api/agent/tasks/task-1", {
      method: "POST",
      headers: {"content-type": "application/json", origin: "https://attacker.invalid"},
      body: JSON.stringify({action: "cancel"}),
    }), {params: Promise.resolve({id: "task-1"})});
    expect(response.status).toBe(403);
    expect(mocked.cancel).not.toHaveBeenCalled();
  });

  it("offers explicit resume only through the owner-authorized task control", async () => {
    mocked.resume.mockReturnValue({id: "task-2", status: "queued", resumeOf: "task-1"});
    const response = await controlTask(new Request("http://localhost/api/agent/tasks/task-1", {
      method: "POST", headers: {"content-type": "application/json", ...sameOrigin}, body: JSON.stringify({action: "resume"}),
    }), {params: Promise.resolve({id: "task-1"})});
    expect(response.status).toBe(200);
    expect(mocked.resume).toHaveBeenCalledWith("task-1");
    expect(mocked.cancel).not.toHaveBeenCalled();
  });
});
