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

export default async function ClientOperatorPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireUser("operator");
  const { clientId } = await params;
  const client = await getClient(clientId);
  if (!client) {
    notFound();
  }

  const [
    metrics,
    channels,
    knowledge,
    escalations,
    conversations,
    agentConfig,
    brandVoice,
    pilotSummary,
  ] = await Promise.all([
    getMetrics(client.id),
    getChannels(client.id),
    getKnowledgeSources(client.id),
    getOpenEscalations(client.id),
    getRecentConversations(client.id, 5),
    getAgentConfigDetail(client.id),
    getBrandVoiceProfile(client.id),
    getPilotReadinessSummary(client.id),
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

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Launch readiness</h2>
          </div>
          <div className="space-y-4 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted">Client status</span>
              <Badge tone="amber">{client.status}</Badge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted">Channels configured</span>
              <span className="font-medium">{setupChannels}/{channels.length}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted">Active channels</span>
              <span className="font-medium">{activeChannels}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted">Knowledge sources</span>
              <span className="font-medium">{knowledge.length}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted">Actionable triage</span>
              <span className="font-medium">{escalations.length}</span>
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

      <section className="mt-6 ui-panel">
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
              href={`/operator/clients/${client.id}/conversations/${conversation.id}`}
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

      <section className="mt-6">
        <PilotReadinessPanel summary={pilotSummary} />
      </section>

      <section className="mt-6">
        <OperatorCommercialPanel client={client} summary={pilotSummary} />
      </section>

      <section className="mt-6">
        <OperatorBrandVoicePanel clientId={client.id} profile={brandVoice} />
      </section>

      <section className="mt-6">
        <OperatorAgentConfigPanel clientId={client.id} detail={agentConfig} />
      </section>
    </AppShell>
  );
}
