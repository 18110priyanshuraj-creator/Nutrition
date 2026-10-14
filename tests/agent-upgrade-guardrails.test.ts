import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const runner = readFileSync(join(process.cwd(), "scripts/agent-upgrade.ts"), "utf8");

describe("autonomous upgrade runner guardrails", () => {
  it("keeps its guardrail test and build/lint configs protected from model edits", () => {
    expect(runner).toContain('"tests/agent-upgrade-guardrails.test.ts"');
    expect(runner).toContain('"vitest.config.ts"');
    expect(runner).toContain('"eslint.config.mjs"');
    expect(runner).toContain('"next.config.ts"');
  });

  it("retains explicit path, dirty-worktree, symlink and secret checks", () => {
    expect(runner).toContain("function safePath");
    expect(runner).toContain("function hasSymlinkAncestor");
    expect(runner).toContain("preExistingStatus.has(file.path)");
    expect(runner).toContain("isSecretLike(proposal.summary)");
    expect(runner).toContain("isSecretLike(file.content)");
  });

  it("retains validated commands, shell-free execution and fixed verification checks", () => {
    expect(runner).toContain("validatePlannedTerminalCommand(item)");
    expect(runner).toContain("shell: false");
    expect(runner).toContain('const CHECK_NAMES = ["lint", "typecheck", "test", "build"] as const');
  });

  it("retains best-checkpoint validation and conditional recovery", () => {
    expect(runner).toContain("isAtLeastAsGood");
    expect(runner).toContain("async function restoreSnapshot");
    expect(runner).toContain("current !== expected");
    expect(runner).toContain("recordUpgradeMemory(root, report)");
  });

  it("keeps key-slot credentials out of output and memory paths", () => {
    expect(runner).toContain('import {redactSecrets as redact} from "../src/lib/agent/secret-redaction"');
    expect(runner).toContain("redact(response.text.trim())");
    expect(runner).toContain('join(root, ".agent", "memory.json")');
    expect(runner).toContain('join(root, ".agent", "upgrade-report.json")');
  });
});
