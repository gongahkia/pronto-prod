import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getClient,
  getClientConversationTriage,
  getConversationMessages,
} from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { OperatorConversationReview } from "@/components/operator/operator-panels";

export const dynamic = "force-dynamic";

export default async function OperatorClientConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<{ conversationId?: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const client = await getClient(clientId);
  if (!client) {
    notFound();
  }

  const conversations = await getClientConversationTriage(client.id, 30);
  const selectedConversation =
    conversations.find(
      (conversation) => conversation.id === resolvedSearchParams.conversationId,
    ) ?? conversations[0] ?? null;
  const messages = selectedConversation
    ? await getConversationMessages(selectedConversation.id)
    : [];
  const returnTo = selectedConversation
    ? `/operator/clients/${client.id}/conversations?conversationId=${selectedConversation.id}#conversation-${selectedConversation.id}`
    : `/operator/clients/${client.id}/conversations`;

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Review transcripts, classify failures, and record QA labels."
      />
      <OperatorClientNav clientId={client.id} active="conversations" />

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Conversation queue</h2>
          </div>
          <div className="divide-y divide-line">
            {conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted">No conversations yet.</p>
            ) : (
              conversations.map((conversation) => {
                const selected = conversation.id === selectedConversation?.id;
                return (
                  <Link
                    key={conversation.id}
                    href={`/operator/clients/${client.id}/conversations?conversationId=${conversation.id}`}
                    className={`block p-4 hover:bg-surface-hover ${selected ? "bg-surface" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{conversation.customer_name ?? conversation.customer_handle}</p>
                      <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
                        {conversation.status}
                      </Badge>
                      <Badge>{conversation.channel_kind}</Badge>
                      {conversation.active_escalation_reason_code ? (
                        <Badge tone="red">{conversation.active_escalation_reason_code}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">{conversation.last_message}</p>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <OperatorConversationReview
          clientId={client.id}
          conversation={selectedConversation}
          messages={messages}
          returnTo={returnTo}
        />
      </section>
    </AppShell>
  );
}
