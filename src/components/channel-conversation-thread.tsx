import Image from "next/image";
import { channelDefinition } from "@/lib/channels/catalog";
import type { ClientConversationTriage } from "@/lib/dashboard";
import type { ChannelKind, Message } from "@/lib/types";
import { Badge } from "@/components/badge";

type Props = {
  conversation: ClientConversationTriage;
  messages: Message[];
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

export function ChannelConversationThread({ conversation, messages }: Props) {
  if (conversation.channel_kind === "email") {
    return <EmailThread conversation={conversation} messages={messages} />;
  }

  return (
    <MessagingThread
      conversation={conversation}
      messages={messages}
      theme={chatThemes[conversation.channel_kind]}
    />
  );
}

function MessagingThread({
  conversation,
  messages,
  theme,
}: Props & { theme: ChatTheme }) {
  const contact = conversation.customer_name ?? conversation.customer_handle ?? "Customer";
  const definition = channelDefinition(conversation.channel_kind);
  let lastDate = "";

  return (
    <div className={`mx-auto max-w-[29rem] overflow-hidden rounded-[2rem] border ${theme.shell}`}>
      <div className={`flex items-center gap-3 border-b border-black/10 px-4 py-3 ${theme.header}`}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Image src={definition.iconPath} alt="" width={24} height={24} className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-base font-semibold">{contact}</p>
          <p className={`text-xs ${theme.accent}`}>{theme.title.toLowerCase()} - online</p>
        </div>
        <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
          {conversation.status}
        </Badge>
      </div>
      <div className={`min-h-[31rem] space-y-2 overflow-auto px-3 py-4 ${theme.body}`}>
        {messages.length ? (
          messages.map((message) => {
            const dateLabel = formatDay(message.created_at);
            const showDate = dateLabel !== lastDate;
            lastDate = dateLabel;
            return (
              <div key={message.id}>
                {showDate ? (
                  <div className="mb-3 flex justify-center">
                    <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted shadow-sm">
                      {dateLabel}
                    </span>
                  </div>
                ) : null}
                <ChatBubble message={message} theme={theme} />
              </div>
            );
          })
        ) : (
          <p className="rounded-lg bg-white/80 p-3 text-sm text-muted">No messages yet.</p>
        )}
      </div>
      <div className={`flex items-center gap-2 border-t border-black/10 p-3 ${theme.composer}`}>
        <span className={`text-lg ${theme.accent}`}>+</span>
        <div className="min-h-10 flex-1 rounded-full bg-white px-4 py-2 text-sm text-muted shadow-sm">
          Message
        </div>
        <span className={`text-xs font-semibold uppercase ${theme.accent}`}>mic</span>
      </div>
    </div>
  );
}

function ChatBubble({ message, theme }: { message: Message; theme: ChatTheme }) {
  if (message.sender_role === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-muted">
          {message.body}
        </span>
      </div>
    );
  }

  const outgoing = message.sender_role !== "customer";
  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-5 ${
          outgoing ? theme.outgoing : theme.incoming
        }`}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        <p className={`mt-1 text-right text-[11px] ${outgoing ? "opacity-75" : "text-muted"}`}>
          {formatTime(message.created_at)}
          {outgoing ? " sent" : ""}
        </p>
      </div>
    </div>
  );
}

function EmailThread({ conversation, messages }: Props) {
  const contact = conversation.customer_name ?? conversation.customer_handle ?? "Customer";
  const subject = conversation.last_message ?? "Customer conversation";

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex items-center gap-3 border-b border-line bg-[#f6f8fc] px-4 py-3">
        <Image
          src={channelDefinition("email").iconPath}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium">{subject}</p>
          <p className="text-sm text-muted">Gmail-style email thread</p>
        </div>
        <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
          {conversation.status}
        </Badge>
      </div>
      <div className="flex items-center gap-4 border-b border-line px-4 py-2 text-sm text-muted">
        <span>Back</span>
        <span>Archive</span>
        <span>Report</span>
        <span>Delete</span>
        <span className="ml-auto">{messages.length} messages</span>
      </div>
      <div className="divide-y divide-line px-4">
        {messages.length ? (
          messages.map((message) => (
            <article key={message.id} className="py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dfe6f7] text-sm font-semibold text-[#345]">
                  {initials(message.sender_role === "customer" ? contact : "Pronto")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="font-semibold">
                      {message.sender_role === "customer" ? contact : "Pronto"}
                    </p>
                    <p className="text-sm text-muted">
                      {message.sender_role === "customer" ? "to Pronto" : `to ${contact}`}
                    </p>
                    <p className="ml-auto text-xs text-muted">{formatDateTime(message.created_at)}</p>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {message.body}
                  </p>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="py-5 text-sm text-muted">No messages yet.</p>
        )}
      </div>
      <div className="flex gap-2 border-t border-line p-4">
        <button className="ui-button px-4 py-2">Reply</button>
        <button className="ui-button px-4 py-2">Forward</button>
      </div>
    </div>
  );
}

function formatDay(value: Date | string): string {
  return new Intl.DateTimeFormat("en-SG", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTime(value: Date | string): string {
  return new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";
}
