import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import {
  getClientDashboardAnalytics,
  getFilteredConversations,
  getKnowledgeGapReport,
  getSlaSummary,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { ClientNav } from "@/components/client-nav";
import {
  ClientAnalyticsCards,
  ConversationFilterForm,
  ConversationList,
  filtersFromSearchParams,
  KnowledgeGapPanel,
  SlaPanel,
} from "@/components/reporting-panels";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = filtersFromSearchParams(resolvedSearchParams, user.clientId);
  const [client, conversations, analytics, gaps, sla] = await Promise.all([
    getClient(user.clientId),
    getFilteredConversations({ ...filters, limit: 50 }),
    getClientDashboardAnalytics(user.clientId),
    getKnowledgeGapReport({ clientId: user.clientId, limit: 8 }),
    getSlaSummary(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  return (
    <AppShell user={user} active="client">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{client.name}</h1>
        <p className="text-sm text-muted">
          Review customer conversations and open triage when Pronto needs help.
        </p>
      </div>
      <ClientNav active="conversations" />

      <ClientAnalyticsCards analytics={analytics} />

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.45fr]">
        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Conversations</h2>
          </div>
          <ConversationFilterForm
            action="/client"
            filters={filters}
            includeReview={false}
          />
          <ConversationList
            conversations={conversations}
            hrefForConversation={(conversation) =>
              `/client/conversations/${conversation.id}`
            }
            emptyText="No conversations match these filters."
          />
        </div>
        <SlaPanel summary={sla} />
      </section>

      <div className="mt-6">
        <KnowledgeGapPanel
          gaps={gaps}
          hrefForGap={(gap) => `/client/conversations/${gap.conversation_id}`}
        />
      </div>
    </AppShell>
  );
}
