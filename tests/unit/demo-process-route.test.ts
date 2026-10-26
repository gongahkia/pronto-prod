import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({enabled:vi.fn(),user:vi.fn(),process:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionUser:mock.user}));
vi.mock('@/lib/deployment-profile',()=>({requestDrivenDemoProcessing:mock.enabled}));
vi.mock('@/lib/demo-processing',()=>({processDemoQueue:mock.process}));
import {POST} from '@/app/api/demo/process/route';
const req=(body='',origin='http://localhost:3000')=>new Request('http://localhost:3000/api/demo/process',{method:'POST',headers:{origin},body});
describe('private processing endpoint',()=>{
 beforeEach(()=>{vi.clearAllMocks();mock.enabled.mockReturnValue(true);mock.user.mockResolvedValue({userId:'actor'});mock.process.mockResolvedValue({processed:1});});
 it('requires a session, same origin and enabled hosted-demo profile',async()=>{
  mock.enabled.mockReturnValue(false);expect((await POST(req())).status).toBe(404);mock.enabled.mockReturnValue(true);
  mock.user.mockResolvedValue(null);expect((await POST(req())).status).toBe(401);expect((await POST(req('','https://foreign.example'))).status).toBe(403);expect(mock.process).not.toHaveBeenCalled();
 });
 it('does not let the browser choose jobs, channels or tenants',async()=>{
  expect((await POST(req(JSON.stringify({clientId:'foreign',jobId:'foreign'})))).status).toBe(400);expect(mock.process).not.toHaveBeenCalled();
  expect((await POST(req())).status).toBe(200);expect(mock.process).toHaveBeenCalledWith({userId:'actor'});
 });
 it('exposes a recoverable error without leaking private provider details',async()=>{
  mock.process.mockRejectedValue(new Error('private token and database error'));const response=await POST(req());expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('private token');
 });
});
