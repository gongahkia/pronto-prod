import { Badge } from "@/components/badge";
import type { ClientConversationTriage } from "@/lib/dashboard";
import type { Message } from "@/lib/types";

export function ConversationTranscript({
  conversation,
  messages,
}: {
  conversation: ClientConversationTriage;
  messages: Message[];
}) {
  return (
    <section id={`conversation-${conversation.id}`} className="ui-panel">
      <div className="ui-panel-header">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">
            {conversation.customer_name ?? conversation.customer_handle ?? "Customer"}
          </h2>
          <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
            {conversation.status}
          </Badge>
          <Badge>{conversation.channel_kind}</Badge>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {messages.length ? (
          messages.map((message) => (
            <div key={message.id} className="rounded-md bg-surface p-3 text-sm">
              <p className="mb-1 font-medium">{message.sender_role}</p>
              <p className="whitespace-pre-wrap text-muted">{message.body}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No messages yet.</p>
        )}
      </div>
    </section>
  );
}
