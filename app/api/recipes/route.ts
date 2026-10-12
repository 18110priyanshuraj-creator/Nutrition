import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {requireOwner} from "@/lib/server-auth";
import {NUTRIENTS} from "@/lib/nutrients";
import {calculateNutrients} from "@/lib/nutrition-core";
import {summarizeRecipe} from "@/lib/recipe-core";
import {readJson} from "@/lib/server-data";
export const runtime="nodejs";
const ingredientsSchema=z.array(z.object({foodId:z.string().min(1).max(100),grams:z.number().finite().positive().max(10000)})).min(1).max(50);
const createSchema=z.object({name:z.string().trim().min(2).max(120),description:z.string().max(1000).default(""),servings:z.number().finite().positive().max(10000),ingredients:ingredientsSchema});
function getRecipe(id:string):Record<string,unknown>|null {
 const db=getDb();const recipe=db.prepare("SELECT * FROM recipes WHERE id=?").get(id) as Record<string,unknown>|undefined;
 if(!recipe)return null;
 const ingredients=(db.prepare("SELECT * FROM recipe_ingredients WHERE recipe_id=? ORDER BY position").all(id) as Record<string,unknown>[]).map(row=>({
  id:row.id,foodId:row.food_id,foodName:row.food_name,grams:row.grams,
  nutrients:readJson<Record<string,number>>(String(row.nutrients_json),{}),
  per100g:readJson<Record<string,number>>(String(row.per100g_snapshot_json),{}),
  source:row.source_snapshot,confidence:row.confidence_snapshot
 }));
 const summary=summarizeRecipe(ingredients.map(item=>({grams:Number(item.grams),nutrients:item.nutrients})),Number(recipe.servings),NUTRIENTS);
 return {...recipe,ingredients,summary};
}
export async function GET(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const db=getDb();const ids=(db.prepare("SELECT id FROM recipes ORDER BY updated_at DESC,name").all() as Array<{id:string}>);
 return NextResponse.json({recipes:ids.map(r=>getRecipe(r.id)).filter(Boolean)},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const parsed=createSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Recipe name, serving count and at least one valid ingredient are required."},{status:400});
 const db=getDb();const id=crypto.randomUUID();const now=new Date().toISOString();
 try{
  const tx=db.transaction(()=>{
   db.prepare("INSERT INTO recipes(id,name,description,servings,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(id,parsed.data.name,parsed.data.description,parsed.data.servings,now,now);
   const add=db.prepare("INSERT INTO recipe_ingredients(id,recipe_id,food_id,food_name,grams,nutrients_json,per100g_snapshot_json,source_snapshot,confidence_snapshot,position) VALUES(?,?,?,?,?,?,?,?,?,?)");
   parsed.data.ingredients.forEach((ingredient,position)=>{
    const food=db.prepare("SELECT * FROM foods WHERE id=?").get(ingredient.foodId) as Record<string,unknown>|undefined;
    if(!food)throw new Error("FOOD_NOT_FOUND");
    const per100=readJson<Record<string,number>>(String(food.nutrients_json),{});
    add.run(crypto.randomUUID(),id,food.id,food.name,ingredient.grams,JSON.stringify(calculateNutrients(per100,ingredient.grams)),JSON.stringify(per100),food.source,food.confidence,position);
   });
  });tx();
 }catch(error){return NextResponse.json({error:error instanceof Error&&error.message==="FOOD_NOT_FOUND"?"A selected food was not found. Refresh the food library and try again.":"Could not save this recipe; no partial recipe was retained."},{status:400});}
 return NextResponse.json({ok:true,recipe:getRecipe(id)},{status:201});
}