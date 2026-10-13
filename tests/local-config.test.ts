import {describe, expect, it} from "vitest";
import {parse} from "dotenv";
import {encodeEnvValue, mergeEnvText} from "../scripts/configure-local";

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
});
