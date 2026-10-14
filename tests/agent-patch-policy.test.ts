import {describe, expect, it} from "vitest";
import {isAgentPatchAllowed, preservesPreexistingChanges} from "../src/lib/agent/patch-policy";

describe("guarded CLI file-patch allowlist", () => {
  const clean = new Set([
    "app/page.tsx",
    "app/globals.css",
    "app/api/analyze/route.ts",
    "app/api/auth/login/route.ts",
    "app/new-file.ts",
    "app/uploads/private.ts",
    "data/private.ts",
    "node_modules/pkg/index.ts",
    ".git/config.ts",
    "dist/generated.ts",
    "private/service.pem",
    "private/access.key",
    "package-lock.json",
    "db/migrations/0006_example.sql",
    "package.json",
    "scripts/agent.ts",
    "scripts/agent-upgrade.ts",
    "src/lib/server-auth.ts",
    "src/lib/agent/patch-policy.ts",
    "src/lib/nutrition-core.ts",
    "tests/nutrition-core.test.ts",
    "docs/agent.md",
    ".github/workflows/ci.yml",
  ]);

  it("allows project code, tests, styles, migrations, configuration, docs and agent internals", () => {
    expect(isAgentPatchAllowed("app/page.tsx", clean)).toBe(true);
    expect(isAgentPatchAllowed("src/lib/nutrition-core.ts", clean)).toBe(true);
    expect(isAgentPatchAllowed("tests/nutrition-core.test.ts", clean)).toBe(true);
    for (const path of [
      "app/globals.css",
      "db/migrations/0006_example.sql",
      "package.json",
      "scripts/agent.ts",
      "scripts/agent-upgrade.ts",
      "src/lib/agent/patch-policy.ts",
      "docs/agent.md",
      ".github/workflows/ci.yml",
      "app/new-file.ts",
      "app/api/auth/login/route.ts",
    ]) expect(isAgentPatchAllowed(path, clean), path).toBe(true);
    expect(isAgentPatchAllowed("app/modified.tsx", new Set())).toBe(false);
    expect(isAgentPatchAllowed("app/page.txt", clean)).toBe(false);
  });

  it("protects credentials, generated output, user data and dependency lockfiles", () => {
    for (const path of [
      ".env.local",
      "data/private.sqlite",
      "app/uploads/private.ts",
      "node_modules/pkg/index.ts",
      ".git/config.ts",
      "dist/generated.ts",
      "private/service.pem",
      "private/access.key",
      "package-lock.json",
    ]) {
      expect(isAgentPatchAllowed(path, clean), path).toBe(false);
    }
  });

  it("rejects absolute paths, traversal, and alternate path separators", () => {
    expect(isAgentPatchAllowed("../app/page.tsx", clean)).toBe(false);
    expect(isAgentPatchAllowed("/workspaces/Nutrition/app/page.tsx", clean)).toBe(false);
    expect(isAgentPatchAllowed("app\\page.tsx", clean)).toBe(false);
  });

  it("preserves user-added and user-removed lines in an edited dirty file", () => {
    const original = "keep\nremove this\nunchanged\n";
    const diff = "--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n keep\n-remove this\n+user addition\n unchanged\n";
    expect(preservesPreexistingChanges(original, diff, "keep\nuser addition\nagent change\nunchanged\n")).toBe(true);
    expect(preservesPreexistingChanges(original, diff, "keep\nagent change\nunchanged\n")).toBe(false);
    expect(preservesPreexistingChanges(original, diff, "keep\nremove this\nuser addition\nunchanged\n")).toBe(false);
  });
});
