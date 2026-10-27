import {z} from 'zod';
import {feedbackAnchor} from './schema';
import type {FeedbackAnchor} from './types';

// One unsent comment per prototype page, kept on this device so a reload, crash or offline save cannot lose it.
export type DraftTarget={kind:'anchor';anchor:FeedbackAnchor}|{kind:'thread';threadId:string};
export type StoredDraft={target:DraftTarget;body:string};
const MAX_AGE_MS=14*24*60*60*1000;
const stored=z.object({
 v:z.literal(1),savedAt:z.number(),body:z.string().max(3000),
 target:z.discriminatedUnion('kind',[z.object({kind:z.literal('anchor'),anchor:feedbackAnchor.partial({quote:true})}),z.object({kind:z.literal('thread'),threadId:z.string().uuid()})]),
});
const keyFor=(path:string)=>`pronto:feedback-draft:v1:${path}`;
function store(){try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}}

export function loadDraft(path:string,now=Date.now()):StoredDraft|null{
 const s=store();if(!s)return null;
 try{
  const raw=s.getItem(keyFor(path));if(!raw)return null;
  const parsed=stored.safeParse(JSON.parse(raw));
  if(!parsed.success||!parsed.data.body.trim()||now-parsed.data.savedAt>MAX_AGE_MS){s.removeItem(keyFor(path));return null;}
  const target=parsed.data.target.kind==='anchor'?{kind:'anchor' as const,anchor:{...parsed.data.target.anchor,quote:parsed.data.target.anchor.quote??''}}:parsed.data.target;
  return {target,body:parsed.data.body};
 }catch{return null;}
}
export function saveDraft(path:string,draft:StoredDraft,now=Date.now()){
 const s=store();if(!s)return;
 try{s.setItem(keyFor(path),JSON.stringify({v:1,savedAt:now,...draft}));}catch{/* quota or private mode: the in-memory draft still works */}
}
// With onlyBody, another tab's newer draft for the same page is left alone.
export function clearDraft(path:string,onlyBody?:string){
 const s=store();if(!s)return;
 try{
  if(onlyBody!==undefined){const raw=s.getItem(keyFor(path));if(!raw)return;try{if(JSON.parse(raw).body!==onlyBody)return;}catch{/* unreadable: remove it */}}
  s.removeItem(keyFor(path));
 }catch{/* ignore */}
}
// Text typed while a save was in flight stays; the part that was just submitted is removed.
export function remainderAfterSave(current:string,sent:string){
 return current.startsWith(sent)?current.slice(sent.length).trimStart():current;
}
