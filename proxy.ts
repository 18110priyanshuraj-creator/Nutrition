import {NextRequest,NextResponse} from "next/server";
import {isValidSession,SESSION_COOKIE} from "./src/lib/auth";

const publicPaths=new Set(["/login","/api/auth/login","/api/auth/logout","/api/health"]);
export async function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 let response:NextResponse;
 if(publicPaths.has(path)||path.startsWith("/_next/")||path==="/favicon.ico"){
  response=NextResponse.next();
 }else{
  const valid=await isValidSession(request.cookies.get(SESSION_COOKIE)?.value);
  if(!valid&&path.startsWith("/api/")){
   response=NextResponse.json({error:"Authentication required."},{status:401});
  }else if(!valid){
   const destination=new URL("/login",request.url);
   response=NextResponse.redirect(destination);
  }else{
   response=NextResponse.next();
  }
 }
 response.headers.set("X-Content-Type-Options","nosniff");
 response.headers.set("Referrer-Policy","strict-origin-when-cross-origin");
 response.headers.set("Permissions-Policy","camera=(self)");
 response.headers.set("X-Frame-Options","DENY");
 return response;
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};