import {requireOwner} from "@/lib/server-auth";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {NUTRIENTS} from "@/lib/nutrients";
import {indiaDate} from "@/lib/server-data";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const db=getDb();const profile=db.prepare("SELECT * FROM profiles WHERE id=1").get();
 const targets=db.prepare("SELECT * FROM nutrient_targets ORDER BY nutrient_key").all();
 return NextResponse.json({profile,targets});
}
const profileSchema=z.object({
 displayName:z.string().trim().min(1).max(80).optional(),
 age:z.number().int().min(1).max(120).optional(),
 sex:z.enum(["male","female","other","prefer_not_to_say"]).optional(),
 heightCm:z.number().positive().max(280).optional(),
 weightKg:z.number().positive().max(500).optional(),
 country:z.string().trim().min(2).max(80).optional(),
 dietPreference:z.enum(["vegetarian","eggetarian","non-vegetarian","vegan"]).optional(),
 region:z.string().max(120).optional(),
 exerciseFrequency:z.string().max(80).optional(),
 exerciseTime:z.string().max(80).optional()
});
const targetSchema=z.object({key:z.string(),target:z.number().nonnegative().max(1e9).nullable(),min:z.number().nonnegative().nullable().optional(),max:z.number().nonnegative().nullable().optional()});
const requestSchema=z.object({profile:profileSchema.optional(),targets:z.array(targetSchema).max(50).optional()});
export async function PATCH(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const parsed=requestSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Profile or target settings are invalid."},{status:400});
 const db=getDb();const now=new Date().toISOString();
 const columns:Record<string,string>={displayName:"display_name",age:"age",sex:"sex",heightCm:"height_cm",weightKg:"weight_kg",country:"country",dietPreference:"diet_preference",region:"region",exerciseFrequency:"exercise_frequency",exerciseTime:"exercise_time"};
 const before=db.prepare("SELECT * FROM profiles WHERE id=1").get() as Record<string,unknown>;
 const tx=db.transaction(()=>{
  if(parsed.data.profile){
   const entries=Object.entries(parsed.data.profile).filter(([key])=>columns[key]);
   for(const [key,value] of entries)db.prepare("UPDATE profiles SET "+columns[key]+"=?,updated_at=? WHERE id=1").run(value,now);
   if(parsed.data.profile.heightCm!==undefined&&parsed.data.profile.heightCm!==Number(before.height_cm))
    db.prepare("INSERT INTO measurements(id,kind,value,unit,note,recorded_at,local_date) VALUES(?,?,?,?,?,?,?)").run(crypto.randomUUID(),"height",parsed.data.profile.heightCm,"cm","Profile height updated",now,indiaDate());
   if(parsed.data.profile.weightKg!==undefined&&parsed.data.profile.weightKg!==Number(before.weight_kg))
    db.prepare("INSERT INTO measurements(id,kind,value,unit,note,recorded_at,local_date) VALUES(?,?,?,?,?,?,?)").run(crypto.randomUUID(),"weight",parsed.data.profile.weightKg,"kg","Profile weight updated",now,indiaDate());
  }
  if(parsed.data.targets){
   const valid=new Set(NUTRIENTS.map((n)=>n.key));
   for(const target of parsed.data.targets){
    if(!valid.has(target.key))throw new Error("Unknown nutrient target.");
    const d=NUTRIENTS.find((n)=>n.key===target.key)!;
    if(d.qualitative&&target.target!==null)throw new Error("Qualitative nutrient proxies cannot have numeric targets.");
    db.prepare("INSERT INTO nutrient_targets(nutrient_key,target,target_min,target_max,unit,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(nutrient_key) DO UPDATE SET target=excluded.target,target_min=excluded.target_min,target_max=excluded.target_max,unit=excluded.unit,updated_at=excluded.updated_at")
      .run(target.key,target.target,target.min??null,target.max??null,d.canonicalUnit,now);
   }
  }
 });
 try{tx();}catch{return NextResponse.json({error:"Could not save profile or target settings."},{status:400});}
 return GET(request);
}