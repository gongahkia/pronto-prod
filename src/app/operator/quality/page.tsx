import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getMetrics,
  getOpenEscalations,
} from "@/lib/dashboard";
import {
  getFilteredConversations,
  getKnowledgeGapReport,
  getOperatorCommandCenter,
  type FilteredConversation,
} from "@/lib/reporting";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";
import { ConversationList, KnowledgeGapPanel } from "@/components/reporting-panels";

export default async function OperatorQualityPage() {
  const user = await requireUser("operator");
  const [commandCenter, metrics, escalations, conversations, gaps] = await Promise.all([
    getOperatorCommandCenter(),
    getMetrics(),
    getOpenEscalations(),
    getFilteredConversations({ limit: 30 }),
    getKnowledgeGapReport({ limit: 20 }),
  ]);
  const reviewQueue = prioritizeQualityReview(conversations);
  const unreviewed = reviewQueue.filter((conversation) => !conversation.latest_review_label).length;

  return (
    <AppShell
      user={user}
      active="operator"
      operatorActive="quality"
    >
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Quality</h1>
        <p className="text-sm text-muted">
          Internal QA view for hallucinations, over-escalation, missing knowledge, and pilot blockers.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard label="Hallucinations" value={metrics.hallucinationIncidents} hint="Target: zero" />
        <StatCard label="Quality blockers" value={commandCenter.qualityBlockers} hint="Pilot-impacting" />
        <StatCard label="Escalation rate" value={`${Math.round(metrics.escalationRate * 100)}%`} />
        <StatCard label="Unreviewed" value={unreviewed} />
        <StatCard label="Knowledge gaps" value={gaps.length} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="ui-panel">
          <div className="ui-panel-header">
            <div>
              <h2 className="text-base font-semibold">Review queue</h2>
              <p className="text-sm text-muted">
                Unreviewed and escalated conversations first.
              </p>
            </div>
          </div>
          <ConversationList
            conversations={reviewQueue}
            hrefForConversation={(conversation) =>
              `/operator/clients/${conversation.client_id}/conversations/${conversation.id}`
            }
            showClient
            emptyText="No conversations available for QA review."
            ctaLabel="Review"
          />
        </div>

        <div className="space-y-6">
          <div className="ui-panel">
            <div className="ui-panel-header">
              <div>
                <h2 className="text-base font-semibold">Triage QA</h2>
                <p className="text-sm text-muted">
                  Audit whether the right issues reached a human.
                </p>
              </div>
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

function prioritizeQualityReview(conversations: FilteredConversation[]): FilteredConversation[] {
  return [...conversations].sort((left, right) => {
    const priorityDelta = reviewPriority(right) - reviewPriority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return right.last_message_at.getTime() - left.last_message_at.getTime();
  });
}

function reviewPriority(conversation: FilteredConversation): number {
  if (!conversation.latest_review_label && conversation.active_escalation_id) {
    return 4;
  }
  if (!conversation.latest_review_label) {
    return 3;
  }
  if (
    conversation.latest_review_label === "hallucinated" ||
    conversation.latest_review_label === "should_have_escalated" ||
    conversation.latest_review_label === "needs_knowledge_update"
  ) {
    return 2;
  }
  if (conversation.latest_review_label === "over_escalated") {
    return 1;
  }
  return 0;
}
