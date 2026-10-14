import {NUTRIENT_BY_KEY} from "./nutrients";
export type LabelBasis="per_100g"|"per_serving";
export type LabelConversion={value:number|null;canonicalUnit:string;status:"converted"|"unknown"|"unsupported"|"needs-serving-mass";note:string};
function normalizeUnit(unit:string):string {
 return unit.trim().toLowerCase().replace(/μ/g,"µ").replace(/\s+/g," ").replace(/[.]$/,"");
}
function unitMassInMg(value:number,unit:string):number|null {
 const u=normalizeUnit(unit);
 if(["g","gram","grams"].includes(u))return value*1000;
 if(["mg","milligram","milligrams"].includes(u))return value;
 if(["µg","ug","mcg","microgram","micrograms"].includes(u))return value/1000;
 if(["kg","kilogram","kilograms"].includes(u))return value*1_000_000;
 return null;
}
function canonicalScale(key:string):{unit:string;scale:number}|null {
 const definition=NUTRIENT_BY_KEY[key];
 if(!definition||definition.qualitative)return null;
 if(key==="kcal")return {unit:"kcal",scale:1};
 if(key==="vit_d_ug")return {unit:"µg",scale:1};
 if(key.endsWith("_g"))return {unit:"g",scale:1};
 if(key.endsWith("_mg"))return {unit:"mg",scale:1};
 if(key.endsWith("_ug"))return {unit:"µg",scale:1};
 return null;
}
function convertUnit(key:string,value:number,unit:string):{value:number;unit:string;note:string}|null {
 const u=normalizeUnit(unit);
 if(key==="kcal") {
  if(["kcal","calorie","calories","kcalories","cal"].includes(u))return {value,unit:"kcal",note:""};
  if(["kj","kilojoule","kilojoules"].includes(u))return {value:value/4.184,unit:"kcal",note:"Converted from kJ using 1 kcal = 4.184 kJ."};
  return null;
 }
 if(key==="vit_d_ug") {
  if(["iu","i u","international unit","international units"].includes(u))return {value:value/40,unit:"µg",note:"Vitamin D converted using 1 µg = 40 IU."};
 }
 if(key==="vit_a_ug"&&["iu","i u","international unit","international units"].includes(u))return null;
 const target=canonicalScale(key);
 if(!target)return null;
 const mg=unitMassInMg(value,u);
 if(mg===null)return null;
 if(target.unit==="mg")return {value:mg,unit:target.unit,note:""};
 if(target.unit==="g")return {value:mg/1000,unit:target.unit,note:""};
 if(target.unit==="µg")return {value:mg*1000,unit:target.unit,note:key==="vit_a_ug"?"Vitamin A form/RAE convention must be verified against the label/source.":""};
 return null;
}
/** Converts a value read from a package label to canonical units per 100 g only when its basis is known. */
export function labelValuePer100g(key:string,value:number|null,unit:string,basis:LabelBasis,servingGrams:number|null|undefined):LabelConversion {
 const definition=NUTRIENT_BY_KEY[key];
 const scale=canonicalScale(key);
 if(!definition||!scale)return {value:null,canonicalUnit:definition?.canonicalUnit??"unknown",status:"unsupported",note:"This nutrient or unit is not supported by the deterministic converter."};
 if(definition.qualitative)return {value:null,canonicalUnit:definition.canonicalUnit,status:"unsupported",note:"Qualitative components cannot be read as numeric label values."};
 if(value===null||!Number.isFinite(value)||value<0)return {value:null,canonicalUnit:scale.unit,status:"unknown",note:"The label value is not readable or not reported."};
 const converted=convertUnit(key,value,unit);
 if(!converted||!Number.isFinite(converted.value))return {value:null,canonicalUnit:scale.unit,status:"unsupported",note:"Source unit '"+unit+"' is not safely convertible for "+definition.label+"."};
 if(basis==="per_serving") {
  if(servingGrams===null||servingGrams===undefined||!Number.isFinite(servingGrams)||servingGrams<=0||servingGrams>10000)
   return {value:null,canonicalUnit:scale.unit,status:"needs-serving-mass",note:"Per-serving label values need a verified serving mass in grams before conversion to per 100 g."};
 }
 const result=basis==="per_serving"?converted.value*100/(servingGrams as number):converted.value;
 const noteParts=[converted.note];
 if(key==="vit_b9_ug")noteParts.push("Folate and dietary folate equivalents may differ.");
 if(key==="vit_b3_mg")noteParts.push("Niacin equivalents may differ from niacin alone.");
 if(basis==="per_serving")noteParts.push("Converted from serving values using "+servingGrams+" g per serving.");
 return {value:result,canonicalUnit:scale.unit,status:"converted",note:noteParts.filter(Boolean).join(" ")};
}