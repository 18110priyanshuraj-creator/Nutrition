import {NextResponse} from "next/server";
import {isValidSession,SESSION_COOKIE} from "./auth";

function cookieValue(header:string|null,name:string):string|undefined {
 if(!header)return undefined;
 for(const part of header.split(";")){
  const trimmed=part.trim();
  if(trimmed.startsWith(name+"=")){
   const raw=trimmed.slice(name.length+1);
   try{return decodeURIComponent(raw);}catch{return undefined;}
  }
 }
 return undefined;
}

/** Route-level authorization is enforced independently of the request proxy. */
export async function requireOwner(request:Request):Promise<NextResponse|null>{
 const token=cookieValue(request.headers.get("cookie"),SESSION_COOKIE);
 if(await isValidSession(token))return null;
 return NextResponse.json({error:"Authentication required."},{status:401,headers:{"Cache-Control":"no-store"}});
}