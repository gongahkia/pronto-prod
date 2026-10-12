import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAssistantDraft } from "@/lib/assistant-drafts";
import { getChannels, getClient, getClientAttentionItems, getKnowledgeSources } from "@/lib/dashboard";
import { getKnowledgeRefreshRequests } from "@/lib/knowledge/refresh";
import { getClientDashboardAnalytics, getFilteredConversations } from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { ConversationList } from "@/components/reporting-panels";
import { StatCard } from "@/components/stat-card";

export default async function ClientOverviewPage() {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Client user is missing a client assignment.");
  const [client, analytics, needsReply, recent, channels, sources, refreshes, draft, attentionItems] = await Promise.all([
    getClient(user.clientId),
    getClientDashboardAnalytics(user.clientId),
    getFilteredConversations({ clientId: user.clientId, status: "needs_reply", sort: "attention", limit: 5 }),
    getFilteredConversations({ clientId: user.clientId, limit: 5 }),
    getChannels(user.clientId),
    getKnowledgeSources(user.clientId),
    getKnowledgeRefreshRequests(user.clientId),
    getAssistantDraft(user.clientId),
    getClientAttentionItems(user.clientId),
  ]);
  if (!client) throw new Error("Client record not found.");
  const activeChannels = channels.filter((channel) => channel.status === "active").length;
  const channelIssues = channels.filter((channel) => channel.status === "active" && channel.last_health_status === "degraded").length;
  const refreshDue = refreshes.filter((request) => request.status === "open").length;
  const setupNeeded = activeChannels === 0 || sources.length === 0;
  const alertCount = Number(channelIssues > 0) + Number(refreshDue > 0) +
    Number(attentionItems.length > 0);

  return (
    <AppShell user={user} active="client" clientActive="overview" workspaceName={client.name}>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted">See customer questions, take over when needed, and keep answers accurate.</p>
      </div>

      {setupNeeded ? (
        <section className="mb-5 ui-panel" aria-labelledby="setup-heading">
          <div className="ui-panel-header">
            <h2 id="setup-heading" className="font-semibold">Get ready to answer customers</h2>
            <p className="mt-1 text-sm text-muted">Add business facts, connect a customer channel, then try a question before inviting customers.</p>
          </div>
          <ol className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
            <SetupStep number={1} label="Add business knowledge" detail="Hours, menu, policies, and other answers." href="/client/knowledge" done={sources.length > 0} />
            <SetupStep number={2} label="Connect a channel" detail="Choose where customers can reach you." href="/client/assistant/channels" done={activeChannels > 0} />
            <SetupStep number={3} label="Try a customer question" detail="Preview the answer and publish any changes." href="/client/assistant" done={false} />
          </ol>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
        <div className="ui-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Customer replies</p>
              <p className="mt-2 text-3xl font-semibold">{analytics.actionableEscalations}</p>
              <p className="mt-1 text-sm text-muted">
                {analytics.actionableEscalations === 1 ? "conversation needs" : "conversations need"} a human response.
              </p>
            </div>
            <Badge tone={analytics.actionableEscalations ? "amber" : "green"}>
              {analytics.actionableEscalations ? "Needs attention" : "All caught up"}
            </Badge>
          </div>
          <Link href="/client/inbox?status=needs_reply"
            className="ui-primary-button mt-5 inline-flex px-4 py-2">Open reply queue</Link>
        </div>
        <div className="ui-panel p-5">
          <p className="text-sm text-muted">Assistant status</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={setupNeeded || channelIssues || attentionItems.length ? "amber" : "green"}>
              {setupNeeded ? "Setup needed" : attentionItems.length ? "Processing issue" : channelIssues ? "Channel issue" : "Configured"}
            </Badge>
            {draft ? <Badge tone="amber">Unpublished changes</Badge> : null}
          </div>
          <p className="mt-3 text-sm text-muted">{activeChannels} active channels · {sources.length} knowledge sources</p>
          <Link href="/client/assistant" className="mt-4 inline-block text-sm font-medium text-accent">
            Test an answer
          </Link>
        </div>
      </section>

      {alertCount ? (
        <section className="mt-5 ui-panel">
          <div className="ui-panel-header">
            <h2 className="font-semibold">Needs attention</h2>
          </div>
          <div className="divide-y divide-line text-sm">
            {channelIssues ? (
              <Link href="/client/assistant/channels" className="block p-4 hover:bg-surface-hover">
                {channelIssues} active channel {channelIssues === 1 ? "needs" : "need"} a health check.
              </Link>
            ) : null}
            {attentionItems.length ? (
              <div className="p-4">
                <p className="font-medium">{attentionItems.length} {attentionItems.length === 1 ? "message needs" : "messages need"} operational review.</p>
                <ul className="mt-2 space-y-1 text-muted">
                  {attentionItems.map((item) => (
                    <li key={item.id}>{item.channel_name}: {item.kind} {item.status}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {refreshDue ? (
              <Link href="/client/knowledge" className="block p-4 hover:bg-surface-hover">
                {refreshDue} knowledge {refreshDue === 1 ? "review is" : "reviews are"} due.
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Business activity <span className="font-normal text-muted">· since setup</span></h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Conversations" value={analytics.conversationCount} />
          <StatCard label="First response" value={formatDuration(analytics.avgFirstResponseSeconds)} />
          <StatCard label="Escalation rate" value={Math.round(analytics.escalationRate * 100) + "%"} />
          <StatCard label="Customer rating" value={analytics.csatAverage === null ? "Pending" : analytics.csatAverage.toFixed(1)}
            hint={analytics.csatResponses + " responses"} />
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="ui-panel">
          <div className="ui-panel-header flex items-center justify-between gap-3">
            <h2 className="font-semibold">Needs your reply</h2>
            <Link href="/client/inbox?status=needs_reply" className="text-sm text-accent">View all</Link>
          </div>
          <ConversationList conversations={needsReply}
            hrefForConversation={(conversation) => "/client/conversations/" + conversation.id}
            emptyText="No customers need a reply right now." ctaLabel="Open" />
        </div>
        <div className="ui-panel">
          <div className="ui-panel-header flex items-center justify-between gap-3">
            <h2 className="font-semibold">Recent conversations</h2>
            <Link href="/client/inbox" className="text-sm text-accent">View inbox</Link>
          </div>
          <ConversationList conversations={recent}
            hrefForConversation={(conversation) => "/client/conversations/" + conversation.id}
            emptyText="No conversations yet." ctaLabel="Open" />
        </div>
      </section>
    </AppShell>
  );
}

function SetupStep({
  number,
  label,
  detail,
  href,
  done,
}: {
  number: number;
  label: string;
  detail: string;
  href: string;
  done: boolean;
}) {
  return (
    <li>
      <Link href={href} className="flex h-full items-start gap-3 p-4 hover:bg-surface-hover">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{number}</span>
        <span className="min-w-0">
          <span className="block font-medium">{label}</span>
          <span className="mt-1 block text-sm text-muted">{detail}</span>
          {number < 3 ? <span className={`mt-2 block text-xs font-medium ${done ? "text-success" : "text-warning"}`}>{done ? "Added" : "To do"}</span> : null}
        </span>
      </Link>
    </li>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Pending";
  if (seconds < 60) return Math.round(seconds) + "s";
  if (seconds < 3600) return Math.round(seconds / 60) + "m";
  return Math.round(seconds / 3600) + "h";
}
