import {describe,expect,it} from "vitest";
import {aggregateIntake,calculateNutrients,getProgress,getRemaining,initialMacroEnergy,parseKnownFoods,unitToGrams} from "../src/lib/nutrition-core";
import {NUTRIENTS} from "../src/lib/nutrients";
describe("nutrition core",()=>{
 it("calculates a gram fraction without inventing unknown values",()=>{const n=calculateNutrients({kcal:120,protein_g:10,calcium_mg:null},50);expect(n.kcal).toBe(60);expect(n.protein_g).toBe(5);expect(n.calcium_mg).toBeUndefined();});
 it("rejects unsafe quantities",()=>{expect(()=>calculateNutrients({kcal:1},0)).toThrow();expect(()=>calculateNutrients({kcal:1},10001)).toThrow();});
 it("converts household portions with explicit estimate status",()=>{expect(unitToGrams(2,"kg").grams).toBe(2000);expect(unitToGrams(2,"banana","banana").grams).toBe(236);expect(unitToGrams(1,"katori").estimated).toBe(true);});
 it("marks any missing nutrient field incomplete",()=>{const n=aggregateIntake([{nutrients:{kcal:100,calcium_mg:10}},{nutrients:{kcal:50}}],NUTRIENTS);expect(n.kcal.amount).toBe(150);expect(n.kcal.complete).toBe(true);expect(n.calcium_mg.amount).toBe(10);expect(n.calcium_mg.complete).toBe(false);expect(n.calcium_mg.unknownCount).toBe(1);});
 it("does not divide by empty targets",()=>{expect(getProgress(0,20)).toBeNull();expect(getProgress(null,20)).toBeNull();expect(getRemaining(100,120)).toBe(0);});
 it("documents the difference between custom calorie and macro goals",()=>{const x=initialMacroEnergy();expect(x.impliedKcal).toBe(2195);expect(x.gapKcal).toBe(205);});
 it("treats an unqualified count of two bananas as two estimated pieces",()=>{const parsed=parseKnownFoods("2 banana",[{id:"banana",name:"Banana, raw",aliases:["banana"],nutrients:{kcal:89}}]);expect(parsed).toHaveLength(1);expect(parsed[0].grams).toBe(236);expect(parsed[0].estimated).toBe(true);});
});