import React,{StrictMode} from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {AnalyticsData} from '@/lib/analytics/types';
const mock=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>mock}));
import {AnalyticsDashboard} from '@/components/analytics-dashboard';
const data=():AnalyticsData=>({days:7,from:'2026-10-20T00:00:00.000Z',until:'2026-10-27T00:00:00.000Z',fingerprint:'a'.repeat(64),
 totals:{conversations:1,needsTeam:0,assistantCompleted:1,customerMessages:1,deliveredReplies:1,firstReplySeconds:2,csatAverage:null,csatResponses:0},
 daily:[{date:'2026-10-26',customers:1,replies:1}],channels:[],handoffs:[],snapshot:null,
 sample:[{id:'conversation',customer:'Customer',channel:'console',status:'active',needsTeam:false,assistantCompleted:true,updatedAt:'2026-10-26T08:00:00Z',messages:[{id:'message',role:'customer',body:'When do you open?'}]}]});
describe('automatic Insights',()=>{
 beforeEach(()=>vi.clearAllMocks());afterEach(()=>{cleanup();vi.unstubAllGlobals();});
 it('generates a missing synthesis once on first load even with Strict Mode effects',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'snapshot'})));vi.stubGlobal('fetch',fetcher);
  render(<StrictMode><AnalyticsDashboard data={data()}/></StrictMode>);
  await waitFor(()=>expect(mock.refresh).toHaveBeenCalledTimes(1));expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify({days:'7'}));
 });
 it('reuses a matching saved synthesis without another model request',async()=>{
  const saved=data();saved.snapshot={id:'snapshot',status:'ready',fingerprint:saved.fingerprint,provider:'groq',model:'openai/gpt-oss-20b',sample_count:1,created_at:'2026-10-26T08:00:00Z',error_message:null,
   payload:{summary:'One opening-hours enquiry.',topics:[],conversations:[],recommendations:[],knowledgeGaps:[]}};
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<AnalyticsDashboard data={saved}/>);
  expect(screen.getByText('One opening-hours enquiry.')).toBeTruthy();expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:/refresh|up to date|generate/i})).toBeNull();
 });
 it('preserves a recoverable error and lets the user retry a failed provider request',async()=>{
  const fetcher=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({error:'Model temporarily unavailable.'}),{status:503})));vi.stubGlobal('fetch',fetcher);
  render(<AnalyticsDashboard data={data()}/>);expect((await screen.findByRole('alert')).textContent).toContain('Model temporarily unavailable.');
  expect(fetcher).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole('button',{name:'Retry analysis'}));
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 });
 it('automatically resumes when another period releases the workspace generation lease',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:409}))
   .mockResolvedValueOnce(new Response(JSON.stringify({status:'missing',busy:false})))
   .mockResolvedValueOnce(new Response(JSON.stringify({id:'snapshot'})));vi.stubGlobal('fetch',fetcher);
  render(<AnalyticsDashboard data={data()}/>);
  await waitFor(()=>expect(mock.refresh).toHaveBeenCalledTimes(1),{timeout:4000});expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[2][1].method).toBe('POST');
 });
});
