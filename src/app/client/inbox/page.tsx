import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import {
  getClientDashboardAnalytics,
  getFilteredConversations,
  type FilteredConversation,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import {
  ConversationFilterForm,
  ConversationList,
  filtersFromSearchParams,
} from "@/components/reporting-panels";
import { Badge } from "@/components/badge";

export const dynamic = "force-dynamic";

export default async function ClientInboxPage({
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
  const [client, conversations, analytics] = await Promise.all([
    getClient(user.clientId),
    getFilteredConversations({ ...filters, limit: 75 }),
    getClientDashboardAnalytics(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  const sortedConversations = sortClientInbox(conversations);

  return (
    <AppShell user={user} active="client" clientActive="inbox" workspaceName={client.name}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Inbox</h1>
          <p className="text-sm text-muted">
            Customer conversations ordered by what needs your attention first.
          </p>
        </div>
        <Badge tone={analytics.actionableEscalations ? "amber" : "green"}>
          {analytics.actionableEscalations} need reply
        </Badge>
      </div>

      <section className="ui-panel">
        <div className="ui-panel-header">
          <div className="flex flex-wrap gap-2">
            <QuickFilter href="/client/inbox" label="All" active={!filters.status} />
            <QuickFilter
              href="/client/inbox?status=escalated"
              label="Needs reply"
              active={filters.status === "escalated"}
            />
            <QuickFilter
              href="/client/inbox?status=active"
              label="Active"
              active={filters.status === "active"}
            />
            <QuickFilter
              href="/client/inbox?status=closed"
              label="Closed"
              active={filters.status === "closed"}
            />
          </div>
        </div>
        <ConversationFilterForm
          action="/client/inbox"
          filters={filters}
          includeReview={false}
        />
        <ConversationList
          conversations={sortedConversations}
          hrefForConversation={(conversation) => `/client/conversations/${conversation.id}`}
          emptyText="No conversations match these filters."
          ctaLabel="Open"
        />
      </section>
    </AppShell>
  );
}

function QuickFilter({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        active
          ? "bg-accent text-white"
          : "border border-line bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

function sortClientInbox(conversations: FilteredConversation[]): FilteredConversation[] {
  return [...conversations].sort((a, b) => {
    const bucketDelta = inboxBucket(a) - inboxBucket(b);
    if (bucketDelta !== 0) {
      return bucketDelta;
    }
    return b.last_message_at.getTime() - a.last_message_at.getTime();
  });
}

function inboxBucket(conversation: FilteredConversation): number {
  if (conversation.active_escalation_id) {
    return 0;
  }
  if (conversation.status === "escalated") {
    return 1;
  }
  if (conversation.status === "active") {
    return 2;
  }
  return 3;
}
