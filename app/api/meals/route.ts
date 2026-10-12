import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {calculateNutrients} from "@/lib/nutrition-core";
import {indiaDate,isDate,mealsForDate} from "@/lib/server-data";
export const runtime="nodejs";
const mealSchema=z.object({
 localDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
 loggedAt:z.string().datetime().optional(),
 mealType:z.string().trim().min(1).max(40),
 source:z.enum(["manual","text","photo"]).default("manual"),
 originalText:z.string().max(4000).default(""),
 note:z.string().max(1000).default(""),
 idempotencyKey:z.string().uuid(),
 items:z.array(z.object({foodId:z.string().min(1).max(100),grams:z.number().positive().max(10000),portionEstimated:z.boolean().default(false)})).min(1).max(30)
});
export async function GET(request:NextRequest){
 const date=request.nextUrl.searchParams.get("date")||indiaDate();
 if(!isDate(date))return NextResponse.json({error:"Date must be YYYY-MM-DD."},{status:400});
 return NextResponse.json({date,meals:mealsForDate(date)},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:NextRequest){
 const parsed=mealSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Meal fields or portion sizes are invalid."},{status:400});
 const loggedAt=parsed.data.loggedAt||new Date().toISOString();const date=parsed.data.localDate||indiaDate(new Date(loggedAt));
 if(!isDate(date))return NextResponse.json({error:"Invalid meal date."},{status:400});
 const db=getDb();
 const existing=db.prepare("SELECT id,local_date FROM meal_logs WHERE idempotency_key=?").get(parsed.data.idempotencyKey) as {id:string;local_date:string}|undefined;
 if(existing){return NextResponse.json({ok:true,duplicateRequest:true,meal:mealsForDate(existing.local_date).find((m)=>m.id===existing.id)??null});}
 const mealId=crypto.randomUUID();const now=new Date().toISOString();
 try{
  const create=db.transaction(()=>{
   db.prepare("INSERT INTO meal_logs(id,logged_at,local_date,meal_type,source,original_text,note,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(mealId,loggedAt,date,parsed.data.mealType,parsed.data.source,parsed.data.originalText,parsed.data.note,parsed.data.idempotencyKey,now,now);
   const insert=db.prepare("INSERT INTO meal_items(id,meal_id,food_id,food_name,grams,nutrients_json,per100g_snapshot_json,source_snapshot,confidence_snapshot,portion_estimated) VALUES(?,?,?,?,?,?,?,?,?,?)");
   for(const item of parsed.data.items){
    const food=db.prepare("SELECT * FROM foods WHERE id=?").get(item.foodId) as Record<string,unknown>|undefined;
    if(!food)throw new Error("FOOD_NOT_FOUND");
    const per100g=JSON.parse(String(food.nutrients_json)) as Record<string,number>;
    const nutrients=calculateNutrients(per100g,item.grams);
    insert.run(crypto.randomUUID(),mealId,item.foodId,String(food.name),item.grams,JSON.stringify(nutrients),JSON.stringify(per100g),String(food.source),String(food.confidence),item.portionEstimated?1:0);
   }
  });
  create();
 }catch(error){
  if(error instanceof Error&&error.message==="FOOD_NOT_FOUND")return NextResponse.json({error:"One selected food is no longer in the catalog. Refresh and try again."},{status:400});
  return NextResponse.json({error:"Could not save the meal. Review portions and retry."},{status:500});
 }
 return NextResponse.json({ok:true,meal:mealsForDate(date).find((m)=>m.id===mealId)},{status:201});
}