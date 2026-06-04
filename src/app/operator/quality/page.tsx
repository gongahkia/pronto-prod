import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getMetrics,
  getOpenEscalations,
  getOperatorConversationTriage,
} from "@/lib/dashboard";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { OperatorNav } from "@/components/operator/operator-nav";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function OperatorQualityPage() {
  const user = await requireUser("operator");
  const [metrics, escalations, conversations] = await Promise.all([
    getMetrics(),
    getOpenEscalations(),
    getOperatorConversationTriage(25),
  ]);
  const escalatedConversations = conversations.filter(
    (conversation) => conversation.status === "escalated",
  );

  return (
    <AppShell user={user} active="operator">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Quality</h1>
        <p className="text-sm text-muted">
          Internal QA view for hallucinations, over-escalation, missing knowledge, and pilot blockers.
        </p>
      </div>
      <OperatorNav active="quality" />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Hallucinations" value={metrics.hallucinationIncidents} hint="Target: zero" />
        <StatCard label="Escalation rate" value={`${Math.round(metrics.escalationRate * 100)}%`} />
        <StatCard label="Open escalations" value={metrics.openEscalations} />
        <StatCard label="Recent review queue" value={conversations.length} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Review queue</h2>
          </div>
          <div className="divide-y divide-line">
            {conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted">No conversations available for review.</p>
            ) : (
              conversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/operator/clients/${conversation.client_id}/conversations?conversationId=${conversation.id}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-stone-50"
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

        <div className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-4">
            <h2 className="text-base font-semibold">Escalation QA</h2>
          </div>
          <div className="divide-y divide-line">
            {escalatedConversations.length === 0 && escalations.length === 0 ? (
              <p className="p-4 text-sm text-muted">No active escalation cases to audit.</p>
            ) : (
              escalations.map((escalation) => (
                <Link
                  key={escalation.id}
                  href={`/operator/clients/${escalation.client_id}/escalations#escalation-${escalation.id}`}
                  className="block p-4 hover:bg-stone-50"
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
      </section>
    </AppShell>
  );
}
