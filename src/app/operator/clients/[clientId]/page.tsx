import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAgentConfigDetail } from "@/lib/agent/config";
import { getBrandVoiceProfile } from "@/lib/brand-voice";
import {
  getChannels,
  getClient,
  getKnowledgeSources,
  getMetrics,
  getOpenEscalations,
  getRecentConversations,
} from "@/lib/dashboard";
import { getPilotReadinessSummary } from "@/lib/pilot-metrics";
import { AppShell } from "@/components/shell";
import { OperatorAgentConfigPanel } from "@/components/agent-config-panels";
import { Badge } from "@/components/badge";
import {
  OperatorBrandVoicePanel,
  OperatorCommercialPanel,
  PilotReadinessPanel,
} from "@/components/local-release-panels";
import {
  OperatorClientHeader,
  OperatorClientNav,
} from "@/components/operator/operator-nav";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

type OverviewSection =
  | "workspace"
  | "conversations"
  | "pilot"
  | "commercial"
  | "voice"
  | "tuning";

const overviewTabs: { id: OverviewSection; label: string; detail: string }[] = [
  { id: "workspace", label: "Workspace", detail: "Launch and links" },
  { id: "conversations", label: "Conversations", detail: "Recent activity" },
  { id: "pilot", label: "Pilot", detail: "Quality gates" },
  { id: "commercial", label: "Commercial", detail: "Pricing inputs" },
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
  ] = await Promise.all([
    getMetrics(client.id),
    getChannels(client.id),
    getKnowledgeSources(client.id),
    getOpenEscalations(client.id),
  ]);
  const [
    conversations,
    pilotSummary,
    brandVoice,
    agentConfig,
  ] = await Promise.all([
    activeSection === "conversations"
      ? getRecentConversations(client.id, 5)
      : Promise.resolve([]),
    activeSection === "pilot" || activeSection === "commercial"
      ? getPilotReadinessSummary(client.id)
      : Promise.resolve(null),
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
      href: `/operator/clients/${client.id}/flows`,
      label: "Flows",
      detail: "Runtime guardrails",
    },
    {
      href: `/operator/clients/${client.id}/conversations`,
      label: "Conversations",
      detail: `${escalations.length} need triage`,
    },
    {
      href: `/operator/clients/${client.id}/test`,
      label: "Test assistant",
      detail: "QA console",
    },
  ];

  return (
    <AppShell user={user} active="operator">
      <OperatorClientHeader client={client} />
      <OperatorClientNav clientId={client.id} active="overview" />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Conversations" value={metrics.conversations} />
        <StatCard label="Escalation rate" value={`${Math.round(metrics.escalationRate * 100)}%`} />
        <StatCard label="Actionable triage" value={metrics.openEscalations} />
        <StatCard label="Hallucinations" value={metrics.hallucinationIncidents} />
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
          />
        ) : null}

        {activeSection === "conversations" ? (
          <RecentConversationsSection
            clientId={client.id}
            conversations={conversations}
          />
        ) : null}

        {activeSection === "pilot" && pilotSummary ? (
          <PilotReadinessPanel summary={pilotSummary} />
        ) : null}

        {activeSection === "commercial" && pilotSummary ? (
          <OperatorCommercialPanel
            client={client}
            summary={pilotSummary}
            returnTo={activeReturnTo}
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
    <nav className="mt-5 grid gap-2 rounded-lg border border-line bg-panel p-1 md:grid-cols-3 xl:grid-cols-6">
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
  clientStatus,
  setupChannels,
  channelCount,
  activeChannels,
  knowledgeCount,
  actionableTriage,
  workspaceLinks,
}: {
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
