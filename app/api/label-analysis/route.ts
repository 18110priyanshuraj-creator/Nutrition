import {GoogleGenAI} from "@google/genai";
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
 type:"OBJECT",properties:{
  productName:{type:"STRING"},servingSizeText:{type:"STRING"},servingGrams:{type:["NUMBER","NULL"]},
  basis:{type:"STRING",enum:["per_100g","per_serving"]},
  nutrients:{type:"ARRAY",items:{type:"OBJECT",properties:{
   label:{type:"STRING"},key:{type:["STRING","NULL"],enum:[...keyList,"other",null]},
   value:{type:["NUMBER","NULL"]},unit:{type:"STRING"},
   confidence:{type:"STRING",enum:["low","medium","high"]},note:{type:"STRING"}
  },required:["label","key","value","unit","confidence","note"],propertyOrdering:["label","key","value","unit","confidence","note"]}},
  overallConfidence:{type:"STRING",enum:["low","medium","high"]},issues:{type:"ARRAY",items:{type:"STRING"}}
 },required:["productName","servingSizeText","servingGrams","basis","nutrients","overallConfidence","issues"],propertyOrdering:["productName","servingSizeText","servingGrams","basis","nutrients","overallConfidence","issues"]
};
const attempts=()=>{const n=Number(process.env.GEMINI_MAX_RETRIES??1);return 1+(Number.isFinite(n)?Math.max(0,Math.min(2,Math.floor(n))):1);};
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
 const key=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL;
 if(!key||!model)return NextResponse.json({error:"Package-label extraction requires server-side GEMINI_API_KEY and GEMINI_MODEL. Nothing was saved."},{status:503});
 const prompt="Read the visible nutrition facts label in the provided image. Do not guess unreadable values. Return product name if visible, serving-size text, servingGrams only when the label states or clearly establishes a weight in grams (do not equate millilitres to grams without evidence), basis per_100g or per_serving, and only nutrient values visibly present. Map labels to one of these canonical keys only when the identity and reporting convention are clear: "+keyList.join(", ")+". Otherwise use key other or null. Source units must match the label. For vitamin A, state uncertainty about retinol/RAE form if not specified; for folate and niacin mention convention uncertainty. Never calculate nutrition for foods based on the photograph. Provide short issues for unreadable/cropped/ambiguous parts. Confidence is about reading clarity, not scientific verification.";
 const timeoutRaw=Number(process.env.GEMINI_REQUEST_TIMEOUT_MS??20000),timeout=Number.isFinite(timeoutRaw)?Math.max(3000,Math.min(60000,timeoutRaw)):20000;
 try{
  const ai=new GoogleGenAI({apiKey:key,httpOptions:{timeout,retryOptions:{attempts:attempts()}}});
  const response=await ai.models.generateContent({model,contents:[{text:prompt},{inlineData:{mimeType,data:Buffer.from(bytes).toString("base64")}}],config:{temperature:0,maxOutputTokens:2400,responseFormat:{text:{mimeType:"application/json",schema:jsonSchema}}}});
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
  const message=String(error instanceof Error?error.message:error).toLowerCase();
  const status=message.includes("429")||message.includes("quota")?503:message.includes("timeout")||message.includes("abort")?504:502;
  return NextResponse.json({error:status===503?"Gemini quota/rate limit reached.":status===504?"Label analysis timed out.":"Gemini label analysis failed. Check model access and try again later.",manualReviewAvailable:true},{status});
 }
}