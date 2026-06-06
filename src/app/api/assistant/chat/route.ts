import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { buildAssistantContext } from "@/lib/assistant/context";
import { generateAssistantTurn } from "@/lib/assistant/llm";
import {
  addAssistantMessage,
  createAssistantActionProposals,
  getOrCreateAssistantThread,
} from "@/lib/assistant/store";
import { isAssistantActionAllowedForUser } from "@/lib/assistant/actions";
import { logWarn, redactErrorMessage } from "@/lib/logger";

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  threadId: z.string().uuid().optional().nullable(),
  pagePath: z.string().max(300).optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  const requestId = randomUUID();
  let parsed: z.infer<typeof chatRequestSchema>;
  try {
    parsed = chatRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid assistant request." }, { status: 400 });
  }

  try {
    const context = await buildAssistantContext({
      user,
      message: parsed.message,
      pagePath: parsed.pagePath,
      clientId: parsed.clientId,
    });
    const thread = await getOrCreateAssistantThread({
      user,
      threadId: parsed.threadId,
      clientId: context.focusedClientId,
      pagePath: context.pagePath,
      firstMessage: parsed.message,
    });
    await addAssistantMessage({
      threadId: thread.id,
      userId: user.userId,
      role: "user",
      body: parsed.message,
      metadata: {
        pagePath: context.pagePath,
        focusedClientId: context.focusedClientId,
        focusedConversationId: context.focusedConversationId,
        intent: context.intent,
        roleMode: context.roleMode,
        requestId,
      },
    });

    const generated = await generateAssistantTurn({
      context,
      message: parsed.message,
      requestId,
    });
    const safeProposals = generated.actionProposals.filter((proposal) =>
      isAssistantActionAllowedForUser(user, proposal.actionType),
    );
    const assistantMessage = await addAssistantMessage({
      threadId: thread.id,
      role: "assistant",
      body: generated.answer,
      metadata: {
        requestId,
        citedRecords: generated.citedRecords,
        followUpQuestions: generated.followUpQuestions,
        contextRecordCount: context.records.length,
        focusedRecordCount: context.focusedRecords.length,
        intent: context.intent,
        roleMode: context.roleMode,
        focusedConversationId: context.focusedConversationId,
      },
    });
    const proposals = await createAssistantActionProposals({
      threadId: thread.id,
      messageId: assistantMessage.id,
      userId: user.userId,
      proposals: safeProposals,
      citations: generated.citedRecords,
    });

    return NextResponse.json({
      threadId: thread.id,
      message: assistantMessage,
      citedRecords: generated.citedRecords,
      followUpQuestions: generated.followUpQuestions,
      proposals,
    });
  } catch (error) {
    logWarn("assistant.chat_failed", {
      requestId,
      userId: user.userId,
      role: user.role,
      error: redactErrorMessage(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assistant failed." },
      { status: 500 },
    );
  }
}
