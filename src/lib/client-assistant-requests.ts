import { recordAuditLog } from "@/lib/audit";
import { query } from "@/lib/db";
import type {
  ClientAssistantChangeRequest,
  ClientAssistantChangeRequestKind,
} from "@/lib/types";

const requestKinds = new Set<ClientAssistantChangeRequestKind>([
  "assistant_change",
  "handoff_rule",
  "tone",
  "scope",
  "other",
]);

export async function getClientAssistantChangeRequests(
  clientId: string,
  limit = 8,
): Promise<ClientAssistantChangeRequest[]> {
  const result = await query<ClientAssistantChangeRequest>(
    `
      select *
      from client_assistant_change_requests
      where client_id = $1
      order by
        case status
          when 'open' then 0
          when 'reviewing' then 1
          when 'resolved' then 2
          else 3
        end,
        created_at desc
      limit $2
    `,
    [clientId, normalizeLimit(limit)],
  );
  return result.rows;
}

export async function getOpenClientAssistantChangeRequestCount(
  clientId: string,
): Promise<number> {
  const result = await query<{ count: string }>(
    `
      select count(*)::text
      from client_assistant_change_requests
      where client_id = $1
        and status in ('open', 'reviewing')
    `,
    [clientId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function createClientAssistantChangeRequest(input: {
  clientId: string;
  actorUserId: string;
  kind: string;
  body: string;
}): Promise<ClientAssistantChangeRequest> {
  const kind = normalizeKind(input.kind);
  const body = input.body.trim().slice(0, 2000);
  if (!body) {
    throw new Error("Assistant change request body is required.");
  }

  const result = await query<ClientAssistantChangeRequest>(
    `
      insert into client_assistant_change_requests (
        client_id,
        created_by_user_id,
        kind,
        body
      )
      values ($1, $2, $3, $4)
      returning *
    `,
    [input.clientId, input.actorUserId, kind, body],
  );
  const request = result.rows[0];

  await recordAuditLog({
    clientId: input.clientId,
    actorUserId: input.actorUserId,
    action: "client.assistant_change_requested",
    targetType: "client_assistant_change_request",
    targetId: request.id,
    metadata: {
      kind,
    },
  });

  return request;
}

function normalizeKind(value: string): ClientAssistantChangeRequestKind {
  return requestKinds.has(value as ClientAssistantChangeRequestKind)
    ? (value as ClientAssistantChangeRequestKind)
    : "assistant_change";
}

function normalizeLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    return 8;
  }
  return Math.min(value, 50);
}
