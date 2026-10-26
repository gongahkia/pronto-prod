import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  decryptChannelCredentials,
  encryptedChannelCredentialValues,
  protectChannelSettingsSecrets,
} from "@/lib/channels/credentials";
import { mergeEscalationHoldingReply } from "@/lib/channels/escalation-handoff";
import { query } from "@/lib/db";
import { assertSameOrigin } from "@/lib/http/csrf";
import { parseJsonObject } from "@/lib/channels/form-input";
import { canAccessClient } from "@/lib/rbac";
import type { ChannelKind, ChannelStatus } from "@/lib/types";

const channelStatuses: ChannelStatus[] = ["draft", "active", "disabled"];
const secretFieldNames = new Set([
  "accessToken",
  "appSecret",
  "botToken",
  "pageAccessToken",
  "instagramAccessToken",
  "apiKey",
  "verifyToken",
  "webhookSecret",
  "eventWebhookSecret",
]);

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const channelId = String(form.get("channelId") ?? "");
  const clientId = String(form.get("clientId") ?? "");
  const status = String(form.get("status") ?? "draft");
  const externalId = String(form.get("externalId") ?? "");
  if (!channelStatuses.includes(status as ChannelStatus)) {
    return NextResponse.json({ error: "Invalid channel status." }, { status: 400 });
  }
  if (!canAccessClient(user, clientId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const channelResult = await query<{
    client_id: string;
    kind: ChannelKind;
    settings: Record<string, unknown>;
    credentials: Record<string, unknown>;
    encrypted_credentials?: string | null;
    credentials_encryption_nonce?: string | null;
    credentials_encryption_tag?: string | null;
    updated_at: Date;
  }>(
    "select client_id, kind, settings, credentials, encrypted_credentials, credentials_encryption_nonce, credentials_encryption_tag, updated_at from channels where id = $1",
    [channelId],
  );
  const channel = channelResult.rows[0]
    ? decryptChannelCredentials(channelResult.rows[0])
    : undefined;
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (channel.client_id !== clientId) {
    return NextResponse.json(
      { error: "Channel does not belong to the submitted client." },
      { status: 403 },
    );
  }

  const settingsRaw = form.get("settings");
  const parsedSettings = parseJsonObject(String(settingsRaw || "{}"), "settings");
  if (settingsRaw !== null && !parsedSettings.ok) {
    return NextResponse.json({ error: parsedSettings.error }, { status: 400 });
  }
  const submittedSettings = parsedSettings.ok ? parsedSettings.value : {};
  const holdingReply = form.get("escalationHoldingReply");
  const settingsBase = mergeStructuredFields({
    base: channel.settings,
    submitted: submittedSettings,
    form,
    scope: "settings",
  });
  const settings =
    holdingReply === null
      ? settingsBase
      : mergeEscalationHoldingReply(settingsBase, String(holdingReply));
  const credentialsRaw = form.get("credentials");
  const credentials = parseJsonObject(String(credentialsRaw || "{}"), "credentials");
  if (credentialsRaw !== null && !credentials.ok) {
    return NextResponse.json({ error: credentials.error }, { status: 400 });
  }
  const credentialValue = mergeStructuredFields({
    base: channel.credentials,
    submitted: credentials.ok ? credentials.value : {},
    form,
    scope: "credentials",
  });
  if (status === "active" && channel.kind === "instagram" && settings.authMode === "instagram_login" &&
      process.env.PRONTO_INSTAGRAM_LOGIN_ENABLED !== "1") {
    return NextResponse.json({ error: "Instagram Login remains disabled until authorized test-account configuration is enabled." }, { status: 400 });
  }
  if (status === "active" && channel.kind === "email" && credentialValue.provider === "local_smtp" &&
      (process.env.NODE_ENV === "production" || process.env.PRONTO_LOCAL_EMAIL_ENABLED !== "1")) {
    return NextResponse.json({ error: "Local SMTP can only be activated in the local sandbox." }, { status: 400 });
  }
  const protectedValues = protectChannelSettingsSecrets(settings, credentialValue,
    ["verifyToken", "webhookSecret", "eventWebhookSecret"]);
  const encryptedCredentials = encryptedChannelCredentialValues(protectedValues.credentials);

  if (status === "active") {
    const existingDraft = await query<{ base_updated_at: Date }>(
      "select base_updated_at from channel_drafts where channel_id = $1 and client_id = $2", [channelId, clientId]);
    const baseUpdatedAt = existingDraft.rows[0]?.base_updated_at ?? channel.updated_at;
    if (new Date(baseUpdatedAt).getTime() !== new Date(channel.updated_at).getTime())
      return NextResponse.json({ error: "Live channel changed; review before staging another revision." }, { status: 409 });
    await query(
      `insert into channel_drafts (channel_id, client_id, base_updated_at, status, external_id,
       settings, encrypted_credentials, credentials_encryption_nonce, credentials_encryption_tag, updated_by)
       values ($1, $2, $3, 'active', nullif($4, ''), $5::jsonb, $6, $7, $8, $9)
       on conflict (channel_id) do update set status = 'active', external_id = excluded.external_id,
         settings = excluded.settings, encrypted_credentials = excluded.encrypted_credentials,
         credentials_encryption_nonce = excluded.credentials_encryption_nonce,
         credentials_encryption_tag = excluded.credentials_encryption_tag,
         health_status = null, health_detail = null, checked_at = null,
         updated_by = excluded.updated_by, updated_at = now()`,
      [channelId, clientId, baseUpdatedAt, externalId, JSON.stringify(protectedValues.settings),
        encryptedCredentials.encryptedCredentials, encryptedCredentials.nonce,
        encryptedCredentials.tag, user.userId]);
    await query(
      "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'channel.draft_saved', 'channel', $3, $4)",
      [clientId, user.userId, channelId, { proposedStatus: "active" }]);
    return NextResponse.json({ ok: true, clientId });
  }

  await query(
    `
      update channels
      set status = $2,
          external_id = nullif($3, ''),
          settings = $4,
          credentials = $5,
          encrypted_credentials = $6,
          credentials_encryption_nonce = $7,
          credentials_encryption_tag = $8,
          last_health_check_at = null,
          last_health_status = null,
          last_health_error = null,
          updated_at = now()
      where id = $1
    `,
    [
      channelId,
      status,
      externalId,
      protectedValues.settings,
      encryptedCredentials.credentials,
      encryptedCredentials.encryptedCredentials,
      encryptedCredentials.nonce,
      encryptedCredentials.tag,
    ],
  );
  await query(
    "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'channel.updated', 'channel', $3, $4)",
    [clientId, user.userId, channelId, { status }],
  );

  return NextResponse.json({ ok: true, clientId });
}

function mergeStructuredFields(input: {
  base: Record<string, unknown>;
  submitted: Record<string, unknown>;
  form: FormData;
  scope: "settings" | "credentials";
}): Record<string, unknown> {
  const next = { ...input.base, ...input.submitted };
  for (const [key, value] of input.form.entries()) {
    const prefix = `${input.scope}.`;
    if (!key.startsWith(prefix)) continue;
    const field = key.slice(prefix.length);
    const text = String(value).trim();
    if (!text) {
      if (!secretFieldNames.has(field)) delete next[field];
      continue;
    }
    next[field] = text;
  }
  return next;
}
