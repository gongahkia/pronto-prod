'use client';
import {useEffect,useState} from 'react';
export const DEMO_MESSAGE_QUEUED='pronto:demo-message-queued';
export function DemoQueuePump(){
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true,pending=false;let timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
  async function tick(){
   if(!active||pending)return;
   if(document.visibilityState!=='visible'){timer=setTimeout(()=>void tick(),15000);return;}
   pending=true;clearTimeout(timer);
   try{const response=await fetch('/api/demo/process',{method:'POST',signal:abort.signal,cache:'no-store'});
    if(!response.ok)throw Error('Processing is temporarily unavailable. Your messages are saved; this page will retry.');
    const result=await response.json();if(active)setError('');
    if(active)timer=setTimeout(()=>void tick(),result.processed||result.delivered||result.busy?2500:15000);
   }catch(failure){if(active){setError(failure instanceof Error?failure.message:'Processing is unavailable.');timer=setTimeout(()=>void tick(),15000);}}
   finally{pending=false;}
  }
  const wake=()=>{if(active&&!pending){clearTimeout(timer);void tick();}};
  timer=setTimeout(()=>void tick(),0);window.addEventListener(DEMO_MESSAGE_QUEUED,wake);document.addEventListener('visibilitychange',wake);
  return()=>{active=false;clearTimeout(timer);abort.abort();window.removeEventListener(DEMO_MESSAGE_QUEUED,wake);document.removeEventListener('visibilitychange',wake);};
 },[]);
 return error?<p role="status" className="fixed inset-x-4 bottom-20 z-30 mx-auto max-w-xl rounded-lg border border-line bg-warning-bg px-4 py-3 text-sm text-foreground">{error}</p>:null;
}
