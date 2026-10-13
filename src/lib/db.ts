import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { NUTRIENTS } from "./nutrients";
type DbInstance = InstanceType<typeof Database>;
let database: DbInstance | undefined;

const seedFoods = [
 {id:"milk-cow-toned",name:"Cow milk, toned",aliases:["milk","cow milk","doodh","दूध","toned milk"],preparation:"liquid; approximate 1 ml = 1 g",n:{kcal:61,protein_g:3.2,carbs_g:4.8,fat_g:3,calcium_mg:120,phosphorus_mg:95,magnesium_mg:11,potassium_mg:150,sodium_mg:50,zinc_mg:0.4,vit_a_ug:32,vit_b2_mg:0.18,vit_b12_ug:0.4}},
 {id:"curd-plain",name:"Plain curd",aliases:["curd","dahi","yogurt","दही"],preparation:"plain; not sweetened",n:{kcal:61,protein_g:3.5,carbs_g:4.7,fat_g:3.3,calcium_mg:121,phosphorus_mg:95,magnesium_mg:11,potassium_mg:155,sodium_mg:46,vit_b2_mg:0.14,vit_b12_ug:0.4}},
 {id:"banana-raw",name:"Banana, raw",aliases:["banana","bananas","kela","केला"],preparation:"peeled edible portion",n:{kcal:89,protein_g:1.1,carbs_g:22.8,fat_g:0.3,omega3_g:0.027,omega6_g:0.046,calcium_mg:5,phosphorus_mg:22,magnesium_mg:27,potassium_mg:358,sodium_mg:1,iron_mg:0.26,vit_a_ug:3,vit_c_mg:8.7,vit_b6_mg:0.37,vit_b9_ug:20}},
 {id:"rice-white-cooked",name:"White rice, cooked",aliases:["rice","cooked rice","chawal","चावल"],preparation:"cooked; plain",n:{kcal:130,protein_g:2.7,carbs_g:28.2,fat_g:0.3,calcium_mg:10,phosphorus_mg:43,magnesium_mg:12,potassium_mg:35,sodium_mg:1,iron_mg:0.2,vit_b1_mg:0.02,vit_b3_mg:0.4}},
 {id:"roti-whole-wheat",name:"Whole-wheat roti",aliases:["roti","chapati","chapathi","phulka","रोटी","चपाती"],preparation:"plain, without added ghee; cooked-weight estimate",n:{kcal:297,protein_g:11.5,carbs_g:55,fat_g:4.5,calcium_mg:30,phosphorus_mg:280,magnesium_mg:82,potassium_mg:280,zinc_mg:2.5,iron_mg:3.5,vit_b1_mg:0.4,vit_b3_mg:4.5,vit_b9_ug:44}},
 {id:"dal-cooked",name:"Dal, cooked",aliases:["dal","daal","lentil","lentils","दाल"],preparation:"generic cooked lentil; tadka/oil not included",n:{kcal:116,protein_g:9,carbs_g:20,fat_g:0.4,calcium_mg:19,phosphorus_mg:180,magnesium_mg:36,potassium_mg:369,sodium_mg:2,zinc_mg:1.3,iron_mg:3.3,vit_b1_mg:0.17,vit_b9_ug:181}},
 {id:"paneer-plain",name:"Paneer, plain",aliases:["paneer","पनीर"],preparation:"generic fresh paneer; brand/fat level varies",n:{kcal:265,protein_g:18.3,carbs_g:1.2,fat_g:20.8,calcium_mg:208,phosphorus_mg:138,magnesium_mg:8,potassium_mg:138,sodium_mg:18,zinc_mg:2.5,vit_b12_ug:0.7}},
 {id:"sesame-seeds",name:"Sesame seeds",aliases:["sesame","sesame seeds","til","white til","तिल"],preparation:"seeds; variety and processing affect values",n:{kcal:573,protein_g:17.7,carbs_g:23.4,fat_g:49.7,omega3_g:0.35,omega6_g:21.4,calcium_mg:975,phosphorus_mg:629,magnesium_mg:351,potassium_mg:468,iron_mg:14.6,zinc_mg:7.8,copper_ug:4082,manganese_mg:2.5,vit_b1_mg:0.79}},
 {id:"almonds",name:"Almonds",aliases:["almond","almonds","badam","बादाम"],preparation:"raw generic almonds",n:{kcal:579,protein_g:21.2,carbs_g:21.6,fat_g:49.9,omega3_g:0.003,omega6_g:12.3,calcium_mg:269,phosphorus_mg:481,magnesium_mg:270,potassium_mg:733,iron_mg:3.7,zinc_mg:3.1,vit_e_mg:25.6,vit_b2_mg:1.14}},
 {id:"spinach-cooked",name:"Spinach, cooked",aliases:["spinach","palak","पालक"],preparation:"cooked; drained generic estimate",n:{kcal:23,protein_g:3,carbs_g:3.75,fat_g:0.26,calcium_mg:136,phosphorus_mg:56,magnesium_mg:87,potassium_mg:466,iron_mg:3.6,vit_a_ug:524,vit_k_ug:493,vit_c_mg:9.8,vit_b9_ug:146}},
 {id:"egg-boiled",name:"Egg, hard-boiled",aliases:["egg","eggs","boiled egg","anda","ande","अंडा","अंडे"],preparation:"hard-boiled edible portion without shell",n:{kcal:155,protein_g:13,carbs_g:1.1,fat_g:11,omega3_g:0.1,omega6_g:1.2,calcium_mg:50,phosphorus_mg:172,magnesium_mg:10,potassium_mg:126,sodium_mg:124,selenium_ug:30,vit_a_ug:160,vit_d_ug:2,vit_e_mg:1.1,vit_b2_mg:0.5,vit_b12_ug:1.1}},
 {id:"chicken-cooked",name:"Chicken, cooked",aliases:["chicken","murgh","चिकन"],preparation:"generic cooked meat; cut and preparation vary",n:{kcal:165,protein_g:31,carbs_g:0,fat_g:3.6,omega3_g:0.03,omega6_g:0.7,calcium_mg:15,phosphorus_mg:228,magnesium_mg:29,potassium_mg:256,sodium_mg:74,zinc_mg:1,iron_mg:1,selenium_ug:27,vit_b3_mg:13.7,vit_b6_mg:0.6,vit_b12_ug:0.3}},
 {id:"peanuts",name:"Peanuts",aliases:["peanut","peanuts","groundnut","groundnuts","moongfali","मूंगफली"],preparation:"raw generic peanuts; roasting/salt not included",n:{kcal:567,protein_g:25.8,carbs_g:16.1,fat_g:49.2,omega3_g:0.003,omega6_g:15.6,calcium_mg:92,phosphorus_mg:376,magnesium_mg:168,potassium_mg:705,sodium_mg:18,iron_mg:4.6,zinc_mg:3.3,vit_e_mg:8.3,vit_b3_mg:12.1,vit_b9_ug:240}},
 {id:"chickpeas-cooked",name:"Chickpeas, cooked",aliases:["chickpea","chickpeas","chana","chole","चना","छोले"],preparation:"cooked generic chickpeas; gravy/oil not included",n:{kcal:164,protein_g:8.9,carbs_g:27.4,fat_g:2.6,calcium_mg:49,phosphorus_mg:168,magnesium_mg:48,potassium_mg:291,iron_mg:2.9,zinc_mg:1.5,vit_b6_mg:0.14,vit_b9_ug:172}},
 {id:"oats-dry",name:"Oats, dry",aliases:["oats","oatmeal","ओट्स"],preparation:"dry rolled oats; additions not included",n:{kcal:389,protein_g:16.9,carbs_g:66.3,fat_g:6.9,omega3_g:0.11,omega6_g:2.4,calcium_mg:54,phosphorus_mg:523,magnesium_mg:177,potassium_mg:429,iron_mg:4.7,zinc_mg:4,vit_b1_mg:0.76,vit_b5_mg:1.35,vit_b9_ug:56}},
 {id:"oil-generic",name:"Cooking oil, generic",aliases:["oil","cooking oil","tel","तेल"],preparation:"oil type unspecified; fatty-acid profile unknown",n:{kcal:884,fat_g:100}}
];

