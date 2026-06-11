import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type {
  ClientDashboardAnalytics,
  ConversationFilterInput,
  FilteredConversation,
  KnowledgeGapRow,
  OperationalAlert,
  SlaSummary,
} from "@/lib/reporting";
import { channelDefinitions } from "@/lib/channels/catalog";
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
      <StatCard label="Knowledge gaps" value={analytics.knowledgeGapCount} />
    </section>
  );
}

export function ConversationFilterForm({
  action,
  filters,
  includeReview = true,
}: {
  action: string;
  filters: ConversationFilterInput;
  includeReview?: boolean;
}) {
  return (
    <form action={action} className="grid gap-3 p-4 md:grid-cols-4 xl:grid-cols-9">
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
      {includeReview ? (
        <select
          name="review"
          defaultValue={filters.reviewLabel ?? ""}
          className="rounded-md border border-line px-3 py-2 text-sm"
        >
          <option value="">Any review</option>
          <option value="answered_correctly">Answered correctly</option>
          <option value="should_have_escalated">Should have escalated</option>
          <option value="over_escalated">Over-escalated</option>
          <option value="hallucinated">Hallucinated</option>
          <option value="needs_knowledge_update">Needs knowledge update</option>
        </select>
      ) : null}
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
                {conversation.latest_review_label ? (
                  <Badge tone="amber">{conversation.latest_review_label}</Badge>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">
                {conversation.last_message ?? "No message yet."}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-accent">
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

export function KnowledgeGapPanel({
  gaps,
  hrefForGap,
}: {
  gaps: KnowledgeGapRow[];
  hrefForGap: (gap: KnowledgeGapRow) => string;
}) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Knowledge gaps</h2>
            <p className="text-sm text-muted">Escalations and QA reviews that point to missing or stale sources.</p>
          </div>
          <Badge tone={gaps.length ? "amber" : "green"}>{gaps.length} open</Badge>
        </div>
      </div>
      <div className="divide-y divide-line">
        {gaps.length === 0 ? (
          <p className="p-4 text-sm text-muted">No knowledge gaps detected.</p>
        ) : (
          gaps.map((gap) => (
            <Link
              key={`${gap.conversation_id}:${gap.gap_source}:${gap.reason_code ?? gap.review_label ?? "gap"}`}
              href={hrefForGap(gap)}
              className="block p-4 hover:bg-surface-hover"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{gap.customer_name ?? gap.customer_handle}</p>
                <Badge>{gap.client_name}</Badge>
                <Badge>{gap.channel_kind}</Badge>
                <Badge tone="amber">{gap.gap_source}</Badge>
                {gap.reason_code ? <Badge tone="red">{gap.reason_code}</Badge> : null}
                {gap.review_label ? <Badge tone="amber">{gap.review_label}</Badge> : null}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">
                {gap.last_message ?? "No message available."}
              </p>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

export function SlaPanel({ summary }: { summary: SlaSummary }) {
  const tone = summary.breachedItems ? "red" : summary.soonItems ? "amber" : "green";
  return (
    <section className="ui-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">SLA watch</h2>
          <p className="mt-1 text-sm text-muted">
            {summary.targetHours
              ? `${summary.targetHours}h target for open triage`
              : "No open triage items"}
          </p>
        </div>
        <Badge tone={tone}>{summary.breachedItems} breached</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-muted">Tracked</dt>
          <dd className="mt-1 font-semibold">{summary.trackedOpenItems}</dd>
        </div>
        <div>
          <dt className="text-muted">Soon</dt>
          <dd className="mt-1 font-semibold">{summary.soonItems}</dd>
        </div>
        <div>
          <dt className="text-muted">Oldest</dt>
          <dd className="mt-1 font-semibold">{formatDuration(summary.oldestOpenSeconds)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function OperationalAlertsPanel({
  alerts,
}: {
  alerts: OperationalAlert[];
}) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Operational alerts</h2>
          <Badge tone={alerts.length ? "red" : "green"}>{alerts.length} active</Badge>
        </div>
      </div>
      <div className="divide-y divide-line">
        {alerts.length === 0 ? (
          <p className="p-4 text-sm text-muted">No alert conditions detected.</p>
        ) : (
          alerts.map((alert) => (
            <Link key={alert.id} href={alert.href} className="block p-4 hover:bg-surface-hover">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={alert.severity === "critical" ? "red" : "amber"}>
                  {alert.severity}
                </Badge>
                <p className="font-medium">{alert.title}</p>
              </div>
              <p className="mt-1 text-sm text-muted">{alert.detail}</p>
            </Link>
          ))
        )}
      </div>
    </section>
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
    reviewLabel: firstParam(searchParams.review),
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
