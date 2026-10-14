import {mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {parse} from "dotenv";
import {encodeEnvValue, loadPrivateEnvFiles, mergeEnvText} from "../scripts/configure-local";

describe("local secrets configuration helpers", () => {
  it("updates only selected settings and preserves unrelated env lines", () => {
    const initial = [
      "# retain this comment",
      "DATABASE_PATH=./data/private.sqlite",
      "GEMINI_API_KEY_1=old-value",
      "GEMINI_API_KEY_2=duplicate-old",
      "APP_PASSWORD=old-password",
      "",
    ].join("\n");
    const updated = mergeEnvText(initial, new Map([
      ["GEMINI_API_KEY_1", "new-key"],
      ["GEMINI_API_KEY_2", null],
    ]));

    expect(updated).toContain("# retain this comment");
    expect(updated).toContain("DATABASE_PATH=./data/private.sqlite");
    expect(updated).toContain("GEMINI_API_KEY_1=new-key");
    expect(updated).not.toContain("GEMINI_API_KEY_2");
    expect(updated).toContain("APP_PASSWORD=old-password");
    expect(updated.match(/^GEMINI_API_KEY_1=/gm)).toHaveLength(1);
  });

  it("safely encodes dotenv values containing spaces, comments, and quotes", () => {
    for (const value of ["plain-value", "space value", "hash#value", `double"quote`, "single'quote"]) {
      expect(parse(`MYNUTRI_VALUE=${encodeEnvValue(value)}`).MYNUTRI_VALUE).toBe(value);
    }
  });

  it("rejects line breaks instead of writing a second dotenv assignment", () => {
    expect(() => encodeEnvValue("first-line\nAPP_PASSWORD=unsafe")).toThrow(/line breaks/);
  });

  it("loads .env.local credentials for CLI scripts while preserving runtime overrides", () => {
    const original = {...process.env};
    const root = mkdtempSync(join(tmpdir(), "mynutri-env-"));
    writeFileSync(join(root, ".env"), "GEMINI_MODEL=base-model\nGEMINI_API_KEY_1=base-key\n");
    writeFileSync(join(root, ".env.local"), "GEMINI_MODEL=local-model\nGEMINI_API_KEY_1=local-key\nGEMINI_API_KEY_2=local-key-2\n");
    for (let index = 1; index <= 7; index += 1) delete process.env[`GEMINI_API_KEY_${index}`];
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_MODEL = "runtime-model";
    process.env.GEMINI_API_KEY_1 = "runtime-key";
    const priorCwd = process.cwd();
    try {
      process.chdir(root);
      loadPrivateEnvFiles(root);
      expect(process.env.GEMINI_MODEL).toBe("runtime-model");
      expect(process.env.GEMINI_API_KEY_1).toBe("runtime-key");
      expect(process.env.GEMINI_API_KEY_2).toBe("local-key-2");
    } finally {
      process.chdir(priorCwd);
      for (const key of Object.keys(process.env)) {
        if (!(key in original)) delete process.env[key];
      }
      Object.assign(process.env, original);
    }
  });
});
