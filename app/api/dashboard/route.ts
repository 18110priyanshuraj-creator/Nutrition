import {requireOwner} from "@/lib/server-auth";
import {NextRequest,NextResponse} from "next/server";
import {dashboardForDate,indiaDate,isDate} from "@/lib/server-data";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const date=request.nextUrl.searchParams.get("date")||indiaDate();
 if(!isDate(date))return NextResponse.json({error:"Date must be YYYY-MM-DD."},{status:400});
 try{return NextResponse.json(dashboardForDate(date),{headers:{"Cache-Control":"no-store"}});}
 catch{return NextResponse.json({error:"Could not load saved nutrition records."},{status:500});}
}