import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getMetrics,
  getOpenEscalations,
  getOperatorConversationTriage,
} from "@/lib/dashboard";
import { getKnowledgeGapReport, getSlaSummary } from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { OperatorNav } from "@/components/operator/operator-nav";
import { StatCard } from "@/components/stat-card";
import {
  KnowledgeGapPanel,
  SlaPanel,
} from "@/components/reporting-panels";

export const dynamic = "force-dynamic";

export default async function OperatorQualityPage() {
  const user = await requireUser("operator");
  const [metrics, escalations, conversations, gaps, sla] = await Promise.all([
    getMetrics(),
    getOpenEscalations(),
    getOperatorConversationTriage(25),
    getKnowledgeGapReport({ limit: 20 }),
    getSlaSummary(),
  ]);

  return (
    <AppShell user={user} active="operator">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Quality</h1>
        <p className="text-sm text-muted">
          Internal QA view for hallucinations, over-escalation, missing knowledge, and pilot blockers.
        </p>
      </div>
      <OperatorNav active="quality" />

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard label="Hallucinations" value={metrics.hallucinationIncidents} hint="Target: zero" />
        <StatCard label="Escalation rate" value={`${Math.round(metrics.escalationRate * 100)}%`} />
        <StatCard label="Actionable triage" value={metrics.openEscalations} />
        <StatCard label="Knowledge gaps" value={gaps.length} />
        <StatCard label="Recent review queue" value={conversations.length} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="text-base font-semibold">Review queue</h2>
          </div>
          <div className="divide-y divide-line">
            {conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted">No conversations available for review.</p>
            ) : (
              conversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/operator/clients/${conversation.client_id}/conversations/${conversation.id}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{conversation.client_name}</p>
                      <Badge tone={conversation.status === "escalated" ? "red" : "green"}>
                        {conversation.status}
                      </Badge>
                      {conversation.active_escalation_reason_code ? (
                        <Badge tone="red">{conversation.active_escalation_reason_code}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">{conversation.last_message}</p>
                  </div>
                  <ArrowRight size={17} className="shrink-0 text-muted" />
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <SlaPanel summary={sla} />
          <div className="ui-panel">
            <div className="ui-panel-header">
              <h2 className="text-base font-semibold">Triage QA</h2>
            </div>
            <div className="divide-y divide-line">
              {escalations.length === 0 ? (
                <p className="p-4 text-sm text-muted">No active triage cases to audit.</p>
              ) : (
                escalations.map((escalation) => (
                  <Link
                    key={escalation.id}
                    href={`/operator/clients/${escalation.client_id}/conversations/${escalation.conversation_id}`}
                    className="block p-4 hover:bg-surface-hover"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{escalation.client_name}</p>
                      <Badge tone="red">{escalation.reason_code}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">{escalation.customer_message}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6">
        <KnowledgeGapPanel
          gaps={gaps}
          hrefForGap={(gap) =>
            `/operator/clients/${gap.client_id}/conversations/${gap.conversation_id}`
          }
        />
      </div>
    </AppShell>
  );
}
