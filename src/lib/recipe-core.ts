import type {NutrientDefinition} from "./nutrients";
import {aggregateIntake,type NutrientAggregate,type NutrientValues} from "./nutrition-core";
export type RecipeIngredient={grams:number;nutrients:NutrientValues};
export type RecipeSummary={servings:number;ingredientCount:number;totals:Record<string,NutrientAggregate>;perServing:Record<string,NutrientAggregate>};
export function summarizeRecipe(ingredients:RecipeIngredient[],servings:number,definitions:NutrientDefinition[]):RecipeSummary {
 if(!Number.isFinite(servings)||servings<=0||servings>10000)throw new Error("Recipe servings must be greater than zero and no more than 10,000.");
 if(!ingredients.length||ingredients.length>50)throw new Error("A recipe needs 1–50 ingredients.");
 for(const ingredient of ingredients)if(!Number.isFinite(ingredient.grams)||ingredient.grams<=0||ingredient.grams>10000)throw new Error("Each recipe ingredient must have a valid quantity in grams.");
 const totals=aggregateIntake(ingredients.map((ingredient)=>({nutrients:ingredient.nutrients})),definitions);
 const perServing:Record<string,NutrientAggregate>={};
 for(const [key,total] of Object.entries(totals))perServing[key]={...total,amount:total.amount/servings,complete:total.complete};
 return {servings,ingredientCount:ingredients.length,totals,perServing};
}