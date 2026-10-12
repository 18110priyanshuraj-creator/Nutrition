import {getDb} from "./db";
import {NUTRIENTS} from "./nutrients";
import {aggregateIntake} from "./nutrition-core";

export function indiaDate(date=new Date()):string {
 return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}
export function isDate(value:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function readJson<T>(value:string, fallback:T):T {
 try{return JSON.parse(value) as T;}catch{return fallback;}
}
export function foodList(search=""):Record<string,unknown>[] {
 const db=getDb();
 const rows=db.prepare("SELECT * FROM foods ORDER BY name").all() as Record<string,unknown>[];
 const q=search.trim().toLocaleLowerCase();
 return rows.filter((row)=>{
  const aliases=readJson<string[]>(String(row.aliases_json),"[]");
  return !q||String(row.name).toLocaleLowerCase().includes(q)||aliases.some((a)=>a.toLocaleLowerCase().includes(q));
 }).map((row)=>({
  id:row.id,name:row.name,aliases:readJson<string[]>(String(row.aliases_json),"[]"),preparation:row.preparation,
  nutrients:readJson<Record<string,number>>(String(row.nutrients_json),{}),servings:readJson<unknown[]>(String(row.servings_json),"[]"),
  source:row.source,sourceVersion:row.source_version,confidence:row.confidence,completeness:row.completeness,sourceUrl:row.source_url??null,sourceRecordId:row.source_record_id??null,sourceBasis:row.source_basis??null,lastVerifiedAt:row.last_verified_at??null,sourceLicenseNote:row.source_license_note??null,nutrientProvenance:readJson<Record<string,unknown>>(String(row.nutrient_provenance_json??"{}"),{})
 }));
}
export function mealsForDate(date:string):Record<string,unknown>[] {
 const db=getDb();
 const logs=db.prepare("SELECT * FROM meal_logs WHERE local_date=? ORDER BY logged_at ASC").all(date) as Record<string,unknown>[];
 return logs.map((log)=>{
  const rows=db.prepare("SELECT * FROM meal_items WHERE meal_id=? ORDER BY created_at ASC").all(log.id) as Record<string,unknown>[];
  const items=rows.map((row)=>({
   id:row.id,foodId:row.food_id,foodName:row.food_name,grams:row.grams,
   nutrients:readJson<Record<string,number>>(String(row.nutrients_json),{}),
   source:row.source_snapshot,confidence:row.confidence_snapshot,portionEstimated:Boolean(row.portion_estimated)
  }));
  return {id:log.id,loggedAt:log.logged_at,localDate:log.local_date,mealType:log.meal_type,source:log.source,
   originalText:log.original_text,note:log.note,createdAt:log.created_at,items};
 });
}
export function dashboardForDate(date:string):Record<string,unknown> {
 const db=getDb();
 const meals=mealsForDate(date);
 const items=meals.flatMap((meal)=>meal.items as Record<string,unknown>[]);
 const aggregates=aggregateIntake(items.map((item)=>({nutrients:item.nutrients as Record<string,number>})),NUTRIENTS);
 const targetRows=db.prepare("SELECT nutrient_key,target,target_min,target_max,unit,updated_at FROM nutrient_targets").all() as Record<string,unknown>[];
 const targets=Object.fromEntries(targetRows.map((t)=>[String(t.nutrient_key),{target:t.target===null?null:Number(t.target),min:t.target_min===null?null:Number(t.target_min),max:t.target_max===null?null:Number(t.target_max),unit:t.unit,updatedAt:t.updated_at}]));
 const profile=db.prepare("SELECT * FROM profiles WHERE id=1").get() as Record<string,unknown>;
 const foods=foodList();
 const recommendations:Record<string,unknown>[]=[];
 for(const key of ["protein_g","calcium_mg","iron_mg","vit_c_mg","omega3_g","vit_b12_ug","magnesium_mg"]){
  const n=aggregates[key];const target=targets[key]?.target;
  if(!n||!n.complete||typeof target!=="number"||n.amount>=target)continue;
  const ranked=foods.filter((f)=>f.confidence==="estimate"&&typeof (f.nutrients as Record<string,number>)[key]==="number")
   .filter((f)=>profile.diet_preference!=="vegetarian"||!["Chicken, cooked","Egg, hard-boiled"].includes(String(f.name)))
   .sort((a,b)=>Number((b.nutrients as Record<string,number>)[key])-Number((a.nutrients as Record<string,number>)[key]));
  const first=ranked[0];
  if(first)recommendations.push({nutrient:key,food:first.name,foodId:first.id,portionGrams:30,contribution:Number((first.nutrients as Record<string,number>)[key])*0.3,unit:NUTRIENTS.find((x)=>x.key===key)?.canonicalUnit,source:first.source,confidence:"estimate"});
 }
 const missingEntries=items.filter((item)=>item.portionEstimated).length;
 return {date,profile,targets,definitions:NUTRIENTS,meals,totals:aggregates,recommendations,
  logSummary:{mealCount:meals.length,itemCount:items.length,portionEstimates:missingEntries,hasAnyRecords:meals.length>0},
  targetConsistency:{macroImpliedKcal:2195,calorieTargetKcal:targets.kcal?.target??2400,gapKcal:Number(targets.kcal?.target??2400)-2195},
  catalog:{foodCount:foods.length,confidence:"provisional",notice:"Starter nutrition values are generic estimates, not verified IFCT rows."}};
}