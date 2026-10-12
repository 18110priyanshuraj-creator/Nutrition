import {SignJWT,jwtVerify} from "jose";
export const SESSION_COOKIE="mynutri_session";
function signingKey():Uint8Array {
 const secret=process.env.SESSION_SECRET??"";
 if(secret.length<32)throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
 return new TextEncoder().encode(secret);
}
export async function createSessionToken():Promise<string>{
 return new SignJWT({role:"owner"}).setProtectedHeader({alg:"HS256"}).setSubject("owner").setIssuedAt().setExpirationTime("7d").sign(signingKey());
}
export async function isValidSession(token:string|undefined|null):Promise<boolean>{
 if(!token)return false;
 try{const verified=await jwtVerify(token,signingKey(),{algorithms:["HS256"]});return verified.payload.sub==="owner"&&verified.payload.role==="owner";}
 catch{return false;}
}
export function securityConfigurationError():string|null {
 if((process.env.APP_PASSWORD??"").length<12)return "Set APP_PASSWORD to a unique value of at least 12 characters.";
 if((process.env.SESSION_SECRET??"").length<32)return "Set SESSION_SECRET to a random value of at least 32 characters.";
 return null;
}