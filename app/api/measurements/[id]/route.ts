import {NextRequest,NextResponse} from "next/server";
import {requireOwner} from "@/lib/server-auth";
import {getDb} from "@/lib/db";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function DELETE(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const {id}=await context.params;
 if(!id||id.length>100)return NextResponse.json({error:"Invalid measurement ID."},{status:400});
 const db=getDb();const row=db.prepare("SELECT id FROM measurements WHERE id=?").get(id);
 if(!row)return NextResponse.json({error:"Measurement not found."},{status:404});
 db.prepare("DELETE FROM measurements WHERE id=?").run(id);
 return NextResponse.json({ok:true,deletedId:id});
}