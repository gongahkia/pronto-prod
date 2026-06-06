"use client";

import {
  Bot,
  Check,
  ChevronDown,
  ExternalLink,
  History,
  Loader2,
  MessageSquareText,
  Send,
  Wand2,
  X,
} from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  body: string;
  metadata?: {
    citedRecords?: AssistantCitation[];
    followUpQuestions?: string[];
    nextActions?: AssistantNextAction[];
    result?: {
      nextActions?: AssistantNextAction[];
    };
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
  payload: Record<string, unknown>;
  status: "pending" | "confirmed" | "executed" | "failed" | "cancelled";
  requires_typed_confirmation: string | null;
  result?: {
    nextActions?: AssistantNextAction[];
  } | null;
  error?: string | null;
};

type AssistantNextAction = {
  label: string;
  href?: string;
  prompt?: string;
  proposal?: {
    actionType: string;
    title: string;
    description: string;
    payload: Record<string, unknown>;
  };
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
  const [editedPayloads, setEditedPayloads] = useState<Record<string, Record<string, unknown>>>({});
  const [payloadErrors, setPayloadErrors] = useState<Record<string, string>>({});
  const [payloadJsonDrafts, setPayloadJsonDrafts] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isOperator = typeof window !== "undefined" && window.location.pathname.startsWith("/operator");

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

  useEffect(() => {
    function handlePrompt(event: Event) {
      const prompt = (event as CustomEvent<string>).detail;
      if (typeof prompt !== "string" || !prompt.trim()) {
        return;
      }
      setInput(prompt);
      inputRef.current?.focus();
    }

    window.addEventListener("pronto-assistant-prompt", handlePrompt);
    return () => window.removeEventListener("pronto-assistant-prompt", handlePrompt);
  }, []);

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
    setEditedPayloads(
      Object.fromEntries(
        body.proposals.map((proposal) => [proposal.id, proposal.payload ?? {}]),
      ),
    );
    setPayloadJsonDrafts(
      Object.fromEntries(
        body.proposals.map((proposal) => [
          proposal.id,
          JSON.stringify(proposal.payload ?? {}, null, 2),
        ]),
      ),
    );
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
      setEditedPayloads((current) => ({
        ...current,
        ...Object.fromEntries(
          (body.proposals ?? []).map((proposal: AssistantProposal) => [
            proposal.id,
            proposal.payload ?? {},
          ]),
        ),
      }));
      setPayloadJsonDrafts((current) => ({
        ...current,
        ...Object.fromEntries(
          (body.proposals ?? []).map((proposal: AssistantProposal) => [
            proposal.id,
            JSON.stringify(proposal.payload ?? {}, null, 2),
          ]),
        ),
      }));
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
          editedPayload: editedPayloads[proposal.id] ?? proposal.payload ?? {},
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

  function updatePayloadField(
    proposalId: string,
    field: string,
    value: unknown,
  ) {
    setEditedPayloads((current) => ({
      ...current,
      [proposalId]: {
        ...(current[proposalId] ?? {}),
        [field]: value,
      },
    }));
    setPayloadErrors((current) => ({ ...current, [proposalId]: "" }));
    setPayloadJsonDrafts((current) => ({
      ...current,
      [proposalId]: JSON.stringify(
        {
          ...(editedPayloads[proposalId] ?? {}),
          [field]: value,
        },
        null,
        2,
      ),
    }));
  }

  function updatePayloadJson(proposalId: string, value: string) {
    setPayloadJsonDrafts((current) => ({ ...current, [proposalId]: value }));
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Payload must be a JSON object.");
      }
      setEditedPayloads((current) => ({
        ...current,
        [proposalId]: parsed as Record<string, unknown>,
      }));
      setPayloadErrors((current) => ({ ...current, [proposalId]: "" }));
    } catch (caught) {
      setPayloadErrors((current) => ({
        ...current,
        [proposalId]: caught instanceof Error ? caught.message : "Invalid JSON.",
      }));
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
              setEditedPayloads({});
              setPayloadJsonDrafts({});
              setPayloadErrors({});
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
            {isOperator
              ? "Ask for portfolio risk, SLA breaches, quality issues, client status, or proposed fixes. I will show data-changing actions for review first."
              : "Ask what customers need, what Pronto handled, what needs your reply, or what business knowledge should be updated. I will show any change for review first."}
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
              <ActionPayloadEditor
                proposal={proposal}
                payload={editedPayloads[proposal.id] ?? proposal.payload ?? {}}
                jsonValue={
                  payloadJsonDrafts[proposal.id] ??
                  JSON.stringify(editedPayloads[proposal.id] ?? proposal.payload ?? {}, null, 2)
                }
                error={payloadErrors[proposal.id]}
                onFieldChange={updatePayloadField}
                onJsonChange={updatePayloadJson}
              />
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
                disabled={busy || Boolean(payloadErrors[proposal.id])}
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
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={isOperator ? "Ask about ops..." : "Ask about your customers..."}
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
  const nextActions =
    message.metadata?.nextActions ?? message.metadata?.result?.nextActions ?? [];
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
            {citations.map((citation, index) =>
              citation.href ? (
                <a
                  key={`${citation.type}:${citation.id}:${index}`}
                  href={citation.href}
                  className="rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-link"
                >
                  {citation.label}
                </a>
              ) : (
                <span
                  key={`${citation.type}:${citation.id}:${index}`}
                  className="rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-muted"
                >
                  {citation.label}
                </span>
              ),
            )}
          </div>
        ) : null}
        {!isUser && nextActions.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {nextActions.map((action) =>
              action.href ? (
                <a
                  key={`${message.id}:${action.label}`}
                  href={action.href}
                  className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-link"
                >
                  {action.label}
                  <ExternalLink size={11} />
                </a>
              ) : action.prompt || action.proposal ? (
                <button
                  key={`${message.id}:${action.label}`}
                  type="button"
                  onClick={() => {
                    const prompt =
                      action.prompt ??
                      `Propose this action for review: ${action.proposal?.title}\n${action.proposal?.description}\nPayload:\n${JSON.stringify(action.proposal?.payload ?? {}, null, 2)}`;
                    const event = new CustomEvent("pronto-assistant-prompt", {
                      detail: prompt,
                    });
                    window.dispatchEvent(event);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-1 text-[11px] font-medium text-link"
                >
                  <Wand2 size={11} />
                  {action.label}
                </button>
              ) : null,
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActionPayloadEditor({
  proposal,
  payload,
  jsonValue,
  error,
  onFieldChange,
  onJsonChange,
}: {
  proposal: AssistantProposal;
  payload: Record<string, unknown>;
  jsonValue: string;
  error?: string;
  onFieldChange: (proposalId: string, field: string, value: unknown) => void;
  onJsonChange: (proposalId: string, value: string) => void;
}) {
  const action = proposal.action_type;

  if (action === "escalation_resolve") {
    return (
      <PayloadSection>
        <TextAreaField
          label="Customer reply"
          value={stringValue(payload.reply)}
          rows={4}
          onChange={(value) => onFieldChange(proposal.id, "reply", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "knowledge_refresh_create") {
    return (
      <PayloadSection>
        <InputField
          label="Cadence"
          value={stringValue(payload.cadence) || "monthly"}
          onChange={(value) => onFieldChange(proposal.id, "cadence", value)}
        />
        <TextAreaField
          label="Notes"
          value={stringValue(payload.notes)}
          rows={3}
          onChange={(value) => onFieldChange(proposal.id, "notes", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "assistant_request_create") {
    return (
      <PayloadSection>
        <SelectField
          label="Kind"
          value={stringValue(payload.kind) || "assistant_change"}
          options={["assistant_change", "handoff_rule", "tone", "scope", "other"]}
          onChange={(value) => onFieldChange(proposal.id, "kind", value)}
        />
        <TextAreaField
          label="Request"
          value={stringValue(payload.body)}
          rows={4}
          onChange={(value) => onFieldChange(proposal.id, "body", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "knowledge_create" || action === "knowledge_update") {
    return (
      <PayloadSection>
        <InputField
          label="Title"
          value={stringValue(payload.title)}
          onChange={(value) => onFieldChange(proposal.id, "title", value)}
        />
        <TextAreaField
          label="Content"
          value={stringValue(payload.content)}
          rows={5}
          onChange={(value) => onFieldChange(proposal.id, "content", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "review_create") {
    return (
      <PayloadSection>
        <SelectField
          label="Answer label"
          value={stringValue(payload.answerLabel) || "answered_correctly"}
          options={[
            "answered_correctly",
            "should_have_escalated",
            "over_escalated",
            "hallucinated",
            "needs_knowledge_update",
          ]}
          onChange={(value) => onFieldChange(proposal.id, "answerLabel", value)}
        />
        <TextAreaField
          label="Notes"
          value={stringValue(payload.notes)}
          rows={3}
          onChange={(value) => onFieldChange(proposal.id, "notes", value)}
        />
        <CheckboxField
          label="Knowledge update needed"
          checked={payload.knowledgeUpdateNeeded === true}
          onChange={(value) => onFieldChange(proposal.id, "knowledgeUpdateNeeded", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "client_create") {
    return (
      <PayloadSection>
        <InputField
          label="Name"
          value={stringValue(payload.name)}
          onChange={(value) => onFieldChange(proposal.id, "name", value)}
        />
        <InputField
          label="Vertical"
          value={stringValue(payload.vertical)}
          onChange={(value) => onFieldChange(proposal.id, "vertical", value)}
        />
        <SelectField
          label="Status"
          value={stringValue(payload.status) || "draft"}
          options={["draft", "pilot", "live", "paused"]}
          onChange={(value) => onFieldChange(proposal.id, "status", value)}
        />
      </PayloadSection>
    );
  }

  if (action === "commercial_update") {
    return (
      <PayloadSection>
        {[
          "monthlyRetainerSgd",
          "setupFeeSgd",
          "hostingCostSgd",
          "integrationCostSgd",
          "includedConversations",
        ].map((field) => (
          <InputField
            key={field}
            label={field}
            type="number"
            value={stringValue(payload[field])}
            onChange={(value) => onFieldChange(proposal.id, field, Number(value))}
          />
        ))}
      </PayloadSection>
    );
  }

  return (
    <PayloadSection>
      <TextAreaField
        label="Payload JSON"
        value={jsonValue}
        rows={6}
        onChange={(value) => onJsonChange(proposal.id, value)}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </PayloadSection>
  );
}

function PayloadSection({ children }: { children: ReactNode }) {
  return <div className="mt-3 space-y-2 rounded-md border border-line bg-panel p-2">{children}</div>;
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-foreground"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full resize-y rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-foreground"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-foreground"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}
