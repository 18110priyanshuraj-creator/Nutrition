import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {requireOwner} from "@/lib/server-auth";
import {getDb} from "@/lib/db";
import {NUTRIENTS} from "@/lib/nutrients";
import {isDate} from "@/lib/server-data";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const nutrients=z.record(z.string().min(1).max(64),z.number().finite().nonnegative().max(1e9));
const itemSchema=z.object({id:z.string().min(1).max(100),food_id:z.string().nullable().optional(),food_name:z.string().min(1).max(150),grams:z.number().positive().max(10000),nutrients,per100g:nutrients,source_snapshot:z.string().max(1000),confidence_snapshot:z.string().max(80),portion_estimated:z.union([z.number().int().min(0).max(1),z.boolean()]).optional()});
const mealSchema=z.object({id:z.string().min(1).max(100),logged_at:z.string().datetime(),local_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),meal_type:z.string().min(1).max(40),source:z.string().max(40),original_text:z.string().max(4000).optional().default(""),note:z.string().max(1000).optional().default(""),idempotency_key:z.string().nullable().optional(),items:z.array(itemSchema).max(100)});
const measurementSchema=z.object({id:z.string().min(1).max(100),kind:z.enum(["weight","height","water","sleep","exercise"]),value:z.number().finite().nonnegative().max(100000),unit:z.string().min(1).max(20),activity_type:z.string().nullable().optional(),note:z.string().max(500).optional().default(""),recorded_at:z.string().datetime(),local_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});
const noteSchema=z.object({id:z.string().min(1).max(100),local_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),note:z.string().max(4000),idempotency_key:z.string().uuid().nullable().optional()});
const historySchema=z.object({id:z.string().min(1).max(100),nutrient_key:z.string().min(1).max(80),previous_target:z.number().nullable(),next_target:z.number().nullable(),previous_min:z.number().nullable(),next_min:z.number().nullable(),previous_max:z.number().nullable(),next_max:z.number().nullable(),unit:z.string().min(1).max(40),changed_at:z.string().datetime(),change_source:z.string().max(80)});
const customFoodSchema=z.object({id:z.string().min(1).max(100),name:z.string().min(1).max(150),aliases:z.array(z.string().max(80)).max(40),preparation:z.string().max(250),nutrients,servings:z.array(z.unknown()).max(50),source:z.string().min(1).max(1000),source_version:z.string().min(1).max(100),confidence:z.literal("user"),completeness:z.string().max(50),source_url:z.string().nullable().optional(),source_record_id:z.string().nullable().optional(),source_basis:z.string().nullable().optional(),last_verified_at:z.string().nullable().optional(),source_license_note:z.string().nullable().optional(),nutrientProvenance:z.record(z.string(),z.unknown()).optional()});
const ingredientSchema=z.object({id:z.string().min(1).max(100),food_id:z.string().nullable().optional(),food_name:z.string().min(1).max(150),grams:z.number().positive().max(10000),nutrients,per100g:nutrients,source_snapshot:z.string().max(1000),confidence_snapshot:z.string().max(80),position:z.number().int().min(0).max(5000)});
const recipeSchema=z.object({id:z.string().min(1).max(100),name:z.string().min(2).max(120),description:z.string().max(1000),servings:z.number().positive().max(10000),ingredients:z.array(ingredientSchema).min(1).max(50)});
const importSchema=z.object({id:z.string().min(1).max(100),dataset_name:z.string().min(1).max(160),dataset_version:z.string().min(1).max(80),source_url:z.string().url(),source_license_note:z.string().max(500),record_count:z.number().int().nonnegative(),imported_at:z.string().datetime()});
const exportSchema=z.object({
 confirmation:z.literal("RESTORE_MY_NUTRI_DATA"),
 payload:z.object({
  profile:z.record(z.string(),z.unknown()).nullable().optional(),
  targets:z.array(z.object({nutrient_key:z.string().min(1),target:z.number().nonnegative().nullable(),target_min:z.number().nonnegative().nullable().optional(),target_max:z.number().nonnegative().nullable().optional(),unit:z.string().min(1).max(40)})).max(60).optional().default([]),
  meals:z.array(mealSchema).max(10000).optional().default([]),
  measurements:z.array(measurementSchema).max(20000).optional().default([]),
  dailyNotes:z.array(noteSchema).max(20000).optional().default([]),
  targetHistory:z.array(historySchema).max(50000).optional().default([]),
  customFoods:z.array(customFoodSchema).max(5000).optional().default([]),
  recipes:z.array(recipeSchema).max(10000).optional().default([]),
  foodDataImports:z.array(importSchema).max(10000).optional().default([])
 })
});
function duplicates(values:string[]):boolean{return new Set(values).size!==values.length;}
export async function POST(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const declaredLength=Number(request.headers.get("content-length")||0);
 if(declaredLength>12*1024*1024)return NextResponse.json({error:"Restore file is too large (maximum 12 MB)."}, {status:413});
 const text=await request.text().catch(()=>"");
 if(Buffer.byteLength(text,"utf8")>12*1024*1024)return NextResponse.json({error:"Restore file is too large (maximum 12 MB)."}, {status:413});
 let raw:unknown;try{raw=JSON.parse(text);}catch{return NextResponse.json({error:"Choose a valid MyNutri AI JSON export."},{status:400});}
 const parsed=exportSchema.safeParse(raw);
 if(!parsed.success)return NextResponse.json({error:"Restore data failed validation. No records were changed.",issues:parsed.error.issues.slice(0,8).map(i=>i.path.join(".")+": "+i.message)},{status:400});
 const p=parsed.data.payload;
 const allDates=[...p.meals.map(x=>x.local_date),...p.measurements.map(x=>x.local_date),...p.dailyNotes.map(x=>x.local_date)];
 if(allDates.some(date=>!isDate(date)))return NextResponse.json({error:"The export contains an invalid local date."},{status:400});
 const keys=new Set(NUTRIENTS.map(n=>n.key));
 if(p.targets.some(t=>!keys.has(t.nutrient_key))||p.targetHistory.some(t=>!keys.has(t.nutrient_key)))return NextResponse.json({error:"The export contains an unknown nutrient target key."},{status:400});
 if(duplicates(p.meals.map(x=>x.id))||duplicates(p.measurements.map(x=>x.id))||duplicates(p.dailyNotes.map(x=>x.id))||duplicates(p.targetHistory.map(x=>x.id))||duplicates(p.recipes.map(x=>x.id)))return NextResponse.json({error:"The export contains duplicate record IDs."},{status:400});
 const db=getDb();
 const counts=db.prepare("SELECT (SELECT COUNT(*) FROM meal_logs) AS meals,(SELECT COUNT(*) FROM measurements) AS measurements,(SELECT COUNT(*) FROM daily_notes) AS notes,(SELECT COUNT(*) FROM nutrient_target_history) AS history,(SELECT COUNT(*) FROM recipes) AS recipes,(SELECT COUNT(*) FROM foods WHERE confidence='user') AS customFoods").get() as Record<string,number>;
 if(Object.values(counts).some(Number))return NextResponse.json({error:"Restore requires an empty personal-data store, including recipes and user-created foods. Export current data first and use a separate empty database to avoid overwrites."},{status:409});
 const currentProfile=db.prepare("SELECT display_name,age,sex,height_cm,weight_kg,country,diet_preference,region,exercise_frequency,exercise_time,timezone,units FROM profiles WHERE id=1").get() as Record<string,unknown>;
 const defaultProfile:Record<string,unknown>={display_name:"My profile",age:17,sex:"male",height_cm:160,weight_kg:47,country:"India",diet_preference:"vegetarian",region:"Indian home-cooked",exercise_frequency:"4–5 days/week",exercise_time:"Morning",timezone:"Asia/Kolkata",units:"metric"};
 const profileWasChanged=Object.entries(defaultProfile).some(([key,value])=>currentProfile?.[key]!==value);
 const currentTargetRows=db.prepare("SELECT nutrient_key,target,target_min,target_max FROM nutrient_targets").all() as Array<{nutrient_key:string;target:number|null;target_min:number|null;target_max:number|null}>;
 const currentTargets=new Map(currentTargetRows.map(row=>[row.nutrient_key,row]));
 const targetsWereChanged=currentTargetRows.length!==NUTRIENTS.length||NUTRIENTS.some(n=>{const row=currentTargets.get(n.key);return !row||(row.target===null?null:Number(row.target))!==n.target||(row.target_min===null?null:Number(row.target_min))!==(n.targetMin??null)||(row.target_max===null?null:Number(row.target_max))!==(n.targetMax??null);});
 if(profileWasChanged||targetsWereChanged)return NextResponse.json({error:"Restore would overwrite customized profile or target settings. Reset the personal-data store or use a separate empty database before restoring."},{status:409});
 for(const food of p.customFoods){if(db.prepare("SELECT id FROM foods WHERE id=?").get(food.id))return NextResponse.json({error:"A custom food ID collides with the base catalog. Resolve the ID before restoring."},{status:409});}
 const profile=p.profile??{};
 const stringField=(key:string,fallback:string,maxLength:number)=>{const value=profile[key];return typeof value==="string"&&value.length<=maxLength?value:fallback;};
 const numberField=(key:string,fallback:number,min:number,max:number)=>{const value=profile[key];return typeof value==="number"&&Number.isFinite(value)&&value>=min&&value<=max?value:fallback;};
 const sexValue=stringField("sex","male",40),dietValue=stringField("diet_preference","vegetarian",40);
 const sex=["male","female","other","prefer_not_to_say"].includes(sexValue)?sexValue:"prefer_not_to_say";
 const diet=["vegetarian","vegan","eggetarian","non-vegetarian"].includes(dietValue)?dietValue:"vegetarian";
 const now=new Date().toISOString();
 try{
  const tx=db.transaction(()=>{
   db.prepare("UPDATE profiles SET display_name=?,age=?,sex=?,height_cm=?,weight_kg=?,country=?,diet_preference=?,region=?,exercise_frequency=?,exercise_time=?,timezone=?,units=?,updated_at=? WHERE id=1")
    .run(stringField("display_name","My profile",80),numberField("age",17,1,120),sex,numberField("height_cm",160,1,280),numberField("weight_kg",47,1,500),stringField("country","India",80),diet,stringField("region","Indian home-cooked",120),stringField("exercise_frequency","4–5 days/week",80),stringField("exercise_time","Morning",80),stringField("timezone","Asia/Kolkata",80),stringField("units","metric",20),now);
   const targetInsert=db.prepare("INSERT INTO nutrient_targets(nutrient_key,target,target_min,target_max,unit,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(nutrient_key) DO UPDATE SET target=excluded.target,target_min=excluded.target_min,target_max=excluded.target_max,unit=excluded.unit,updated_at=excluded.updated_at");
   for(const t of p.targets)targetInsert.run(t.nutrient_key,t.target,t.target_min??null,t.target_max??null,t.unit,now);
   const foodInsert=db.prepare("INSERT INTO foods(id,name,aliases_json,preparation,nutrients_json,servings_json,source,source_version,confidence,completeness,updated_at,source_url,source_record_id,source_basis,last_verified_at,source_license_note,nutrient_provenance_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
   for(const f of p.customFoods)foodInsert.run(f.id,f.name,JSON.stringify(f.aliases),f.preparation,JSON.stringify(f.nutrients),JSON.stringify(f.servings),f.source,f.source_version,"user",f.completeness,now,f.source_url??null,f.source_record_id??null,f.source_basis??null,f.last_verified_at??null,f.source_license_note??null,JSON.stringify(f.nutrientProvenance??{}));
   const mealInsert=db.prepare("INSERT INTO meal_logs(id,logged_at,local_date,meal_type,source,original_text,note,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
   const itemInsert=db.prepare("INSERT INTO meal_items(id,meal_id,food_id,food_name,grams,nutrients_json,per100g_snapshot_json,source_snapshot,confidence_snapshot,portion_estimated) VALUES(?,?,?,?,?,?,?,?,?,?)");
   for(const m of p.meals){
    mealInsert.run(m.id,m.logged_at,m.local_date,m.meal_type,m.source,m.original_text,m.note,m.idempotency_key??null,now,now);
    for(const i of m.items){const foodId=i.food_id&&db.prepare("SELECT id FROM foods WHERE id=?").get(i.food_id)?i.food_id:null;itemInsert.run(i.id,m.id,foodId,i.food_name,i.grams,JSON.stringify(i.nutrients),JSON.stringify(i.per100g),i.source_snapshot,i.confidence_snapshot,Boolean(i.portion_estimated)?1:0);}
   }
   const measurementInsert=db.prepare("INSERT INTO measurements(id,kind,value,unit,activity_type,note,recorded_at,local_date) VALUES(?,?,?,?,?,?,?,?)");
   for(const m of p.measurements)measurementInsert.run(m.id,m.kind,m.value,m.unit,m.activity_type??null,m.note,m.recorded_at,m.local_date);
   const noteInsert=db.prepare("INSERT INTO daily_notes(id,local_date,note,created_at,updated_at,idempotency_key) VALUES(?,?,?,?,?,?)");
   for(const n of p.dailyNotes)noteInsert.run(n.id,n.local_date,n.note,now,now,n.idempotency_key??null);
   const historyInsert=db.prepare("INSERT INTO nutrient_target_history(id,nutrient_key,previous_target,next_target,previous_min,next_min,previous_max,next_max,unit,changed_at,change_source) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
   for(const h of p.targetHistory)historyInsert.run(h.id,h.nutrient_key,h.previous_target,h.next_target,h.previous_min,h.next_min,h.previous_max,h.next_max,h.unit,h.changed_at,h.change_source);
   const recipeInsert=db.prepare("INSERT INTO recipes(id,name,description,servings,created_at,updated_at) VALUES(?,?,?,?,?,?)");
   const ingredientInsert=db.prepare("INSERT INTO recipe_ingredients(id,recipe_id,food_id,food_name,grams,nutrients_json,per100g_snapshot_json,source_snapshot,confidence_snapshot,position) VALUES(?,?,?,?,?,?,?,?,?,?)");
   for(const r of p.recipes){
    recipeInsert.run(r.id,r.name,r.description,r.servings,now,now);
    for(const i of r.ingredients){const foodId=i.food_id&&db.prepare("SELECT id FROM foods WHERE id=?").get(i.food_id)?i.food_id:null;ingredientInsert.run(i.id,r.id,foodId,i.food_name,i.grams,JSON.stringify(i.nutrients),JSON.stringify(i.per100g),i.source_snapshot,i.confidence_snapshot,i.position);}
   }
   const importInsert=db.prepare("INSERT INTO food_data_imports(id,dataset_name,dataset_version,source_url,source_license_note,record_count,imported_at) VALUES(?,?,?,?,?,?,?)");
   for(const i of p.foodDataImports)importInsert.run(i.id,i.dataset_name,i.dataset_version,i.source_url,i.source_license_note,i.record_count,i.imported_at);
  });
  tx();
 }catch{
  return NextResponse.json({error:"Restore was rolled back. No partial records were retained. Check schema version, duplicate IDs, and export integrity."},{status:400});
 }
 return NextResponse.json({ok:true,restored:{meals:p.meals.length,foodItems:p.meals.reduce((sum,m)=>sum+m.items.length,0),measurements:p.measurements.length,recipes:p.recipes.length,customFoods:p.customFoods.length,notes:p.dailyNotes.length},message:"Personal records restored transactionally. Food nutrient snapshots and source labels were preserved."},{status:201});
}