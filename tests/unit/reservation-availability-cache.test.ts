import { withAgentTurn } from "@/lib/agent/turn-budget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityResult, ReservationConnector } from "@/lib/reservations/types";
const mocks=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/db",()=>mocks);
import { getCachedChopeAvailability, usableObservation } from "@/lib/reservations/availability-cache";
const request={clientId:"tenant-a",outletId:"restaurant-a",date:"2026-10-31",partySize:4,time:"19:00"};
const observed: AvailabilityResult={outletId:request.outletId,date:request.date,partySize:4,provider:"chope",timezone:"Asia/Singapore",status:"available",availableSlots:["19:00"],observedAt:"2026-10-26T07:00:00Z"};
let row: { result: AvailabilityResult|null; checked_at:string|null; lease_until:string|null };
let rateAllowed:boolean;
function connector(result:AvailabilityResult=observed): ReservationConnector {
 return {provider:"chope",capabilities:{availability:true,create:false,read:false,update:false,cancel:false},getAvailability:vi.fn(async()=>result),createReservation:vi.fn(),getReservation:vi.fn(),updateReservation:vi.fn(),cancelReservation:vi.fn()};
}
beforeEach(()=>{
 vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T07:00:00Z"));
 row={result:null,checked_at:null,lease_until:null}; rateAllowed=true;
 mocks.query.mockReset().mockImplementation(async(sql:string)=>{
  if(sql.startsWith("select result")) return {rows:[row],rowCount:1};
  if(sql.startsWith("insert into reservation_provider_limits")) return {rows:rateAllowed?[{provider:"chope"}]:[],rowCount:rateAllowed?1:0};
  if(sql.startsWith("insert into reservation_availability_observations")) return {rows:[{id:"observation-id"}],rowCount:1};
  return {rows:[],rowCount:1};
 });
 mocks.transaction.mockReset().mockImplementation(async(fn:(db:{query:typeof mocks.query})=>unknown)=>fn({query:mocks.query}));
});
afterEach(()=>vi.useRealTimers());
describe("shared Chope availability cache",()=>{
 it("stores actual scoped observations and refresh schedule; preferred time is not a cache key",async()=>{
  const reader=connector(); const result=await getCachedChopeAvailability(request,reader);
  expect(result).toMatchObject({result:observed,cacheHit:false,observationId:"observation-id"});
  expect(reader.getAvailability).toHaveBeenCalledWith({clientId:request.clientId,outletId:request.outletId,date:request.date,partySize:4});
  expect(mocks.query.mock.calls.some(([sql,args])=>String(sql).startsWith("insert into reservation_availability_observations") && args[0]==="tenant-a" && args[4]===observed)).toBe(true);
  expect(mocks.query.mock.calls.some(([sql])=>String(sql).includes("interval '1 hour'"))).toBe(true);
 });
 it("serves a fresh matching observation without another provider read",async()=>{
  row.result=observed; const reader=connector();
  expect(await getCachedChopeAvailability(request,reader)).toMatchObject({cacheHit:true,result:observed});
  expect(reader.getAvailability).not.toHaveBeenCalled();
  expect(mocks.query.mock.calls.some(([sql])=>String(sql).includes("reservation_provider_limits"))).toBe(false);
 });
 it.each([
  {observedAt:"2026-10-26T06:54:59Z"},{outletId:"restaurant-b"},{partySize:2},{provider:"invented"},
  {observedAt:"2026-10-26T07:00:01Z"},{availableSlots:["29:00"]},{status:"unknown",availableSlots:["19:00"]},
 ])("rejects stale/mismatched/malformed cache evidence %j",override=>{
  expect(usableObservation({...observed,...override} as AvailabilityResult,request)).toBe(false);
 });
 it("refreshes stale results before making them available to the model",async()=>{
  row.result={...observed,observedAt:"2026-10-26T06:00:00Z"}; const reader=connector();
  expect(await getCachedChopeAvailability(request,reader)).toMatchObject({cacheHit:false,result:observed});
  expect(reader.getAvailability).toHaveBeenCalledOnce();
 });
 it("returns unknown on the shared cooldown instead of stale availability",async()=>{
  rateAllowed=false;row.result={...observed,observedAt:"2026-10-26T06:00:00Z"}; const reader=connector();
  expect(await getCachedChopeAvailability(request,reader)).toMatchObject({result:{status:"unknown",availableSlots:[],observedAt:null,errorCode:"rate_limited"}});
  expect(reader.getAvailability).not.toHaveBeenCalled();
 });
 it("coalesces concurrent requests for a date and party",async()=>{
  row.lease_until="2026-10-26T07:00:30Z"; const reader=connector(); const pending=getCachedChopeAvailability(request,reader);
  await vi.advanceTimersByTimeAsync(1);row.lease_until=null;row.result=observed;
  await vi.advanceTimersByTimeAsync(500);
  expect(await pending).toMatchObject({result:observed,cacheHit:true});expect(reader.getAvailability).not.toHaveBeenCalled();
 });
 it("persists a failed attempt with no slots, even if a broken provider includes invented slots",async()=>{
  const reader=connector({...observed,status:"error",availableSlots:["19:00"],errorCode:"provider_timeout"});
  const result=await getCachedChopeAvailability(request,reader);
  expect(result.result).toMatchObject({status:"unknown",availableSlots:[],observedAt:null,errorCode:"provider_timeout"});
  expect(mocks.query.mock.calls.some(([sql])=>String(sql).startsWith("insert into reservation_availability_observations"))).toBe(true);
 });
 it("discards a late connector result after the shared turn deadline",async()=>{
  const reader=connector();let finish!:(result:AvailabilityResult)=>void;
  vi.mocked(reader.getAvailability).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const work=withAgentTurn(()=>getCachedChopeAvailability(request,reader),{timeoutMs:10});
  const rejected=expect(work).rejects.toMatchObject({reason:"deadline"});
  await vi.advanceTimersByTimeAsync(11);await rejected;
  finish(observed);await vi.advanceTimersByTimeAsync(0);
  expect(mocks.query.mock.calls.some(([sql])=>String(sql).startsWith("insert into reservation_availability_observations"))).toBe(false);
 });
 it("does not query the database for invalid requests or unsupported connectors",async()=>{
  const reader=connector();await getCachedChopeAvailability({...request,date:"2026-02-30"},reader);
  await getCachedChopeAvailability(request,{...reader,provider:"other"});
  expect(mocks.query).not.toHaveBeenCalled();expect(reader.getAvailability).not.toHaveBeenCalled();
 });
});
