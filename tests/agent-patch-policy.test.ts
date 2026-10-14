import {describe, expect, it} from "vitest";
import {isAgentPatchAllowed} from "../src/lib/agent/patch-policy";

describe("guarded CLI file-patch allowlist", () => {
  const clean = new Set([
    "app/page.tsx",
    "app/api/analyze/route.ts",
    "app/api/data/route.ts",
    "scripts/migrate.ts",
    "src/lib/server-auth.ts",
    "src/lib/nutrition-core.ts",
    "tests/nutrition-core.test.ts",
    "src/lib/agent/patch-policy.ts",
  ]);

  it("allows only clean tracked TypeScript source and tests", () => {
    expect(isAgentPatchAllowed("app/page.tsx", clean)).toBe(true);
    expect(isAgentPatchAllowed("src/lib/nutrition-core.ts", clean)).toBe(true);
    expect(isAgentPatchAllowed("tests/nutrition-core.test.ts", clean)).toBe(true);
    expect(isAgentPatchAllowed("app/globals.css", clean)).toBe(false);
    expect(isAgentPatchAllowed("app/new-file.ts", clean)).toBe(false);
    expect(isAgentPatchAllowed("app/modified.tsx", new Set())).toBe(false);
  });

  it("protects authentication, private data operations, migrations, and agent internals", () => {
    for (const path of [
      "app/api/auth/login/route.ts",
      "app/api/data/route.ts",
      "app/api/restore/route.ts",
      "app/api/provider-status/route.ts",
      "app/api/agent/tasks/route.ts",
      "src/lib/server-auth.ts",
      "src/lib/agent/patch-policy.ts",
      "scripts/migrate.ts",
      "db/migrations/0006_example.ts",
      ".env.local",
    ]) {
      expect(isAgentPatchAllowed(path, clean), path).toBe(false);
    }
  });

  it("rejects absolute paths, traversal, and alternate path separators", () => {
    expect(isAgentPatchAllowed("../app/page.tsx", clean)).toBe(false);
    expect(isAgentPatchAllowed("/workspaces/Nutrition/app/page.tsx", clean)).toBe(false);
    expect(isAgentPatchAllowed("app\\page.tsx", clean)).toBe(false);
  });
});
