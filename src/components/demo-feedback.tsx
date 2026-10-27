'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {Check,CornerDownRight,Download,LocateFixed,MessageCircle,MousePointer2,Plus,X} from 'lucide-react';
import {useDraftEditor} from '@/components/use-draft-editor';
import type {FeedbackAnchor,FeedbackThread} from '@/lib/feedback/types';
import {createRequestIdTracker} from '@/lib/feedback/request-id';
import {clearDraft,loadDraft,remainderAfterSave,saveDraft} from '@/lib/feedback/draft-storage';
function selectorFor(element:Element){
 if(element.id)return `#${CSS.escape(element.id)}`;
 const parts:string[]=[];let node:Element|null=element;
 while(node&&node.tagName!=='BODY'&&parts.length<7){
  if(node.id){parts.unshift(`#${CSS.escape(node.id)}`);break;}
  const tag=node.tagName.toLowerCase();const siblings=node.parentElement?[...node.parentElement.children].filter(e=>e.tagName===node!.tagName):[];
  parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node)+1})`);node=node.parentElement;
 }return parts.join(' > ');
}
function pageAnchor():FeedbackAnchor{return {selector:document.querySelector('#main-content')?'#main-content':'main',label:'This page',quote:'',x:0.98,y:0};}
function findAnchor(anchor:FeedbackAnchor){try{return document.querySelector(anchor.selector);}catch{return null;}}
export function DemoFeedback(){
 const path=usePathname();return <DemoFeedbackPanel key={path} path={path}/>;
}
function DemoFeedbackPanel({path}:{path:string}){
 const [open,setOpen]=useState(false);const [pinning,setPinning]=useState(false);
 const [threads,setThreads]=useState<FeedbackThread[]>([]);const [selected,setSelected]=useState('');const [anchor,setAnchor]=useState<FeedbackAnchor|null>(null);
 const [error,setError]=useState('');const [saving,setSaving]=useState(false);const [loading,setLoading]=useState(false);const [showResolved,setShowResolved]=useState(false);const [hasMoreThreads,setHasMoreThreads]=useState(false);
 const [hover,setHover]=useState<{left:number;top:number;width:number;height:number}|null>(null);
 const [positions,setPositions]=useState<Record<string,{left:number;top:number}>>({});const textarea=useRef<HTMLTextAreaElement>(null);const requests=useRef(createRequestIdTracker());
 const draft=useDraftEditor('',0);const visible=threads.filter(t=>showResolved||t.status==='open');
 const [restored,setRestored]=useState(false);
 const valueRef=useRef('');const ctxRef=useRef<{anchor:FeedbackAnchor|null;selected:string}>({anchor:null,selected:''});const restoredRef=useRef(false);const restoredThread=useRef('');
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);try{const response=await fetch(`/api/demo/feedback?path=${encodeURIComponent(path)}`,{cache:'no-store',signal});const body=await response.json();
   if(!response.ok)throw Error(body.error??'Could not load feedback.');setThreads(body.threads);setHasMoreThreads(Boolean(body.hasMoreThreads));
   // A restored reply whose thread no longer exists becomes a page comment rather than disappearing.
   if(restoredThread.current){const id=restoredThread.current;restoredThread.current='';
    if(ctxRef.current.selected===id&&!(body.threads as FeedbackThread[]).some(t=>t.id===id)){setSelected('');setAnchor(pageAnchor());setError('The thread you were replying to is no longer available. Your comment is kept as a page comment.');}}
  }catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Could not load feedback.');}finally{if(!signal?.aborted)setLoading(false);}
 },[path]);
 useEffect(()=>{if(!open)return;const abort=new AbortController();const start=setTimeout(()=>void load(abort.signal),0);const timer=setInterval(()=>void load(abort.signal),15000);return()=>{abort.abort();clearTimeout(start);clearInterval(timer);};},[load,open]);
 useEffect(()=>{if(!pinning)return;
  const move=(event:PointerEvent)=>{const target=event.target instanceof Element?event.target:null;if(!target||target.closest('[data-feedback-ui]')){setHover(null);return;}const r=target.getBoundingClientRect();setHover({left:r.left,top:r.top,width:r.width,height:r.height});};
  const click=(event:MouseEvent)=>{const target=event.target instanceof Element?event.target:null;if(!target||target.closest('[data-feedback-ui]'))return;
   event.preventDefault();event.stopPropagation();const element=target.closest('button,a,input,textarea,select,h1,h2,h3,p,li,section')??target;const r=element.getBoundingClientRect();
   const label=(element.getAttribute('aria-label')||element.getAttribute('placeholder')||element.textContent||element.tagName).trim().replace(/\s+/g,' ').slice(0,120)||'Page element';
   setAnchor({selector:selectorFor(element),label,quote:(window.getSelection()?.toString()??'').trim().slice(0,300),x:Math.max(0,Math.min(1,(event.clientX-r.left)/Math.max(1,r.width))),y:Math.max(0,Math.min(1,(event.clientY-r.top)/Math.max(1,r.height)))});
   setSelected('');setPinning(false);setHover(null);setOpen(true);setError('');setTimeout(()=>textarea.current?.focus(),0);
  };
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setPinning(false);setHover(null);setOpen(true);}};
  window.addEventListener('pointermove',move);window.addEventListener('click',click,true);window.addEventListener('keydown',key);
  return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('click',click,true);window.removeEventListener('keydown',key);};
 },[pinning]);
 useEffect(()=>{if(!open)return;const position=()=>{const result:Record<string,{left:number;top:number}>={};for(const thread of threads){if(thread.status==='resolved'&&!showResolved)continue;const el=findAnchor(thread.anchor);if(!el)continue;const r=el.getBoundingClientRect();if(r.width&&r.height)result[thread.id]={left:Math.min(innerWidth-32,Math.max(0,r.left+r.width*thread.anchor.x)),top:r.top+r.height*thread.anchor.y};}setPositions(result);};
  position();window.addEventListener('scroll',position,true);window.addEventListener('resize',position);return()=>{window.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);};
 },[threads,open,showResolved]);
 useEffect(()=>{valueRef.current=draft.value;ctxRef.current={anchor,selected};});
 // Bring back an unsent comment after a reload, crash or tab restore.
 useEffect(()=>{const start=setTimeout(()=>{const saved=loadDraft(path);
   if(saved){draft.setValue(saved.body);if(saved.target.kind==='anchor')setAnchor(saved.target.anchor);else{setSelected(saved.target.threadId);restoredThread.current=saved.target.threadId;}setOpen(true);setRestored(true);}
   restoredRef.current=true;},0);return()=>clearTimeout(start);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[path]);
 useEffect(()=>{if(!restoredRef.current)return;if(!draft.value.trim()){clearDraft(path);return;}
  const target=anchor?{kind:'anchor' as const,anchor}:selected?{kind:'thread' as const,threadId:selected}:null;if(target)saveDraft(path,{target,body:draft.value});
 },[draft.value,anchor,selected,path]);
 function switchThread(id:string){if(draft.dirty&&!window.confirm('Discard your unsent comment?'))return;draft.reset();setSelected(id);setAnchor(null);setError('');}
 function newComment(pin:boolean){if(draft.dirty&&!window.confirm('Discard your unsent comment?'))return;draft.reset();setSelected('');setError('');
  if(pin){setAnchor(null);setOpen(false);setPinning(true);}else{setAnchor(pageAnchor());setTimeout(()=>textarea.current?.focus(),0);}}
 async function mutate(payload:Record<string,unknown>){setSaving(true);setError('');const started=ctxRef.current;const sent=typeof payload.body==='string'?payload.body:null;try{
  const response=await fetch('/api/demo/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload.action==='status'?payload:{...payload,requestId:requests.current.idFor(payload)})});const body=await response.json();if(!response.ok)throw Error(body.error??'Could not save feedback.');
  requests.current.clear();if(sent!==null)clearDraft(path,sent);
  // Only follow the saved thread if the reviewer is still where they submitted from.
  const unchanged=ctxRef.current.anchor===started.anchor&&ctxRef.current.selected===started.selected;
  if(unchanged){
   if(sent!==null){const rest=remainderAfterSave(valueRef.current,sent);draft.reset();if(rest.trim())draft.setValue(rest);}
   setAnchor(null);setSelected(body.id);
  }
  await load();
 }catch(e){setError(e instanceof TypeError?'Could not reach the server. Your comment is kept on this device; try again when you are back online.':e instanceof Error?e.message:'Could not save feedback.');}finally{setSaving(false);}}
 const current=threads.find(t=>t.id===selected);
 return <div data-feedback-ui data-feedback-open={open||pinning?true:undefined}>
  {!open&&!pinning&&<button type="button" onClick={()=>setOpen(true)} aria-label="Open prototype feedback" className="ui-primary-button fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm shadow-lg"><MessageCircle size={17} aria-hidden="true"/>Feedback</button>}
  {pinning&&<><div className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3 text-sm text-white shadow-lg"><span className="inline-flex items-center gap-2"><MousePointer2 size={17} aria-hidden="true"/>Click a part of the page to comment. Esc to cancel.</span><button type="button" aria-label="Cancel pinning" className="pointer-events-auto" onClick={()=>{setPinning(false);setOpen(true);setHover(null);}}><X size={18}/></button></div>
   {hover&&<div className="pointer-events-none fixed z-[60] rounded-sm border-2 border-accent bg-accent/5" style={hover}/>}</>}
  {open&&<>
   {visible.map((thread,index)=>positions[thread.id]&&<button key={thread.id} type="button" aria-label={`Open feedback ${index+1}: ${thread.anchor.label}`} onClick={()=>switchThread(thread.id)}
    className="fixed z-40 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-accent text-xs font-semibold text-white shadow-md" style={positions[thread.id]}>{index+1}</button>)}
   <aside role="complementary" aria-label="Prototype feedback" className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-sm flex-col border-l border-line bg-panel text-foreground shadow-xl">
    <div className="border-b border-line p-4"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><MessageCircle size={18} className="text-accent" aria-hidden="true"/>POC feedback</h2><button type="button" aria-label="Close feedback" onClick={()=>setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-hover"><X size={18}/></button></div>
     <p className="mt-1 text-xs text-muted">Leave a note for this page, or pin it to a specific element.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>newComment(true)} className="ui-primary-button inline-flex items-center gap-2 px-3 py-2 text-sm"><MousePointer2 size={15} aria-hidden="true"/>Pin a comment</button><button type="button" onClick={()=>newComment(false)} className="ui-button inline-flex items-center gap-2 px-3 py-2 text-sm"><Plus size={15} aria-hidden="true"/>Page comment</button></div>
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
     {restored&&!error&&(anchor||current)&&<p role="status" className="rounded-md bg-surface p-3 text-xs text-muted">Restored your unsent comment from this device.</p>}
     {error&&<p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
     {!anchor&&!current&&<><label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showResolved} onChange={e=>setShowResolved(e.target.checked)}/>Show resolved</label>
      {visible.map((thread,index)=><button key={thread.id} type="button" onClick={()=>switchThread(thread.id)} className="block w-full rounded-lg border border-line p-3 text-left hover:bg-surface-hover"><span className="flex items-center gap-2 text-xs font-medium text-accent"><span>{index+1}</span><span className="truncate">{thread.anchor.label}</span>{thread.status==='resolved'&&<Check size={14} className="ml-auto text-success" aria-label="Resolved"/>}</span>
       <span className="mt-2 block whitespace-pre-wrap text-sm leading-6">{thread.comments[thread.comments.length-1]?.body.slice(0,200)}</span><span className="mt-2 block text-xs text-muted">{thread.comments[thread.comments.length-1]?.author_name} · {thread.comments.length} comment{thread.comments.length===1?'':'s'}</span></button>)}
      {hasMoreThreads&&<p className="text-xs leading-5 text-muted">Showing the 100 most recently updated threads on this page. Export the workspace feedback to see the rest.</p>}
      {!visible.length&&<p className="py-5 text-sm leading-6 text-muted">{loading?'Loading feedback…':'No comments on this page yet. Add a note or pin one to the interface.'}</p>}</>}
     {(anchor||current)&&<>
      <button type="button" onClick={()=>switchThread('')} className="text-xs text-accent">All page comments</button>
      <div className="rounded-md bg-surface p-3 text-sm"><p className="font-medium">{(anchor??current?.anchor)?.label}</p>{(anchor??current?.anchor)?.quote&&<blockquote className="mt-2 border-l-2 border-accent/30 pl-3 text-xs leading-5 text-muted">{(anchor??current?.anchor)?.quote}</blockquote>}
       {current&&<button type="button" onClick={()=>findAnchor(current.anchor)?.scrollIntoView({behavior:'auto',block:'center'})} className="mt-2 inline-flex items-center gap-1 text-xs text-accent"><LocateFixed size={14} aria-hidden="true"/>Locate on page</button>}</div>
      {current&&(current.comment_count??0)>current.comments.length&&<p className="text-xs leading-5 text-muted">Showing the latest {current.comments.length} of {current.comment_count} comments. Export the workspace feedback for the full history.</p>}
      {current?.comments.map(comment=><article key={comment.id} className="border-b border-line pb-4"><p className="text-xs font-medium">{comment.author_name}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p><time className="mt-2 block text-xs text-muted" dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short'})}</time></article>)}
      {current&&<button type="button" disabled={saving} onClick={()=>void mutate({action:'status',threadId:current.id,status:current.status==='open'?'resolved':'open'})} className="ui-button inline-flex items-center gap-2 px-3 py-2 text-xs"><Check size={14} aria-hidden="true"/>{current.status==='open'?'Resolve thread':'Reopen thread'}</button>}
      <form onSubmit={event=>{event.preventDefault();if(!draft.value.trim())return;void mutate(anchor?{action:'create',path,anchor,body:draft.value}:{action:'reply',threadId:selected,body:draft.value});}} className="space-y-3">
       <label className="block text-sm font-medium" htmlFor="prototype-feedback-body">{anchor?'Your comment':'Reply'}</label><textarea id="prototype-feedback-body" ref={textarea} value={draft.value} onChange={e=>draft.setValue(e.target.value)} rows={4} maxLength={3000} required className="ui-input w-full px-3 py-2 text-sm" placeholder="What should we change here?"/>
       <button type="submit" disabled={saving||!draft.value.trim()} className="ui-primary-button inline-flex items-center gap-2 px-3 py-2 text-sm"><CornerDownRight size={15} aria-hidden="true"/>{saving?'Saving…':anchor?'Post comment':'Post reply'}</button>
      </form>
     </>}
    </div><div className="space-y-3 border-t border-line p-4"><a href="/api/demo/feedback/export?status=all&complete=1" download className="ui-button inline-flex items-center gap-2 px-3 py-2 text-xs"><Download size={14} aria-hidden="true"/>Export workspace feedback</a><p className="text-xs leading-5 text-muted">Private prototype feedback, saved to this demo workspace. No message is sent to customers.</p></div>
   </aside>
  </>}
 </div>;
}
