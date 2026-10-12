import {requireOwner} from "@/lib/server-auth";
import {NextRequest,NextResponse} from "next/server";
import {getDb} from "@/lib/db";
import {readJson} from "@/lib/server-data";
export const runtime="nodejs";
function csvCell(value:unknown):string {const raw=value===null||value===undefined?"":String(value);return '"'+raw.replace(/"/g,'""')+'"';}
export async function GET(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const format=request.nextUrl.searchParams.get("format")==="csv"?"csv":"json";
 const db=getDb();
 const profile=db.prepare("SELECT * FROM profiles WHERE id=1").get();
 const targets=db.prepare("SELECT * FROM nutrient_targets ORDER BY nutrient_key").all();
 const meals=db.prepare("SELECT * FROM meal_logs ORDER BY local_date,logged_at").all() as Record<string,unknown>[];
 const mealData: Array<Record<string,unknown> & {items:Record<string,unknown>[]}> = meals.map((meal)=>{
  const items=db.prepare("SELECT * FROM meal_items WHERE meal_id=? ORDER BY created_at").all(meal.id) as Record<string,unknown>[];
  return {...meal,items:items.map((item)=>({...item,nutrients:readJson<Record<string,number>>(String(item.nutrients_json),{}),per100g:readJson<Record<string,number>>(String(item.per100g_snapshot_json),{})}))};
 });
 const measurements=db.prepare("SELECT * FROM measurements ORDER BY recorded_at").all();
 if(format==="json"){
  return new NextResponse(JSON.stringify({exportedAt:new Date().toISOString(),timeZone:"Asia/Kolkata",profile,targets,meals:mealData,measurements},null,2),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=mynutri-export.json","Cache-Control":"no-store"}});
 }
 const header=["date","logged_at","meal_type","food_name","grams","kcal","protein_g","carbs_g","fat_g","omega3_g","omega6_g","source","confidence","portion_estimated","original_text"];
 const lines=[header.map(csvCell).join(",")];
 for(const meal of mealData)for(const item of meal.items as Record<string,unknown>[]){
  const n=item.nutrients as Record<string,number>;
  lines.push([meal.local_date,meal.logged_at,meal.meal_type,item.food_name,item.grams,n.kcal,n.protein_g,n.carbs_g,n.fat_g,n.omega3_g,n.omega6_g,meal.source,item.confidence_snapshot,Boolean(item.portion_estimated),meal.original_text].map(csvCell).join(","));
 }
 return new NextResponse("\uFEFF"+lines.join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=mynutri-meals.csv","Cache-Control":"no-store"}});
}