import {requireOwner} from "@/lib/server-auth";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {foodList} from "@/lib/server-data";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const q=(request.nextUrl.searchParams.get("q")||"").slice(0,100);
 return NextResponse.json({foods:foodList(q)});
}
const customFoodSchema=z.object({name:z.string().trim().min(2).max(100),aliases:z.array(z.string().trim().min(1).max(60)).max(30).default([]),preparation:z.string().max(250).default("user-entered"),per100g:z.record(z.string(),z.number().finite().nonnegative().max(100000)),sourceNote:z.string().trim().min(3).max(300)});
export async function POST(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const parsed=customFoodSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Food name, source note, and valid per-100 g values are required."},{status:400});
 const db=getDb();
 const existing=db.prepare("SELECT id,nutrients_json FROM foods WHERE lower(name)=lower(?) AND confidence='user' ORDER BY updated_at DESC LIMIT 1").get(parsed.data.name) as {id:string;nutrients_json:string}|undefined;
 const stable=(values:Record<string,number>)=>JSON.stringify(Object.fromEntries(Object.entries(values).sort(([a],[b])=>a.localeCompare(b))));
 if(existing){
  let sameValues=false;
  try{sameValues=stable(JSON.parse(existing.nutrients_json) as Record<string,number>)===stable(parsed.data.per100g);}catch{sameValues=false;}
  if(sameValues)return NextResponse.json({ok:true,id:existing.id,duplicate:true,message:"This user-created food already exists; the existing record was reused."});
  return NextResponse.json({error:"A user-created food with this name already exists but has different nutrient values. Give the product a distinct name instead of creating an ambiguous duplicate."},{status:409});
 }
 const id="custom-"+crypto.randomUUID();const now=new Date().toISOString();
 db.prepare("INSERT INTO foods(id,name,aliases_json,preparation,nutrients_json,servings_json,source,source_version,confidence,completeness,updated_at) VALUES(?,?,?,?,?,?,?,'user-entry-v1','user','partial',?)")
  .run(id,parsed.data.name,JSON.stringify(parsed.data.aliases),parsed.data.preparation,JSON.stringify(parsed.data.per100g),JSON.stringify([{label:"100 g",grams:100}]),parsed.data.sourceNote,now);
 return NextResponse.json({ok:true,id}, {status:201});
}