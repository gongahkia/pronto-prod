import { query } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import type {
  AssistantActionDraft,
  AssistantActionProposalRecord,
  AssistantCitation,
  AssistantMessageRecord,
  AssistantThreadSummary,
} from "@/lib/assistant/types";

export async function getOrCreateAssistantThread(input: {
  user: SessionUser;
  threadId?: string | null;
  clientId?: string | null;
  pagePath?: string | null;
  firstMessage: string;
}): Promise<AssistantThreadSummary> {
  if (input.threadId) {
    const existing = await query<AssistantThreadSummary>(
      `
        select *
        from assistant_threads
        where id = $1 and user_id = $2
      `,
      [input.threadId, input.user.userId],
    );
    if (existing.rows[0]) {
      await query(
        "update assistant_threads set updated_at = now(), page_path = coalesce($2, page_path) where id = $1",
        [existing.rows[0].id, input.pagePath ?? null],
      );
      return existing.rows[0];
    }
  }

  const title = inferThreadTitle(input.firstMessage);
  const created = await query<AssistantThreadSummary>(
    `
      insert into assistant_threads (user_id, client_id, role, title, page_path)
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [
      input.user.userId,
      input.clientId ?? input.user.clientId ?? null,
      input.user.role,
      title,
      input.pagePath ?? null,
    ],
  );
  return created.rows[0];
}

export async function addAssistantMessage(input: {
  threadId: string;
  userId?: string | null;
  role: "user" | "assistant" | "system";
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<AssistantMessageRecord> {
  const inserted = await query<AssistantMessageRecord>(
    `
      insert into assistant_messages (thread_id, user_id, role, body, metadata)
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [
      input.threadId,
      input.userId ?? null,
      input.role,
      input.body,
      input.metadata ?? {},
    ],
  );
  await query("update assistant_threads set updated_at = now() where id = $1", [
    input.threadId,
  ]);
  return inserted.rows[0];
}

export async function createAssistantActionProposals(input: {
  threadId: string;
  messageId: string;
  userId: string;
  proposals: AssistantActionDraft[];
  citations: AssistantCitation[];
}): Promise<AssistantActionProposalRecord[]> {
  const records: AssistantActionProposalRecord[] = [];
  for (const proposal of input.proposals) {
    const clientId = typeof proposal.payload.clientId === "string" ? proposal.payload.clientId : null;
    const dangerousPhrase = dangerousConfirmationPhrase(proposal.actionType, proposal.payload);
    const inserted = await query<AssistantActionProposalRecord>(
      `
        insert into assistant_action_proposals (
          thread_id,
          message_id,
          user_id,
          client_id,
          action_type,
          title,
          description,
          payload,
          requires_typed_confirmation
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning *
      `,
      [
        input.threadId,
        input.messageId,
        input.userId,
        clientId,
        proposal.actionType,
        proposal.title,
        proposal.description,
        proposal.payload,
        dangerousPhrase,
      ],
    );
    records.push(inserted.rows[0]);
  }
  return records;
}

export async function listAssistantThreads(
  user: SessionUser,
  limit = 12,
): Promise<AssistantThreadSummary[]> {
  const result = await query<AssistantThreadSummary>(
    `
      select *
      from assistant_threads
      where user_id = $1
      order by updated_at desc
      limit $2
    `,
    [user.userId, Math.min(Math.max(1, limit), 30)],
  );
  return result.rows;
}

export async function getAssistantThreadDetail(input: {
  user: SessionUser;
  threadId: string;
}): Promise<{
  thread: AssistantThreadSummary;
  messages: AssistantMessageRecord[];
  proposals: AssistantActionProposalRecord[];
} | null> {
  const threadResult = await query<AssistantThreadSummary>(
    "select * from assistant_threads where id = $1 and user_id = $2",
    [input.threadId, input.user.userId],
  );
  const thread = threadResult.rows[0];
  if (!thread) {
    return null;
  }
  const [messages, proposals] = await Promise.all([
    query<AssistantMessageRecord>(
      `
        select *
        from assistant_messages
        where thread_id = $1
        order by created_at asc
        limit 80
      `,
      [input.threadId],
    ),
    query<AssistantActionProposalRecord>(
      `
        select *
        from assistant_action_proposals
        where thread_id = $1
        order by created_at asc
      `,
      [input.threadId],
    ),
  ]);
  return { thread, messages: messages.rows, proposals: proposals.rows };
}

export async function getPendingActionProposal(input: {
  user: SessionUser;
  proposalId: string;
}): Promise<AssistantActionProposalRecord | null> {
  const result = await query<AssistantActionProposalRecord>(
    `
      select ap.*
      from assistant_action_proposals ap
      join assistant_threads at on at.id = ap.thread_id
      where ap.id = $1
        and at.user_id = $2
        and ap.status = 'pending'
    `,
    [input.proposalId, input.user.userId],
  );
  return result.rows[0] ?? null;
}

export async function markActionProposalExecuted(input: {
  proposalId: string;
  result: Record<string, unknown>;
}): Promise<void> {
  await query(
    `
      update assistant_action_proposals
      set status = 'executed',
          confirmed_at = coalesce(confirmed_at, now()),
          executed_at = now(),
          result = $2,
          error = null,
          updated_at = now()
      where id = $1
    `,
    [input.proposalId, input.result],
  );
}

export async function markActionProposalFailed(input: {
  proposalId: string;
  error: string;
}): Promise<void> {
  await query(
    `
      update assistant_action_proposals
      set status = 'failed',
          confirmed_at = coalesce(confirmed_at, now()),
          error = $2,
          updated_at = now()
      where id = $1
    `,
    [input.proposalId, input.error.slice(0, 1000)],
  );
}

function inferThreadTitle(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "Assistant chat";
  }
  return compact.length > 72 ? `${compact.slice(0, 69)}...` : compact;
}

function dangerousConfirmationPhrase(
  actionType: string,
  payload: Record<string, unknown>,
): string | null {
  if (actionType === "offboarding_delete") {
    return typeof payload.confirmSlug === "string" && payload.confirmSlug
      ? payload.confirmSlug
      : "DELETE CLIENT";
  }
  if (actionType === "knowledge_delete") {
    return "DELETE";
  }
  if (actionType === "brand_voice_delete_example") {
    return "DELETE";
  }
  return null;
}
