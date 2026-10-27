import {cleanup,configure,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({usePathname:()=>'/client/knowledge'}));
// jsdom rendering is slow when the whole suite runs in parallel; these tests wait on real timers, not fake ones.
vi.setConfig({testTimeout:30000});
configure({asyncUtilTimeout:10000});
import {DemoFeedback} from '@/components/demo-feedback';
const thread=(id:string,anchor:Record<string,unknown>)=>({id,page_path:'/client/knowledge',anchor:{quote:'',x:.5,y:.5,...anchor},status:'open',created_at:'2026-10-27T00:00:00Z',updated_at:'2026-10-27T00:00:00Z',comments:[{id:`c-${id}`,author_name:'QA',author_user_id:null,body:`Note ${id}`,created_at:'2026-10-27T00:00:00Z'}]});
const ID1='00000000-0000-4000-8000-000000000001',ID2='00000000-0000-4000-8000-000000000002';
beforeEach(()=>{
 Element.prototype.getBoundingClientRect=function(){return {width:100,height:20,left:10,top:10,right:110,bottom:30,x:10,y:10} as DOMRect;};
 document.body.innerHTML='<main id="main-content"><section aria-label="Settings"><h3>Brand voice</h3></section></main><div id="root"></div>';
 vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve(new Response(JSON.stringify({threads:[
  thread(ID1,{selector:'section[aria-label="Settings"] > h3:nth-of-type(1)',label:'Brand voice',tag:'h3'}),
  thread(ID2,{selector:'#gone',label:'Deleted widget',tag:'div'}),
 ]})))));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();document.body.innerHTML='';});
describe('feedback overlay target warnings',()=>{
 it('marks a pin whose target no longer exists and explains it, while healthy pins stay unmarked',{timeout:20000},async()=>{
  render(<DemoFeedback/>,{container:document.getElementById('root')!});
  fireEvent.click(screen.getByRole('button',{name:/open prototype feedback/i}));
  expect(await screen.findByText('Target missing',{},{timeout:8000})).toBeTruthy();
  expect(screen.getAllByText(/target missing/i)).toHaveLength(1);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Open feedback 1: Brand voice'})).toBeTruthy(),{timeout:8000});
  expect(screen.queryByRole('button',{name:/Open feedback 2/})).toBeNull();
  fireEvent.click(screen.getByText('Note '+ID2));
  expect((await screen.findByRole('note',{},{timeout:8000})).textContent).toMatch(/can't be found on the page/i);
  fireEvent.click(screen.getByRole('button',{name:/locate on page/i}));
  expect((await screen.findByRole('alert',{},{timeout:8000})).textContent).toMatch(/can't be found/i);
 });
});
