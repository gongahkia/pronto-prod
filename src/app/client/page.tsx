import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient, getKnowledgeSources } from "@/lib/dashboard";
import { getClientAssistantChangeRequests } from "@/lib/client-assistant-requests";
import { getKnowledgeRefreshRequests } from "@/lib/knowledge/refresh";
import {
  getClientDashboardAnalytics,
  getFilteredConversations,
  getKnowledgeGapReport,
  type FilteredConversation,
  type KnowledgeGapRow,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { ConversationList, KnowledgeGapPanel } from "@/components/reporting-panels";
import { StatCard } from "@/components/stat-card";

export default async function ClientOverviewPage() {
  const user = await requireUser("client");
  if (!user.clientId) {
    throw new Error("Client user is missing a client assignment.");
  }

  const [
    client,
    analytics,
    gaps,
    attentionConversations,
    recentConversations,
    knowledgeSources,
    refreshRequests,
    assistantRequests,
  ] = await Promise.all([
    getClient(user.clientId),
    getClientDashboardAnalytics(user.clientId),
    getKnowledgeGapReport({ clientId: user.clientId, limit: 6 }),
    getFilteredConversations({ clientId: user.clientId, status: "escalated", limit: 5 }),
    getFilteredConversations({ clientId: user.clientId, limit: 6 }),
    getKnowledgeSources(user.clientId),
    getKnowledgeRefreshRequests(user.clientId),
    getClientAssistantChangeRequests(user.clientId, 5),
  ]);
  if (!client) {
    throw new Error("Client record not found.");
  }

  const openRefreshes = refreshRequests.filter((request) => request.status === "open");
  const openAssistantRequests = assistantRequests.filter((request) =>
    request.status === "open" || request.status === "reviewing"
  );
  const themes = summarizeThemes(gaps, attentionConversations);

  return (
    <AppShell user={user} active="client" clientActive="overview" workspaceName={client.name}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-muted">
            Business view of what Pronto handled, where it needs you, and what needs updating.
          </p>
        </div>
        <Link className="ui-button px-3 py-2 text-accent" href="/client/inbox?status=escalated">
          Review needs reply
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Conversations" value={analytics.conversationCount} />
        <StatCard label="Needs reply" value={analytics.actionableEscalations} />
        <StatCard
          label="First response"
          value={formatDuration(analytics.avgFirstResponseSeconds)}
        />
        <StatCard
          label="Escalation rate"
          value={`${Math.round(analytics.escalationRate * 100)}%`}
          hint={`${analytics.escalatedConversationCount} escalated`}
        />
        <StatCard
          label="CSAT"
          value={analytics.csatAverage ? analytics.csatAverage.toFixed(1) : "Pending"}
          hint={`${analytics.csatResponses} responses`}
        />
        <StatCard label="Knowledge gaps" value={analytics.knowledgeGapCount} />
      </section>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <div>
            <h2 className="text-base font-semibold">Needs your attention</h2>
            <p className="text-sm text-muted">
              Items that affect current customers or the assistant&apos;s ability to answer well.
            </p>
          </div>
          <Badge tone={attentionTone(analytics.actionableEscalations + openRefreshes.length + openAssistantRequests.length)}>
            {analytics.actionableEscalations + openRefreshes.length + openAssistantRequests.length} open
          </Badge>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <AttentionCard
            label="Customer replies"
            value={analytics.actionableEscalations}
            detail="Conversations where Pronto needs a human answer."
            href="/client/inbox?status=escalated"
          />
          <AttentionCard
            label="Knowledge updates"
            value={openRefreshes.length + gaps.length}
            detail={`${knowledgeSources.length} sources currently available to Pronto.`}
            href="/client/knowledge"
          />
          <AttentionCard
            label="Assistant requests"
            value={openAssistantRequests.length}
            detail="Requested changes to tone, handoff behavior, or scope."
            href="/client/assistant"
          />
        </div>
        <ConversationList
          conversations={attentionConversations}
          hrefForConversation={(conversation) => `/client/conversations/${conversation.id}`}
          emptyText="No customer replies need your attention."
          ctaLabel="Open"
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.45fr_1fr]">
        <section className="ui-panel">
          <div className="ui-panel-header">
            <div>
              <h2 className="text-base font-semibold">Recent customer themes</h2>
              <p className="text-sm text-muted">
                Patterns showing up in recent handoffs and knowledge gaps.
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            {themes.length === 0 ? (
              <p className="p-4 text-sm text-muted">
                No repeated customer theme is standing out right now.
              </p>
            ) : (
              themes.map((theme) => (
                <Link
                  key={theme.key}
                  href={theme.href}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{theme.label}</p>
                      <Badge tone="amber">{theme.count}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">{theme.detail}</p>
                  </div>
                  <ArrowRight size={17} className="shrink-0 text-muted" />
                </Link>
              ))
            )}
          </div>
        </section>

        <KnowledgeGapPanel
          gaps={gaps}
          hrefForGap={(gap) => `/client/conversations/${gap.conversation_id}`}
        />
      </section>

      <section className="mt-6 ui-panel">
        <div className="ui-panel-header">
          <div>
            <h2 className="text-base font-semibold">Recent conversations</h2>
            <p className="text-sm text-muted">Latest customer threads across connected channels.</p>
          </div>
          <Link href="/client/inbox" className="text-sm font-medium text-accent">
            Open inbox
          </Link>
        </div>
        <ConversationList
          conversations={recentConversations}
          hrefForConversation={(conversation) => `/client/conversations/${conversation.id}`}
          emptyText="No conversations yet."
          ctaLabel="Open"
        />
      </section>
    </AppShell>
  );
}

function AttentionCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: number;
  detail: string;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-line bg-surface p-4 hover:bg-surface-hover">
      <p className="text-sm font-medium leading-[18px] text-muted">{label}</p>
      <p className="mt-3 text-[30px] font-normal leading-9">{value}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </Link>
  );
}

type ThemeSummary = {
  key: string;
  label: string;
  detail: string;
  count: number;
  href: string;
};

function summarizeThemes(
  gaps: KnowledgeGapRow[],
  conversations: FilteredConversation[],
): ThemeSummary[] {
  const counts = new Map<string, number>();
  for (const gap of gaps) {
    const key = gap.reason_code ?? gap.gap_source;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const conversation of conversations) {
    if (conversation.active_escalation_reason_code) {
      counts.set(
        conversation.active_escalation_reason_code,
        (counts.get(conversation.active_escalation_reason_code) ?? 0) + 1,
      );
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, count]) => ({
      key,
      label: titleize(key),
      detail: count === 1 ? "One recent conversation" : `${count} recent conversations`,
      count,
      href: `/client/inbox?reason=${encodeURIComponent(key)}`,
    }));
}

function attentionTone(total: number): "green" | "amber" {
  return total > 0 ? "amber" : "green";
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

function titleize(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
