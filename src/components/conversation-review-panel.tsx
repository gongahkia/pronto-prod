import { ChannelConversationThread } from "@/components/channel-conversation-thread";
import type { ClientConversationTriage } from "@/lib/dashboard";
import type { Message } from "@/lib/types";

export function ConversationReviewPanel({
  conversation,
  messages,
}: {
  conversation: ClientConversationTriage | null;
  messages: Message[];
}) {
  if (!conversation) {
    return (
      <div className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Messages</h2>
        </div>
        <p className="p-4 text-sm text-muted">No conversations yet.</p>
      </div>
    );
  }

  return (
    <div id={`conversation-${conversation.id}`} className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Messages</h2>
      </div>
      <ChannelConversationThread conversation={conversation} messages={messages} />
    </div>
  );
}
