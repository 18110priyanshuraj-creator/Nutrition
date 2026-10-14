import {describe, expect, it} from "vitest";
import {changedTaskFiles} from "../src/lib/agent/task-files";

describe("repository-agent changed-file reporting", () => {
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
