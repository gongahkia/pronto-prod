import React,{StrictMode} from 'react';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {DemoQueuePump,DEMO_MESSAGE_QUEUED} from '@/components/demo-queue-pump';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('request-driven browser activity',()=>{
 it('starts automatically, wakes after enqueue and avoids overlapping requests',async()=>{
  let finish!:(response:Response)=>void;const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}))
   .mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({processed:0,delivered:0,busy:false}))));vi.stubGlobal('fetch',fetcher);
  render(<StrictMode><DemoQueuePump/></StrictMode>);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
  window.dispatchEvent(new Event(DEMO_MESSAGE_QUEUED));expect(fetcher).toHaveBeenCalledTimes(1);
  finish(new Response(JSON.stringify({processed:0,delivered:0,busy:false})));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST'});
 });
 it('makes processing unavailability visible without losing the saved-message promise',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:503})));render(<DemoQueuePump/>);
  expect((await screen.findByRole('status')).textContent).toContain('Your messages are saved');
 });
});
