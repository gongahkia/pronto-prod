import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAgentConfigDetail } from "@/lib/agent/config";
import { getBrandVoiceProfile } from "@/lib/brand-voice";
import {
  getChannels,
  getClientAttentionItems,
  getClient,
  getKnowledgeSources,
  getMetrics,
  getOpenEscalations,
  getRecentConversations,
} from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { OperatorAgentConfigPanel } from "@/components/agent-config-panels";
import { Badge } from "@/components/badge";
import { OperatorBrandVoicePanel } from "@/components/local-release-panels";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { StatCard } from "@/components/stat-card";
import { approvedChopeBookingLink } from "@/lib/reservations/chope";

type OverviewSection =
  | "workspace"
  | "conversations"
  | "voice"
  | "tuning";

const overviewTabs: { id: OverviewSection; label: string; detail: string }[] = [
  { id: "workspace", label: "Workspace", detail: "Launch and links" },
  { id: "conversations", label: "Conversations", detail: "Recent activity" },
  { id: "voice", label: "Brand voice", detail: "Style guide" },
  { id: "tuning", label: "Agent tuning", detail: "Model and prompt" },
];

export default async function ClientOperatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const resolvedSearchParams = await searchParams;
  const client = await getClient(clientId);
  if (!client) {
    notFound();
  }
  const activeSection = normalizeOverviewSection(resolvedSearchParams?.section);
  const basePath = `/operator/clients/${client.id}`;
  const activeReturnTo = `${basePath}?section=${activeSection}`;

  const [
    metrics,
    channels,
    knowledge,
    escalations,
    attentionItems,
  ] = await Promise.all([
    getMetrics(client.id),
    getChannels(client.id),
    getKnowledgeSources(client.id),
    getOpenEscalations(client.id),
    getClientAttentionItems(client.id),
  ]);
  const [
    conversations,
    brandVoice,
    agentConfig,
  ] = await Promise.all([
    activeSection === "conversations"
      ? getRecentConversations(client.id, 5)
      : Promise.resolve([]),
    activeSection === "voice"
      ? getBrandVoiceProfile(client.id)
      : Promise.resolve(null),
    activeSection === "tuning"
      ? getAgentConfigDetail(client.id)
      : Promise.resolve(null),
  ]);
  const activeChannels = channels.filter((channel) => channel.status === "active").length;
  const setupChannels = channels.filter((channel) => channel.status !== "disabled").length;

  const workspaceLinks = [
    {
      href: `/operator/clients/${client.id}/channels`,
      label: "Channels",
      detail: `${activeChannels}/${channels.length} active`,
    },
    {
      href: `/operator/clients/${client.id}/knowledge`,
      label: "Knowledge",
      detail: `${knowledge.length} sources`,
    },
    {
      href: `/operator/clients/${client.id}/conversations`,
      label: "Conversations",
      detail: `${escalations.length} need triage`,
    },
  ];

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader client={client} />
      <OperatorClientNav clientId={client.id} active="overview" />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Conversations" value={metrics.conversations} />
        <StatCard label="Escalation rate" value={`${Math.round(metrics.escalationRate * 100)}%`} />
        <StatCard label="Actionable triage" value={metrics.openEscalations} />
      </section>

      <OperatorOverviewTabs
        basePath={basePath}
        activeSection={activeSection}
      />

      <div className="mt-4">
        {activeSection === "workspace" ? (
          <WorkspaceSection
            clientStatus={client.status}
            setupChannels={setupChannels}
            channelCount={channels.length}
            activeChannels={activeChannels}
            knowledgeCount={knowledge.length}
            actionableTriage={escalations.length}
            workspaceLinks={workspaceLinks}
            clientId={client.id}
            chopeBooking={approvedChopeBookingLink(client.business_profile)}
            attentionItems={attentionItems}
          />
        ) : null}

        {activeSection === "conversations" ? (
          <RecentConversationsSection
            clientId={client.id}
            conversations={conversations}
          />
        ) : null}

        {activeSection === "voice" && brandVoice ? (
          <OperatorBrandVoicePanel
            clientId={client.id}
            profile={brandVoice}
            returnTo={activeReturnTo}
          />
        ) : null}

        {activeSection === "tuning" ? (
          <OperatorAgentConfigPanel
            clientId={client.id}
            detail={agentConfig}
            returnTo={activeReturnTo}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function OperatorOverviewTabs({
  basePath,
  activeSection,
}: {
  basePath: string;
  activeSection: OverviewSection;
}) {
  return (
    <nav className="mt-5 grid gap-2 rounded-lg border border-line bg-panel p-1 md:grid-cols-4">
      {overviewTabs.map((tab) => {
        const isActive = activeSection === tab.id;
        return (
          <Link
            key={tab.id}
            href={`${basePath}?section=${tab.id}`}
            className={`rounded-md px-3 py-2 text-sm transition ${
              isActive
                ? "bg-surface text-link"
                : "text-muted hover:bg-surface-hover hover:text-link"
            }`}
          >
            <span className="block font-medium">{tab.label}</span>
            <span className="block text-xs text-muted">{tab.detail}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function WorkspaceSection({
  clientId,
  chopeBooking,
  attentionItems,
  clientStatus,
  setupChannels,
  channelCount,
  activeChannels,
  knowledgeCount,
  actionableTriage,
  workspaceLinks,
}: {
  clientId: string;
  chopeBooking: { outletId: string; url: string; verifiedAt: string } | null;
  attentionItems: Array<{ id: string; kind: string; status: string; channel_name: string; last_error: string | null }>;
  clientStatus: string;
  setupChannels: number;
  channelCount: number;
  activeChannels: number;
  knowledgeCount: number;
  actionableTriage: number;
  workspaceLinks: { href: string; label: string; detail: string }[];
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Launch readiness</h2>
        </div>
        <div className="space-y-4 p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted">Client status</span>
            <Badge tone="amber">{clientStatus}</Badge>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted">Channels configured</span>
            <span className="font-medium">{setupChannels}/{channelCount}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted">Active channels</span>
            <span className="font-medium">{activeChannels}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted">Knowledge sources</span>
            <span className="font-medium">{knowledgeCount}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted">Actionable triage</span>
            <span className="font-medium">{actionableTriage}</span>
          </div>
        </div>
      </div>
      <div className="ui-panel">
        <div className="ui-panel-header"><h2 className="text-base font-semibold">Processing and delivery attention</h2></div>
        <div className="space-y-2 p-4 text-sm">
          {attentionItems.length ? attentionItems.map((item) => (
            <div key={item.id} className="rounded-md border border-line p-2">
              <span className="font-medium">{item.channel_name}: {item.kind} {item.status}</span>
              {item.last_error ? <p className="text-muted">{item.last_error}</p> : null}
              {item.kind === "inbound" && item.status === "dead" ? (
                <form action={`/api/operator/inbound-jobs/${item.id}/retry`} method="post" className="mt-2">
                  <input type="hidden" name="clientId" value={clientId} />
                  <button className="ui-button px-2 py-1">Retry after fixing cause</button>
                </form>
              ) : null}
            </div>
          )) : <p className="text-muted">No exhausted inbound jobs or uncertain outbound sends.</p>}
        </div>
      </div>
      <div className="ui-panel">
        <div className="ui-panel-header"><h2 className="text-base font-semibold">Chope booking handoff</h2></div>
        <div className="space-y-3 p-4 text-sm">
          <p className="text-muted">Direct Chope API bookings are unavailable. A verified outlet link lets customers confirm on Chope.</p>
          {chopeBooking ? <p>Verified outlet: {chopeBooking.outletId}</p> : <p>No verified outlet link configured.</p>}
          <form action={`/api/operator/clients/${clientId}/chope-link`} method="post" className="space-y-2">
            <input name="outletId" aria-label="Chope outlet ID" placeholder="Chope outlet ID" defaultValue={chopeBooking?.outletId ?? ""} className="w-full rounded-md border border-line px-3 py-2" required />
            <input name="url" aria-label="Chope outlet booking URL" placeholder="https://www.chope.co/..." defaultValue={chopeBooking?.url ?? ""} className="w-full rounded-md border border-line px-3 py-2" required />
            <label className="flex gap-2"><input type="checkbox" name="verified" value="yes" required /> I checked this exact restaurant outlet and booking link.</label>
            <button className="ui-button px-3 py-2">Save verified link</button>
          </form>
          {chopeBooking ? <form action={`/api/operator/clients/${clientId}/chope-link`} method="post">
            <input type="hidden" name="action" value="clear" />
            <button className="ui-button px-3 py-2">Remove link</button>
          </form> : null}
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="text-base font-semibold">Client workspace</h2>
        </div>
        <div className="divide-y divide-line">
          {workspaceLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover"
            >
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted">{item.detail}</p>
              </div>
              <ArrowRight size={17} className="text-muted" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentConversationsSection({
  clientId,
  conversations,
}: {
  clientId: string;
  conversations: Awaited<ReturnType<typeof getRecentConversations>>;
}) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-header">
        <h2 className="text-base font-semibold">Recent conversations</h2>
      </div>
      <div className="divide-y divide-line">
        {conversations.length === 0 ? (
          <p className="p-4 text-sm text-muted">No conversations yet.</p>
        ) : (
          conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/operator/clients/${clientId}/conversations/${conversation.id}`}
              className="block p-4 hover:bg-surface-hover"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{conversation.customer_name ?? conversation.customer_handle}</p>
                <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
                  {conversation.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{conversation.last_message}</p>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function normalizeOverviewSection(
  value: string | string[] | undefined,
): OverviewSection {
  const candidate = Array.isArray(value) ? value[0] : value;
  return overviewTabs.some((tab) => tab.id === candidate)
    ? (candidate as OverviewSection)
    : "workspace";
}
