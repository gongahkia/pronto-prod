import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/db",()=>({...mocks,vectorLiteral:vi.fn()}));
import { stageVoice, stageFlow } from "@/lib/assistant-drafts";
import { buildDefaultTriageFlow } from "@/lib/triage-flow";
let stored: { edit_version: number; voice?: unknown; flow?: unknown } | null;
beforeEach(()=>{
 stored=null;
 mocks.query.mockReset().mockImplementation(async(sql:string,args:unknown[]=[])=>{
  if(sql.startsWith("select edit_version from assistant_drafts"))return {rows:stored?[{edit_version:stored.edit_version}]:[]};
  if(sql.includes("insert into assistant_drafts")){stored??={edit_version:1};return {rows:[]};}
  if(sql.startsWith("update assistant_drafts set voice")||sql.startsWith("update assistant_drafts set flow")){
   if(!stored||(args[3]!==null&&args[3]!==stored.edit_version))return {rows:[]};
   stored[sql.includes("set voice")?"voice":"flow"]=JSON.parse(String(args[1]));stored.edit_version++;
   return {rows:[{edit_version:stored.edit_version}]};
  }
  return {rows:[]};
 });
 mocks.transaction.mockImplementation(async(fn:(db:typeof mocks)=>unknown)=>fn({query:mocks.query,transaction:mocks.transaction}));
});
const input={clientId:"tenant-a",actorUserId:"user-a",voice:{title:"Voice",content:"Warm and concise.",examples:[]}};
describe("lightweight assistant draft save protection",()=>{
 it("rejects a second tab's stale first save instead of overwriting the first",async()=>{
  expect(await stageVoice({...input,expectedVersion:0})).toBe(2);
  await expect(stageVoice({...input,voice:{...input.voice,content:"Stale edit"},expectedVersion:0})).rejects.toThrow("another tab");
  expect(stored?.voice).toMatchObject({content:"Warm and concise."});
 });
 it("preserves the other card when a current-version section is saved",async()=>{
  const version=await stageVoice({...input,expectedVersion:0});
  const flow=buildDefaultTriageFlow();expect(await stageFlow({clientId:input.clientId,actorUserId:input.actorUserId,...flow,expectedVersion:version})).toBe(3);
  expect(stored?.voice).toMatchObject({content:input.voice.content});expect(stored?.flow).toBeTruthy();
  await expect(stageVoice({...input,expectedVersion:version})).rejects.toThrow("another tab");
 });
 it("uses a version predicate to protect simultaneous saves before a draft row exists",async()=>{
  const results=await Promise.allSettled([stageVoice({...input,expectedVersion:0}),stageVoice({...input,expectedVersion:0})]);
  expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
 });
});
