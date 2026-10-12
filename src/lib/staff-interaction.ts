import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { recordAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { transaction, type Queryable } from "@/lib/db";
import { createKnowledgeSuggestion } from "@/lib/knowledge/suggestions";
import { getEscalationPolicy, saveEscalationPolicy, type EscalationPolicy } from "@/lib/staff-configuration";
import { requireStaffCapability } from "@/lib/staff-permissions";

type ProposedCommand =
  | { kind: "policy_target"; targetMinutes: number | null }
  | { kind: "knowledge_suggestion"; title: string; content: string; reason: string; sourceReference: string | null };

export function localStaffCommandsEnabled(): boolean {
  if (process.env.PRONTO_LOCAL_STAFF_COMMANDS !== "1") return false;
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.PRONTO_LOCAL_STAFF_E2E !== "1" ||
      !process.env.PRONTO_TEST_DATABASE_URL ||
      process.env.PRONTO_TEST_DATABASE_URL !== process.env.DATABASE_URL) return false;
  try {
    const url = new URL(process.env.DATABASE_URL);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.pathname === "/pronto_test";
  } catch { return false; }
}

export function parseStaffCommand(text: string): "view_policy" | ProposedCommand {
  const message = text.trim();
  if (/^(?:show|view) (?:our )?escalation (?:policy|response target)\??$/i.test(message)) return "view_policy";
  const target = message.match(/^(?:set|change (?:our )?)escalation response target to (\d{1,5}|unset)(?: minutes?)?\.?$/i);
  if (target) {
    const minutes = target[1].toLowerCase() === "unset" ? null : Number(target[1]);
    if (minutes !== null && (minutes < 1 || minutes > 10080)) throw new Error("Choose 1–10080 minutes, or unset.");
    return { kind: "policy_target", targetMinutes: minutes };
  }
  if (/^suggest knowledge:/i.test(message)) {
    const parts = message.replace(/^suggest knowledge:\s*/i, "").split("|").map((part) => part.trim());
    if (parts.length < 3 || parts.length > 4 || parts.slice(0, 3).some((part) => !part))
      throw new Error("Use: Suggest knowledge: title | proposed answer | reason | source (optional).");
    return { kind: "knowledge_suggestion", title: parts[0], content: parts[1], reason: parts[2],
      sourceReference: parts[3] || null };
  }
  throw new Error("Supported local requests: view escalation policy, change response target, or suggest knowledge.");
}

export async function viewStaffPolicy(actor: SessionUser): Promise<{ version: number; policy: EscalationPolicy | null }> {
  if (!localStaffCommandsEnabled()) throw new Error("Local staff commands are disabled.");
  return transaction(async (db) => {
    const clientId = await assertVerifiedStaff(db, actor);
    const current = await getEscalationPolicy(clientId, db);
    return { version: current?.version ?? 0, policy: current?.policy ?? null };
  });
}

export async function proposeStaffCommand(input: {
  actor: SessionUser; requestKey: string; text: string;
}): Promise<{ id: string; confirmationToken: string | null; expiresAt: Date | null;
  summary: string; oldValue?: number | null; newValue?: number | null; state: string }> {
  if (!localStaffCommandsEnabled()) throw new Error("Local staff commands are disabled.");
  const requestKey = input.requestKey.trim();
  if (!requestKey || requestKey.length > 120) throw new Error("A unique request key is required.");
  const command = parseStaffCommand(input.text);
  if (command === "view_policy") throw new Error("Viewing policy does not need confirmation.");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = digest(token);
  return transaction(async (db) => {
    const clientId = await assertVerifiedStaff(db, input.actor);
    if (command.kind === "policy_target")
      await requireStaffCapability(input.actor, clientId, "escalation.policy.manage", db);
    const current = command.kind === "policy_target" ? await getEscalationPolicy(clientId, db) : null;
    const baseVersion = current?.version ?? 0;
    const previous = current?.policy.targetMinutes ?? null;
    const payload = command.kind === "policy_target"
      ? { targetMinutes: command.targetMinutes, previous, requestTextHash: digest(input.text.trim()) }
      : { ...command, requestTextHash: digest(input.text.trim()) };
    const existing = await db.query<{ id: string; kind: string; payload: Record<string, unknown>; state: string }>(
      "select id, kind, payload, state from staff_command_requests where client_id = $1 and actor_user_id = $2 and request_key = $3",
      [clientId, input.actor.userId, requestKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].kind !== command.kind || existing.rows[0].payload.requestTextHash !== payload.requestTextHash)
        throw new Error("This request key was already used for a different change.");
      return { id: existing.rows[0].id, confirmationToken: null, expiresAt: null,
        summary: "This request already exists. Submit a new request to receive a new confirmation.", state: existing.rows[0].state };
    }
    const inserted = await db.query<{ id: string; expires_at: Date }>(
      `insert into staff_command_requests
       (client_id, actor_user_id, request_key, kind, payload, base_version, token_hash, expires_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, now() + interval '10 minutes')
       on conflict do nothing
       returning id, expires_at`,
      [clientId, input.actor.userId, requestKey, command.kind, JSON.stringify(payload),
        command.kind === "policy_target" ? baseVersion : null, tokenHash]);
    if (!inserted.rows[0]) {
      const repeated = await db.query<{ id: string; kind: string; payload: Record<string, unknown>; state: string }>(
        "select id, kind, payload, state from staff_command_requests where client_id = $1 and actor_user_id = $2 and request_key = $3",
        [clientId, input.actor.userId, requestKey]);
      if (!repeated.rows[0] || repeated.rows[0].kind !== command.kind ||
          repeated.rows[0].payload.requestTextHash !== payload.requestTextHash)
        throw new Error("This request key was already used for a different change.");
      return { id: repeated.rows[0].id, confirmationToken: null, expiresAt: null,
        summary: "This request already exists. Submit a new request to receive a new confirmation.", state: repeated.rows[0].state };
    }
    const id = inserted.rows[0].id;
    await recordAuditLog({ clientId, actorUserId: input.actor.userId,
      action: "staff_command.proposed", targetType: "staff_command", targetId: id,
      metadata: { kind: command.kind, baseVersion } }, db);
    return { id, confirmationToken: token, expiresAt: inserted.rows[0].expires_at,
      summary: command.kind === "policy_target"
        ? `Change response target from ${previous ?? "unset"} to ${command.targetMinutes ?? "unset"} minutes? This is an operating target, not a guarantee.`
        : `Submit “${command.title}” as a pending knowledge correction? It will not change customer answers yet.`,
      oldValue: previous, newValue: command.kind === "policy_target" ? command.targetMinutes : undefined,
      state: "pending" };
  }, { isolationLevel: "serializable", retries: 2 });
}

