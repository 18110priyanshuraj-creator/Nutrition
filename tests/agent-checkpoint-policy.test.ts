import {describe, expect, it} from "vitest";
import {isAtLeastAsGood} from "../src/lib/agent/checkpoint-policy";

describe("agent checkpoint policy", () => {
  it("accepts a checkpoint that preserves the passing checks and improves failures", () => {
    expect(isAtLeastAsGood(
      [{name:"lint",ok:true},{name:"typecheck",ok:true},{name:"test",ok:true},{name:"build",ok:false}],
      [{name:"lint",ok:true},{name:"typecheck",ok:true},{name:"test",ok:false},{name:"build",ok:false}],
    )).toBe(true);
  });

  it("rejects regressions even when another check turns green", () => {
    expect(isAtLeastAsGood(
      [{name:"lint",ok:true},{name:"typecheck",ok:false},{name:"test",ok:true},{name:"build",ok:false}],
      [{name:"lint",ok:true},{name:"typecheck",ok:true},{name:"test",ok:false},{name:"build",ok:false}],
    )).toBe(false);
  });

  it("rejects fewer passing checks and missing previously passing checks", () => {
    expect(isAtLeastAsGood(
      [{name:"lint",ok:true},{name:"typecheck",ok:false},{name:"test",ok:false}],
      [{name:"lint",ok:true},{name:"typecheck",ok:true},{name:"test",ok:false},{name:"build",ok:false}],
    )).toBe(false);
    expect(isAtLeastAsGood(
      [{name:"lint",ok:true},{name:"test",ok:true}],
      [{name:"lint",ok:true},{name:"typecheck",ok:true},{name:"test",ok:false}],
    )).toBe(false);
  });

  it("does not treat a failing but unchanged baseline as a regression", () => {
    const baseline = [{name:"lint",ok:true},{name:"typecheck",ok:false},{name:"test",ok:true},{name:"build",ok:false}];
    expect(isAtLeastAsGood(baseline, baseline)).toBe(true);
  });
});
