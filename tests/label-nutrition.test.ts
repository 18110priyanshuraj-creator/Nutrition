import {describe,expect,it} from "vitest";
import {labelValuePer100g} from "../src/lib/label-nutrition";
describe("nutrition-label conversion",()=>{
 it("converts a known per-serving energy value using serving mass",()=>{
  const result=labelValuePer100g("kcal",200,"kcal","per_serving",40);
  expect(result.value).toBe(500);expect(result.status).toBe("converted");
 });
 it("converts vitamin D IU to micrograms and preserves the convention",()=>{
  const result=labelValuePer100g("vit_d_ug",400,"IU","per_100g",null);
  expect(result.value).toBe(10);expect(result.canonicalUnit).toBe("µg");expect(result.note).toContain("40 IU");
 });
 it("does not guess a serving weight or unsupported unit",()=>{
  expect(labelValuePer100g("protein_g",10,"g","per_serving",null).status).toBe("needs-serving-mass");
  expect(labelValuePer100g("vit_a_ug",300,"IU","per_100g",null).status).toBe("unsupported");
 });
 it("preserves unavailable values instead of converting them to zero",()=>{
  const result=labelValuePer100g("calcium_mg",null,"mg","per_100g",null);
  expect(result.value).toBeNull();expect(result.status).toBe("unknown");
 });
});