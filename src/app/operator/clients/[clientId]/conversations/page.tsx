import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { getFilteredConversations } from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import {
  ConversationFilterForm,
  ConversationList,
  PaginationControls,
  filtersFromSearchParams,
  pageFromSearchParams,
} from "@/components/reporting-panels";

export const dynamic = "force-dynamic";

export default async function OperatorClientConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const client = await getClient(clientId);
  if (!client) {
    notFound();
  }
  const conversationId = Array.isArray(resolvedSearchParams.conversationId)
    ? resolvedSearchParams.conversationId[0]
    : resolvedSearchParams.conversationId;
  if (conversationId) {
    redirect(`/operator/clients/${client.id}/conversations/${conversationId}`);
  }

  const filters = filtersFromSearchParams(resolvedSearchParams, client.id);
  const page = pageFromSearchParams(resolvedSearchParams);
  const limit = 50;
  const conversations = await getFilteredConversations({
    ...filters,
    limit: limit + 1,
    offset: (page - 1) * limit,
  });
  const hasNext = conversations.length > limit;
  const visibleConversations = conversations.slice(0, limit);

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
        <ConversationFilterForm
          action={`/operator/clients/${client.id}/conversations`}
          filters={filters}
        />
        <ConversationList
          conversations={visibleConversations}
          hrefForConversation={(conversation) =>
            `/operator/clients/${client.id}/conversations/${conversation.id}`
          }
        />
        <PaginationControls
          action={`/operator/clients/${client.id}/conversations`}
          searchParams={resolvedSearchParams}
          page={page}
          hasNext={hasNext}
        />
      </section>
    </AppShell>
  );
}
