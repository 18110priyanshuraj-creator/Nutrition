import {GoogleGenAI} from "@google/genai";
import {classifyGeminiError, configuredGeminiModel, geminiRequestTimeoutMs, hasGeminiKey, withGeminiKeyFailover} from "@/lib/agent/gemini-provider";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {requireOwner} from "@/lib/server-auth";
import {NUTRIENTS,NUTRIENT_BY_KEY} from "@/lib/nutrients";
import {labelValuePer100g,type LabelBasis} from "@/lib/label-nutrition";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const keyList=NUTRIENTS.filter(n=>!n.qualitative).map(n=>n.key);
const schema=z.object({
 productName:z.string().max(160),
 servingSizeText:z.string().max(120),
 servingGrams:z.number().positive().max(10000).nullable(),
 basis:z.enum(["per_100g","per_serving"]),
 nutrients:z.array(z.object({label:z.string().min(1).max(100),key:z.string().max(64).nullable(),value:z.number().nonnegative().max(1e7).nullable(),unit:z.string().max(30),confidence:z.enum(["low","medium","high"]),note:z.string().max(200)})).max(60),
 overallConfidence:z.enum(["low","medium","high"]),
 issues:z.array(z.string().max(200)).max(12)
});
const jsonSchema={
 type:"object",properties:{
  productName:{type:"string"},servingSizeText:{type:"string"},servingGrams:{type:["number","null"]},
  basis:{type:"string",enum:["per_100g","per_serving"]},
  nutrients:{type:"array",items:{type:"object",properties:{
   label:{type:"string"},key:{type:["string","null"],enum:[...keyList,"other",null]},
   value:{type:["number","null"]},unit:{type:"string"},
   confidence:{type:"string",enum:["low","medium","high"]},note:{type:"string"}
  },required:["label","key","value","unit","confidence","note"],propertyOrdering:["label","key","value","unit","confidence","note"]}},
  overallConfidence:{type:"string",enum:["low","medium","high"]},issues:{type:"array",items:{type:"string"}}
 },required:["productName","servingSizeText","servingGrams","basis","nutrients","overallConfidence","issues"],propertyOrdering:["productName","servingSizeText","servingGrams","basis","nutrients","overallConfidence","issues"]
};
const counts=new Map<string,{count:number;start:number}>();
function tooMany(request:NextRequest):boolean{const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown",now=Date.now(),old=counts.get(ip);if(old&&now-old.start<60000&&old.count>=5)return true;counts.set(ip,old&&now-old.start<60000?{count:old.count+1,start:old.start}:{count:1,start:now});return false;}
function imageMime(b:Uint8Array):string|null{
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return "image/jpeg";
 if(b.length>=8&&b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10)return "image/png";
 if(b.length>=12&&String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP")return "image/webp";
 return null;
}
export async function POST(request:NextRequest){
 const unauthorized=await requireOwner(request);if(unauthorized)return unauthorized;
 if(tooMany(request))return NextResponse.json({error:"Too many label-analysis requests. Wait a minute and retry."},{status:429});
 const maxRaw=Number(process.env.GEMINI_MAX_IMAGE_MB??8);const maxMb=Number.isFinite(maxRaw)&&maxRaw>0?Math.min(12,Math.max(1,maxRaw)):8;
 const contentLength=Number(request.headers.get("content-length")||0);
 if(contentLength>maxMb*1024*1024+65536)return NextResponse.json({error:"Image request is too large."},{status:413});
 const form=await request.formData().catch(()=>null);const file=form?.get("image");
 if(!(file instanceof File)||file.size===0)return NextResponse.json({error:"Choose a package-label photo first."},{status:400});
 if(file.size>maxMb*1024*1024)return NextResponse.json({error:"Image exceeds the configured "+maxMb+" MB limit."},{status:413});
 const bytes=new Uint8Array(await file.arrayBuffer());const mimeType=imageMime(bytes);
 if(!mimeType)return NextResponse.json({error:"Image contents were invalid. Use a real JPEG, PNG, or WebP file."},{status:415});
 const model=configuredGeminiModel();
 if(!hasGeminiKey()||!model)return NextResponse.json({error:"Package-label extraction requires GEMINI_MODEL and at least one server-side Gemini key slot (GEMINI_API_KEY_1 through GEMINI_API_KEY_7). Nothing was saved."},{status:503});
 const prompt="Read the visible nutrition facts label in the provided image. Do not guess unreadable values. Return product name if visible, serving-size text, servingGrams only when the label states or clearly establishes a weight in grams (do not equate millilitres to grams without evidence), basis per_100g or per_serving, and only nutrient values visibly present. Map labels to one of these canonical keys only when the identity and reporting convention are clear: "+keyList.join(", ")+". Otherwise use key other or null. Source units must match the label. For vitamin A, state uncertainty about retinol/RAE form if not specified; for folate and niacin mention convention uncertainty. Never calculate nutrition for foods based on the photograph. Provide short issues for unreadable/cropped/ambiguous parts. Confidence is about reading clarity, not scientific verification.";
 try{
  const response=await withGeminiKeyFailover(async(apiKey)=>{
   const ai=new GoogleGenAI({apiKey,httpOptions:{timeout:geminiRequestTimeoutMs(),retryOptions:{attempts:1}}});
   return ai.models.generateContent({model,contents:[{text:prompt},{inlineData:{mimeType,data:Buffer.from(bytes).toString("base64")}}],config:{maxOutputTokens:6144,thinkingConfig:{thinkingLevel:"low"},responseMimeType:"application/json",responseJsonSchema:jsonSchema as never}});
  });
  if(!response.text)return NextResponse.json({error:"Gemini returned no label text. Nothing was saved."},{status:502});
  let raw:unknown;try{raw=JSON.parse(response.text);}catch{return NextResponse.json({error:"Gemini returned malformed label data. Nothing was saved."},{status:502});}
  const parsed=schema.safeParse(raw);if(!parsed.success)return NextResponse.json({error:"The label proposal did not pass validation. Nothing was saved."},{status:502});
  const label=parsed.data;const basis=label.basis as LabelBasis;
  const nutrients=label.nutrients.map(item=>{
   const supported=item.key&&keyList.includes(item.key)&&NUTRIENT_BY_KEY[item.key]&&!NUTRIENT_BY_KEY[item.key].qualitative?item.key:null;
   const converted=supported?labelValuePer100g(supported,item.value,item.unit,basis,label.servingGrams):{value:null,canonicalUnit:"unknown",status:"unsupported" as const,note:"This label component does not map safely to a tracked nutrient."};
   return {...item,key:supported,per100gValue:converted.value,canonicalUnit:converted.canonicalUnit,status:converted.status,conversionNote:converted.note};
  });
  return NextResponse.json({mode:"gemini",productName:label.productName,servingSizeText:label.servingSizeText,servingGrams:label.servingGrams,basis,overallConfidence:label.overallConfidence,nutrients,issues:label.issues,warning:"AI label transcription must be compared with the physical label. Values are not independently verified and no food is saved automatically."},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  const category=classifyGeminiError(error);
  const status=category==="rate_limit"||category==="project_quota"||category==="model_not_found"?503:category==="timeout"?504:category==="invalid_request"?400:502;
  const message=category==="project_quota"?"Gemini project-wide quota/billing limit reached.":category==="rate_limit"?"All available Gemini key slots are rate-limited or cooling down.":category==="invalid_key"||category==="permission"?"Gemini credentials or project permissions failed for the available key slots.":category==="model_not_found"?"The configured Gemini model is unavailable.":category==="timeout"?"Label analysis timed out after key failover.":category==="network"?"Gemini network request failed across key slots.":category==="invalid_request"?"Gemini rejected the label-analysis request.":"Gemini label analysis failed. Check model access and try again later.";
  return NextResponse.json({error:message,category,manualReviewAvailable:true},{status,headers:{"Cache-Control":"no-store"}});
 }
}