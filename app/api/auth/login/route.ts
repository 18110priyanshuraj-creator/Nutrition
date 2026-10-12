import {createHash,timingSafeEqual} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {createSessionToken,securityConfigurationError,SESSION_COOKIE} from "@/lib/auth";
export const runtime="nodejs";
const bodySchema=z.object({password:z.string().min(1).max(512)});\nconst MAX_LOGIN_BODY_BYTES=4096;
const attempts=new Map<string,{count:number;start:number}>();
function digest(value:string){return createHash("sha256").update(value,"utf8").digest();}
export async function POST(request:NextRequest){
 const declaredLength=Number(request.headers.get("content-length")||0);\n if(Number.isFinite(declaredLength)&&declaredLength>MAX_LOGIN_BODY_BYTES)return NextResponse.json({error:"Login request is too large."},{status:413});\n const ip=(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown").slice(0,100);\n const now=Date.now();\n for(const [key,entry] of attempts)if(now-entry.start>=60_000)attempts.delete(key);\n const previous=attempts.get(ip);
 if(previous&&now-previous.start<60_000&&previous.count>=10)return NextResponse.json({error:"Too many login attempts. Try again in a minute."},{status:429});
 const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Enter your password."},{status:400});
 const configError=securityConfigurationError();
 if(configError)return NextResponse.json({error:"App security is not configured. " + configError},{status:503});
 if(!previous&&attempts.size>=2048)return NextResponse.json({error:"Login rate-limit capacity is temporarily exhausted. Try again shortly."},{status:429});\n const expected=digest(process.env.APP_PASSWORD??"");const actual=digest(parsed.data.password);
 if(!timingSafeEqual(expected,actual)){
  attempts.set(ip,previous&&now-previous.start<60_000?{count:previous.count+1,start:previous.start}:{count:1,start:now});
  return NextResponse.json({error:"Password did not match."},{status:401});
 }
 attempts.delete(ip);
 const token=await createSessionToken();const response=NextResponse.json({ok:true});
 response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:60*60*24*7});
 return response;
}