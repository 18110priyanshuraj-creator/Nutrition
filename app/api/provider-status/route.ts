import {requireOwner} from "@/lib/server-auth";
import {GoogleGenAI} from "@google/genai";
import {NextResponse} from "next/server";
import {classifyGeminiError,getGeminiProviderStatus,hasGeminiKey,withGeminiKeyFailover} from "@/lib/agent/gemini-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request) {
  const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
  const status=getGeminiProviderStatus();
  return NextResponse.json({
    ...status,
    message:status.configured&&status.modelConfigured
      ?"Gemini key failover is configured. Run a test request to verify access."
      :"Set GEMINI_MODEL and GEMINI_API_KEY_1 through GEMINI_API_KEY_4 on the server; legacy GEMINI_API_KEY remains supported.",
  },{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request) {
  const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
  const model=process.env.GEMINI_MODEL?.trim();
  if(!hasGeminiKey()||!model) return NextResponse.json({ok:false,error:"Configure GEMINI_MODEL and at least one Gemini API key slot."},{status:503});
  try {
    const response=await withGeminiKeyFailover(async (apiKey)=>{
      const ai=new GoogleGenAI({apiKey,httpOptions:{timeout:Math.max(3000,Math.min(120000,Number(process.env.GEMINI_REQUEST_TIMEOUT_MS||60000))),retryOptions:{attempts:1}}});
      return ai.models.generateContent({model,contents:"Reply with exactly: MyNutri AI connection check",config:{maxOutputTokens:24,temperature:0}});
    });
    if(!response.text) return NextResponse.json({ok:false,error:"The model returned no text."},{status:502});
    return NextResponse.json({ok:true,model,checkedAt:new Date().toISOString(),activeSlot:getGeminiProviderStatus().activeSlot,message:"Gemini accepted the test request."},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const category=classifyGeminiError(error);
    const status=category==="rate_limit"||category==="project_quota"||category==="model_not_found"?503:category==="timeout"?504:category==="invalid_request"?400:502;
    const message=category==="project_quota"?"Gemini project-wide quota/billing limit reached.":category==="rate_limit"?"All available key slots are rate-limited or cooling down.":category==="invalid_key"||category==="permission"?"Gemini credential or project permission failure.":category==="model_not_found"?"Configured model was not found or is unavailable.":category==="timeout"?"Gemini request timed out after key failover.":"Gemini test failed after key failover.";
    return NextResponse.json({ok:false,error:message,category,activeSlot:getGeminiProviderStatus().activeSlot},{status,headers:{"Cache-Control":"no-store"}});
  }
}
