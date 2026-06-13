import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { validatedSecretMaterial } from "@/lib/secret-key";

export type ChannelCredentialColumns = {
  encrypted_credentials?: string | null;
  credentials_encryption_nonce?: string | null;
  credentials_encryption_tag?: string | null;
};

export type ChannelWithCredentialColumns = {
  credentials: Record<string, unknown>;
} & ChannelCredentialColumns;

export function decryptChannelCredentials<T extends ChannelWithCredentialColumns>(
  channel: T,
): T {
  if (
    !channel.encrypted_credentials ||
    !channel.credentials_encryption_nonce ||
    !channel.credentials_encryption_tag
  ) {
    return channel;
  }

  return {
    ...channel,
    credentials: decryptCredentials({
      ciphertext: channel.encrypted_credentials,
      nonce: channel.credentials_encryption_nonce,
      tag: channel.credentials_encryption_tag,
    }),
  };
}

export function decryptChannelList<T extends ChannelWithCredentialColumns>(
  channels: T[],
): T[] {
  return channels.map((channel) => decryptChannelCredentials(channel));
}

export function encryptedChannelCredentialValues(
  credentials: Record<string, unknown>,
): {
  credentials: Record<string, unknown>;
  encryptedCredentials: string | null;
  nonce: string | null;
  tag: string | null;
} {
  if (!Object.keys(credentials).length) {
    return {
      credentials: {},
      encryptedCredentials: null,
      nonce: null,
      tag: null,
    };
  }

  const encrypted = encryptCredentials(credentials);
  return {
    credentials: {},
    encryptedCredentials: encrypted.ciphertext,
    nonce: encrypted.nonce,
    tag: encrypted.tag,
  };
}

function encryptCredentials(value: Record<string, unknown>): {
  ciphertext: string;
  nonce: string;
  tag: string;
} {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decryptCredentials(input: {
  ciphertext: string;
  nonce: string;
  tag: string;
}): Record<string, unknown> {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(input.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Encrypted channel credentials did not decrypt to an object.");
  }
  return parsed as Record<string, unknown>;
}

function encryptionKey(): Buffer {
  const material = validatedSecretMaterial("PRONTO_SECRETS_KEY");
  return createHash("sha256").update(material).digest();
}
