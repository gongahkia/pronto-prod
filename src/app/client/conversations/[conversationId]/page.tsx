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
import { ConversationTranscript } from "@/components/conversation-transcript";

export const dynamic = "force-dynamic";

export default async function ClientConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }
  const { conversationId } = await params;
  const [client, conversation] = await Promise.all([
    getClient(user.clientId),
    getConversationTriageDetail({ clientId: user.clientId, conversationId }),
  ]);
  if (!client || !conversation) {
    notFound();
  }
  const [activeEscalation, messages] = await Promise.all([
    getConversationActionableEscalation({ clientId: user.clientId, conversationId }),
    getConversationMessages(conversation.id),
  ]);

  const returnTo = `/client/conversations/${conversation.id}`;

  return (
    <AppShell user={user} active="client" clientActive="conversations" workspaceName={client.name}>
      <div className="mb-5">
        <Link href="/client" className="text-xs font-medium text-accent hover:text-accent-dark">
          Back to conversations
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.01em]">
          {client.name}
        </h1>
        <p className="text-sm text-muted">
          Review this customer conversation and handle the active triage item.
        </p>
      </div>
      <div className="space-y-6">
        <ConversationTriagePanel escalation={activeEscalation} returnTo={returnTo} />
        <ConversationTranscript conversation={conversation} messages={messages} />
      </div>
    </AppShell>
  );
}
