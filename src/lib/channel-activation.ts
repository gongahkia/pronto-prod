import { recordAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { decryptChannelCredentials } from "@/lib/channels/credentials";
import { transaction } from "@/lib/db";
import { assertChannelActivationEvidence, assertConfigurationApproved, assertOnboardingReadyForChannelActivation } from "@/lib/managed-approvals";
import type { Channel } from "@/lib/types";

export async function activateCustomerChannel(input: {
  actor: SessionUser; clientId: string; channelId: string; revision: string;
}): Promise<void> {
  if (input.actor.role !== "operator") throw new Error("Pronto operator access is required.");
  await transaction(async (db) => {
    const row = await db.query<Channel & { updated_at: Date; last_health_status: string | null }>(
      "select * from channels where id = $1 and client_id = $2 for update",
      [input.channelId, input.clientId]);
    const channel = row.rows[0];
    if (!channel) throw new Error("Channel not found for this business.");
    if (channel.status === "active") throw new Error("Channel is already active.");
    const revision = new Date(channel.updated_at).toISOString();
    if (revision !== input.revision) throw new Error("Channel changed; review current settings before activation.");
    if (channel.last_health_status !== "healthy" || !channel.last_health_check_at)
      throw new Error("A successful current channel health check is required.");
    const credentials = decryptChannelCredentials(channel).credentials;
    const localOnly = channel.kind === "email" && credentials.provider === "local_smtp" &&
      process.env.PRONTO_LOCAL_EMAIL_ENABLED === "1" && process.env.NODE_ENV !== "production";
    if (credentials.provider === "local_smtp" && !localOnly) throw new Error("Local SMTP is restricted to the sandbox.");
    await assertConfigurationApproved(db, input.clientId, "channel", input.channelId, revision);
    await assertChannelActivationEvidence(db, input.clientId, input.channelId, revision, localOnly);
    await assertOnboardingReadyForChannelActivation(db, input.clientId);
    await db.query("update channels set status = 'active', updated_at = now() where id = $1 and client_id = $2",
      [input.channelId, input.clientId]);
    await recordAuditLog({ clientId: input.clientId, actorUserId: input.actor.userId,
      action: "channel.activated_by_operator", targetType: "channel", targetId: input.channelId,
      metadata: { approvedRevision: revision, localOnly } }, db);
  }, { isolationLevel: "serializable", retries: 2 });
}
