"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, RefreshCw, MessageCircle } from "lucide-react";

type State = {
  now: string;
  sessions: { id: string; conversation_id: string; ai_mode: "real" | "mock"; created_at: string }[];
  realAi: { available: boolean; detail: string; provider?: string; model?: string };
  session: { id: string; conversation_id: string; ai_mode: "real" | "mock"; status: string } | null;
  messages: { id: string; body: string; sender: string; created_at: string; generation_mode: string | null }[];
  job: { status: string; created_at: string; delivery_status?: string | null } | null;
  providerError: boolean;
};

function MessageText({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part)
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline">{part}</a>
    : <span key={index}>{part}</span>)}</>;
}

async function demoRequest(path: string, body?: unknown) {
  const response = await fetch(path, { ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The demo request failed.");
  return data;
}

export function CustomerSimulator() {
  const [state, setState] = useState<State | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [mode, setMode] = useState<"real" | "mock">("real");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const retry = useRef<{ text: string; requestId: string; sessionId: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const value = await demoRequest(`/api/demo/customer${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`);
      if (version === requestVersion.current) setState(value);
    } catch (failure) {
      if (version === requestVersion.current) setError(failure instanceof Error ? failure.message : "Could not load the conversation.");
    }
  }, [sessionId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 2500);
    return () => { window.clearInterval(timer); window.clearTimeout(initial); };
  }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [state?.messages.length]);
  const start = async () => {
    if (loading || sending) return;
    setLoading(true); setError("");
    try {
      const session = await demoRequest("/api/demo/customer", { action: "create", mode });
      ++requestVersion.current;
      retry.current = null; setText(""); setSessionId(session.id); setState(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not start a conversation."); }
    finally { setLoading(false); }
  };
  const send = async () => {
    if (!sessionId || state?.session?.id !== sessionId || !text.trim() || loading || sending) return;
    const pending = retry.current && retry.current.sessionId === sessionId && retry.current.text === text.trim()
      ? retry.current : { text: text.trim(), requestId: crypto.randomUUID(), sessionId };
    retry.current = pending; setSending(true); setError("");
    try {
      await demoRequest("/api/demo/customer", { action: "send", ...pending });
      retry.current = null; setText(""); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Send failed. Retry uses the same message ID."); }
    finally { setSending(false); }
  };
  const retryProcessing = async () => {
    setSending(true); setError("");
    try { await demoRequest("/api/demo/customer", { action: "retry", sessionId }); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Retry failed."); }
    finally { setSending(false); }
  };
  const processing = state?.job && ["pending", "processing", "failed"].includes(state.job.status);
  const deliveryPending = state?.job?.status === "completed" && ["pending", "sending"].includes(state.job.delivery_status ?? "");
  const delayed = processing && Date.parse(state!.now) - Date.parse(state!.job!.created_at) > 120_000;
  const humanOwned = state?.session && state.session.status !== "active";
  return <main className="min-h-screen bg-surface px-3 py-5 text-foreground sm:px-6">
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-accent">Pronto • unofficial POC</p>
          <h1 className="text-xl font-semibold">Simulated Instagram DM</h1></div>
        <Link href="/client/inbox" className="ui-button px-3 py-2 text-sm">Open business inbox</Link>
      </header>
      <p className="mb-4 text-sm text-muted">A synthetic conversation with the PS.Cafe Raffles City demo. This is not PS.Cafe’s Instagram account and sends no Instagram messages.</p>
      <div className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="ui-panel space-y-4 p-4">
          <label className="block text-sm font-medium">AI mode
            <select aria-label="AI mode" className="ui-input mt-2 w-full px-3 py-2" value={mode} onChange={event => setMode(event.target.value as "real" | "mock")}>
              <option value="real">Real AI</option><option value="mock">Mock • deterministic test</option>
            </select></label>
          <button className="ui-primary-button w-full px-3 py-2 text-sm" disabled={loading || sending} onClick={() => void start()}>{loading ? "Starting…" : "New conversation"}</button>
          {state?.realAi && <div className="rounded-md border border-line p-3 text-xs">
            <strong>Real AI {state.realAi.available ? "configured" : "unavailable"}</strong>
            <p className="mt-1 break-words text-muted">{state.realAi.detail}</p>
            {state.realAi.provider && <p className="mt-1">{state.realAi.provider} · {state.realAi.model}</p>}
          </div>}
          <nav aria-label="Your simulated conversations"><p className="mb-2 text-xs font-semibold text-muted">Your conversation history</p>
            {state?.sessions.map((session, index) => <button key={session.id} disabled={loading || sending} className={`mb-2 block w-full rounded-md border px-3 py-2 text-left text-sm ${sessionId === session.id ? "border-accent bg-accent-soft" : "border-line"}`}
              onClick={() => { ++requestVersion.current; retry.current = null; setText(""); setState(null); setSessionId(session.id); }}>
              Conversation {state.sessions.length - index}<span className="block text-xs text-muted">{session.ai_mode === "mock" ? "Mock test" : "Real AI requested"}</span></button>)}
          </nav>
        </aside>
        <section aria-label="Customer chat" className="ui-panel flex min-h-[34rem] min-w-0 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-4">
            <ArrowLeft size={19} aria-hidden="true"/><span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-lg font-semibold text-white">PS.</span>
            <div className="min-w-0"><h2 className="font-semibold">PS.Cafe Raffles City</h2><p className="text-xs text-muted">Unofficial restaurant demo</p></div>
          </div>
          {state?.session && <div className="border-b border-line bg-surface px-4 py-2 text-xs">
            {state.session.ai_mode === "mock" ? "Mock AI — deterministic test responses" : "Real AI requested — policy replies and handoffs may run before generation"}
            <span className="ml-2">{humanOwned ? "AI paused for your team" : "AI owns this conversation"}</span></div>}
          <div className="max-h-[32rem] flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite" aria-label="Message history">
            {!state?.session ? <div className="mx-auto mt-16 max-w-xs text-center text-sm text-muted"><MessageCircle className="mx-auto mb-3"/>
              Choose a mode and start a conversation, or reopen your saved history.</div> : null}
            {state?.messages.map(message => <div key={message.id} className={`flex ${message.sender === "customer" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm ${message.sender === "customer" ? "bg-accent text-white" : "border border-line bg-surface"}`}>
                <p className="mb-1 text-xs opacity-75">{message.sender === "customer" ? "You" : message.sender === "human" ? "Business team" : "Pronto assistant"}
                  {message.generation_mode === "real" ? " · real model response" : message.generation_mode === "mock" ? " · mock response" : ""}</p>
                <p className="whitespace-pre-wrap break-words leading-6"><MessageText text={message.body}/></p>
              </div></div>)}
            {(processing || deliveryPending) && <p role="status" className="text-sm text-muted">{delayed ? "Processing is taking longer than expected. Check status; your message is already saved." : "Pronto is processing your message…"}</p>}
            {state?.job?.status === "dead" && <div role="alert" className="text-sm text-danger">Processing stopped after retries. Your message is saved.
              <button className="ml-2 underline" disabled={sending} onClick={() => void retryProcessing()}>Retry processing</button></div>}
            {["failed", "uncertain"].includes(state?.job?.delivery_status ?? "") &&
              <p role="alert" className="text-sm text-danger">Your message is saved, but the reply has not been delivered. Refresh status or ask the business team to review delivery.</p>}
            {state?.providerError && <p role="alert" className="text-sm text-danger">The real AI provider could not answer. The enquiry was handed to the team; no mock answer was substituted.</p>}
            {humanOwned && <p className="rounded-md bg-warning-bg p-3 text-sm">{state?.session?.status === "closed" ? "Your team resolved this conversation. AI stays paused until an authorized release." : "A person is handling this conversation. Further messages are saved and AI stays paused."}</p>}
            <div ref={end}/>
          </div>
          {error && <div role="alert" className="border-t border-line bg-danger-bg p-3 text-sm text-danger">{error}
            <button className="ml-2 underline" onClick={() => { setError(""); if (retry.current) void send(); else void load(); }}>Retry</button></div>}
          <form className="flex gap-2 border-t border-line p-3" onSubmit={event => { event.preventDefault(); void send(); }}>
            <label className="sr-only" htmlFor="customer-message">Message PS.Cafe demo</label>
            <textarea id="customer-message" rows={2} maxLength={4000} value={text} onChange={event => setText(event.target.value)}
              disabled={loading || sending || !state?.session || state.session.id !== sessionId || state.session.status === "closed"} placeholder="Message the demo restaurant…" className="ui-input min-w-0 flex-1 resize-none rounded-xl px-3 py-2 text-sm"/>
            <button aria-label="Send message" className="ui-primary-button self-end px-3 py-3" disabled={loading || !text.trim() || sending || !!processing || !state?.session || state.session.id !== sessionId || state.session.status === "closed"}><Send size={18}/></button>
          </form>
          <button onClick={() => { setError(""); void load(); }} className="flex items-center justify-center gap-1 pb-3 text-xs text-muted"><RefreshCw size={12}/>Refresh status</button>
        </section>
      </div>
    </div>
  </main>;
}
