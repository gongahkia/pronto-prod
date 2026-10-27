import {act,cleanup,configure,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({usePathname:()=>'/client/knowledge'}));
// jsdom rendering is slow when the whole suite runs in parallel; these tests wait on real timers, not fake ones.
vi.setConfig({testTimeout:30000});
configure({asyncUtilTimeout:10000});
import {DemoFeedback} from '@/components/demo-feedback';
const ME='00000000-0000-4000-8000-0000000000aa',KEITH='00000000-0000-4000-8000-0000000000bb';
const id=(n:number)=>`00000000-0000-4000-8000-00000000010${n}`;
const thread=(n:number,author:string,authorId:string,page='/client/knowledge',commentId=`c${n}`)=>({id:id(n),page_path:page,anchor:{selector:'#nope',label:`Thing ${n}`,quote:'',x:.5,y:.5},status:'open',created_at:'2026-10-27T00:00:00Z',updated_at:'2026-10-27T00:00:00Z',comment_count:1,
 comments:[{id:commentId,author_name:author,author_user_id:authorId,body:`${author} says ${n}`,created_at:'2026-10-27T00:00:00Z'}]});
let threads:unknown[];let calls:string[];
function memoryStorage():Storage{const m=new Map<string,string>();return {get length(){return m.size;},clear:()=>m.clear(),getItem:k=>m.get(k)??null,key:i=>[...m.keys()][i]??null,removeItem:k=>{m.delete(k);},setItem:(k,v)=>{m.set(k,String(v));}};}
beforeEach(()=>{
 vi.stubGlobal('localStorage',memoryStorage());calls=[];threads=[thread(1,'Me',ME)];
 vi.stubGlobal('fetch',vi.fn((url:string)=>{calls.push(url);return Promise.resolve(new Response(JSON.stringify({viewerId:ME,threads,hasMoreThreads:false})));}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const refresh=()=>act(async()=>{window.dispatchEvent(new Event('focus'));});
const openButton=()=>screen.getByRole('button',{name:/open prototype feedback/i});
describe('live feedback from other reviewers',()=>{
 it('loads every page\'s comments without needing the panel open, and treats existing ones as read',async()=>{
  threads=[thread(1,'Keith',KEITH,'/client/inbox')];
  render(<DemoFeedback/>);await waitFor(()=>expect(calls.length).toBeGreaterThan(0));
  expect(calls[0]).toBe('/api/demo/feedback');expect(openButton().getAttribute('aria-label')).toBe('Open prototype feedback');
 });
 it('badges the button as soon as another reviewer comments, but not for your own comments',async()=>{
  render(<DemoFeedback/>);await waitFor(()=>expect(calls.length).toBe(1));
  threads=[thread(2,'Me',ME),thread(1,'Me',ME)];await refresh();
  await waitFor(()=>expect(calls.length).toBe(2));expect(openButton().getAttribute('aria-label')).toBe('Open prototype feedback');
  threads=[thread(3,'Keith',KEITH),...threads];await refresh();
  await waitFor(()=>expect(openButton().getAttribute('aria-label')).toBe('Open prototype feedback (1 new)'));
 });
 it('flags new comments inside the panel and clears the flag once the thread is opened',async()=>{
  render(<DemoFeedback/>);await waitFor(()=>expect(calls.length).toBe(1));
  threads=[thread(3,'Keith',KEITH),...threads];await refresh();
  await waitFor(()=>expect(openButton().getAttribute('aria-label')).toMatch(/1 new/));
  fireEvent.click(openButton());expect(await screen.findByText('New')).toBeTruthy();
  fireEvent.click(screen.getByText('Keith says 3'));await screen.findByText('All page comments');
  fireEvent.click(screen.getByText('All page comments'));await waitFor(()=>expect(screen.queryByText('New')).toBeNull());
 });
 it('flags a new reply from Keith on a thread you had already read',async()=>{
  render(<DemoFeedback/>);await waitFor(()=>expect(calls.length).toBe(1));
  threads=[thread(1,'Keith',KEITH,'/client/knowledge','c1-reply')];await refresh();
  await waitFor(()=>expect(openButton().getAttribute('aria-label')).toMatch(/1 new/));
 });
 it('keeps the thread you are viewing marked as read while it updates live',async()=>{
  threads=[thread(1,'Me',ME)];render(<DemoFeedback/>);await waitFor(()=>expect(calls.length).toBe(1));
  fireEvent.click(openButton());fireEvent.click(await screen.findByText('Me says 1'));await screen.findByText('All page comments');
  threads=[{...thread(1,'Keith',KEITH),comments:[...(thread(1,'Me',ME).comments),{id:'c-live',author_name:'Keith',author_user_id:KEITH,body:'Just now',created_at:'2026-10-27T00:01:00Z'}]}];
  await refresh();expect(await screen.findByText('Just now')).toBeTruthy();
  fireEvent.click(screen.getByText('All page comments'));await waitFor(()=>expect(screen.queryByText('New')).toBeNull());
 });
 it('lists other pages\' comments on request and links to them',async()=>{
  threads=[thread(1,'Me',ME),thread(2,'Keith',KEITH,'/client/inbox')];
  render(<DemoFeedback/>);await waitFor(()=>expect(calls.length).toBe(1));fireEvent.click(openButton());
  await screen.findByText('Me says 1');expect(screen.queryByText('Keith says 2')).toBeNull();
  fireEvent.click(screen.getByLabelText(/comments from all pages/i));expect(await screen.findByText('Keith says 2')).toBeTruthy();expect(screen.getByText('On /client/inbox')).toBeTruthy();
  fireEvent.click(screen.getByText('Keith says 2'));expect((await screen.findByRole('link',{name:/open this page/i})).getAttribute('href')).toBe('/client/inbox');
 });
 it('does not poll while the tab is hidden',async()=>{
  render(<DemoFeedback/>);await waitFor(()=>expect(calls.length).toBe(1));
  const spy=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');await refresh();expect(calls.length).toBe(1);
  spy.mockReturnValue('visible');await refresh();await waitFor(()=>expect(calls.length).toBe(2));
 });
});
