import {describe, expect, it} from "vitest";
import {aggregateIntake, calculateNutrients, getProgress, getRemaining, initialMacroEnergy, parseKnownFoods, unitToGrams} from "../src/lib/nutrition-core";
import {NUTRIENTS} from "../src/lib/nutrients";

const foods = [
  {id: "almonds", name: "Almonds", aliases: ["badam", "बादाम"], nutrients: {kcal: 579}},
  {id: "walnuts", name: "Walnut kernels, English, raw", aliases: ["walnut", "walnuts", "akhrot", "अखरोट"], nutrients: {kcal: 654}},
  {id: "amla", name: "Amla, raw", aliases: ["amla", "आंवला"], nutrients: {}},
  {id: "moringa", name: "Moringa leaves, dry powder", aliases: ["moringa dry powder"], nutrients: {}},
  {id: "rice", name: "White rice, cooked", aliases: ["rice", "cooked rice"], nutrients: {kcal: 130}},
  {id: "roti", name: "Whole-wheat roti", aliases: ["roti"], nutrients: {kcal: 297}},
  {id: "dal", name: "Dal, cooked", aliases: ["dal"], nutrients: {kcal: 116}},
  {id: "milk", name: "Cow milk, toned", aliases: ["milk"], nutrients: {kcal: 61}},
  {id: "sattu", name: "Sattu (roasted gram flour)", aliases: ["sattu", "सत्तू"], nutrients: {kcal: 387}},
];

describe("nutrition core", () => {
  it("calculates a gram fraction without inventing unknown values", () => {
    const nutrients = calculateNutrients({kcal: 120, protein_g: 10, calcium_mg: null}, 50);
    expect(nutrients.kcal).toBe(60);
    expect(nutrients.protein_g).toBe(5);
    expect(nutrients.calcium_mg).toBeUndefined();
  });

  it("rejects unsafe quantities", () => {
    expect(() => calculateNutrients({kcal: 1}, 0)).toThrow();
    expect(() => calculateNutrients({kcal: 1}, 10_001)).toThrow();
    expect(() => unitToGrams(0, "g")).toThrow();
    expect(() => unitToGrams(10_001, "kg")).toThrow();
    expect(() => unitToGrams(1, "piece", "Unknown food")).toThrow(/no supported conversion/i);
    expect(() => unitToGrams(1, "piece", "Walnut in shell")).toThrow(/edible kernels/i);
  });

  it("converts six almonds to a small food-specific estimate", () => {
    const match = parseKnownFoods("6 almonds", foods).find(item => item.foodId === "almonds");
    expect(match).toMatchObject({grams: 7.2, estimated: true, amount: 6, unit: "piece"});
    expect(match?.note).toContain("food-specific piece estimate");
  });

  it("uses edible-kernel rather than generic piece weights for walnuts", () => {
    expect(unitToGrams(3, "piece", "Walnut kernels, English, raw").grams).toBe(12);
    expect(unitToGrams(3, "half", "Walnut kernels, English, raw").grams).toBe(6);
    expect(parseKnownFoods("3 half walnuts", foods).find(item => item.foodId === "walnuts"))
      .toMatchObject({grams: 6, amount: 3, unit: "half"});
    expect(parseKnownFoods("1 whole walnut", foods).find(item => item.foodId === "walnuts"))
      .toMatchObject({grams: null, estimated: true});
  });

  it("estimates a 30 g dry-sattu serving when the user only types Sattu", () => {
    expect(parseKnownFoods("Sattu", foods).find(item => item.foodId === "sattu"))
      .toMatchObject({grams: 30, amount: 1, unit: "serving", estimated: true});
  });

  it("preserves an explicit dry-powder gram quantity exactly", () => {
    expect(unitToGrams(20, "g", "Moringa leaves, dry powder")).toMatchObject({
      grams: 20,
      estimated: false,
      source: "user-specified",
    });
    expect(parseKnownFoods("20 g moringa dry powder", foods).find(item => item.foodId === "moringa"))
      .toMatchObject({grams: 20, amount: 20, unit: "g", estimated: false});
  });

  it("converts amla, roti, cooked rice, milk and dal with matching rules", () => {
    expect(parseKnownFoods("Amla 1 piece", foods).find(item => item.foodId === "amla")?.grams).toBe(35);
    expect(parseKnownFoods("2 roti", foods).find(item => item.foodId === "roti")?.grams).toBe(80);
    expect(unitToGrams(1, "cup", "White rice, cooked").grams).toBe(158);
    expect(unitToGrams(1, "katori", "Dal, cooked").grams).toBe(150);
    expect(unitToGrams(250, "ml", "Cow milk, toned").grams).toBeCloseTo(257.5);
  });

  it("parses Hindi and Hinglish food descriptions without sharing one piece weight", () => {
    const parsed = parseKnownFoods("६ बादाम aur ३ अखरोट", foods);
    expect(parsed.find(item => item.foodId === "almonds")?.grams).toBeCloseTo(7.2);
    expect(parsed.find(item => item.foodId === "walnuts")?.grams).toBe(12);
  });

  it("flags missing or unsupported portions instead of silently assigning 100 g", () => {
    expect(parseKnownFoods("moringa dry powder", foods).find(item => item.foodId === "moringa"))
      .toMatchObject({grams: null, estimated: true});
    expect(parseKnownFoods("250 ml almonds", foods).find(item => item.foodId === "almonds"))
      .toMatchObject({grams: null, estimated: true});
    expect(parseKnownFoods("2 rice", foods).find(item => item.foodId === "rice"))
      .toMatchObject({grams: null, estimated: true});
  });

  it("marks any missing nutrient field incomplete", () => {
    const result = aggregateIntake([{nutrients: {kcal: 100, calcium_mg: 10}}, {nutrients: {kcal: 50}}], NUTRIENTS);
    expect(result.kcal.amount).toBe(150);
    expect(result.kcal.complete).toBe(true);
    expect(result.calcium_mg.amount).toBe(10);
    expect(result.calcium_mg.complete).toBe(false);
    expect(result.calcium_mg.unknownCount).toBe(1);
  });

  it("does not divide by empty targets", () => {
    expect(getProgress(0, 20)).toBeNull();
    expect(getProgress(null, 20)).toBeNull();
    expect(getRemaining(100, 120)).toBe(0);
  });

  it("documents the difference between custom calorie and macro goals", () => {
    const result = initialMacroEnergy();
    expect(result.impliedKcal).toBe(2195);
    expect(result.gapKcal).toBe(205);
  });
});
