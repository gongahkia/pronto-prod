import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { QueryResultRow } from "pg";
import { query } from "@/lib/db";
import type { IntegrationCredentialRecord, IntegrationProvider } from "@/lib/integrations/types";
import { validatedSecretMaterial } from "@/lib/secret-key";

type EncryptedRow = IntegrationCredentialRecord & {
  encrypted_api_key: string;
  encryption_nonce: string;
  encryption_tag: string;
};

export type IntegrationCredentialStatus = {
  id: string;
  clientId: string;
  provider: string;
  label: string | null;
  rotationDueAt: Date | null;
  lastRotatedAt: Date | null;
  updatedAt: Date;
};

export async function upsertIntegrationCredential(input: {
  clientId: string;
  provider: IntegrationProvider;
  apiKey: string;
  label?: string;
  metadata?: Record<string, unknown>;
  rotationDueAt?: Date | null;
  actorUserId: string;
}): Promise<void> {
  const trimmed = input.apiKey.trim();
  if (!trimmed) {
    return;
  }
  const encrypted = encryptSecret(trimmed);
  await query(
    `
      insert into integration_credentials (
        client_id,
        provider,
        label,
        encrypted_api_key,
        encryption_nonce,
        encryption_tag,
        metadata,
        rotation_due_at,
        last_rotated_at,
        created_by_user_id,
        updated_by_user_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $9)
      on conflict (client_id, provider, coalesce(label, '')) do update set
        encrypted_api_key = excluded.encrypted_api_key,
        encryption_nonce = excluded.encryption_nonce,
        encryption_tag = excluded.encryption_tag,
        metadata = excluded.metadata,
        rotation_due_at = excluded.rotation_due_at,
        last_rotated_at = now(),
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now()
    `,
    [
      input.clientId,
      input.provider,
      input.label ?? null,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.tag,
      input.metadata ?? {},
      input.rotationDueAt ?? null,
      input.actorUserId,
    ],
  );
}

export async function resolveIntegrationCredential(input: {
  clientId: string;
  provider: IntegrationProvider;
  label?: string;
}): Promise<{ apiKey: string; metadata: Record<string, unknown> } | null> {
  const result = await safeQuery<EncryptedRow>(
    `
      select *
      from integration_credentials
      where client_id = $1 and provider = $2 and coalesce(label, '') = coalesce($3, '')
    `,
    [input.clientId, input.provider, input.label ?? null],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    apiKey: decryptSecret({
      ciphertext: row.encrypted_api_key,
      nonce: row.encryption_nonce,
      tag: row.encryption_tag,
    }),
    metadata: row.metadata ?? {},
  };
}

export async function listIntegrationCredentialStatuses(
  clientId: string,
): Promise<IntegrationCredentialStatus[]> {
  const result = await safeQuery<EncryptedRow>(
    `
      select id, client_id, provider, label, metadata, rotation_due_at,
             last_rotated_at, updated_at, encrypted_api_key, encryption_nonce, encryption_tag
      from integration_credentials
      where client_id = $1
      order by provider asc, coalesce(label, '') asc
    `,
    [clientId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    provider: row.provider,
    label: row.label,
    rotationDueAt: row.rotation_due_at,
    lastRotatedAt: row.last_rotated_at,
    updatedAt: row.updated_at,
  }));
}

export async function deleteIntegrationCredential(input: {
  clientId: string;
  provider: IntegrationProvider;
  label?: string;
}): Promise<void> {
  await query(
    `
      delete from integration_credentials
      where client_id = $1 and provider = $2 and coalesce(label, '') = coalesce($3, '')
    `,
    [input.clientId, input.provider, input.label ?? null],
  );
}

function encryptSecret(value: string): { ciphertext: string; nonce: string; tag: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decryptSecret(input: { ciphertext: string; nonce: string; tag: string }): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(input.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function encryptionKey(): Buffer {
  const material = validatedSecretMaterial("PRONTO_SECRETS_KEY");
  return createHash("sha256").update(material).digest();
}

async function safeQuery<T extends QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<{ rows: T[] }> {
  try {
    return await query<T>(text, values);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return { rows: [] };
    }
    throw error;
  }
}

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "42P01",
  );
}

export function redactCredentialForLog(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "***";
  return `${secret.slice(0, 4)}***${secret.slice(-2)}`;
}
