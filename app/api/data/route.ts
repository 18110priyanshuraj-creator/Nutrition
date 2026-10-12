import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {requireOwner} from "@/lib/server-auth";
import {getDb} from "@/lib/db";
import {NUTRIENTS} from "@/lib/nutrients";
export const runtime="nodejs";
const bodySchema=z.object({confirmation:z.literal("DELETE_MY_PERSONAL_DATA")});
export async function DELETE(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Explicit deletion confirmation is required."},{status:400});
 const db=getDb();const now=new Date().toISOString();
 const tx=db.transaction(()=>{
  db.prepare("DELETE FROM meal_logs").run();
  db.prepare("DELETE FROM measurements").run();
  db.prepare("DELETE FROM daily_notes").run();
  db.prepare("DELETE FROM foods WHERE confidence='user'").run();
  db.prepare("DELETE FROM nutrient_target_history").run();
  db.prepare("UPDATE profiles SET display_name='My profile',age=17,sex='male',height_cm=160,weight_kg=47,country='India',diet_preference='vegetarian',region='Indian home-cooked',exercise_frequency='4–5 days/week',exercise_time='Morning',timezone='Asia/Kolkata',units='metric',updated_at=? WHERE id=1").run(now);
  const save=db.prepare("INSERT INTO nutrient_targets(nutrient_key,target,target_min,target_max,unit,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(nutrient_key) DO UPDATE SET target=excluded.target,target_min=excluded.target_min,target_max=excluded.target_max,unit=excluded.unit,updated_at=excluded.updated_at");
  for(const n of NUTRIENTS)save.run(n.key,n.target,n.targetMin??null,n.targetMax??null,n.canonicalUnit,now);
 });
 tx();
 return NextResponse.json({ok:true,message:"Personal meal logs, measurements, notes, target history and user-created food records have been deleted. Seed/reference catalog records and login configuration remain."});
}