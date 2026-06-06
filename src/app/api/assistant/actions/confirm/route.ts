import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { executeAssistantAction } from "@/lib/assistant/actions";
import {
  addAssistantMessage,
  getPendingActionProposal,
  markActionProposalExecuted,
  markActionProposalFailed,
} from "@/lib/assistant/store";
import { logWarn, redactErrorMessage } from "@/lib/logger";

const confirmRequestSchema = z.object({
  proposalId: z.string().uuid(),
  confirmationText: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  let parsed: z.infer<typeof confirmRequestSchema>;
  try {
    parsed = confirmRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid action confirmation." }, { status: 400 });
  }

  const proposal = await getPendingActionProposal({
    user,
    proposalId: parsed.proposalId,
  });
  if (!proposal) {
    return NextResponse.json({ error: "Pending action proposal not found." }, { status: 404 });
  }

  try {
    const result = await executeAssistantAction({
      user,
      proposal,
      confirmationText: parsed.confirmationText,
    });
    await markActionProposalExecuted({
      proposalId: proposal.id,
      result,
    });
    const message = await addAssistantMessage({
      threadId: proposal.thread_id,
      role: "system",
      body: result.message,
      metadata: {
        actionProposalId: proposal.id,
        actionType: proposal.action_type,
        result,
      },
    });
    return NextResponse.json({ proposalId: proposal.id, result, message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed.";
    await markActionProposalFailed({
      proposalId: proposal.id,
      error: message,
    });
    await addAssistantMessage({
      threadId: proposal.thread_id,
      role: "system",
      body: `Action failed: ${message}`,
      metadata: {
        actionProposalId: proposal.id,
        actionType: proposal.action_type,
        error: message,
      },
    });
    logWarn("assistant.action_failed", {
      userId: user.userId,
      proposalId: proposal.id,
      actionType: proposal.action_type,
      error: redactErrorMessage(error),
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
