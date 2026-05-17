import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  answerLabels,
  failureSeverities,
  fixOwners,
  optionalEnumValue,
  rootCauses,
} from "@/lib/reviews";

export async function POST(request: Request) {
  const user = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const conversationId = String(form.get("conversationId") ?? "");
  const hallucination = form.get("hallucination") === "on";
  const escalationWasNeeded = form.get("escalationWasNeeded");
  const csatRaw = String(form.get("csat") ?? "");
  const notes = String(form.get("notes") ?? "");
  const answerLabel = optionalEnumValue(form.get("answerLabel"), answerLabels);
  const failureSeverity = optionalEnumValue(
    form.get("failureSeverity"),
    failureSeverities,
  );
  const rootCause = optionalEnumValue(form.get("rootCause"), rootCauses);
  const fixOwner = optionalEnumValue(form.get("fixOwner"), fixOwners);
  const knowledgeUpdateNeeded = form.get("knowledgeUpdateNeeded") === "on";
  const pilotBlocker = form.get("pilotBlocker") === "on";

  const review = await query<{ id: string }>(
    `
      insert into reviews (
        client_id,
        conversation_id,
        reviewer_id,
        hallucination,
        escalation_was_needed,
        csat,
        notes,
        answer_label,
        failure_severity,
        root_cause,
        fix_owner,
        knowledge_update_needed,
        pilot_blocker
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      returning id
    `,
    [
      clientId,
      conversationId,
      user.userId,
      hallucination,
      escalationWasNeeded === "" ? null : escalationWasNeeded === "true",
      csatRaw ? Number(csatRaw) : null,
      notes || null,
      answerLabel,
      failureSeverity,
      rootCause,
      fixOwner,
      knowledgeUpdateNeeded,
      pilotBlocker,
    ],
  );

  await query(
    "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'review.created', 'review', $3, $4)",
    [
      clientId,
      user.userId,
      review.rows[0].id,
      {
        conversationId,
        answerLabel,
        failureSeverity,
        rootCause,
        fixOwner,
        knowledgeUpdateNeeded,
        pilotBlocker,
      },
    ],
  );

  return NextResponse.redirect(new URL(`/operator/clients/${clientId}`, request.url), 303);
}
