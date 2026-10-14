import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {NextRequest} from "next/server";
import {createSessionToken,SESSION_COOKIE} from "../src/lib/auth";
import {getDb} from "../src/lib/db";
import {POST as restorePost} from "../app/api/restore/route";
import {GET as exportGet} from "../app/api/export/route";

// An isolated disposable SQLite database: these tests never touch a personal database.
const testDirectory=mkdtempSync(join(tmpdir(),"mynutri-restore-test-"));
process.env.DATABASE_PATH=join(testDirectory,"restore-test.sqlite");
process.env.SESSION_SECRET="test-only-session-secret-with-more-than-32-characters";
let sessionToken="";
function request(url:string,method:string,payload?:unknown,authenticated=true):NextRequest {
 const headers=new Headers({"content-type":"application/json"});
 if(authenticated)headers.set("cookie",SESSION_COOKIE+"="+sessionToken);
 return new NextRequest("http://localhost"+url,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
}
const fixture={
 confirmation:"RESTORE_MY_NUTRI_DATA",
 payload:{
  meals:[{
   id:"test-meal-restore-1",logged_at:"2026-10-12T04:00:00.000Z",local_date:"2026-10-12",
   meal_type:"Breakfast",source:"manual",original_text:"test restore fixture",note:"",idempotency_key:"restore-idem-test-1",
   items:[{
    id:"test-item-restore-1",food_id:"banana-raw",food_name:"Banana, raw",grams:100,
    nutrients:{kcal:89,protein_g:1.1},per100g:{kcal:89,protein_g:1.1},
    source_snapshot:"test fixture only",confidence_snapshot:"estimate",portion_estimated:1
   }]
  }],
  measurements:[{id:"test-measure-restore-1",kind:"weight",value:47,unit:"kg",activity_type:null,note:"test fixture",recorded_at:"2026-10-12T04:00:00.000Z",local_date:"2026-10-12"}]
 }
};
beforeAll(async()=>{sessionToken=await createSessionToken();});
afterAll(()=>{
 try{getDb().close();}catch{}
 delete process.env.DATABASE_PATH;
 delete process.env.SESSION_SECRET;
 rmSync(testDirectory,{recursive:true,force:true});
});
describe("private JSON restore route",()=>{
 it("rejects requests without an owner session",async()=>{
  const response=await restorePost(request("/api/restore","POST",fixture,false));
  expect(response.status).toBe(401);
 });
 it("rejects impossible dates before touching saved records",async()=>{
  const malformed={confirmation:"RESTORE_MY_NUTRI_DATA",payload:{measurements:[{id:"bad-date",kind:"weight",value:45,unit:"kg",recorded_at:"2026-10-12T04:00:00.000Z",local_date:"2026-02-30"}]}};
  const response=await restorePost(request("/api/restore","POST",malformed));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("invalid local date");
 });
 it("restores saved meal snapshots and measurements transactionally, then exports them",async()=>{
  const response=await restorePost(request("/api/restore","POST",fixture));
  expect(response.status).toBe(201);
  const result=await response.json();
  expect(result.restored.meals).toBe(1);
  expect(result.restored.foodItems).toBe(1);
  expect(result.restored.measurements).toBe(1);
  const exported=await exportGet(request("/api/export?format=json","GET"));
  expect(exported.status).toBe(200);
  const data=await exported.json();
  expect(data.meals).toHaveLength(1);
  expect(data.meals[0].items[0].nutrients.kcal).toBe(89);
  expect(data.measurements).toHaveLength(1);
  expect(Array.isArray(data.recipes)).toBe(true);
 });
 it("refuses restore over existing personal records",async()=>{
  const response=await restorePost(request("/api/restore","POST",fixture));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("empty personal-data store");
 });
});