import { query } from "@/lib/db";
import type {
  ClientCommercialAssumptions,
  ClientLaunchMilestones,
} from "@/lib/types";

export type PilotReadinessSummary = {
  reviewedConversations: number;
  hallucinations: number;
  pilotBlockers: number;
  escalationAccuracy: number | null;
  csatAverage: number | null;
  csatResponses: number;
  timeToFirstPilotConversationSeconds: number | null;
  avgFirstResponseSeconds: number | null;
  timeToLiveAgentSeconds: number | null;
  monthlyLlmCostUsd: number;
  monthlyLlmCostSgd: number;
  estimatedGrossMarginSgd: number | null;
  launchMilestones: ClientLaunchMilestones | null;
  commercialAssumptions: ClientCommercialAssumptions | null;
};

const usdToSgd = 1.35;

export async function getPilotReadinessSummary(
  clientId: string,
): Promise<PilotReadinessSummary> {
  const [
    reviews,
    csat,
    firstConversation,
    firstResponse,
    usage,
    launch,
    commercial,
  ] = await Promise.all([
    query<{
      reviewed: string;
      hallucinations: string;
      blockers: string;
      accuracy_total: string;
      accuracy_passed: string;
    }>(
      `
        select
          count(*) as reviewed,
          count(*) filter (where hallucination = true) as hallucinations,
          count(*) filter (where pilot_blocker = true) as blockers,
          count(*) filter (where answer_label in ('answered_correctly', 'should_have_escalated', 'over_escalated')) as accuracy_total,
          count(*) filter (where answer_label = 'answered_correctly') as accuracy_passed
        from reviews
        where client_id = $1
      `,
      [clientId],
    ),
    query<{ average: string | null; count: string }>(
      `
        select avg(score)::text as average, count(*) as count
        from csat_responses
        where client_id = $1
      `,
      [clientId],
    ),
    query<{ seconds: string | null }>(
      `
        select extract(epoch from (min(c.created_at) - cl.created_at))::text as seconds
        from clients cl
        left join conversations c on c.client_id = cl.id
        where cl.id = $1
        group by cl.id
      `,
      [clientId],
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
        where customer.client_id = $1 and customer.sender_role = 'customer'
      `,
      [clientId],
    ),
    query<{ cost_usd: string | null }>(
      `
        select sum(estimated_cost_usd)::text as cost_usd
        from agent_usage_events
        where client_id = $1
          and created_at >= now() - interval '30 days'
      `,
      [clientId],
    ),
    query<ClientLaunchMilestones>(
      "select * from client_launch_milestones where client_id = $1",
      [clientId],
    ),
    query<ClientCommercialAssumptions>(
      "select * from client_commercial_assumptions where client_id = $1",
      [clientId],
    ),
  ]);

  const reviewRow = reviews.rows[0];
  const accuracyTotal = Number(reviewRow.accuracy_total);
  const accuracyPassed = Number(reviewRow.accuracy_passed);
  const launchMilestones = launch.rows[0] ?? null;
  const commercialAssumptions = commercial.rows[0] ?? null;
  const monthlyLlmCostUsd = Number(usage.rows[0]?.cost_usd ?? 0);
  const monthlyLlmCostSgd = monthlyLlmCostUsd * usdToSgd;
  const grossMargin = commercialAssumptions
    ? estimateGrossMarginSgd(commercialAssumptions, monthlyLlmCostSgd)
    : null;

  return {
    reviewedConversations: Number(reviewRow.reviewed),
    hallucinations: Number(reviewRow.hallucinations),
    pilotBlockers: Number(reviewRow.blockers),
    escalationAccuracy: accuracyTotal ? accuracyPassed / accuracyTotal : null,
    csatAverage: csat.rows[0]?.average ? Number(csat.rows[0].average) : null,
    csatResponses: Number(csat.rows[0]?.count ?? 0),
    timeToFirstPilotConversationSeconds: parseNullableSeconds(firstConversation.rows[0]?.seconds),
    avgFirstResponseSeconds: parseNullableSeconds(firstResponse.rows[0]?.seconds),
    timeToLiveAgentSeconds: timeBetween(
      launchMilestones?.signed_contract_at,
      launchMilestones?.production_live_at,
    ),
    monthlyLlmCostUsd,
    monthlyLlmCostSgd,
    estimatedGrossMarginSgd: grossMargin,
    launchMilestones,
    commercialAssumptions,
  };
}

export async function updateClientLaunchAndCommercial(input: {
  clientId: string;
  signedContractAt: string | null;
  targetLiveAt: string | null;
  productionLiveAt: string | null;
  launchNotes: string | null;
  monthlyRetainerSgd: number;
  setupFeeSgd: number;
  amortizedSetupMonths: number;
  hostingCostSgd: number;
  integrationCostSgd: number;
  includedConversations: number;
  llmCostBufferMultiplier: number;
  actorUserId: string;
}): Promise<void> {
  await query(
    `
      insert into client_launch_milestones (
        client_id,
        signed_contract_at,
        target_live_at,
        production_live_at,
        notes
      )
      values ($1, $2, $3, $4, $5)
      on conflict (client_id) do update set
        signed_contract_at = excluded.signed_contract_at,
        target_live_at = excluded.target_live_at,
        production_live_at = excluded.production_live_at,
        notes = excluded.notes,
        updated_at = now()
    `,
    [
      input.clientId,
      input.signedContractAt,
      input.targetLiveAt,
      input.productionLiveAt,
      input.launchNotes,
    ],
  );
  await query(
    `
      insert into client_commercial_assumptions (
        client_id,
        monthly_retainer_sgd,
        setup_fee_sgd,
        amortized_setup_months,
        hosting_cost_sgd,
        integration_cost_sgd,
        included_conversations,
        llm_cost_buffer_multiplier
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (client_id) do update set
        monthly_retainer_sgd = excluded.monthly_retainer_sgd,
        setup_fee_sgd = excluded.setup_fee_sgd,
        amortized_setup_months = excluded.amortized_setup_months,
        hosting_cost_sgd = excluded.hosting_cost_sgd,
        integration_cost_sgd = excluded.integration_cost_sgd,
        included_conversations = excluded.included_conversations,
        llm_cost_buffer_multiplier = excluded.llm_cost_buffer_multiplier,
        updated_at = now()
    `,
    [
      input.clientId,
      input.monthlyRetainerSgd,
      input.setupFeeSgd,
      input.amortizedSetupMonths,
      input.hostingCostSgd,
      input.integrationCostSgd,
      input.includedConversations,
      input.llmCostBufferMultiplier,
    ],
  );
  await query(
    `
      insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata)
      values ($1, $2, 'client.commercial_assumptions.updated', 'client', $1, $3)
    `,
    [
      input.clientId,
      input.actorUserId,
      {
        monthlyRetainerSgd: input.monthlyRetainerSgd,
        targetLiveAt: input.targetLiveAt,
      },
    ],
  );
}

function estimateGrossMarginSgd(
  assumptions: ClientCommercialAssumptions,
  monthlyLlmCostSgd: number,
): number {
  const amortizedSetup =
    Number(assumptions.setup_fee_sgd) /
    Math.max(1, Number(assumptions.amortized_setup_months));
  const bufferedLlmCost =
    monthlyLlmCostSgd * Number(assumptions.llm_cost_buffer_multiplier);
  return (
    Number(assumptions.monthly_retainer_sgd) +
    amortizedSetup -
    Number(assumptions.hosting_cost_sgd) -
    Number(assumptions.integration_cost_sgd) -
    bufferedLlmCost
  );
}

function parseNullableSeconds(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timeBetween(start: Date | null | undefined, end: Date | null | undefined): number | null {
  if (!start || !end) {
    return null;
  }
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}
