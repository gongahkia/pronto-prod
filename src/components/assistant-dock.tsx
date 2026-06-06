"use client";

import { Bot, Check, ChevronDown, History, Loader2, MessageSquareText, Send, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  body: string;
  metadata?: {
    citedRecords?: AssistantCitation[];
    followUpQuestions?: string[];
  };
};

type AssistantCitation = {
  type: string;
  id: string;
  label: string;
  href?: string;
};

type AssistantThread = {
  id: string;
  title: string;
  updated_at: string;
};

type AssistantProposal = {
  id: string;
  action_type: string;
  title: string;
  description: string;
  status: "pending" | "confirmed" | "executed" | "failed" | "cancelled";
  requires_typed_confirmation: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
};

export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [proposals, setProposals] = useState<AssistantProposal[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const pendingProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === "pending"),
    [proposals],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadThreads();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, proposals.length, busy]);

  async function loadThreads() {
    const response = await fetch("/api/assistant/threads", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const body = (await response.json()) as { threads: AssistantThread[] };
    setThreads(body.threads);
  }

  async function loadThread(nextThreadId: string) {
    const response = await fetch(`/api/assistant/threads?threadId=${nextThreadId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }
    const body = (await response.json()) as {
      messages: AssistantMessage[];
      proposals: AssistantProposal[];
    };
    setThreadId(nextThreadId);
    setMessages(body.messages);
    setProposals(body.proposals);
    setError(null);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInput("");
    setMessages((current) => [
      ...current,
      { id: `optimistic-${Date.now()}`, role: "user", body: message },
    ]);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          threadId,
          pagePath: `${window.location.pathname}${window.location.search}`,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Assistant failed.");
      }
      setThreadId(body.threadId);
      setMessages((current) => [
        ...current.filter((item) => !item.id.startsWith("optimistic-")),
        { id: `sent-${Date.now()}`, role: "user", body: message },
        body.message,
      ]);
      setProposals((current) => [...current, ...(body.proposals ?? [])]);
      void loadThreads();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assistant failed.");
      setMessages((current) => current.filter((item) => !item.id.startsWith("optimistic-")));
    } finally {
      setBusy(false);
    }
  }

  async function confirmProposal(proposal: AssistantProposal) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assistant/actions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          confirmationText: confirmText[proposal.id] ?? "",
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Action failed.");
      }
      setProposals((current) =>
        current.map((item) =>
          item.id === proposal.id
            ? { ...item, status: "executed", result: body.result }
            : item,
        ),
      );
      setMessages((current) => [...current, body.message]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-white shadow-[0_16px_40px_rgba(33,49,131,0.22)] transition hover:bg-accent-dark"
        aria-label="Open Pronto assistant"
      >
        <Bot size={20} />
      </button>
    );
  }

  return (
    <section className="fixed bottom-5 right-5 z-40 flex h-[min(720px,calc(100vh-40px))] w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <Bot size={17} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Pronto assistant</h2>
            <p className="text-xs text-muted">Ask, inspect, then confirm actions.</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setThreadId(null);
              setMessages([]);
              setProposals([]);
              setError(null);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
            aria-label="New assistant chat"
            title="New chat"
          >
            <MessageSquareText size={16} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
            aria-label="Close assistant"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {threads.length > 0 ? (
        <details className="border-b border-line bg-surface-subtle px-4 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted">
            <span className="flex items-center gap-1.5">
              <History size={13} />
              Recent chats
            </span>
            <ChevronDown size={14} />
          </summary>
          <div className="mt-2 grid gap-1">
            {threads.slice(0, 6).map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => void loadThread(thread.id)}
                className={`truncate rounded-md px-2 py-1.5 text-left text-xs ${
                  thread.id === threadId
                    ? "bg-accent-soft text-link"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                {thread.title}
              </button>
            ))}
          </div>
        </details>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
            Ask for portfolio risk, client status, knowledge gaps, conversation summaries,
            or proposed fixes. I will show any data-changing action for confirmation first.
          </div>
        ) : null}

        <div className="space-y-3">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {pendingProposals.map((proposal) => (
            <div key={proposal.id} className="rounded-lg border border-line bg-surface p-3">
              <p className="text-xs font-medium text-muted">{proposal.action_type}</p>
              <h3 className="mt-1 text-sm font-semibold">{proposal.title}</h3>
              <p className="mt-1 text-sm text-muted">{proposal.description}</p>
              {proposal.requires_typed_confirmation ? (
                <label className="mt-3 block text-xs text-muted">
                  Type {proposal.requires_typed_confirmation} to confirm
                  <input
                    value={confirmText[proposal.id] ?? ""}
                    onChange={(event) =>
                      setConfirmText((current) => ({
                        ...current,
                        [proposal.id]: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => void confirmProposal(proposal)}
                disabled={busy}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
              >
                <Check size={14} />
                Confirm
              </button>
            </div>
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={15} className="animate-spin" />
              Working
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      {error ? (
        <p className="border-t border-line px-4 py-2 text-sm text-danger">{error}</p>
      ) : null}

      <form onSubmit={sendMessage} className="border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask Pronto..."
            rows={2}
            className="min-h-10 flex-1 resize-none rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-dark disabled:opacity-50"
            aria-label="Send assistant message"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </section>
  );
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";
  const citations = message.metadata?.citedRecords ?? [];
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-accent text-white"
            : message.role === "system"
              ? "border border-line bg-surface text-muted"
              : "bg-surface text-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        {!isUser && citations.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {citations.map((citation) =>
              citation.href ? (
                <a
                  key={`${citation.type}:${citation.id}`}
                  href={citation.href}
                  className="rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-link"
                >
                  {citation.label}
                </a>
              ) : (
                <span
                  key={`${citation.type}:${citation.id}`}
                  className="rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-muted"
                >
                  {citation.label}
                </span>
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
