import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({user:{userId:'user-a',clientId:'tenant-a',role:'client'},canView:vi.fn(),generate:vi.fn(),usage:vi.fn(),events:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/db',()=>({query:mock.query}));
vi.mock('@/lib/auth',()=>({requireUser:async()=>mock.user}));
vi.mock('@/lib/staff-permissions',()=>({canViewBusinessConversation:mock.canView}));
vi.mock('@/lib/analytics/synthesis',()=>({generateClientSynthesis:mock.generate,SynthesisBusyError:class extends Error{}}));
vi.mock('@/lib/analytics/usage',async original=>({...await original<typeof import('@/lib/analytics/usage')>(),getWorkspaceUsage:mock.usage,getUsageEvents:mock.events}));
import {POST,GET as getSynthesisStatus} from '@/app/api/client/analytics/synthesis/route';
import {GET} from '@/app/api/client/usage/route';
const request=(body:unknown,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/client/analytics/synthesis',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
describe('client analytics access',()=>{
 beforeEach(()=>{vi.clearAllMocks();mock.canView.mockResolvedValue(true);mock.generate.mockResolvedValue('snapshot');mock.usage.mockResolvedValue({generationCalls:3});});
 it('binds synthesis to the authenticated workspace and checks conversation access',async()=>{
  expect((await POST(request({days:'30'}))).status).toBe(200);expect(mock.generate).toHaveBeenCalledWith('tenant-a','user-a','30');
  mock.canView.mockResolvedValue(false);expect((await POST(request({days:'30'}))).status).toBe(403);expect(mock.generate).toHaveBeenCalledTimes(1);
 });
 it('rejects cross-origin requests and body tenant overrides before calling the model',async()=>{
  expect((await POST(request({days:'30'},'https://foreign.example'))).status).toBe(403);
  expect((await POST(request({days:'30',clientId:'tenant-b'}))).status).toBe(400);expect(mock.generate).not.toHaveBeenCalled();
 });
 it('never reads another tenant from query parameters and validates billing months',async()=>{
  expect((await GET(new Request('http://localhost:3000/api/client/usage?month=2026-10&clientId=tenant-b'))).status).toBe(200);
  expect(mock.usage).toHaveBeenCalledWith('tenant-a','2026-10');expect((await GET(new Request('http://localhost:3000/api/client/usage?month=bad'))).status).toBe(400);
 });
 it('scopes synthesis polling to the authenticated tenant and validates its fingerprint',async()=>{
  mock.query.mockResolvedValue({rows:[{status:'ready',busy:false}]});const fingerprint='a'.repeat(64);
  const response=await getSynthesisStatus(new Request(`http://localhost:3000/api/client/analytics/synthesis?days=7&fingerprint=${fingerprint}&clientId=tenant-b`));
  expect(await response.json()).toEqual({status:'ready',busy:false});expect(mock.query.mock.calls[0][1]).toEqual(['tenant-a',7,fingerprint]);
  expect((await getSynthesisStatus(new Request('http://localhost:3000/api/client/analytics/synthesis?days=7&fingerprint=bad'))).status).toBe(400);
  mock.canView.mockResolvedValue(false);expect((await getSynthesisStatus(new Request(`http://localhost:3000/api/client/analytics/synthesis?days=7&fingerprint=${fingerprint}`))).status).toBe(403);
  expect(mock.query).toHaveBeenCalledTimes(1);
 });
});