export function getDb():DbInstance {
 if(database)return database;
 const configured=process.env.DATABASE_PATH||"./data/mynutri.sqlite";
 const filePath=resolve(/*turbopackIgnore: true*/ configured);
 mkdirSync(dirname(filePath),{recursive:true});
 database=new Database(filePath);database.pragma("foreign_keys = ON");database.pragma("journal_mode = WAL");
 database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
 const migrationDir=resolve(process.cwd(),"db","migrations");
 const migrationFiles=readdirSync(migrationDir).filter((f)=>f.endsWith(".sql")).sort();
 for(const filename of migrationFiles){
  const done=database.prepare("SELECT version FROM schema_migrations WHERE version=?").get(filename);
  if(done)continue;
  const sql=readFileSync(join(migrationDir,filename),"utf8");
  database.transaction(()=>{database!.exec(sql);database!.prepare("INSERT INTO schema_migrations(version) VALUES(?)").run(filename);})();
 }
 seedInitialData(database);return database;
}
function seedInitialData(db:DbInstance):void {
 const now=new Date().toISOString();
 db.prepare("INSERT OR IGNORE INTO profiles (id,display_name,age,sex,height_cm,weight_kg,country,diet_preference,region,exercise_frequency,exercise_time,timezone,units,created_at,updated_at) VALUES (1,?,17,'male',160,47,'India','vegetarian','Indian home-cooked','4–5 days/week','Morning','Asia/Kolkata','metric',?,?)").run("My profile",now,now);
 const target=db.prepare("INSERT OR IGNORE INTO nutrient_targets(nutrient_key,target,target_min,target_max,unit,updated_at) VALUES(?,?,?,?,?,?)");
 const targetTx=db.transaction(()=>{for(const n of NUTRIENTS)target.run(n.key,n.target,n.targetMin??null,n.targetMax??null,n.canonicalUnit,now);});targetTx();
 const count=(db.prepare("SELECT COUNT(*) AS count FROM foods").get() as {count:number}).count;
 if(count===0){
  const insert=db.prepare("INSERT INTO foods(id,name,aliases_json,preparation,nutrients_json,servings_json,source,source_version,confidence,completeness,updated_at) VALUES(?,?,?,?,?,?,?,?, 'estimate','partial',?)");
  const tx=db.transaction(()=>{for(const f of seedFoods)insert.run(f.id,f.name,JSON.stringify(f.aliases),f.preparation,JSON.stringify(f.n),JSON.stringify([{label:"100 g",grams:100}]),"Provisional generic starter estimate; not verified against an exact IFCT row","starter-v1",now);});tx();
 }
}