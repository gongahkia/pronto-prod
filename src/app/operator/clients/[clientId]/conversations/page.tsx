import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getClient,
  getClientConversationTriage,
} from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";

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
  if (resolvedSearchParams.conversationId) {
    redirect(`/operator/clients/${client.id}/conversations/${resolvedSearchParams.conversationId}`);
  }

  const conversations = await getClientConversationTriage(client.id, 30);

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Review transcripts, classify failures, and record QA labels."
      />
      <OperatorClientNav clientId={client.id} active="conversations" />

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Conversation queue</h2>
        </div>
        <div className="divide-y divide-line">
          {conversations.length === 0 ? (
            <p className="p-4 text-sm text-muted">No conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/operator/clients/${client.id}/conversations/${conversation.id}`}
                className="block p-4 hover:bg-surface-hover"
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
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
