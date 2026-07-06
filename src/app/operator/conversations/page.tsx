import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getFilteredConversations,
  type FilteredConversation,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import {
  ConversationFilterForm,
  ConversationList,
  PaginationControls,
  filtersFromSearchParams,
  pageFromSearchParams,
} from "@/components/reporting-panels";
import { StatCard } from "@/components/stat-card";

export default async function OperatorConversationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("operator");
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = filtersFromSearchParams(resolvedSearchParams);
  const page = pageFromSearchParams(resolvedSearchParams);
  const limit = 75;
  const conversations = prioritizeLiveInbox(
    await getFilteredConversations({ ...filters, limit: limit + 1, offset: (page - 1) * limit }),
  );
  const hasNext = conversations.length > limit;
  const visibleConversations = conversations.slice(0, limit);

  const actionable = visibleConversations.filter((conversation) => conversation.active_escalation_id).length;
  const escalated = visibleConversations.filter((conversation) => conversation.status === "escalated").length;
  const active = visibleConversations.filter((conversation) => conversation.status === "active").length;

  return (
    <AppShell user={user} active="operator" operatorActive="conversations">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Conversations</h1>
          <p className="text-sm text-muted">
            Cross-client live inbox for triage, owner follow-up, and debugging.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="ui-button px-3 py-2 text-accent" href="/operator/conversations?status=escalated">
            Escalated
          </Link>
          <Link className="ui-button px-3 py-2 text-accent" href="/operator/conversations?status=active">
            Active
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Actionable" value={actionable} />
        <StatCard label="Escalated" value={escalated} />
        <StatCard label="Active" value={active} />
      </section>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <div>
            <h2 className="text-base font-semibold">Live inbox</h2>
            <p className="text-sm text-muted">
              Triage items and escalations are shown before ordinary recent activity.
            </p>
          </div>
        </div>
        <ConversationFilterForm action="/operator/conversations" filters={filters} />
        <ConversationList
          conversations={visibleConversations}
          hrefForConversation={(conversation) =>
            `/operator/clients/${conversation.client_id}/conversations/${conversation.id}`
          }
          showClient
          ctaLabel="Open"
        />
        <PaginationControls
          action="/operator/conversations"
          searchParams={resolvedSearchParams}
          page={page}
          hasNext={hasNext}
        />
      </section>
    </AppShell>
  );
}

function prioritizeLiveInbox(conversations: FilteredConversation[]): FilteredConversation[] {
  return [...conversations].sort((left, right) => {
    const priorityDelta = conversationPriority(right) - conversationPriority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return right.last_message_at.getTime() - left.last_message_at.getTime();
  });
}

function conversationPriority(conversation: FilteredConversation): number {
  if (conversation.active_escalation_id) {
    return 4;
  }
  if (conversation.status === "escalated") {
    return 3;
  }
  if (conversation.status === "active") {
    return 2;
  }
  return 1;
}
