import { query } from "@/lib/db";

export type MonthlyReportWindow = {
  clientId: string;
  windowStart: Date;
  windowEnd: Date;
};

export type MonthlyReportMetrics = {
  conversations: number;
  escalations: number;
  escalationRate: number;
  csatAverage: number | null;
  csatResponses: number;
  avgFirstResponseSeconds: number | null;
  knowledgeGapCount: number;
};

export type MonthlyReportTopReasons = { reason_code: string; count: number }[];

export type MonthlyReportRecommendation = {
  type: "knowledge_update" | "escalation_review" | "csat_followup";
  detail: string;
};

export type MonthlyCheckInReport = {
  clientId: string;
  clientName: string;
  windowStart: Date;
  windowEnd: Date;
  metrics: MonthlyReportMetrics;
  topEscalationReasons: MonthlyReportTopReasons;
  recommendations: MonthlyReportRecommendation[];
};

export function defaultMonthlyWindow(asOf: Date = new Date()): {
  windowStart: Date;
  windowEnd: Date;
} {
  const windowEnd = new Date(asOf);
  windowEnd.setUTCHours(23, 59, 59, 999);
  const windowStart = new Date(asOf);
  windowStart.setUTCDate(windowStart.getUTCDate() - 30);
  windowStart.setUTCHours(0, 0, 0, 0);
  return { windowStart, windowEnd };
}

export async function generateMonthlyCheckInReport(
  input: MonthlyReportWindow,
): Promise<MonthlyCheckInReport> {
  const { clientId, windowStart, windowEnd } = input;

  const [clientRow, convoStats, csat, firstResponse, gapCount, topReasons] =
    await Promise.all([
      query<{ id: string; name: string }>("select id, name from clients where id = $1", [
        clientId,
      ]),
      query<{ conversations: string; escalations: string }>(
        `
          select
            (select count(*) from conversations
              where client_id = $1 and created_at >= $2 and created_at < $3) as conversations,
            (select count(*) from escalations
              where client_id = $1 and created_at >= $2 and created_at < $3) as escalations
        `,
        [clientId, windowStart, windowEnd],
      ),
      query<{ average: string | null; count: string }>(
        `
          select avg(score)::text as average, count(*) as count
          from csat_responses
          where client_id = $1 and created_at >= $2 and created_at < $3
        `,
        [clientId, windowStart, windowEnd],
      ),
      query<{ seconds: string | null }>(
        `
          select avg(extract(epoch from (first_response.created_at - customer.created_at)))::text as seconds
          from messages customer
          join lateral (
            select created_at
            from messages
            where conversation_id = customer.conversation_id
              and sender_role in ('agent', 'operator')
              and created_at > customer.created_at
            order by created_at asc
            limit 1
          ) first_response on true
          where customer.client_id = $1
            and customer.sender_role = 'customer'
            and customer.created_at >= $2
            and customer.created_at < $3
        `,
        [clientId, windowStart, windowEnd],
      ),
      query<{ count: string }>(
        `
          select count(distinct conversation_id) as count
          from escalations
          where client_id = $1
            and reason_code in ('low_confidence', 'unknown_policy', 'no_answer')
            and created_at >= $2 and created_at < $3
        `,
        [clientId, windowStart, windowEnd],
      ),
      query<{ reason_code: string; count: string }>(
        `
          select reason_code, count(*) as count
          from escalations
          where client_id = $1 and created_at >= $2 and created_at < $3
          group by reason_code
          order by count(*) desc
          limit 5
        `,
        [clientId, windowStart, windowEnd],
      ),
    ]);

  const client = clientRow.rows[0];
  if (!client) {
    throw new Error(`Client not found: ${clientId}`);
  }

  const conversations = Number(convoStats.rows[0]?.conversations ?? 0);
  const escalations = Number(convoStats.rows[0]?.escalations ?? 0);
  const csatAverage = parseNullable(csat.rows[0]?.average);
  const csatResponses = Number(csat.rows[0]?.count ?? 0);
  const knowledgeGapCount = Number(gapCount.rows[0]?.count ?? 0);

  const metrics: MonthlyReportMetrics = {
    conversations,
    escalations,
    escalationRate: conversations ? escalations / conversations : 0,
    csatAverage,
    csatResponses,
    avgFirstResponseSeconds: parseNullable(firstResponse.rows[0]?.seconds),
    knowledgeGapCount,
  };

  const recommendations: MonthlyReportRecommendation[] = [];
  if (knowledgeGapCount >= 3) {
    recommendations.push({
      type: "knowledge_update",
      detail: `${knowledgeGapCount} conversations hit low-confidence or unknown-policy paths. Review source coverage and add missing FAQs.`,
    });
  }
  if (csatAverage !== null && csatAverage < 4 && csatResponses >= 5) {
    recommendations.push({
      type: "csat_followup",
      detail: `CSAT average ${csatAverage.toFixed(2)} across ${csatResponses} responses is below target. Inspect low-score conversations for tone or accuracy issues.`,
    });
  }
  if (metrics.escalationRate > 0.4) {
    recommendations.push({
      type: "escalation_review",
      detail: `Escalation rate ${(metrics.escalationRate * 100).toFixed(1)}% exceeds the 40% guardrail. Audit escalation reasons and refine guardrails.`,
    });
  }

  return {
    clientId,
    clientName: client.name,
    windowStart,
    windowEnd,
    metrics,
    topEscalationReasons: topReasons.rows.map((row) => ({
      reason_code: row.reason_code,
      count: Number(row.count),
    })),
    recommendations,
  };
}

export function formatMonthlyCheckInReport(report: MonthlyCheckInReport): string {
  const lines: string[] = [];
  lines.push(`Monthly check-in: ${report.clientName}`);
  lines.push(
    `Window: ${report.windowStart.toISOString().slice(0, 10)} → ${report.windowEnd.toISOString().slice(0, 10)}`,
  );
  lines.push("");
  lines.push("Metrics:");
  lines.push(`  Conversations: ${report.metrics.conversations}`);
  lines.push(`  Escalations:   ${report.metrics.escalations}`);
  lines.push(
    `  Escalation rate: ${(report.metrics.escalationRate * 100).toFixed(1)}%`,
  );
  if (report.metrics.csatAverage !== null) {
    lines.push(
      `  CSAT: ${report.metrics.csatAverage.toFixed(2)} across ${report.metrics.csatResponses} responses`,
    );
  } else {
    lines.push(`  CSAT: no responses in window`);
  }
  if (report.metrics.avgFirstResponseSeconds !== null) {
    lines.push(
      `  Avg first response: ${Math.round(report.metrics.avgFirstResponseSeconds)}s`,
    );
  }
  lines.push(`  Knowledge gaps: ${report.metrics.knowledgeGapCount}`);

  if (report.topEscalationReasons.length) {
    lines.push("");
    lines.push("Top escalation reasons:");
    for (const row of report.topEscalationReasons) {
      lines.push(`  ${row.reason_code}: ${row.count}`);
    }
  }

  if (report.recommendations.length) {
    lines.push("");
    lines.push("Recommendations:");
    for (const rec of report.recommendations) {
      lines.push(`  [${rec.type}] ${rec.detail}`);
    }
  }

  return lines.join("\n");
}

function parseNullable(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
