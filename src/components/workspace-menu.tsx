'use client';
import { useEffect,useId,useRef,useState,type ReactNode } from 'react';
import { BrainCircuit,ChevronDown,Download,MessageSquare,RefreshCw,X } from 'lucide-react';
import type { UsageSummary } from '@/lib/analytics/types';
const number=(value:number)=>value.toLocaleString('en-SG');
export function WorkspaceMenu({name,email,children,className}:{name:string;email:string;children:ReactNode;className:string}) {
 const dialog=useRef<HTMLDialogElement>(null);const heading=useId();const [open,setOpen]=useState(false);
 const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7));const [version,setVersion]=useState(0);
 const [data,setData]=useState<UsageSummary|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{
  if(!open)return;const abort=new AbortController();
  async function load(){setLoading(true);setError('');setData(null);
   try{const response=await fetch(`/api/client/usage?month=${encodeURIComponent(month)}`,{cache:'no-store',signal:abort.signal});
    const body=await response.json();if(!response.ok)throw Error(body.error??'Could not load workspace usage.');setData(body);
   }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Could not load usage.');}
   finally{if(!abort.signal.aborted)setLoading(false);}}
  void load();return()=>abort.abort();
 },[month,open,version]);
 return <>
  <button type="button" aria-label="Open workspace and usage" aria-haspopup="dialog" className={className}
   onClick={()=>{dialog.current?.showModal();setOpen(true);}}>{children}<ChevronDown size={15} className="ml-auto shrink-0 text-muted" aria-hidden="true"/></button>
  <dialog ref={dialog} aria-labelledby={heading} onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}
   className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-xl border border-line bg-panel p-0 text-foreground shadow-xl backdrop:bg-black/35">
   <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-panel p-5">
    <div><h2 id={heading} className="text-lg font-semibold">Workspace & usage</h2><p className="mt-1 text-sm font-medium">{name}</p><p className="mt-1 break-all text-xs text-muted">{email}</p></div>
    <div className="flex shrink-0 items-center gap-2"><a href={`/api/client/usage?month=${encodeURIComponent(month)}&format=csv`} download aria-label="Export usage CSV" title="Export usage CSV" className="ui-button inline-flex items-center gap-2 px-3 py-2 text-sm"><Download size={15} aria-hidden="true"/><span className="hidden sm:inline">Export CSV</span></a>
    <button type="button" aria-label="Close workspace menu" onClick={()=>dialog.current?.close()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover"><X size={19} aria-hidden="true"/></button></div>
   </div>
   <div className="space-y-5 p-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><label className="text-sm font-medium">Usage month<input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}} className="ui-input mt-1 block px-3 py-2"/></label>
     <button type="button" onClick={()=>setVersion(v=>v+1)} disabled={loading} className="ui-button inline-flex items-center gap-2 px-3 py-2 text-sm"><RefreshCw size={15} className={loading?'animate-spin':''} aria-hidden="true"/>Refresh</button></div>
    {loading&&<p role="status" className="py-6 text-sm text-muted">Loading metered usage…</p>}
    {error&&<p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
    {data&&<>
     <div className="grid gap-3 sm:grid-cols-3">
      <UsageStat icon={<MessageSquare size={16}/>} label="Pronto replies" value={number(data.deliveredReplies)} help="Delivered to customers"/>
      <UsageStat icon={<BrainCircuit size={16}/>} label="Model calls" value={number(data.generationCalls)} help="Reply decisions + internal work"/>
      <UsageStat icon={<RefreshCw size={16}/>} label="Internal work" value={number(data.internalCalls)} help="Planning, intake and analytics"/>
     </div>
     <section><h3 className="text-sm font-semibold">Provider-reported tokens</h3><dl className="mt-3 divide-y divide-line text-sm">
      <UsageRow label="Input tokens" value={number(data.providerInputTokens)}/><UsageRow label="Output tokens" value={number(data.providerOutputTokens)}/>
      <UsageRow label="Reasoning tokens · included in output" value={data.reasoningReportedCalls?number(data.reasoningTokens):'Not reported'}/>
     </dl><p className="mt-2 text-xs leading-5 text-muted">Reasoning usage reported for {data.reasoningReportedCalls} of {data.generationCalls} model calls. Missing detail is unknown, rather than zero. Output already includes reported reasoning tokens.</p></section>
     <section><h3 className="text-sm font-semibold">What used your allowance</h3><div className="mt-3 divide-y divide-line">{data.breakdown.map(row=><div key={row.purpose} className="flex justify-between gap-3 py-2 text-sm"><span>{row.purpose}{row.estimatedCalls>0&&<span className="ml-2 text-xs text-muted">{row.estimatedCalls} estimated</span>}</span><span className="tabular-nums">{number(row.calls)} calls</span></div>)}</div>
      {!data.breakdown.length&&<p className="mt-2 text-sm text-muted">No recorded model calls this month.</p>}
      {data.embeddingCalls>0&&<p className="mt-2 text-xs text-muted">Includes {data.embeddingCalls} knowledge-retrieval calls, separate from generation.</p>}</section>
     {data.estimatedCalls>0&&<p className="rounded-md bg-surface p-3 text-xs leading-5 text-muted">{data.estimatedCalls} calls have estimated usage ({number(data.estimatedInputTokens)} input / {number(data.estimatedOutputTokens)} output tokens). These are excluded from provider-reported totals.</p>}
     <p className="text-xs leading-5 text-muted">Metered usage for {month}, in UTC. Each delivered reply is counted once; internal calls are tracked separately. This is a usage statement. Billing rates have not been configured.</p>
    </>}
   </div>
  </dialog>
 </>;
}
function UsageStat({icon,label,value,help}:{icon:ReactNode;label:string;value:string;help:string}) {return <div className="rounded-lg border border-line p-4"><p className="flex items-center gap-2 text-xs text-muted"><span className="text-accent" aria-hidden="true">{icon}</span>{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs leading-5 text-muted">{help}</p></div>;}
function UsageRow({label,value}:{label:string;value:string}){return <div className="flex justify-between gap-4 py-2"><dt className="text-muted">{label}</dt><dd className="shrink-0 font-medium tabular-nums">{value}</dd></div>;}
