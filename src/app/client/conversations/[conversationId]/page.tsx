import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import { ConversationClassificationPanel } from "@/components/conversation-classification-panel";
import { getEscalationPolicy } from "@/lib/staff-configuration";
import { AutoRefresh } from "@/components/auto-refresh";
import { query } from "@/lib/db";

export default async function ClientConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) {
    redirect("/access?reason=membership");
  }
  if (!await canViewBusinessConversation(user, user.clientId)) redirect("/access?reason=permission");
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
  const selection = await query<{ provider: string | null; model: string | null; retrieval_mode: string | null }>(`select
    ai_configuration->>'provider' as provider,ai_configuration->>'model' as model,ai_configuration->>'retrievalMode' as retrieval_mode from customer_demo_sessions
    where client_id=$1 and conversation_id=$2`, [user.clientId,conversation.id]);
  const policy = await getEscalationPolicy(user.clientId);

  return (
    <AppShell user={user} active="client" clientActive="inbox" workspaceName={client.name}>
      <AutoRefresh intervalMs={3000}/>
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
        {selection.rows[0]?.provider && <p className="mt-1 text-xs text-muted">Selected model: {selection.rows[0].provider} / {selection.rows[0].model}. Actual generation is labelled on each reply.</p>}
        {selection.rows[0]?.retrieval_mode === "local_text" && <p className="mt-1 text-xs text-muted">Retrieval: local PostgreSQL text; no embeddings.</p>}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ConversationReviewPanel conversation={conversation} messages={messages} />
        <div><ConversationClassificationPanel conversation={conversation} canRespond={canRespond} policy={policy?.policy ?? null}/>
          <ConversationTriagePanel escalation={activeEscalation} returnTo={returnTo}
            canRespond={canRespond} canRelease={canRelease} /></div>
      </div>
    </AppShell>
  );
}
