import {describe, expect, it} from "vitest";
import {changedTaskFiles, porcelainStatusPaths} from "../src/lib/agent/task-files";

describe("repository-agent changed-file reporting", () => {
  it("preserves the full path from Git porcelain status lines", () => {
    expect(porcelainStatusPaths(" M tests/agent-task-routes.test.ts\n?? docs/new-agent-check.md\n"))
      .toEqual(["tests/agent-task-routes.test.ts", "docs/new-agent-check.md"]);
  });

  it("asserts porcelainStatusPaths handles paths with spaces correctly", () => {
    expect(porcelainStatusPaths("MM src/lib/agent/task runner.ts\n"))
      .toEqual(["src/lib/agent/task runner.ts"]);
  });

  it("detects content changes to files that were already dirty at submission time", () => {
    const baseline = JSON.stringify({
      "README.md": "before-readme",
      "tests/database-smoke.test.ts": "before-test",
      "src/untouched.ts": "same-content",
    });

    expect(changedTaskFiles(baseline, {
      "README.md": "after-readme",
      "tests/database-smoke.test.ts": "after-test",
      "src/untouched.ts": "same-content",
    })).toEqual(["README.md", "tests/database-smoke.test.ts"]);
  });

  it("reports newly changed files and files that became clean", () => {
    expect(changedTaskFiles(JSON.stringify({"src/removed.ts": "old-fingerprint"}), {
      "src/added.ts": "new-fingerprint",
    })).toEqual(["src/added.ts", "src/removed.ts"]);
  });

  it("keeps compatibility with path-only baselines created by older tasks", () => {
    expect(changedTaskFiles(JSON.stringify(["README.md"]), {
      "README.md": "current",
      "src/new.ts": "new-fingerprint",
    })).toEqual(["src/new.ts"]);
  });

  it("rejects corrupt saved baselines instead of reporting a misleading file list", () => {
    expect(() => changedTaskFiles("not-json", {})).toThrow("baseline is invalid");
    expect(() => changedTaskFiles(JSON.stringify({"README.md": 42}), {})).toThrow("baseline is invalid");
  });
});
