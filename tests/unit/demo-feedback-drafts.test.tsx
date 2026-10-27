import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {clearDraft,loadDraft,remainderAfterSave,saveDraft} from '@/lib/feedback/draft-storage';
vi.mock('next/navigation',()=>({usePathname:()=>'/client/knowledge'}));
import {DemoFeedback} from '@/components/demo-feedback';
const PATH='/client/knowledge';
const threadId='00000000-0000-4000-8000-000000001111';
const anchor={selector:'#brand-voice',label:'Brand voice',quote:'',x:0.5,y:0.5};
type Post={body:Record<string,unknown>;resolve:(r:Response)=>void;reject:(e:unknown)=>void};
let posts:Post[];let threads:unknown[];
// Node's experimental localStorage global shadows jsdom's, so tests use an explicit in-memory Storage.
function memoryStorage():Storage{const m=new Map<string,string>();return {get length(){return m.size;},clear:()=>m.clear(),getItem:k=>m.get(k)??null,key:i=>[...m.keys()][i]??null,removeItem:k=>{m.delete(k);},setItem:(k,v)=>{m.set(k,String(v));}};}
const fresh=()=>{vi.stubGlobal('localStorage',memoryStorage());};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
beforeEach(()=>{
 fresh();posts=[];threads=[];
 vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
  if(init?.method==='POST')return new Promise<Response>((resolve,reject)=>{posts.push({body:JSON.parse(String(init.body)),resolve,reject});});
  return Promise.resolve(json({threads,hasMoreThreads:false}));
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const box=()=>screen.getByLabelText(/your comment|reply/i) as HTMLTextAreaElement;
async function openPageComment(){
 render(<DemoFeedback/>);fireEvent.click(screen.getByRole('button',{name:/open prototype feedback/i}));
 fireEvent.click(await screen.findByRole('button',{name:/page comment/i}));
}
const type=(value:string)=>fireEvent.change(box(),{target:{value}});
const submit=()=>fireEvent.click(screen.getByRole('button',{name:/post (comment|reply)/i}));
describe('feedback draft recovery',()=>{
 it('keeps text typed while a slow save is in flight',async()=>{
  await openPageComment();type('First note');submit();await waitFor(()=>expect(posts).toHaveLength(1));
  type('First note and more detail');
  threads=[{id:threadId,page_path:PATH,anchor,status:'open',created_at:'2026-10-27T00:00:00Z',updated_at:'2026-10-27T00:00:00Z',comments:[{id:'c1',author_name:'QA',author_user_id:null,body:'First note',created_at:'2026-10-27T00:00:00Z'}]}];
  await act(async()=>{posts[0].resolve(json({id:threadId}));});
  await waitFor(()=>expect(box().value).toBe('and more detail'));
  expect(screen.getByRole('button',{name:/post reply/i})).toBeTruthy();
 });
 it('clears the box once the submitted text is saved and nothing else was typed',async()=>{
  await openPageComment();type('Just this');submit();await waitFor(()=>expect(posts).toHaveLength(1));
  await act(async()=>{posts[0].resolve(json({id:threadId}));});
  await waitFor(()=>expect(loadDraft(PATH)).toBeNull());
 });
 it('brings back an unsent draft after a reload',async()=>{
  await openPageComment();type('Unsent thought');await waitFor(()=>expect(loadDraft(PATH)?.body).toBe('Unsent thought'));
  cleanup();render(<DemoFeedback/>);
  await waitFor(()=>expect(box().value).toBe('Unsent thought'));expect(screen.getByText(/restored your unsent comment/i)).toBeTruthy();
 });
 it('converts a restored reply to a page comment when its thread has gone',async()=>{
  saveDraft(PATH,{target:{kind:'thread',threadId},body:'Reply to a deleted thread'});
  render(<DemoFeedback/>);
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toMatch(/no longer available/i));
  expect(box().value).toBe('Reply to a deleted thread');expect(screen.getByRole('button',{name:/post comment/i})).toBeTruthy();
 });
 it('keeps the draft on a failed or offline save and reuses the request ID for an identical retry',async()=>{
  await openPageComment();type('Retry me');submit();await waitFor(()=>expect(posts).toHaveLength(1));
  await act(async()=>{posts[0].reject(new TypeError('Failed to fetch'));});
  expect((await screen.findByRole('alert')).textContent).toMatch(/kept on this device/i);expect(box().value).toBe('Retry me');expect(loadDraft(PATH)?.body).toBe('Retry me');
  submit();await waitFor(()=>expect(posts).toHaveLength(2));
  expect(posts[1].body.requestId).toBe(posts[0].body.requestId);
  await act(async()=>{posts[1].reject(new TypeError('Failed to fetch'));});await screen.findByRole('alert');
  type('Retry me, edited');submit();await waitFor(()=>expect(posts).toHaveLength(3));
  expect(posts[2].body.requestId).not.toBe(posts[0].body.requestId);
 });
});
describe('draft storage',()=>{
 beforeEach(fresh);
 it('round-trips, expires and ignores corrupt entries',()=>{
  saveDraft(PATH,{target:{kind:'anchor',anchor},body:'Hello'},1000);expect(loadDraft(PATH,2000)).toEqual({target:{kind:'anchor',anchor},body:'Hello'});
  expect(loadDraft(PATH,1000+15*24*60*60*1000)).toBeNull();expect(localStorage.length).toBe(0);
  localStorage.setItem(`pronto:feedback-draft:v1:${PATH}`,'{nope');expect(loadDraft(PATH)).toBeNull();
  localStorage.setItem(`pronto:feedback-draft:v1:${PATH}`,JSON.stringify({v:1,savedAt:Date.now(),body:'x',target:{kind:'thread',threadId:'not-a-uuid'}}));expect(loadDraft(PATH)).toBeNull();
 });
 it('only clears the draft it was asked to clear',()=>{
  saveDraft(PATH,{target:{kind:'thread',threadId},body:'Another tab wrote this'});
  clearDraft(PATH,'Something already saved');expect(loadDraft(PATH)?.body).toBe('Another tab wrote this');
  clearDraft(PATH,'Another tab wrote this');expect(loadDraft(PATH)).toBeNull();
 });
 it('removes only the submitted prefix of what is in the box',()=>{
  expect(remainderAfterSave('abc','abc')).toBe('');expect(remainderAfterSave('abc def','abc')).toBe('def');expect(remainderAfterSave('xbc','abc')).toBe('xbc');
 });
});
