import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getClient,
  getConversationActionableEscalation,
  getConversationMessages,
  getConversationTriageDetail,
} from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { ConversationTriagePanel } from "@/components/conversation-triage-panel";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { OperatorConversationReview } from "@/components/operator/operator-panels";

export default async function OperatorClientConversationDetailPage({
  params,
}: {
  params: Promise<{ clientId: string; conversationId: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId, conversationId } = await params;
  const [client, conversation] = await Promise.all([
    getClient(clientId),
    getConversationTriageDetail({ clientId, conversationId }),
  ]);
  if (!client || !conversation) {
    notFound();
  }
  const [activeEscalation, messages] = await Promise.all([
    getConversationActionableEscalation({ clientId, conversationId }),
    getConversationMessages(conversation.id),
  ]);

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader
        client={client}
        description="Review one customer conversation and handle its active triage item."
      />
      <OperatorClientNav clientId={client.id} active="conversations" />

      <div className="mb-4 flex items-center gap-3 text-xs font-medium">
        <Link
          href={`/operator/clients/${client.id}/conversations`}
          className="text-accent hover:text-accent-dark"
        >
          Back to conversation queue
        </Link>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <OperatorConversationReview
          conversation={conversation}
          messages={messages}
        />
        <ConversationTriagePanel
          escalation={activeEscalation}
          returnTo={`/operator/clients/${client.id}/conversations/${conversation.id}`}
        />
      </div>
    </AppShell>
  );
}
