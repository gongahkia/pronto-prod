import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptChannelCredentials,
  encryptedChannelCredentialValues,
} from "@/lib/channels/credentials";

describe("channel credential encryption", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts credentials at rest and restores them for server-side channel use", () => {
    vi.stubEnv("PRONTO_SECRETS_KEY", "test-secret-material-with-at-least-32-chars");

    const encrypted = encryptedChannelCredentialValues({
      accessToken: "whatsapp-token",
      appSecret: "meta-secret",
      phoneNumberId: "phone-id",
    });

    expect(encrypted.credentials).toEqual({});
    expect(encrypted.encryptedCredentials).not.toContain("whatsapp-token");
    expect(encrypted.nonce).toEqual(expect.any(String));
    expect(encrypted.tag).toEqual(expect.any(String));

    const channel = decryptChannelCredentials({
      credentials: encrypted.credentials,
      encrypted_credentials: encrypted.encryptedCredentials,
      credentials_encryption_nonce: encrypted.nonce,
      credentials_encryption_tag: encrypted.tag,
    });

    expect(channel.credentials).toEqual({
      accessToken: "whatsapp-token",
      appSecret: "meta-secret",
      phoneNumberId: "phone-id",
    });
  });

  it("does not require encryption material for empty credential payloads", () => {
    const encrypted = encryptedChannelCredentialValues({});

    expect(encrypted).toEqual({
      credentials: {},
      encryptedCredentials: null,
      nonce: null,
      tag: null,
    });
  });
});
