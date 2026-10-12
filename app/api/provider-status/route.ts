import {requireOwner} from "@/lib/server-auth";
import {GoogleGenAI} from "@google/genai";
import {NextResponse} from "next/server";
import {classifyGeminiError, getGeminiProviderStatus, hasGeminiKey, withGeminiKeyFailover} from "@/lib/agent/gemini-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
  const status=getGeminiProviderStatus();
  return NextResponse.json({
    ...status,
    keyConfigured:hasGeminiKey(),
    message:status.configured&&status.modelConfigured
      ?"Gemini is configured. Run a test request to verify provider access."
      :"Configure GEMINI_MODEL and GEMINI_API_KEY_1 through GEMINI_API_KEY_4 on the server. The legacy GEMINI_API_KEY is also supported.",
  },{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
  const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
  const model=process.env.GEMINI_MODEL?.trim();
  if(!hasGeminiKey()||!model){
    return NextResponse.json({ok:false,error:"GEMINI_MODEL and at least one server-side Gemini key must be configured."},{status:503});
  }
  try{
    const response=await withGeminiKeyFailover(async(apiKey)=>{
      const ai=new GoogleGenAI({apiKey,httpOptions:{
        timeout:Math.max(3000,Math.min(30000,Number(process.env.GEMINI_REQUEST_TIMEOUT_MS||15000))),
        retryOptions:{attempts:1},
      }});
      return ai.models.generateContent({model,contents:"Reply with exactly: MyNutri AI connection check",config:{maxOutputTokens:24,temperature:0}});
    });
    if(!response.text)return NextResponse.json({ok:false,error:"Gemini returned no text."},{status:502});
    return NextResponse.json({ok:true,model,checkedAt:new Date().toISOString(),message:"Gemini accepted the test request."},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const category=classifyGeminiError(error);
    const status=category==="rate_limit"||category==="project_quota"?503:category==="timeout"||category==="network"?504:502;
    const message=category==="project_quota"
      ?"Gemini project-wide quota/billing limit reached; key rotation cannot resolve this."
      :category==="rate_limit"
        ?"All available Gemini key slots are rate-limited or cooling down. Keys from the same project share quotas."
        :category==="timeout"||category==="network"
          ?"All available Gemini key attempts failed temporarily."
          :category==="model_not_found"
            ?"Configured Gemini model is unavailable; verify GEMINI_MODEL and project model access."
            :"Gemini provider test failed. Raw provider details and key values are hidden.";
    return NextResponse.json({ok:false,error:message,category},{status,headers:{"Cache-Control":"no-store"}});
  }
}