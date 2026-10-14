import {NextRequest,NextResponse} from "next/server";
import {requireOwner} from "@/lib/server-auth";
import {getDb} from "@/lib/db";
import {dashboardForDate,indiaDate} from "@/lib/server-data";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const month=request.nextUrl.searchParams.get("month")||indiaDate().slice(0,7);
 const match=/^(\d{4})-(\d{2})$/.exec(month);
 if(!match||Number(match[2])<1||Number(match[2])>12)return NextResponse.json({error:"Month must use YYYY-MM format."},{status:400});
 const year=Number(match[1]),monthNumber=Number(match[2]);
 const start=month+"-01";
 const end=new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10);
 const db=getDb();
 const records=db.prepare("SELECT local_date,COUNT(DISTINCT meal_logs.id) AS meal_count,COUNT(meal_items.id) AS item_count FROM meal_logs LEFT JOIN meal_items ON meal_items.meal_id=meal_logs.id WHERE local_date BETWEEN ? AND ? GROUP BY local_date ORDER BY local_date")
 .all(start,end) as Array<{local_date:string;meal_count:number;item_count:number}>;
 const days=records.map((r)=>{
  const daily=dashboardForDate(r.local_date);
  const totals=daily.totals as Record<string,{amount:number;complete:boolean;unknownCount:number}>;
  return {date:r.local_date,mealCount:r.meal_count,itemCount:r.item_count,
   kcal:totals.kcal?.complete?totals.kcal.amount:null,
   kcalComplete:Boolean(totals.kcal?.complete&&r.item_count>0)};
 });
 return NextResponse.json({month,start,end,days},{headers:{"Cache-Control":"no-store"}});
}