import {NextRequest,NextResponse} from "next/server";
import {requireOwner} from "@/lib/server-auth";
import {getDb} from "@/lib/db";
import {dashboardForDate,indiaDate,isDate} from "@/lib/server-data";
import {dateRangeEnding} from "@/lib/trend-core";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 const date=request.nextUrl.searchParams.get("date")||indiaDate();
 const days=Number(request.nextUrl.searchParams.get("days")||30);
 if(!isDate(date))return NextResponse.json({error:"Date must use YYYY-MM-DD."},{status:400});
 if(!Number.isInteger(days)||days<1||days>90)return NextResponse.json({error:"Trend range must be between 1 and 90 days."},{status:400});
 const dates=dateRangeEnding(date,days);const start=dates[0];
 const daily=dates.map(day=>{
  const report=dashboardForDate(day);const totals=report.totals as Record<string,{amount:number;complete:boolean;unknownCount:number}>;
  const count=Number((report.logSummary as Record<string,unknown>).itemCount||0);
  const value=(key:string)=>count>0&&totals[key]?.complete?totals[key].amount:null;
  return {date:day,hasRecords:count>0,itemCount:count,mealCount:Number((report.logSummary as Record<string,unknown>).mealCount||0),
   kcal:value("kcal"),protein_g:value("protein_g"),carbs_g:value("carbs_g"),fat_g:value("fat_g"),calcium_mg:value("calcium_mg"),iron_mg:value("iron_mg")};
 });
 const db=getDb();
 const measurements=db.prepare("SELECT id,kind,value,unit,note,recorded_at,local_date FROM measurements WHERE local_date BETWEEN ? AND ? ORDER BY recorded_at ASC").all(start,date);
 return NextResponse.json({start,end:date,days:daily,measurements},{headers:{"Cache-Control":"no-store"}});
}