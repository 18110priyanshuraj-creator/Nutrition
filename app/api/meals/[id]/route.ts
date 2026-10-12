import {requireOwner} from "@/lib/server-auth";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {calculateNutrients} from "@/lib/nutrition-core";
import {mealsForDate} from "@/lib/server-data";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
const patchSchema=z.object({itemId:z.string().min(1).max(100).optional(),grams:z.number().positive().max(10000).optional(),foodId:z.string().min(1).max(100).optional(),mealType:z.string().trim().min(1).max(40).optional()});
export async function PATCH(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const {id}=await context.params;const parsed=patchSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success||(!parsed.data.itemId&&!parsed.data.mealType)||(parsed.data.itemId&&parsed.data.grams===undefined&&parsed.data.foodId===undefined&&!parsed.data.mealType))return NextResponse.json({error:"Provide a food identity, item portion or meal category to update."},{status:400});
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
    if(food)db.prepare("UPDATE meal_items SET food_id=?,food_name=?,grams=?,nutrients_json=?,per100g_snapshot_json=?,source_snapshot=?,confidence_snapshot=? WHERE id=?")
      .run(food.id,food.name,grams,JSON.stringify(totals),JSON.stringify(per100),food.source,food.confidence,parsed.data.itemId);
    else db.prepare("UPDATE meal_items SET grams=?,nutrients_json=?,portion_estimated=1 WHERE id=?").run(grams,JSON.stringify(totals),parsed.data.itemId);
   }
  });tx();
 }catch(error){if(error instanceof Error&&error.message==="ITEM_NOT_FOUND")return NextResponse.json({error:"Meal item not found."},{status:404});if(error instanceof Error&&error.message==="FOOD_NOT_FOUND")return NextResponse.json({error:"Selected food was not found. Refresh the catalog."},{status:404});return NextResponse.json({error:"Could not update meal."},{status:400});}
 return NextResponse.json({ok:true,meal:mealsForDate(String(meal.local_date)).find((m)=>m.id===id)});
}
export async function DELETE(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
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