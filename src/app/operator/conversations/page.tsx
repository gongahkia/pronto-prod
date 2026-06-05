import { requireUser } from "@/lib/auth";
import { getFilteredConversations, getOperatorCommandCenter } from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import {
  ConversationFilterForm,
  ConversationList,
  filtersFromSearchParams,
} from "@/components/reporting-panels";

export const dynamic = "force-dynamic";

export default async function OperatorConversationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("operator");
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = filtersFromSearchParams(resolvedSearchParams);
  const [commandCenter, conversations] = await Promise.all([
    getOperatorCommandCenter(),
    getFilteredConversations({ ...filters, limit: 75 }),
  ]);

  return (
    <AppShell
      user={user}
      active="operator"
      operatorActive="conversations"
      operatorClients={commandCenter.clientHealth}
    >
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Conversations</h1>
        <p className="text-sm text-muted">
          Cross-client transcript queue for debugging, QA review, and escalation follow-up.
        </p>
      </div>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Recent conversations</h2>
        </div>
        <ConversationFilterForm action="/operator/conversations" filters={filters} />
        <ConversationList
          conversations={conversations}
          hrefForConversation={(conversation) =>
            `/operator/clients/${conversation.client_id}/conversations/${conversation.id}`
          }
          showClient
        />
      </section>
    </AppShell>
  );
}
