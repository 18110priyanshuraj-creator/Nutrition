export type NutrientDefinition = {
  key: string; label: string; category: "Energy" | "Macros" | "Fatty acids" | "Minerals" | "Vitamins" | "Other";
  canonicalUnit: string; displayUnit: string; target: number | null; targetMin?: number | null; targetMax?: number | null;
  displayFactor?: number; description?: string; qualitative?: boolean;
};
export const NUTRIENTS: NutrientDefinition[] = [
  {key:"kcal",label:"Energy",category:"Energy",canonicalUnit:"kcal",displayUnit:"kcal",target:2400},
  {key:"protein_g",label:"Protein",category:"Macros",canonicalUnit:"g",displayUnit:"g",target:80},
  {key:"carbs_g",label:"Carbohydrates",category:"Macros",canonicalUnit:"g",displayUnit:"g",target:300},
  {key:"fat_g",label:"Total fat",category:"Macros",canonicalUnit:"g",displayUnit:"g",target:75},
  {key:"omega3_g",label:"Omega-3 fatty acids",category:"Fatty acids",canonicalUnit:"g",displayUnit:"g",target:1.6},
  {key:"omega6_g",label:"Omega-6 fatty acids",category:"Fatty acids",canonicalUnit:"g",displayUnit:"g",target:16},
  {key:"calcium_mg",label:"Calcium",category:"Minerals",canonicalUnit:"mg",displayUnit:"mg",target:1300},
  {key:"phosphorus_mg",label:"Phosphorus",category:"Minerals",canonicalUnit:"mg",displayUnit:"mg",target:1250},
  {key:"magnesium_mg",label:"Magnesium",category:"Minerals",canonicalUnit:"mg",displayUnit:"mg",target:410},
  {key:"potassium_mg",label:"Potassium",category:"Minerals",canonicalUnit:"mg",displayUnit:"mg",target:3000},
  {key:"sodium_mg",label:"Sodium",category:"Minerals",canonicalUnit:"mg",displayUnit:"mg",target:1500},
  {key:"chloride_mg",label:"Chloride",category:"Minerals",canonicalUnit:"mg",displayUnit:"g",target:2300,displayFactor:0.001},
  {key:"zinc_mg",label:"Zinc",category:"Minerals",canonicalUnit:"mg",displayUnit:"mg",target:11},
  {key:"iron_mg",label:"Iron",category:"Minerals",canonicalUnit:"mg",displayUnit:"mg",target:11},
  {key:"iodine_ug",label:"Iodine",category:"Minerals",canonicalUnit:"µg",displayUnit:"µg",target:150},
  {key:"copper_ug",label:"Copper",category:"Minerals",canonicalUnit:"µg",displayUnit:"µg",target:890},
  {key:"manganese_mg",label:"Manganese",category:"Minerals",canonicalUnit:"mg",displayUnit:"mg",target:2.2},
  {key:"selenium_ug",label:"Selenium",category:"Minerals",canonicalUnit:"µg",displayUnit:"µg",target:55},
  {key:"fluoride_mg",label:"Fluoride",category:"Minerals",canonicalUnit:"mg",displayUnit:"mg",target:3},
  {key:"chromium_ug",label:"Chromium",category:"Minerals",canonicalUnit:"µg",displayUnit:"µg",target:35},
  {key:"molybdenum_ug",label:"Molybdenum",category:"Minerals",canonicalUnit:"µg",displayUnit:"µg",target:43},
  {key:"sulfur_proxy",label:"Sulfur / protein adequacy proxy",category:"Other",canonicalUnit:"qualitative",displayUnit:"status",target:null,qualitative:true,description:"Qualitative proxy only; sulfur intake is not calculated independently."},
  {key:"vit_a_ug",label:"Vitamin A",category:"Vitamins",canonicalUnit:"µg RAE where known",displayUnit:"µg",target:900,description:"Source may use a different retinol/carotenoid reporting convention."},
  {key:"vit_d_ug",label:"Vitamin D",category:"Vitamins",canonicalUnit:"µg",displayUnit:"IU",target:22.5,targetMin:20,targetMax:25,displayFactor:40,description:"User range 800–1,000 IU; 1 µg vitamin D = 40 IU."},
  {key:"vit_e_mg",label:"Vitamin E",category:"Vitamins",canonicalUnit:"mg",displayUnit:"mg",target:15},
  {key:"vit_k_ug",label:"Vitamin K",category:"Vitamins",canonicalUnit:"µg",displayUnit:"µg",target:75},
  {key:"vit_c_mg",label:"Vitamin C",category:"Vitamins",canonicalUnit:"mg",displayUnit:"mg",target:75},
  {key:"vit_b1_mg",label:"Vitamin B1 — Thiamine",category:"Vitamins",canonicalUnit:"mg",displayUnit:"mg",target:1.2},
  {key:"vit_b2_mg",label:"Vitamin B2 — Riboflavin",category:"Vitamins",canonicalUnit:"mg",displayUnit:"mg",target:1.3},
  {key:"vit_b3_mg",label:"Vitamin B3 — Niacin",category:"Vitamins",canonicalUnit:"mg",displayUnit:"mg",target:16,description:"Niacin equivalents may differ from niacin alone."},
  {key:"vit_b5_mg",label:"Vitamin B5 — Pantothenic acid",category:"Vitamins",canonicalUnit:"mg",displayUnit:"mg",target:5},
  {key:"vit_b6_mg",label:"Vitamin B6",category:"Vitamins",canonicalUnit:"mg",displayUnit:"mg",target:1.3},
  {key:"vit_b7_ug",label:"Vitamin B7 — Biotin",category:"Vitamins",canonicalUnit:"µg",displayUnit:"µg",target:30},
  {key:"vit_b9_ug",label:"Vitamin B9 — Folate",category:"Vitamins",canonicalUnit:"µg",displayUnit:"µg",target:400,description:"Folate and dietary folate equivalents are not interchangeable without source metadata."},
  {key:"vit_b12_ug",label:"Vitamin B12",category:"Vitamins",canonicalUnit:"µg",displayUnit:"µg",target:2.4}
];
export const NUTRIENT_BY_KEY = Object.fromEntries(NUTRIENTS.map((n)=>[n.key,n])) as Record<string,NutrientDefinition>;
export function formatNutrient(key:string,value:number|null|undefined):string {
  if(value===null||value===undefined||!Number.isFinite(value)) return "Data unavailable";
  const d=NUTRIENT_BY_KEY[key]; if(!d) return String(value); if(d.qualitative) return "Qualitative proxy";
  const v=value*(d.displayFactor??1); const digits=Math.abs(v)>=100?0:Math.abs(v)>=10?1:2;
  return new Intl.NumberFormat("en-IN",{maximumFractionDigits:digits}).format(v)+" "+d.displayUnit;
}
export function targetLabel(n:NutrientDefinition,target:number|null=n.target):string {
  if(n.qualitative) return "Qualitative proxy"; if(target===null) return "Not configured";
  if(n.targetMin!==undefined&&n.targetMax!==undefined&&n.targetMin!==null&&n.targetMax!==null&&target===n.target)
    return formatNutrient(n.key,n.targetMin)+"–"+formatNutrient(n.key,n.targetMax);
  return formatNutrient(n.key,target);
}