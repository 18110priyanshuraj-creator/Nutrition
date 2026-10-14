import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const importer=join(repoRoot,"scripts","import-foods.ts");
const tsxCli=join(repoRoot,"node_modules","tsx","dist","cli.mjs");

describe("food import nutrient validation",()=>{
 it("rejects nutrient keys that the app cannot calculate or display",()=>{
  const directory=mkdtempSync(join(tmpdir(),"mynutri-import-validation-"));
  try{
   const input=join(directory,"unknown-nutrient.json");
   writeFileSync(input,JSON.stringify({
    datasetName:"Test fixture",datasetVersion:"test-1",
    sourceUrl:"https://example.org/test-fixture",
    sourceLicenseNote:"Test fixture only; no food data is imported",
    licenseConfirmed:true,
    records:[{
     id:"test-food",name:"Test food",aliases:[],preparation:"test only",
     sourceRecordId:"test-row-1",sourceBasis:"per 100 g test fixture",
     confidence:"estimate",lastVerifiedAt:null,completeness:"partial",
     nutrients:{unknown_test_nutrient:{value:1,canonicalUnit:"mg",originalValue:1,originalUnit:"mg"}}
    }]
   }));
   const result=spawnSync(process.execPath,[tsxCli,importer,input],{
    cwd:repoRoot,encoding:"utf8",timeout:15000,
    env:{...process.env,DATABASE_PATH:join(directory,"must-not-be-created.sqlite")}
   });
   expect(result.error).toBeUndefined();
   expect(result.status).toBe(2);
   expect(result.stdout+"\n"+result.stderr).toContain("Unsupported nutrient key");
   expect(result.stdout+"\n"+result.stderr).toContain("unknown_test_nutrient");
  }finally{
   rmSync(directory,{recursive:true,force:true});
  }
 });
});
