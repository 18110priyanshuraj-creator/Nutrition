import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {NextRequest} from "next/server";
import {createSessionToken,SESSION_COOKIE} from "../src/lib/auth";
import {getDb} from "../src/lib/db";
import {GET as notesGet,POST as notesPost} from "../app/api/notes/route";
import {PATCH as notesPatch,DELETE as notesDelete} from "../app/api/notes/[id]/route";

const testDirectory=mkdtempSync(join(tmpdir(),"mynutri-notes-test-"));
process.env.DATABASE_PATH=join(testDirectory,"notes-test.sqlite");
process.env.SESSION_SECRET="test-only-notes-session-secret-with-more-than-32-characters";
let token="";
function request(url:string,method:string,payload?:unknown,authenticated=true):NextRequest{
 const headers=new Headers({"content-type":"application/json"});
 if(authenticated)headers.set("cookie",SESSION_COOKIE+"="+token);
 return new NextRequest("http://localhost"+url,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
}
beforeAll(async()=>{token=await createSessionToken();});
afterAll(()=>{
 try{getDb().close();}catch{}
 delete process.env.DATABASE_PATH;
 delete process.env.SESSION_SECRET;
 rmSync(testDirectory,{recursive:true,force:true});
});
describe("date-specific personal notes API",()=>{
 it("requires the owner session to read or create notes",async()=>{
  expect((await notesGet(request("/api/notes?date=2026-10-12","GET",undefined,false))).status).toBe(401);
  expect((await notesPost(request("/api/notes","POST",{localDate:"2026-10-12",note:"private",idempotencyKey:"11111111-1111-4111-8111-111111111111"},false))).status).toBe(401);
 });
 it("validates real dates, note text and the idempotency key",async()=>{
  const invalidDate=await notesPost(request("/api/notes","POST",{localDate:"2026-02-30",note:"test",idempotencyKey:"11111111-1111-4111-8111-111111111111"}));
  expect(invalidDate.status).toBe(400);
  const invalidKey=await notesPost(request("/api/notes","POST",{localDate:"2026-10-12",note:"test",idempotencyKey:"not-a-uuid"}));
  expect(invalidKey.status).toBe(400);
  const empty=await notesPost(request("/api/notes","POST",{localDate:"2026-10-12",note:"  ",idempotencyKey:"11111111-1111-4111-8111-111111111111"}));
  expect(empty.status).toBe(400);
 });
 it("saves idempotently, edits, reads by date and deletes a note",async()=>{
  const key="22222222-2222-4222-8222-222222222222";
  const first=await notesPost(request("/api/notes","POST",{localDate:"2026-10-12",note:"Morning measurement context",idempotencyKey:key}));
  expect(first.status).toBe(201);
  const firstBody=await first.json();
  const id=String(firstBody.note.id);
  const duplicate=await notesPost(request("/api/notes","POST",{localDate:"2026-10-12",note:"Morning measurement context",idempotencyKey:key}));
  expect(duplicate.status).toBe(200);
  expect((await duplicate.json()).duplicate).toBe(true);
  const read=await notesGet(request("/api/notes?date=2026-10-12","GET"));
  expect(read.status).toBe(200);
  expect((await read.json()).notes).toHaveLength(1);
  const edit=await notesPatch(request("/api/notes/"+id,"PATCH",{note:"Updated measurement context"}),{params:Promise.resolve({id})});
  expect(edit.status).toBe(200);
  const list=await notesGet(request("/api/notes?date=2026-10-12","GET"));
  expect((await list.json()).notes[0].note).toBe("Updated measurement context");
  const deletion=await notesDelete(request("/api/notes/"+id,"DELETE"),{params:Promise.resolve({id})});
  expect(deletion.status).toBe(200);
  const emptyList=await notesGet(request("/api/notes?date=2026-10-12","GET"));
  expect((await emptyList.json()).notes).toHaveLength(0);
 });
});