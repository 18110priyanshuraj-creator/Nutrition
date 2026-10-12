import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {requireOwner} from "@/lib/server-auth";
import {getDb} from "@/lib/db";
import {indiaDate,isDate} from "@/lib/server-data";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const date=request.nextUrl.searchParams.get("date")||indiaDate();
 if(!isDate(date))return NextResponse.json({error:"Date must use YYYY-MM-DD."},{status:400});
 const notes=getDb().prepare("SELECT id,local_date,note,created_at,updated_at FROM daily_notes WHERE local_date=? ORDER BY created_at DESC").all(date);
 return NextResponse.json({date,notes},{headers:{"Cache-Control":"no-store"}});
}
const createSchema=z.object({localDate:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),note:z.string().trim().min(1).max(4000),idempotencyKey:z.string().uuid()});
export async function POST(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const parsed=createSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"A real date, non-empty note and request idempotency key are required."},{status:400});
 if(!isDate(parsed.data.localDate))return NextResponse.json({error:"Note date is invalid."},{status:400});
 const db=getDb();
 const existing=db.prepare("SELECT id,local_date,note,created_at,updated_at FROM daily_notes WHERE idempotency_key=?").get(parsed.data.idempotencyKey);
 if(existing)return NextResponse.json({ok:true,duplicate:true,note:existing});
 const id=crypto.randomUUID(),now=new Date().toISOString();
 try{
  db.prepare("INSERT INTO daily_notes(id,local_date,note,created_at,updated_at,idempotency_key) VALUES(?,?,?,?,?,?)")
   .run(id,parsed.data.localDate,parsed.data.note,now,now,parsed.data.idempotencyKey);
 }catch{return NextResponse.json({error:"Could not save the note. Retry the same request safely."},{status:500});}
 return NextResponse.json({ok:true,note:{id,local_date:parsed.data.localDate,note:parsed.data.note,created_at:now,updated_at:now}},{status:201});
}