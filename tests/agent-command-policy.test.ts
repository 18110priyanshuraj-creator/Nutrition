import {describe, expect, it} from "vitest";
import {validatePlannedTerminalCommand} from "../src/lib/agent/command-policy";

describe("agent terminal command policy", () => {
  it("allows read-only repository inspection", () => {
    expect(validatePlannedTerminalCommand({program: "git", args: ["status", "--short"], reason: "Check worktree"}).allowed).toBe(true);
    expect(validatePlannedTerminalCommand({program: "git", args: ["ls-files"], reason: "Inspect tracked paths"}).allowed).toBe(true);
    expect(validatePlannedTerminalCommand({program: "rg", args: ["GeminiFailoverError", "src"], reason: "Find provider error handling"})).toMatchObject({
      allowed: true, args: ["--max-count", "20", "--", "GeminiFailoverError", "src"],
    });
  });

  it("allows only fixed repository verification commands", () => {
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "test"], reason: "Run tests"}).allowed).toBe(true);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "build"], reason: "Verify build"}).allowed).toBe(true);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "agent:upgrade", "--", "--help"], reason: "Check CLI help"}).allowed).toBe(true);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "test", "--", "tests/database-smoke.test.ts"], reason: "Run disposable database regressions"}).allowed).toBe(true);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["test", "--", "tests/nutrition-core.test.ts"], reason: "Run focused nutrition tests"}).allowed).toBe(true);
  });

  it("allows read-only diagnostics and memory, but not recursive repair or watch mode", () => {
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "agent:doctor"], reason: "Check all project health"}).allowed).toBe(true);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "agent:memory"], reason: "Read saved agent lessons"}).allowed).toBe(true);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "agent:scan"], reason: "Run autonomous repair"}).allowed).toBe(false);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "agent:watch"], reason: "Start long-lived watcher"}).allowed).toBe(false);
  });

  it("blocks installs, database migrations, arbitrary scripts and shell injection", () => {
    expect(validatePlannedTerminalCommand({program: "npm", args: ["install"], reason: "Need dependency"}).allowed).toBe(false);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "db:migrate"], reason: "Change database"}).allowed).toBe(false);
    expect(validatePlannedTerminalCommand({program: "git", args: ["reset", "--hard"], reason: "Reset"}).allowed).toBe(false);
    expect(validatePlannedTerminalCommand({program: "git", args: ["status", "--short; rm -rf /"], reason: "Check state"}).allowed).toBe(false);
  });

  it("limits search scope and validates arguments", () => {
    expect(validatePlannedTerminalCommand({program: "rg", args: ["API_KEY", ".env"], reason: "Find keys"}).allowed).toBe(false);
    expect(validatePlannedTerminalCommand({program: "rg", args: ["--files", "src"], reason: "List files"}).allowed).toBe(false);
    expect(validatePlannedTerminalCommand({program: "rg", args: ["secret\nvalue", "src"], reason: "Invalid multiline search"}).allowed).toBe(false);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "test", "&& rm -rf /"], reason: "Inject command"}).allowed).toBe(false);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "test", "--", "../private.test.ts"], reason: "Escape test root"}).allowed).toBe(false);
    expect(validatePlannedTerminalCommand({program: "npm", args: ["run", "test", "--", "scripts/private.ts"], reason: "Run outside test root"}).allowed).toBe(false);
  });
});
