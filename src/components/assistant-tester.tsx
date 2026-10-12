"use client";

import { Loader2, Send } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { channelDefinition } from "@/lib/channels/catalog";
import type { ChannelKind, ChannelStatus } from "@/lib/types";
import { Badge } from "@/components/badge";

export type AssistantTesterChannel = {
  id: string;
  kind: ChannelKind;
  name: string;
  status: ChannelStatus;
};

type TesterMessage = {
  id: string;
  senderRole: "customer" | "agent" | "system";
  body: string;
  createdAt: Date;
  reasonCode?: string;
  action?: "answered" | "escalated";
};

type PreviewResponse = {
  action: "answered" | "escalated";
  responseText: string;
  reasonCode: string;
  reasonDetail: string;
  confidence: number;
};

type ChatTheme = {
  shell: string;
  header: string;
  body: string;
  incoming: string;
  outgoing: string;
  composer: string;
  accent: string;
  title: string;
};

const chatThemes: Record<Exclude<ChannelKind, "email">, ChatTheme> = {
  whatsapp: {
    shell: "border-[#d8d0bf] bg-[#f7f1e7]",
    header: "bg-[#f7f7f7] text-[#111b21]",
    body: "bg-[#efe7d8] [background-image:radial-gradient(#0000000b_1px,transparent_1px)] [background-size:18px_18px]",
    incoming: "rounded-bl-sm bg-white text-[#111b21] shadow-sm",
    outgoing: "rounded-br-sm bg-[#d9fdd3] text-[#111b21] shadow-sm",
    composer: "bg-[#f0f2f5]",
    accent: "text-[#008069]",
    title: "WhatsApp",
  },
  telegram: {
    shell: "border-[#a4d7d6] bg-[#dff4ec]",
    header: "bg-white text-[#111827]",
    body: "bg-gradient-to-br from-[#a8e0ef] via-[#b7e8ca] to-[#dce889]",
    incoming: "rounded-bl-sm bg-white text-[#111827] shadow-sm",
    outgoing: "rounded-br-sm bg-[#fff3b0] text-[#111827] shadow-sm",
    composer: "bg-white",
    accent: "text-[#229ed9]",
    title: "Telegram",
  },
  messenger: {
    shell: "border-[#e5e7eb] bg-white",
    header: "bg-white text-[#111827]",
    body: "bg-white",
    incoming: "rounded-bl-sm bg-[#f1f1f1] text-[#111827]",
    outgoing: "rounded-br-sm bg-[#6d4aff] text-white",
    composer: "bg-white",
    accent: "text-[#6d4aff]",
    title: "Messenger",
  },
  instagram: {
    shell: "border-[#f1008b] bg-white",
    header: "bg-white text-[#111827]",
    body: "bg-white",
    incoming: "rounded-bl-sm bg-[#efefef] text-[#111827]",
    outgoing: "rounded-br-sm bg-gradient-to-br from-[#a033ff] to-[#5b2dff] text-white",
    composer: "bg-white",
    accent: "text-[#7b2cff]",
    title: "Instagram",
  },
};

export function AssistantTester({
  channels,
  clientName,
}: {
  channels: AssistantTesterChannel[];
  clientName: string;
}) {
  const router = useRouter();
  const [selectedChannelId, setSelectedChannelId] = useState(channels[0]?.id ?? "");
  const [messages, setMessages] = useState<TesterMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? channels[0],
    [channels, selectedChannelId],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChannel || !draft.trim() || isSending) return;

    const customerMessage: TesterMessage = {
      id: messageId(),
      senderRole: "customer",
      body: draft.trim(),
      createdAt: new Date(),
    };
    const nextMessages = [...messages, customerMessage];
    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);

    try {
      const response = await fetch("/api/client/assistant-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedChannel.id,
          message: customerMessage.body,
          history: messages
            .filter((message) => message.senderRole === "customer" || message.senderRole === "agent")
            .map((message) => ({
              senderRole: message.senderRole,
              body: message.body,
            })),
        }),
      });
      const payload = await response.json() as Partial<PreviewResponse> & { error?: string };
      if (!response.ok || !payload.responseText || !payload.action || !payload.reasonCode) {
        throw new Error(payload.error ?? "Assistant test failed.");
      }
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          senderRole: "agent",
          body: payload.responseText!,
          createdAt: new Date(),
          action: payload.action,
          reasonCode: payload.reasonCode,
        },
      ]);
      router.refresh();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          senderRole: "system",
          body: error instanceof Error ? error.message : "Assistant test failed.",
          createdAt: new Date(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  if (!selectedChannel) {
    return (
      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Preview a customer conversation</h2>
        </div>
        <p className="p-4 text-sm text-muted">No configured channels are available.</p>
      </section>
    );
  }

  return (
    <section className="ui-panel overflow-hidden">
      <div className="ui-panel-header">
        <div>
          <h2 className="text-base font-semibold">Preview a customer conversation</h2>
          <p className="text-sm text-muted">{clientName} · Nothing here is sent to a customer.</p>
        </div>
        <select
          value={selectedChannel.id}
          onChange={(event) => {
            setSelectedChannelId(event.target.value);
            setMessages([]);
          }}
          className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
          aria-label="Test channel"
        >
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channelDefinition(channel.kind).label} · {channel.name}
            </option>
          ))}
        </select>
      </div>
      <div className="p-4">
        {selectedChannel.kind === "email" ? (
          <EmailPreview
            channel={selectedChannel}
            messages={messages}
            draft={draft}
            isSending={isSending}
            onDraftChange={setDraft}
            onSubmit={submit}
          />
        ) : (
          <MessagingPreview
            channel={selectedChannel}
            messages={messages}
            draft={draft}
            isSending={isSending}
            onDraftChange={setDraft}
            onSubmit={submit}
          />
        )}
      </div>
    </section>
  );
}

