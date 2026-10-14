import {requireOwner} from "@/lib/server-auth";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {calculateNutrients} from "@/lib/nutrition-core";
import {mealsForDate} from "@/lib/server-data";
import {isSameOriginRequest} from "@/lib/server-origin";
import {createHash} from "node:crypto";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
const patchSchema=z.object({itemId:z.string().min(1).max(100).optional(),grams:z.number().positive().max(10000).optional(),foodId:z.string().min(1).max(100).optional(),mealType:z.string().trim().min(1).max(40).optional()});
const correctionSchema=z.object({
 items:z.array(z.object({
  foodId:z.string().min(1).max(100),grams:z.number().positive().max(10000),
  portionEstimated:z.boolean().default(false),portionAmount:z.number().positive().max(10000).optional(),
  portionUnit:z.string().trim().min(1).max(24).optional(),portionSource:z.enum(["explicit","estimated","manual"]).default("manual"),
  preparation:z.string().max(160).default("as described"),portionNote:z.string().max(300).default("")
 }).strict()).min(1).max(30),idempotencyKey:z.string().uuid()
}).strict();
export async function POST(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 if(!isSameOriginRequest(request))return NextResponse.json({error:"Cross-origin meal corrections are not allowed."},{status:403});
 const {id}=await context.params;const parsed=correctionSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Food identity or portion is invalid."},{status:400});
 const db=getDb();const values=parsed.data;
 const requestHash=createHash("sha256").update(JSON.stringify({mealId:id,items:values.items})).digest("hex");
 try{
  const result=db.transaction(()=>{
   const meal=db.prepare("SELECT id,local_date FROM meal_logs WHERE id=?").get(id) as {id:string;local_date:string}|undefined;
   if(!meal)throw new Error("MEAL_NOT_FOUND");
   const existing=db.prepare("SELECT meal_id,request_hash FROM meal_item_correction_requests WHERE idempotency_key=?")
    .get(values.idempotencyKey) as {meal_id:string;request_hash:string}|undefined;
   if(existing){
    if(existing.meal_id!==id||existing.request_hash!==requestHash)throw new Error("IDEMPOTENCY_KEY_REUSED");
    return {date:meal.local_date,duplicate:true};
   }
   db.prepare("INSERT INTO meal_item_correction_requests(idempotency_key,meal_id,request_hash,created_at) VALUES(?,?,?,?)")
    .run(values.idempotencyKey,id,requestHash,new Date().toISOString());
   const insert=db.prepare("INSERT INTO meal_items(id,meal_id,food_id,food_name,grams,nutrients_json,per100g_snapshot_json,source_snapshot,confidence_snapshot,portion_estimated,portion_amount,portion_unit,portion_source,preparation_snapshot,portion_note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
   for(const item of values.items){
    const food=db.prepare("SELECT * FROM foods WHERE id=?").get(item.foodId) as Record<string,unknown>|undefined;
    if(!food)throw new Error("FOOD_NOT_FOUND");
    const per100=JSON.parse(String(food.nutrients_json)) as Record<string,number>;
    const nutrients=calculateNutrients(per100,item.grams);
    insert.run(crypto.randomUUID(),id,item.foodId,String(food.name),item.grams,JSON.stringify(nutrients),JSON.stringify(per100),String(food.source),String(food.confidence),item.portionEstimated?1:0,item.portionAmount??null,item.portionUnit??null,item.portionSource,item.preparation||String(food.preparation),item.portionNote);
   }
   return {date:meal.local_date,duplicate:false};
  }).immediate();
  const meal=mealsForDate(result.date).find(item=>item.id===id)??null;
  if(!meal)return NextResponse.json({error:"The corrected item was saved but its meal could not be loaded."},{status:500});
  return NextResponse.json({ok:true,duplicateRequest:result.duplicate,meal},{status:result.duplicate?200:201});
 }catch(error){
  if(error instanceof Error&&error.message==="MEAL_NOT_FOUND")return NextResponse.json({error:"Meal not found."},{status:404});
  if(error instanceof Error&&error.message==="FOOD_NOT_FOUND")return NextResponse.json({error:"Selected food was not found in the catalog."},{status:404});
  if(error instanceof Error&&error.message==="IDEMPOTENCY_KEY_REUSED")return NextResponse.json({error:"This correction key was already used for different data."},{status:409});
  return NextResponse.json({error:"Could not add the corrected item."},{status:400});
 }
}
export async function PATCH(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 if(!isSameOriginRequest(request))return NextResponse.json({error:"Cross-origin meal updates are not allowed."},{status:403});
 const {id}=await context.params;const parsed=patchSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success||(!parsed.data.itemId&&!parsed.data.mealType)||(parsed.data.itemId&&parsed.data.grams===undefined&&parsed.data.foodId===undefined))return NextResponse.json({error:"Provide a food identity, item portion or meal category to update."},{status:400});
 const db=getDb();const meal=db.prepare("SELECT * FROM meal_logs WHERE id=?").get(id) as Record<string,unknown>|undefined;
 if(!meal)return NextResponse.json({error:"Meal not found."},{status:404});
 try{
  const tx=db.transaction(()=>{
   if(parsed.data.mealType)db.prepare("UPDATE meal_logs SET meal_type=?,updated_at=? WHERE id=?").run(parsed.data.mealType,new Date().toISOString(),id);
   if(parsed.data.itemId&&(parsed.data.grams!==undefined||parsed.data.foodId!==undefined)){
    const item=db.prepare("SELECT * FROM meal_items WHERE id=? AND meal_id=?").get(parsed.data.itemId,id) as Record<string,unknown>|undefined;
    if(!item)throw new Error("ITEM_NOT_FOUND");
    const food=parsed.data.foodId?db.prepare("SELECT * FROM foods WHERE id=?").get(parsed.data.foodId) as Record<string,unknown>|undefined:undefined;
    if(parsed.data.foodId&&!food)throw new Error("FOOD_NOT_FOUND");
    const grams=parsed.data.grams??Number(item.grams);
    const per100=food?JSON.parse(String(food.nutrients_json)) as Record<string,number>:JSON.parse(String(item.per100g_snapshot_json)) as Record<string,number>;
    const totals=calculateNutrients(per100,grams);
    const portionChanged=parsed.data.grams!==undefined&&parsed.data.grams!==Number(item.grams);
    const identityChanged=Boolean(food);
    const portionEstimated=portionChanged||identityChanged?0:Number(item.portion_estimated??0);
    const portionAmount=portionChanged||identityChanged?grams:item.portion_amount??null;
    const portionUnit=portionChanged||identityChanged?"g":item.portion_unit??null;
    const portionSource=portionChanged||identityChanged?"explicit":String(item.portion_source??"manual");
    const portionNote=portionChanged||identityChanged?"Gram portion reviewed during diary correction.":String(item.portion_note??"");
    const preparation=food?String(food.preparation):String(item.preparation_snapshot??"as described");
    if(food)db.prepare("UPDATE meal_items SET food_id=?,food_name=?,grams=?,nutrients_json=?,per100g_snapshot_json=?,source_snapshot=?,confidence_snapshot=?,portion_estimated=?,portion_amount=?,portion_unit=?,portion_source=?,portion_note=?,preparation_snapshot=? WHERE id=?")
      .run(food.id,food.name,grams,JSON.stringify(totals),JSON.stringify(per100),food.source,food.confidence,portionEstimated,portionAmount,portionUnit,portionSource,portionNote,preparation,parsed.data.itemId);
    else db.prepare("UPDATE meal_items SET grams=?,nutrients_json=?,portion_estimated=?,portion_amount=?,portion_unit=?,portion_source=?,portion_note=? WHERE id=?")
      .run(grams,JSON.stringify(totals),portionEstimated,portionAmount,portionUnit,portionSource,portionNote,parsed.data.itemId);
   }
  });tx();
 }catch(error){if(error instanceof Error&&error.message==="ITEM_NOT_FOUND")return NextResponse.json({error:"Meal item not found."},{status:404});if(error instanceof Error&&error.message==="FOOD_NOT_FOUND")return NextResponse.json({error:"Selected food was not found. Refresh the catalog."},{status:404});return NextResponse.json({error:"Could not update meal."},{status:400});}
 return NextResponse.json({ok:true,meal:mealsForDate(String(meal.local_date)).find((m)=>m.id===id)});
}
export async function DELETE(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 if(!isSameOriginRequest(request))return NextResponse.json({error:"Cross-origin meal deletion is not allowed."},{status:403});
 const {id}=await context.params;const db=getDb();
 const meal=db.prepare("SELECT local_date FROM meal_logs WHERE id=?").get(id) as {local_date:string}|undefined;
 if(!meal)return NextResponse.json({error:"Meal not found."},{status:404});
 const body=z.object({itemId:z.string().min(1).max(100).optional()}).safeParse(await request.json().catch(()=>({})));
 if(!body.success)return NextResponse.json({error:"Invalid deletion request."},{status:400});
 if(body.data.itemId){
  const item=db.prepare("SELECT id FROM meal_items WHERE id=? AND meal_id=?").get(body.data.itemId,id);
  if(!item)return NextResponse.json({error:"Meal item not found."},{status:404});
  db.prepare("DELETE FROM meal_items WHERE id=? AND meal_id=?").run(body.data.itemId,id);
  const remaining=(db.prepare("SELECT COUNT(*) AS count FROM meal_items WHERE meal_id=?").get(id) as {count:number}).count;
  if(!remaining)db.prepare("DELETE FROM meal_logs WHERE id=?").run(id);
  return NextResponse.json({ok:true,deletedItemId:body.data.itemId,mealDeleted:remaining===0});
 }
 db.prepare("DELETE FROM meal_logs WHERE id=?").run(id);
 return NextResponse.json({ok:true,deletedId:id});
}