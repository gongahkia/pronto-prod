import { isSupportedMetaGraphVersion, metaGraphVersion, whatsAppGraphVersion } from "@/lib/env";
import { validateChannelHealthConfig } from "@/lib/channels/health";
import type { Channel } from "@/lib/types";

export function metaReadAuthorized(env: Record<string, string | undefined>): boolean {
  return env.PRONTO_META_READ_APPROVED === "1" && env.PRONTO_META_TEST_ACCOUNT === "1" &&
    env.PRONTO_SKIP_LIVE_HEALTH !== "1";
}

export function metaSandboxChannelIssue(channel: Channel, hadLegacyPlaintext = false): string | null {
  if (channel.kind !== "whatsapp" && channel.kind !== "instagram") return "Expected a Meta customer channel.";
  if (channel.status !== "active") return "Channel must be active in the isolated test database.";
  if (hadLegacyPlaintext) return "Channel still contains plaintext secrets.";
  if (!channel.encrypted_credentials || !channel.credentials_encryption_nonce ||
      !channel.credentials_encryption_tag) return "Encrypted channel credentials are missing.";
  if (channel.kind === "whatsapp" && !isSupportedMetaGraphVersion(whatsAppGraphVersion())) {
    return "WhatsApp Graph version is unsupported.";
  }
  if (channel.kind === "instagram" && !isSupportedMetaGraphVersion(metaGraphVersion())) {
    return "Instagram Graph version is unsupported.";
  }
  return validateChannelHealthConfig(channel);
}
