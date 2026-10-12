import {NextResponse} from "next/server";
import {getDb} from "@/lib/db";
export const runtime="nodejs";
export async function GET(){
 try{
  getDb().prepare("SELECT 1 AS ok").get();
  return NextResponse.json({status:"ok",database:"sqlite",geminiConfigured:Boolean(process.env.GEMINI_API_KEY&&process.env.GEMINI_MODEL),timeZone:"Asia/Kolkata"});
 }catch{return NextResponse.json({status:"error",message:"Database is not ready."},{status:503});}
}