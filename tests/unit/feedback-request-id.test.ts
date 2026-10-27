import {afterEach,describe,expect,it,vi} from 'vitest';
import {createRequestIdTracker,newRequestId} from '@/lib/feedback/request-id';
afterEach(()=>vi.unstubAllGlobals());
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
describe('feedback request IDs',()=>{
 it('reuses one ID while the identical save is retried and issues a new one when it changes',()=>{
  const tracker=createRequestIdTracker();const first=tracker.idFor({body:'a'});
  expect(tracker.idFor({body:'a'})).toBe(first);expect(tracker.idFor({body:'b'})).not.toBe(first);
 });
 it('issues a fresh ID after a confirmed save',()=>{
  const tracker=createRequestIdTracker();const first=tracker.idFor({body:'a'});tracker.clear();expect(tracker.idFor({body:'a'})).not.toBe(first);
 });
 it('produces valid v4 UUIDs even without crypto.randomUUID',()=>{
  vi.stubGlobal('crypto',{getRandomValues:(bytes:Uint8Array)=>{bytes.fill(255);return bytes;}});
  expect(newRequestId()).toMatch(uuid);
  vi.stubGlobal('crypto',undefined);expect(newRequestId()).toMatch(uuid);
 });
});
