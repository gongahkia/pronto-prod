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
  filtersFromSearchParams,
} from "@/components/reporting-panels";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function OperatorConversationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("operator");
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = filtersFromSearchParams(resolvedSearchParams);
  const conversations = prioritizeLiveInbox(
    await getFilteredConversations({ ...filters, limit: 75 }),
  );

  const actionable = conversations.filter((conversation) => conversation.active_escalation_id).length;
  const escalated = conversations.filter((conversation) => conversation.status === "escalated").length;
  const active = conversations.filter((conversation) => conversation.status === "active").length;
  const reviewed = conversations.filter((conversation) => conversation.latest_review_label).length;

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

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Actionable" value={actionable} />
        <StatCard label="Escalated" value={escalated} />
        <StatCard label="Active" value={active} />
        <StatCard label="Reviewed" value={reviewed} />
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
          conversations={conversations}
          hrefForConversation={(conversation) =>
            `/operator/clients/${conversation.client_id}/conversations/${conversation.id}`
          }
          showClient
          ctaLabel="Open"
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
  if (!conversation.latest_review_label) {
    return 1;
  }
  return 0;
}
