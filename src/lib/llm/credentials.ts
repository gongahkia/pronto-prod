import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { QueryResultRow } from "pg";
import { query } from "@/lib/db";
import { validatedSecretMaterial } from "@/lib/secret-key";

export type ProviderCredentialStatus = {
  provider: string;
  hasCredential: boolean;
  updatedAt: Date | null;
};

type ProviderCredentialRecord = {
  provider: string;
  encrypted_api_key: string;
  encryption_nonce: string;
  encryption_tag: string;
  updated_at: Date;
};

export async function upsertProviderApiKey(input: {
  provider: string;
  apiKey: string;
  actorUserId: string;
}): Promise<void> {
  const trimmed = input.apiKey.trim();
  if (!trimmed) {
    return;
  }

  const encrypted = encryptSecret(trimmed);
  await query(
    `
      insert into llm_provider_credentials (
        provider,
        encrypted_api_key,
        encryption_nonce,
        encryption_tag,
        created_by_user_id,
        updated_by_user_id
      )
      values ($1, $2, $3, $4, $5, $5)
      on conflict (provider) do update set
        encrypted_api_key = excluded.encrypted_api_key,
        encryption_nonce = excluded.encryption_nonce,
        encryption_tag = excluded.encryption_tag,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now()
    `,
    [
      input.provider,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.tag,
      input.actorUserId,
    ],
  );
}

export async function resolveProviderApiKey(
  provider: string | null | undefined,
): Promise<string | null> {
  const envValue = envApiKeyForProvider(provider);
  if (envValue) {
    return envValue;
  }
  if (!provider) {
    return null;
  }

  const result = await safeCredentialQuery<ProviderCredentialRecord>(
    `
      select provider, encrypted_api_key, encryption_nonce, encryption_tag, updated_at
      from llm_provider_credentials
      where provider = $1
    `,
    [provider],
  );
  const record = result.rows[0];
  if (!record) {
    return null;
  }
  return decryptSecret({
    ciphertext: record.encrypted_api_key,
    nonce: record.encryption_nonce,
    tag: record.encryption_tag,
  });
}

export async function listProviderCredentialStatuses(): Promise<ProviderCredentialStatus[]> {
  const result = await safeCredentialQuery<ProviderCredentialRecord>(
    `
      select provider, encrypted_api_key, encryption_nonce, encryption_tag, updated_at
      from llm_provider_credentials
      order by provider asc
    `,
  );
  return result.rows.map((row) => ({
    provider: row.provider,
    hasCredential: true,
    updatedAt: row.updated_at,
  }));
}

export function credentialEncryptionConfigured(): boolean {
  return Boolean(process.env.PRONTO_SECRETS_KEY);
}

export function envApiKeyForProvider(provider: string | null | undefined): string | null {
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY?.trim() || null;
  }
  if (provider === "azure") {
    return process.env.AZURE_OPENAI_API_KEY?.trim() || null;
  }
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY?.trim() || null;
  }
  if (!provider) {
    return null;
  }

  const envName = `PRONTO_${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
  return process.env[envName]?.trim() || null;
}

async function safeCredentialQuery<T extends QueryResultRow>(
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

function encryptSecret(value: string): {
  ciphertext: string;
  nonce: string;
  tag: string;
} {
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

function decryptSecret(input: {
  ciphertext: string;
  nonce: string;
  tag: string;
}): string {
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

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "42P01",
  );
}
