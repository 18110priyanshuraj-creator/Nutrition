import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {requireOwner} from "@/lib/server-auth";
import {getDb} from "@/lib/db";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
const schema=z.object({note:z.string().trim().min(1).max(4000)});
export async function PATCH(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const {id}=await context.params;const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Note must contain 1–4,000 characters."},{status:400});
 const db=getDb();const existing=db.prepare("SELECT id FROM daily_notes WHERE id=?").get(id);
 if(!existing)return NextResponse.json({error:"Note not found."},{status:404});
 const now=new Date().toISOString();
 db.prepare("UPDATE daily_notes SET note=?,updated_at=? WHERE id=?").run(parsed.data.note,now,id);
 return NextResponse.json({ok:true,id,note:parsed.data.note,updated_at:now});
}
export async function DELETE(request:NextRequest,context:Context){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const {id}=await context.params;const db=getDb();
 if(!db.prepare("SELECT id FROM daily_notes WHERE id=?").get(id))return NextResponse.json({error:"Note not found."},{status:404});
 db.prepare("DELETE FROM daily_notes WHERE id=?").run(id);
 return NextResponse.json({ok:true,deletedId:id});
}