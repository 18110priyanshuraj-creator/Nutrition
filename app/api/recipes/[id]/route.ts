import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {requireOwner} from "@/lib/server-auth";
import {calculateNutrients} from "@/lib/nutrition-core";
import {summarizeRecipe} from "@/lib/recipe-core";
import {NUTRIENTS} from "@/lib/nutrients";
import {readJson} from "@/lib/server-data";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
const patchSchema=z.object({name:z.string().trim().min(2).max(120).optional(),description:z.string().max(1000).optional(),servings:z.number().finite().positive().max(10000).optional(),ingredients:z.array(z.object({foodId:z.string().min(1).max(100),grams:z.number().finite().positive().max(10000)})).min(1).max(50).optional()});
function getRecipe(id:string):Record<string,unknown>|null{
 const db=getDb();const recipe=db.prepare("SELECT * FROM recipes WHERE id=?").get(id) as Record<string,unknown>|undefined;if(!recipe)return null;
 const ingredients=(db.prepare("SELECT * FROM recipe_ingredients WHERE recipe_id=? ORDER BY position").all(id) as Record<string,unknown>[]).map(row=>({id:row.id,foodId:row.food_id,foodName:row.food_name,grams:row.grams,nutrients:readJson<Record<string,number>>(String(row.nutrients_json),{}),per100g:readJson<Record<string,number>>(String(row.per100g_snapshot_json),{}),source:row.source_snapshot,confidence:row.confidence_snapshot}));
 return {...recipe,ingredients,summary:summarizeRecipe(ingredients.map(i=>({grams:Number(i.grams),nutrients:i.nutrients})),Number(recipe.servings),NUTRIENTS)};
}
export async function PATCH(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const {id}=await context.params;const parsed=patchSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success||Object.keys(parsed.data||{}).length===0)return NextResponse.json({error:"Provide a valid recipe field or ingredient list."},{status:400});
 const db=getDb();if(!db.prepare("SELECT id FROM recipes WHERE id=?").get(id))return NextResponse.json({error:"Recipe not found."},{status:404});
 const now=new Date().toISOString();
 try{
  const tx=db.transaction(()=>{
   if(parsed.data.name!==undefined||parsed.data.description!==undefined||parsed.data.servings!==undefined){
    const current=db.prepare("SELECT name,description,servings FROM recipes WHERE id=?").get(id) as {name:string;description:string;servings:number};
    db.prepare("UPDATE recipes SET name=?,description=?,servings=?,updated_at=? WHERE id=?").run(parsed.data.name??current.name,parsed.data.description??current.description,parsed.data.servings??current.servings,now,id);
   }
   if(parsed.data.ingredients){
    const add=db.prepare("INSERT INTO recipe_ingredients(id,recipe_id,food_id,food_name,grams,nutrients_json,per100g_snapshot_json,source_snapshot,confidence_snapshot,position) VALUES(?,?,?,?,?,?,?,?,?,?)");
    db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id=?").run(id);
    parsed.data.ingredients.forEach((ingredient,position)=>{
     const food=db.prepare("SELECT * FROM foods WHERE id=?").get(ingredient.foodId) as Record<string,unknown>|undefined;if(!food)throw new Error("FOOD_NOT_FOUND");
     const per100=readJson<Record<string,number>>(String(food.nutrients_json),{});
     add.run(crypto.randomUUID(),id,food.id,food.name,ingredient.grams,JSON.stringify(calculateNutrients(per100,ingredient.grams)),JSON.stringify(per100),food.source,food.confidence,position);
    });
   }
  });tx();
 }catch(error){return NextResponse.json({error:error instanceof Error&&error.message==="FOOD_NOT_FOUND"?"A selected food was not found. No changes were saved.":"Could not update recipe; the transaction was rolled back."},{status:400});}
 return NextResponse.json({ok:true,recipe:getRecipe(id)});
}
export async function DELETE(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const {id}=await context.params;const db=getDb();
 if(!db.prepare("SELECT id FROM recipes WHERE id=?").get(id))return NextResponse.json({error:"Recipe not found."},{status:404});
 db.prepare("DELETE FROM recipes WHERE id=?").run(id);return NextResponse.json({ok:true,deletedId:id});
}