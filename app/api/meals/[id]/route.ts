import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {calculateNutrients} from "@/lib/nutrition-core";
import {mealsForDate} from "@/lib/server-data";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
const patchSchema=z.object({itemId:z.string().uuid().optional(),grams:z.number().positive().max(10000).optional(),mealType:z.string().trim().min(1).max(40).optional()});
export async function PATCH(request:NextRequest,context:Context){
 const {id}=await context.params;const parsed=patchSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success||(!parsed.data.itemId&&!parsed.data.mealType))return NextResponse.json({error:"Provide an item portion or meal category to update."},{status:400});
 const db=getDb();const meal=db.prepare("SELECT * FROM meal_logs WHERE id=?").get(id) as Record<string,unknown>|undefined;
 if(!meal)return NextResponse.json({error:"Meal not found."},{status:404});
 try{
  const tx=db.transaction(()=>{
   if(parsed.data.mealType)db.prepare("UPDATE meal_logs SET meal_type=?,updated_at=? WHERE id=?").run(parsed.data.mealType,new Date().toISOString(),id);
   if(parsed.data.itemId&&parsed.data.grams){
    const item=db.prepare("SELECT * FROM meal_items WHERE id=? AND meal_id=?").get(parsed.data.itemId,id) as Record<string,unknown>|undefined;
    if(!item)throw new Error("ITEM_NOT_FOUND");
    const per100=JSON.parse(String(item.per100g_snapshot_json)) as Record<string,number>;
    const totals=calculateNutrients(per100,parsed.data.grams);
    db.prepare("UPDATE meal_items SET grams=?,nutrients_json=?,portion_estimated=1 WHERE id=?").run(parsed.data.grams,JSON.stringify(totals),parsed.data.itemId);
   }
  });tx();
 }catch(error){if(error instanceof Error&&error.message==="ITEM_NOT_FOUND")return NextResponse.json({error:"Meal item not found."},{status:404});return NextResponse.json({error:"Could not update meal."},{status:400});}
 return NextResponse.json({ok:true,meal:mealsForDate(String(meal.local_date)).find((m)=>m.id===id)});
}
export async function DELETE(_request:NextRequest,context:Context){
 const {id}=await context.params;const db=getDb();
 const meal=db.prepare("SELECT local_date FROM meal_logs WHERE id=?").get(id) as {local_date:string}|undefined;
 if(!meal)return NextResponse.json({error:"Meal not found."},{status:404});
 db.prepare("DELETE FROM meal_logs WHERE id=?").run(id);
 return NextResponse.json({ok:true,deletedId:id});
}