function MessagingPreview({
  channel,
  messages,
  draft,
  isSending,
  onDraftChange,
  onSubmit,
}: {
  channel: Exclude<AssistantTesterChannel, { kind: "email" }>;
  messages: TesterMessage[];
  draft: string;
  isSending: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const theme = chatThemes[channel.kind as Exclude<ChannelKind, "email">];
  const definition = channelDefinition(channel.kind);

  return (
    <div className={`mx-auto max-w-[31rem] overflow-hidden rounded-[2rem] border ${theme.shell}`}>
      <div className={`flex items-center gap-3 border-b border-black/10 px-4 py-3 ${theme.header}`}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Image src={definition.iconPath} alt="" width={24} height={24} className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-base font-semibold">{channel.name}</p>
          <p className={`text-xs ${theme.accent}`}>{theme.title.toLowerCase()} test</p>
        </div>
        <Badge tone={channel.status === "active" ? "green" : "amber"}>{channel.status}</Badge>
      </div>
      <div className={`min-h-[32rem] space-y-2 overflow-auto px-3 py-4 ${theme.body}`}>
        {messages.length ? (
          messages.map((message) => (
            <ChatBubble key={message.id} message={message} theme={theme} />
          ))
        ) : (
          <p className="rounded-lg bg-white/80 p-3 text-sm text-muted">No test messages yet.</p>
        )}
        {isSending ? (
          <div className="flex justify-start">
            <div className={`rounded-2xl px-3 py-2 text-sm ${theme.incoming}`}>
              <Loader2 size={16} className="animate-spin" />
            </div>
          </div>
        ) : null}
      </div>
      <form onSubmit={onSubmit} className={`flex items-center gap-2 border-t border-black/10 p-3 ${theme.composer}`}>
        <span className={`text-lg ${theme.accent}`}>+</span>
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          className="min-h-10 flex-1 rounded-full bg-white px-4 py-2 text-sm text-foreground shadow-sm outline-none"
          placeholder="Message"
        />
        <button
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ${theme.accent}`}
          disabled={!draft.trim() || isSending}
          aria-label="Send test message"
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}

function ChatBubble({ message, theme }: { message: TesterMessage; theme: ChatTheme }) {
  if (message.senderRole === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-danger">
          {message.body}
        </span>
      </div>
    );
  }

  const outgoing = message.senderRole === "customer";
  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-5 ${
          outgoing ? theme.outgoing : theme.incoming
        }`}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        <p className={`mt-1 text-right text-[11px] ${outgoing ? "opacity-75" : "text-muted"}`}>
          {formatTime(message.createdAt)}
          {message.action === "escalated" ? ` · ${message.reasonCode}` : ""}
        </p>
      </div>
    </div>
  );
}

function EmailPreview({
  channel,
  messages,
  draft,
  isSending,
  onDraftChange,
  onSubmit,
}: {
  channel: AssistantTesterChannel;
  messages: TesterMessage[];
  draft: string;
  isSending: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex items-center gap-3 border-b border-line bg-[#f6f8fc] px-4 py-3">
        <Image
          src={channelDefinition("email").iconPath}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium">{channel.name}</p>
          <p className="text-sm text-muted">email test thread</p>
        </div>
        <Badge tone={channel.status === "active" ? "green" : "amber"}>{channel.status}</Badge>
      </div>
      <div className="min-h-[28rem] divide-y divide-line px-4">
        {messages.length ? (
          messages.map((message) => (
            <article key={message.id} className="py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dfe6f7] text-sm font-semibold text-[#345]">
                  {message.senderRole === "customer" ? "CU" : message.senderRole === "agent" ? "P" : "!"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="font-semibold">
                      {message.senderRole === "customer" ? "Customer" : message.senderRole === "agent" ? "Pronto" : "System"}
                    </p>
                    <p className="text-sm text-muted">
                      {message.senderRole === "customer" ? "to Pronto" : "to Customer"}
                    </p>
                    <p className="ml-auto text-xs text-muted">{formatTime(message.createdAt)}</p>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {message.body}
                  </p>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="py-5 text-sm text-muted">No test emails yet.</p>
        )}
        {isSending ? (
          <div className="py-5 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : null}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-line bg-[#f6f8fc] p-4">
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          className="min-h-10 flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm outline-none"
          placeholder="Write test email"
        />
        <button
          className="ui-primary-button inline-flex items-center gap-2 px-4 py-2"
          disabled={!draft.trim() || isSending}
        >
          <Send size={16} />
          Send
        </button>
      </form>
    </div>
  );
}

function messageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}
