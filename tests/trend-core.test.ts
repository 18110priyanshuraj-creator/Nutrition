import {describe,expect,it} from "vitest";
import {dateRangeEnding,finiteOrNull} from "../src/lib/trend-core";
describe("historical trend ranges",()=>{
 it("creates a calendar range including the selected day",()=>{expect(dateRangeEnding("2026-03-01",3)).toEqual(["2026-02-27","2026-02-28","2026-03-01"]);});
 it("handles month and year boundaries",()=>{expect(dateRangeEnding("2026-01-01",2)).toEqual(["2025-12-31","2026-01-01"]);});
 it("rejects invalid dates and excessively large windows",()=>{expect(()=>dateRangeEnding("2026-02-30",7)).toThrow();expect(()=>dateRangeEnding("2026-01-01",91)).toThrow();});
 it("does not manufacture numeric values for missing data",()=>{expect(finiteOrNull(null)).toBeNull();expect(finiteOrNull(undefined)).toBeNull();expect(finiteOrNull("0")).toBeNull();expect(finiteOrNull(0)).toBe(0);});
});