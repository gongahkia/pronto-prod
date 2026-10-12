import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canViewBusinessConversation } from "@/lib/staff-permissions";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/dashboard";
import {
  getClientDashboardAnalytics,
  getFilteredConversations,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import {
  ConversationFilterForm,
  ConversationList,
  PaginationControls,
  filtersFromSearchParams,
  pageFromSearchParams,
} from "@/components/reporting-panels";
import { Badge } from "@/components/badge";

export default async function ClientInboxPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }
  if (!await canViewBusinessConversation(user, user.clientId)) notFound();

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = filtersFromSearchParams(resolvedSearchParams, user.clientId);
  const page = pageFromSearchParams(resolvedSearchParams);
  const limit = 75;
  const [client, conversations, analytics] = await Promise.all([
    getClient(user.clientId),
    getFilteredConversations({ ...filters, sort: "attention", limit: limit + 1, offset: (page - 1) * limit }),
    getClientDashboardAnalytics(user.clientId),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  const hasNext = conversations.length > limit;
  const visibleConversations = conversations.slice(0, limit);

  return (
    <AppShell user={user} active="client" clientActive="inbox" workspaceName={client.name}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inbox</h1>
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
              href="/client/inbox?status=needs_reply"
              label="Needs reply"
              active={filters.status === "needs_reply"}
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
        />
        <ConversationList
          conversations={visibleConversations}
          hrefForConversation={(conversation) => `/client/conversations/${conversation.id}`}
          emptyText="No conversations match these filters."
          ctaLabel="Open"
        />
        <PaginationControls
          action="/client/inbox"
          searchParams={resolvedSearchParams}
          page={page}
          hasNext={hasNext}
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
