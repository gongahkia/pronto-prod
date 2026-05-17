import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const user = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const conversationId = String(form.get("conversationId") ?? "");
  const hallucination = form.get("hallucination") === "on";
  const escalationWasNeeded = form.get("escalationWasNeeded");
  const csatRaw = String(form.get("csat") ?? "");
  const notes = String(form.get("notes") ?? "");

  await query(
    `
      insert into reviews (client_id, conversation_id, reviewer_id, hallucination, escalation_was_needed, csat, notes)
      values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      clientId,
      conversationId,
      user.userId,
      hallucination,
      escalationWasNeeded === "" ? null : escalationWasNeeded === "true",
      csatRaw ? Number(csatRaw) : null,
      notes || null,
    ],
  );

  return NextResponse.redirect(new URL(`/operator/clients/${clientId}`, request.url), 303);
}