export async function confirmStaffCommand(input: {
  actor: SessionUser; requestId: string; confirmationToken: string;
}): Promise<{ state: "applied" | "already_applied"; resultReference: string | null; policyVersion?: number }> {
  if (!localStaffCommandsEnabled()) throw new Error("Local staff commands are disabled.");
  if (!input.confirmationToken || input.confirmationToken.length > 120) throw new Error("Invalid confirmation.");
  return transaction(async (db) => {
    const clientId = await assertVerifiedStaff(db, input.actor);
    const result = await db.query<{ id: string; kind: string; payload: Record<string, unknown>;
      base_version: number | null; token_hash: string; state: string; expires_at: Date;
      result_reference: string | null }>(
      `select id, kind, payload, base_version, token_hash, state, expires_at, result_reference
       from staff_command_requests where id = $1 and client_id = $2 and actor_user_id = $3 for update`,
      [input.requestId, clientId, input.actor.userId]);
    const command = result.rows[0];
    if (!command || !sameDigest(command.token_hash, digest(input.confirmationToken)))
      throw new Error("Invalid confirmation.");
    if (command.state === "applied") return { state: "already_applied", resultReference: command.result_reference };
    if (command.state !== "pending" || new Date(command.expires_at).getTime() <= Date.now()) {
      throw new Error("Confirmation expired. Start a new request.");
    }
    let resultReference: string | null = null;
    let policyVersion: number | undefined;
    if (command.kind === "policy_target") {
      await requireStaffCapability(input.actor, clientId, "escalation.policy.manage", db);
      const current = await getEscalationPolicy(clientId, db);
      if ((current?.version ?? 0) !== command.base_version)
        throw new Error("Escalation policy changed. Start a new request against the current version.");
      const previous = command.payload.previous ?? null;
      if ((current?.policy.targetMinutes ?? null) !== previous)
        throw new Error("Response target changed. Start a new request.");
      const targetMinutes = command.payload.targetMinutes as number | null;
      const policy: EscalationPolicy = { targetMinutes,
        timezone: current?.policy.timezone ?? "Asia/Singapore",
        staffedHours: current?.policy.staffedHours ?? {},
        initialDestinationId: current?.policy.initialDestinationId ?? null,
        reminderMinutes: current?.policy.reminderMinutes ?? [],
        backupDestinationId: current?.policy.backupDestinationId ?? null,
        outOfHoursAcknowledgement: current?.policy.outOfHoursAcknowledgement ?? null };
      policyVersion = await saveEscalationPolicy({ actor: input.actor, clientId,
        expectedVersion: command.base_version ?? 0, policy, db });
    } else if (command.kind === "knowledge_suggestion") {
      resultReference = await createKnowledgeSuggestion({ actor: input.actor, clientId,
        title: String(command.payload.title ?? ""), content: String(command.payload.content ?? ""),
        reason: String(command.payload.reason ?? ""),
        sourceReference: String(command.payload.sourceReference ?? "") || null,
        requestKey: `staff-command:${command.id}`, db });
    } else throw new Error("Unsupported command.");
    await db.query(
      `update staff_command_requests set state = 'applied', applied_at = now(), result_reference = $3
       where id = $1 and client_id = $2`, [input.requestId, clientId, resultReference]);
    await recordAuditLog({ clientId, actorUserId: input.actor.userId,
      action: "staff_command.applied", targetType: "staff_command", targetId: input.requestId,
      metadata: { kind: command.kind, policyVersion, resultReference } }, db);
    return { state: "applied", resultReference, policyVersion };
  }, { isolationLevel: "serializable", retries: 2 });
}

async function assertVerifiedStaff(db: Queryable, actor: SessionUser): Promise<string> {
  if (actor.role !== "client" || !actor.clientId) throw new Error("A signed-in business staff member is required.");
  const row = await db.query<{ id: string }>(
    "select id from users where id = $1 and client_id = $2 and role = 'client'",
    [actor.userId, actor.clientId]);
  if (!row.rows[0]) throw new Error("This staff identity is no longer authorized.");
  return actor.clientId;
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function sameDigest(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
