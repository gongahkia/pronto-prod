import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getOperatorConversationTriage } from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { OperatorNav } from "@/components/operator/operator-nav";

export const dynamic = "force-dynamic";

export default async function OperatorConversationsPage() {
  const user = await requireUser("operator");
  const conversations = await getOperatorConversationTriage(50);

  return (
    <AppShell user={user} active="operator">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Conversations</h1>
        <p className="text-sm text-muted">
          Cross-client transcript queue for debugging, QA review, and escalation follow-up.
        </p>
      </div>
      <OperatorNav active="conversations" />

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Recent conversations</h2>
        </div>
        <div className="divide-y divide-line">
          {conversations.length === 0 ? (
            <p className="p-4 text-sm text-muted">No conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/operator/clients/${conversation.client_id}/conversations?conversationId=${conversation.id}`}
                className="flex flex-col gap-4 p-4 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{conversation.customer_name ?? conversation.customer_handle}</p>
                    <Badge>{conversation.client_name}</Badge>
                    <Badge>{conversation.channel_kind}</Badge>
                    <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
                      {conversation.status}
                    </Badge>
                    {conversation.active_escalation_reason_code ? (
                      <Badge tone="red">{conversation.active_escalation_reason_code}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">{conversation.last_message}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-accent">
                  Review
                  <ArrowRight size={16} />
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
