import "dotenv/config";
import {readFileSync} from "node:fs";
import {z} from "zod";
import {getDb} from "../src/lib/db";
import {NUTRIENT_BY_KEY} from "../src/lib/nutrients";

const nutrientValue=z.object({
 value:z.number().finite().nonnegative().nullable(),
 canonicalUnit:z.string().trim().min(1).max(40),
 originalValue:z.number().finite().nonnegative().nullable(),
 originalUnit:z.string().trim().min(1).max(40),
 conversionNote:z.string().max(240).optional()
});
const recordSchema=z.object({
 id:z.string().trim().min(1).max(100),
 name:z.string().trim().min(1).max(150),
 aliases:z.array(z.string().trim().min(1).max(80)).max(40).default([]),
 preparation:z.string().trim().min(1).max(250),
 sourceRecordId:z.string().trim().min(1).max(150),
 sourceBasis:z.string().trim().min(1).max(250),
 confidence:z.enum(["verified","estimate"]).default("estimate"),
 lastVerifiedAt:z.string().datetime().nullable().optional(),
 completeness:z.enum(["full","partial"]).default("partial"),
 nutrients:z.record(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),nutrientValue)
});
const bundleSchema=z.object({
 datasetName:z.string().trim().min(2).max(160),
 datasetVersion:z.string().trim().min(1).max(80),
 sourceUrl:z.string().url(),
 sourceLicenseNote:z.string().trim().min(5).max(500),
 licenseConfirmed:z.literal(true),
 records:z.array(recordSchema).min(1).max(100000)
});

function usage():never{
 console.error("Usage: npm run foods:import -- path/to/normalized-foods.json [--apply]");
 console.error("Default is a dry run. Apply writes only after source, units, record IDs and license confirmation validate.");
 process.exit(2);
}
const args=process.argv.slice(2);
const file=args.find(a=>!a.startsWith("--"));
if(!file||args.some(a=>!["--apply"].includes(a)&&a===file?false:a.startsWith("--")&&a!=="--apply"))usage();
let raw:unknown;
try{raw=JSON.parse(readFileSync(file,"utf8"));}catch{console.error("Could not read valid JSON from "+file);process.exit(2);}
const parsed=bundleSchema.safeParse(raw);
if(!parsed.success){
 console.error("Import file failed validation. Correct the file and rerun a dry run.");
 for(const issue of parsed.error.issues.slice(0,20))console.error("- "+issue.path.join(".")+": "+issue.message);
 process.exit(2);
}
const bundle=parsed.data;
const seen=new Set<string>();
for(const record of bundle.records){
 if(seen.has(record.id)){console.error("Duplicate record ID in import file: "+record.id);process.exit(2);}
 seen.add(record.id);
 for(const [key,value] of Object.entries(record.nutrients)){
  const definition=NUTRIENT_BY_KEY[key];
  if(!definition){console.error("Unsupported nutrient key for "+record.id+": "+key+". Add it to src/lib/nutrients.ts before importing.");process.exit(2);}
  if(!definition.qualitative&&value.canonicalUnit!==definition.canonicalUnit){
   console.error("Canonical unit mismatch for "+record.id+" / "+key+": expected "+definition.canonicalUnit+", got "+value.canonicalUnit);
   process.exit(2);
  }
  if(definition?.qualitative){console.error("Do not store a numeric value for qualitative nutrient proxy "+key);process.exit(2);}
 }
 if(record.confidence==="verified"&&!record.lastVerifiedAt){console.error("Verified record "+record.id+" needs an explicit lastVerifiedAt timestamp.");process.exit(2);}
}
const db=getDb();
const existing=db.prepare("SELECT id FROM foods WHERE id=?");
const duplicates=bundle.records.filter(record=>existing.get(record.id)).map(record=>record.id);
const apply=args.includes("--apply");
console.log("Dataset: "+bundle.datasetName+" ("+bundle.datasetVersion+")");
console.log("Source: "+bundle.sourceUrl);
console.log("License confirmation: supplied by operator: "+bundle.sourceLicenseNote);
console.log("Valid records: "+bundle.records.length+"; IDs already in database: "+duplicates.length);
if(duplicates.length)console.log("Existing IDs will be updated only with --apply: "+duplicates.slice(0,20).join(", "));
if(!apply){console.log("DRY RUN ONLY. No food records were changed. Add --apply only after verifying the source, record IDs, edible basis, units and usage rights.");process.exit(0);}
const now=new Date().toISOString();
const importId=crypto.randomUUID();
const upsert=db.prepare("INSERT INTO foods(id,name,aliases_json,preparation,nutrients_json,servings_json,source,source_version,confidence,completeness,updated_at,source_url,source_record_id,source_basis,last_verified_at,source_license_note,nutrient_provenance_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,aliases_json=excluded.aliases_json,preparation=excluded.preparation,nutrients_json=excluded.nutrients_json,source=excluded.source,source_version=excluded.source_version,confidence=excluded.confidence,completeness=excluded.completeness,updated_at=excluded.updated_at,source_url=excluded.source_url,source_record_id=excluded.source_record_id,source_basis=excluded.source_basis,last_verified_at=excluded.last_verified_at,source_license_note=excluded.source_license_note,nutrient_provenance_json=excluded.nutrient_provenance_json");
const tx=db.transaction(()=>{
 for(const record of bundle.records){
  const nutrientNumbers=Object.fromEntries(Object.entries(record.nutrients).filter((entry)=>entry[1].value!==null).map(([key,v])=>[key,v.value]));
  const actualConfidence=record.confidence==="verified"&&record.lastVerifiedAt?"verified":"estimate";
  upsert.run(record.id,record.name,JSON.stringify(record.aliases),record.preparation,JSON.stringify(nutrientNumbers),JSON.stringify([{label:"100 g",grams:100}]),bundle.datasetName+" · "+bundle.sourceUrl+" · record "+record.sourceRecordId,bundle.datasetVersion,actualConfidence,record.completeness,now,bundle.sourceUrl,record.sourceRecordId,record.sourceBasis,record.lastVerifiedAt??null,bundle.sourceLicenseNote,JSON.stringify(record.nutrients));
 }
 db.prepare("INSERT INTO food_data_imports(id,dataset_name,dataset_version,source_url,source_license_note,record_count,imported_at) VALUES(?,?,?,?,?,?,?)").run(importId,bundle.datasetName,bundle.datasetVersion,bundle.sourceUrl,bundle.sourceLicenseNote,bundle.records.length,now);
});
tx();
console.log("Import applied successfully: "+bundle.records.length+" record(s). Import ID: "+importId);