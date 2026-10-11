import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type {
  ClientDashboardAnalytics,
  ConversationFilterInput,
  FilteredConversation,
} from "@/lib/reporting";
import { channelDefinition, channelDefinitions } from "@/lib/channels/catalog";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

export function ClientAnalyticsCards({
  analytics,
}: {
  analytics: ClientDashboardAnalytics;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-6">
      <StatCard label="Conversations" value={analytics.conversationCount} />
      <StatCard
        label="Escalation rate"
        value={`${Math.round(analytics.escalationRate * 100)}%`}
        hint={`${analytics.escalatedConversationCount} escalated`}
      />
      <StatCard label="Open triage" value={analytics.actionableEscalations} />
      <StatCard
        label="First response"
        value={formatDuration(analytics.avgFirstResponseSeconds)}
      />
      <StatCard
        label="CSAT"
        value={analytics.csatAverage ? analytics.csatAverage.toFixed(1) : "Pending"}
        hint={`${analytics.csatResponses} responses`}
      />
    </section>
  );
}

export function ConversationFilterForm({
  action,
  filters,
}: {
  action: string;
  filters: ConversationFilterInput;
}) {
  return (
    <form action={action} className="grid gap-3 p-4 md:grid-cols-4 xl:grid-cols-7">
      <input
        name="q"
        defaultValue={filters.query ?? ""}
        className="rounded-md border border-line px-3 py-2 text-sm md:col-span-2"
        placeholder="Search customer or message"
      />
      <select
        name="channel"
        defaultValue={filters.channelKind ?? ""}
        className="rounded-md border border-line px-3 py-2 text-sm"
      >
        <option value="">All channels</option>
        {channelDefinitions.map((channel) => (
          <option key={channel.kind} value={channel.kind}>
            {channel.label}
          </option>
        ))}
      </select>
      <select
        name="status"
        defaultValue={filters.status ?? ""}
        className="rounded-md border border-line px-3 py-2 text-sm"
      >
        <option value="">All statuses</option>
        {action === "/client/inbox" ? <option value="needs_reply">Needs reply</option> : null}
        <option value="active">Active</option>
        <option value="escalated">Escalated</option>
        <option value="closed">Closed</option>
      </select>
      <input
        name="reason"
        defaultValue={filters.reasonCode ?? ""}
        className="rounded-md border border-line px-3 py-2 text-sm"
        placeholder="Escalation reason"
      />
      <input
        name="from"
        type="date"
        defaultValue={filters.from ?? ""}
        className="rounded-md border border-line px-3 py-2 text-sm"
        aria-label="From date"
      />
      <input
        name="to"
        type="date"
        defaultValue={filters.to ?? ""}
        className="rounded-md border border-line px-3 py-2 text-sm"
        aria-label="To date"
      />
      <div className="flex gap-2">
        <button className="ui-primary-button px-3 py-2">Filter</button>
        <Link href={action} className="ui-button px-3 py-2">
          Reset
        </Link>
      </div>
    </form>
  );
}

export function ConversationList({
  conversations,
  hrefForConversation,
  showClient = false,
  emptyText = "No conversations match these filters.",
  ctaLabel = "Review",
}: {
  conversations: FilteredConversation[];
  hrefForConversation: (conversation: FilteredConversation) => string;
  showClient?: boolean;
  emptyText?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="divide-y divide-line">
      {conversations.length === 0 ? (
        <p className="p-4 text-sm text-muted">{emptyText}</p>
      ) : (
        conversations.map((conversation) => (
          <Link
            key={conversation.id}
            href={hrefForConversation(conversation)}
            className="flex flex-col gap-4 p-4 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {conversation.customer_name ?? conversation.customer_handle}
                </p>
                {showClient ? <Badge>{conversation.client_name}</Badge> : null}
                <Badge>{conversation.channel_kind}</Badge>
                <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
                  {conversation.status}
                </Badge>
                {conversation.active_escalation_reason_code ? (
                  <Badge tone="red">{conversation.active_escalation_reason_code}</Badge>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">
                {conversation.last_message ?? "No message yet."}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-accent">
              <Image
                src={channelDefinition(conversation.channel_kind).iconPath}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5"
              />
              {conversation.active_escalation_id ? "Open triage" : ctaLabel}
              <ArrowRight size={16} />
            </span>
          </Link>
        ))
      )}
    </div>
  );
}

export function PaginationControls({
  action,
  searchParams,
  page,
  hasNext,
}: {
  action: string;
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  hasNext: boolean;
}) {
  if (page <= 1 && !hasNext) return null;

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line p-4 text-sm" aria-label="Pagination">
      <Link
        href={pageHref(action, searchParams, page - 1)}
        aria-disabled={page <= 1}
        className={`ui-button px-3 py-2 ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
      >
        Previous
      </Link>
      <span className="text-muted">Page {page}</span>
      <Link
        href={pageHref(action, searchParams, page + 1)}
        aria-disabled={!hasNext}
        className={`ui-button px-3 py-2 ${hasNext ? "" : "pointer-events-none opacity-50"}`}
      >
        Next
      </Link>
    </nav>
  );
}

export function filtersFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  clientId?: string,
): ConversationFilterInput {
  return {
    clientId,
    query: firstParam(searchParams.q),
    channelKind: firstParam(searchParams.channel),
    status: firstParam(searchParams.status),
    reasonCode: firstParam(searchParams.reason),
    from: firstParam(searchParams.from),
    to: firstParam(searchParams.to),
  };
}

export function pageFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): number {
  const value = Number(firstParam(searchParams.page) ?? "1");
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(
  action: string,
  searchParams: Record<string, string | string[] | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const first = firstParam(value);
    if (first && key !== "page") params.set(key, first);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${action}?${query}` : action;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return "Pending";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`;
  }
  return `${Math.round(seconds / 3600)}h`;
}
