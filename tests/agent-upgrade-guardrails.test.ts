import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const runner = readFileSync(join(process.cwd(), "scripts/agent-upgrade.ts"), "utf8");
const inAppRunner = readFileSync(join(process.cwd(), "scripts/agent.ts"), "utf8");

describe("autonomous upgrade runner guardrails", () => {
  it("keeps the guardrail test and executable build/lint configuration protected", () => {
    expect(runner).toContain('"tests/agent-upgrade-guardrails.test.ts"');
    expect(runner).toContain('"vitest.config.ts"');
    expect(runner).toContain('"eslint.config.mjs"');
    expect(runner).toContain('"next.config.ts"');
  });

  it("supports project file types while preserving secret, symlink and dirty-edit protections", () => {
    expect(runner).toContain("function safePath");
    expect(runner).toContain("function hasSymlinkAncestor");
    expect(runner).toContain("function preservesPreexistingDiff");
    expect(runner).toContain("preExistingStatus.has(file.path)");
    expect(runner).toContain("isSecretLike(proposal.summary)");
    expect(runner).toContain("isSecretLike(file.content)");
    expect(runner).toContain("sql|json|ya?ml");
    expect(runner).toContain("500,000 total generated characters");
    expect(runner).not.toContain("READ-ONLY: pre-existing working-tree change");
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

  it("loads complete task-named files and preserves generated Next.js type references", () => {
    expect(runner).toContain("sourceContext(root, visibleFiles, changed, task)");
    expect(runner).toContain("named(path) ? 16000 : 5000");
    expect(runner).toContain('env.MYNUTRI_AGENT_BUILD = "true"');
    expect(runner).toContain("restoreNextEnvAfterBuild(cwd, nextEnvBefore)");
    expect(inAppRunner).toContain("sourceContext(root,diag,memory,task)");
    expect(inAppRunner).toContain("named(path)?16000:diag.includes(path)?6000:3000");
    expect(inAppRunner).toContain("restoreNextEnvAfterBuild(root,nextEnvBefore)");
  });

  it("keeps key-slot credentials out of output and memory paths", () => {
    expect(runner).toContain('import {redactSecrets as redact} from "../src/lib/agent/secret-redaction"');
    expect(runner).toContain("redact(response.text.trim())");
    expect(runner).toContain('join(root, ".agent", "memory.json")');
    expect(runner).toContain('join(root, ".agent", "upgrade-report.json")');
  });
});
