import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewBusinessConversation, hasStaffCapability } from "@/lib/staff-permissions";
import {
  getClient,
  getConversationActionableEscalation,
  getConversationMessages,
  getConversationTriageDetail,
} from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { ConversationTriagePanel } from "@/components/conversation-triage-panel";
import { ConversationReviewPanel } from "@/components/conversation-review-panel";

export default async function ClientConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }
  if (!await canViewBusinessConversation(user, user.clientId)) notFound();
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
    getConversationMessages(conversation.id, user.clientId),
  ]);
  const [canRespond, canRelease] = await Promise.all([
    hasStaffCapability(user, user.clientId, "conversation.respond"),
    hasStaffCapability(user, user.clientId, "conversation.release"),
  ]);

  const returnTo = `/client/conversations/${conversation.id}`;

  return (
    <AppShell user={user} active="client" clientActive="inbox" workspaceName={client.name}>
      <div className="mb-5">
        <Link href="/client/inbox" className="text-xs font-medium text-accent hover:text-accent-dark">
          Back to inbox
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold">
          {conversation.customer_name ?? conversation.customer_handle ?? "Customer conversation"}
        </h1>
        <p className="text-sm text-muted">
          Review this thread and reply when Pronto needs help.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ConversationReviewPanel conversation={conversation} messages={messages} />
        <ConversationTriagePanel escalation={activeEscalation} returnTo={returnTo}
          canRespond={canRespond} canRelease={canRelease} />
      </div>
    </AppShell>
  );
}
