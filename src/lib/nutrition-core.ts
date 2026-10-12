import type { NutrientDefinition } from "./nutrients";
export type NutrientValues=Record<string,number|null|undefined>;
export type FoodLike={id:string;name:string;aliases?:string[];nutrients:NutrientValues;source?:string;confidence?:string};
export type IntakeItem={nutrients:NutrientValues};
export function calculateNutrients(per100g:NutrientValues,grams:number):NutrientValues {
  if(!Number.isFinite(grams)||grams<=0||grams>10000) throw new Error("Portion must be greater than 0 g and at most 10,000 g.");
  const result:NutrientValues={}; for(const [key,value] of Object.entries(per100g)) if(typeof value==="number"&&Number.isFinite(value)) result[key]=value*grams/100;
  return result;
}
export type NutrientAggregate={amount:number;complete:boolean;unknownCount:number;itemCount:number};
export function aggregateIntake(items:IntakeItem[],definitions:NutrientDefinition[]):Record<string,NutrientAggregate> {
  const result:Record<string,NutrientAggregate>={};
  for(const n of definitions){if(n.qualitative)continue;let amount=0,unknownCount=0;
    for(const item of items){const v=item.nutrients[n.key];if(typeof v==="number"&&Number.isFinite(v))amount+=v;else unknownCount++;}
    result[n.key]={amount,complete:items.length>0&&unknownCount===0,unknownCount,itemCount:items.length};
  }return result;
}
export function getRemaining(target:number|null|undefined,intake:number|null|undefined):number|null {
  if(target===null||target===undefined||!Number.isFinite(target)||target<=0||intake===null||intake===undefined||!Number.isFinite(intake))return null;
  return Math.max(0,target-intake);
}
export function getProgress(target:number|null|undefined,intake:number|null|undefined):number|null {
  if(target===null||target===undefined||!Number.isFinite(target)||target<=0||intake===null||intake===undefined||!Number.isFinite(intake))return null;
  return intake/target*100;
}
export function initialMacroEnergy(){const proteinKcal=80*4,carbsKcal=300*4,fatKcal=75*9,impliedKcal=proteinKcal+carbsKcal+fatKcal;return {proteinKcal,carbsKcal,fatKcal,impliedKcal,targetKcal:2400,gapKcal:2400-impliedKcal};}
export function unitToGrams(amount:number,unit:string,foodName=""):{grams:number;estimated:boolean} {
  if(!Number.isFinite(amount)||amount<=0)throw new Error("Quantity must be greater than zero.");
  const u=unit.toLowerCase().trim();
  if(["g","gram","grams","gm"].includes(u))return {grams:amount,estimated:false};
  if(["kg","kilogram","kilograms"].includes(u))return {grams:amount*1000,estimated:false};
  if(["ml","milliliter","millilitre"].includes(u))return {grams:amount,estimated:true};
  if(["l","litre","liter","litres","liters"].includes(u))return {grams:amount*1000,estimated:true};
  if(["piece","pieces","pcs","banana","egg","eggs","roti","chapati"].includes(u)){const n=foodName.toLowerCase();const each=n.includes("banana")||n.includes("kela")?118:n.includes("egg")||n.includes("anda")?50:40;return {grams:amount*each,estimated:true};}
  if(["katori","bowl","cup","glass","bowlful"].includes(u)){const base=u==="cup"?240:u==="glass"?250:u==="katori"?150:180;return {grams:amount*base,estimated:true};}
  if(["tbsp","tablespoon","tablespoons"].includes(u))return {grams:amount*15,estimated:true};
  if(["tsp","teaspoon","teaspoons"].includes(u))return {grams:amount*5,estimated:true};
  throw new Error("Unsupported portion unit. Enter grams or choose a known household serving.");
}
function escapeRegex(input:string):string{return input.replace(/[.*+?^{}()|[\]\\$]/g,"\\$&");}
export type ParsedCandidate={foodId:string;name:string;grams:number;estimated:boolean;confidence:"low"|"medium";note:string};
export function parseKnownFoods(text:string,foods:FoodLike[]):ParsedCandidate[] {
  const output:ParsedCandidate[]=[];const normalized=text.toLowerCase().replace(/[०-९]/g,d=>String("०१२३४५६७८९".indexOf(d)));
  const sorted=[...foods].sort((a,b)=>Math.max(b.name.length,...(b.aliases??[]).map(x=>x.length))-Math.max(a.name.length,...(a.aliases??[]).map(x=>x.length)));
  const used=new Set<string>();
  for(const food of sorted){const aliases=[food.name,...(food.aliases??[])].filter(Boolean).sort((a,b)=>b.length-a.length);
    for(const alias of aliases){const match=new RegExp("([0-9]+(?:[.,][0-9]+)?)?\\s*(kg|g|grams?|gm|ml|l|litres?|liters?|pieces?|pcs|katori|bowl|cup|glass|tbsp|tsp)?\\s*"+escapeRegex(alias.toLowerCase()),"i").exec(normalized);
      if(!match||used.has(food.id))continue;const amount=match[1]?Number(match[1].replace(",",".")):1;const unit=match[2]??"";
      let converted:{grams:number;estimated:boolean};try{const foodName=food.name.toLowerCase();const isCountFood=/banana|kela|egg|anda|roti|chapati|chapathi/.test(foodName);if(unit)converted=unitToGrams(amount,unit,food.name);else if(match[1]&&isCountFood)converted=unitToGrams(amount,"pieces",food.name);else if(match[1])converted={grams:amount,estimated:true};else converted={grams:foodName.includes("banana")?118:foodName.includes("roti")||foodName.includes("chapati")?40:100,estimated:true};}catch{converted={grams:100,estimated:true};}
      output.push({foodId:food.id,name:food.name,grams:Math.min(converted.grams,10000),estimated:converted.estimated||!match[1],confidence:match[1]?"medium":"low",note:"Local food-name match only; review food and portion before saving."});used.add(food.id);break;
    }
  }return output;
}