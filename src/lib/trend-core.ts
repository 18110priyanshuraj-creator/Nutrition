import {isDate} from "./server-data";
export function dateRangeEnding(endDate:string,days:number):string[] {
 if(!isDate(endDate))throw new Error("End date must be a real YYYY-MM-DD date.");
 if(!Number.isInteger(days)||days<1||days>90)throw new Error("Trend range must be between 1 and 90 days.");
 const end=Date.parse(endDate+"T12:00:00Z");
 const out:string[]=[];
 for(let offset=days-1;offset>=0;offset--)out.push(new Date(end-offset*86400000).toISOString().slice(0,10));
 return out;
}
export function finiteOrNull(value:unknown):number|null {
 return typeof value==="number"&&Number.isFinite(value)?value:null;
}