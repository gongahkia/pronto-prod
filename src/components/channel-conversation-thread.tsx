import Image from "next/image";
import { channelDefinition } from "@/lib/channels/catalog";
import { formatDate } from "@/lib/date-format";
import type { ClientConversationTriage } from "@/lib/dashboard";
import type { Message } from "@/lib/types";
import { Badge } from "@/components/badge";

export function ChannelConversationThread({
  conversation,
  messages,
}: {
  conversation: ClientConversationTriage;
  messages: Message[];
}) {
  const contact = conversation.customer_name ?? conversation.customer_handle ?? "Customer";
  const channel = channelDefinition(conversation.channel_kind);

  return (
    <section aria-label="Conversation messages" className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <Image src={channel.iconPath} alt="" width={22} height={22} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{contact}</p>
          <p className="text-xs text-muted">{channel.label} conversation</p>
        </div>
        <Badge tone={conversation.active_escalation_id ? "amber" : "neutral"}>
          {conversation.active_escalation_id ? "Needs attention" : conversation.status}
        </Badge>
      </div>
      {messages.length ? (
        <ol className="divide-y divide-line">
          {messages.map((message) => {
            const fromCustomer = message.sender_role === "customer";
            const sender = fromCustomer
              ? contact
              : message.sender_role === "agent"
                ? "Pronto assistant"
                : message.sender_role === "operator"
                  ? "Your team"
                  : "System";
            return (
              <li key={message.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{sender}</span>
                  <time dateTime={new Date(message.created_at).toISOString()} className="text-xs text-muted">
                    {formatDate(message.created_at)}
                  </time>
                </div>
                {message.sender_role === "agent" && ["real", "mock"].includes(String(message.metadata.generationMode)) &&
                  <p className="mt-1 text-xs text-muted">{message.metadata.generationMode === "real" ? "Real model response" : "Mock response"}
                    {typeof message.metadata.responseProvider === "string" && typeof message.metadata.responseModel === "string"
                      ? ` · ${message.metadata.responseProvider} / ${message.metadata.responseModel}` : ""}</p>}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="p-5 text-sm text-muted">No messages in this conversation yet.</p>
      )}
    </section>
  );
}
