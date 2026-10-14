import {describe,expect,it} from "vitest";
import {summarizeRecipe} from "../src/lib/recipe-core";
import {NUTRIENTS} from "../src/lib/nutrients";
describe("recipe nutrition",()=>{
 it("calculates totals and per-serving values from ingredient snapshots",()=>{
  const result=summarizeRecipe([{grams:100,nutrients:{kcal:200,protein_g:10}},{grams:50,nutrients:{kcal:50,protein_g:5}}],3,NUTRIENTS);
  expect(result.totals.kcal.amount).toBe(250);expect(result.perServing.kcal.amount).toBeCloseTo(250/3);
  expect(result.totals.protein_g.amount).toBe(15);expect(result.perServing.protein_g.amount).toBe(5);
 });
 it("keeps a nutrient incomplete when any ingredient data is absent",()=>{
  const result=summarizeRecipe([{grams:100,nutrients:{kcal:100}},{grams:20,nutrients:{kcal:20}}],2,NUTRIENTS);
  expect(result.totals.calcium_mg.amount).toBe(0);expect(result.totals.calcium_mg.complete).toBe(false);expect(result.totals.calcium_mg.unknownCount).toBe(2);
 });
 it("rejects empty recipes, invalid serving count and invalid quantities",()=>{
  expect(()=>summarizeRecipe([],1,NUTRIENTS)).toThrow();expect(()=>summarizeRecipe([{grams:10,nutrients:{}}],0,NUTRIENTS)).toThrow();expect(()=>summarizeRecipe([{grams:0,nutrients:{}}],1,NUTRIENTS)).toThrow();
 });
});