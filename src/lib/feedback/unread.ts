import type {FeedbackThread} from './types';

// Remembers, per browser, the latest comment of each thread this reviewer has looked at, so comments other
// reviewers add afterwards can be flagged as new without a server-side read-state table.
export type SeenMap=Record<string,string>;
const KEY='pronto:feedback-seen:v1';
function store(){try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}}

export function loadSeen():SeenMap|null{
 const s=store();if(!s)return null;
 try{const raw=s.getItem(KEY);if(!raw)return null;const parsed=JSON.parse(raw);
  return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?Object.fromEntries(Object.entries(parsed).filter(([,v])=>typeof v==='string')) as SeenMap:null;}catch{return null;}
}
export function saveSeen(seen:SeenMap){const s=store();if(!s)return;try{s.setItem(KEY,JSON.stringify(seen));}catch{/* private mode: unread flags just reset on reload */}}

export const latestCommentId=(thread:FeedbackThread)=>thread.comments[thread.comments.length-1]?.id??'';
export function baseline(threads:FeedbackThread[]):SeenMap{return Object.fromEntries(threads.map(t=>[t.id,latestCommentId(t)]));}

// A thread is new when its latest comment is by someone else and differs from the one last seen.
export function isUnread(thread:FeedbackThread,seen:SeenMap,viewerId:string){
 const latest=thread.comments[thread.comments.length-1];
 return Boolean(latest)&&latest.author_user_id!==viewerId&&seen[thread.id]!==latest.id;
}
