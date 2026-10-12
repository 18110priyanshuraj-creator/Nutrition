import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {indiaDate,isDate} from "@/lib/server-data";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const from=request.nextUrl.searchParams.get("from");const to=request.nextUrl.searchParams.get("to");
 const db=getDb();
 let rows:Record<string,unknown>[];
 if(from&&to&&isDate(from)&&isDate(to))rows=db.prepare("SELECT * FROM measurements WHERE local_date BETWEEN ? AND ? ORDER BY recorded_at DESC LIMIT 500").all(from,to) as Record<string,unknown>[];
 else rows=db.prepare("SELECT * FROM measurements ORDER BY recorded_at DESC LIMIT 200").all() as Record<string,unknown>[];
 return NextResponse.json({measurements:rows});
}
const schema=z.object({kind:z.enum(["weight","height","water","sleep","exercise"]),value:z.number().finite().positive(),unit:z.string().min(1).max(20),activityType:z.string().max(80).optional(),note:z.string().max(500).optional(),localDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),recordedAt:z.string().datetime().optional()});
export async function POST(request:NextRequest){
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Measurement details are invalid."},{status:400});
 const expected:Record<string,string>={weight:"kg",height:"cm",water:"L",sleep:"h",exercise:"min"};
 if(parsed.data.unit!==expected[parsed.data.kind])return NextResponse.json({error:"Use the expected unit: "+expected[parsed.data.kind]+"."},{status:400});
 const limits:Record<string,number>={weight:500,height:280,water:30,sleep:24,exercise:1440};
 if(parsed.data.value>limits[parsed.data.kind])return NextResponse.json({error:"That value is outside the allowed range."},{status:400});
 const recordedAt=parsed.data.recordedAt||new Date().toISOString();const date=parsed.data.localDate||indiaDate(new Date(recordedAt));
 if(!isDate(date))return NextResponse.json({error:"Invalid local date."},{status:400});
 const id=crypto.randomUUID();getDb().prepare("INSERT INTO measurements(id,kind,value,unit,activity_type,note,recorded_at,local_date) VALUES(?,?,?,?,?,?,?,?)")
 .run(id,parsed.data.kind,parsed.data.value,parsed.data.unit,parsed.data.activityType||null,parsed.data.note||"",recordedAt,date);
 return NextResponse.json({ok:true,id},{status:201});
}