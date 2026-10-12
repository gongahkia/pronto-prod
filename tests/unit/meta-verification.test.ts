import { afterEach, describe, expect, it, vi } from "vitest";
import { metaReadAuthorized, metaSandboxChannelIssue } from "@/lib/channels/meta-verification";
import type { Channel } from "@/lib/types";

const channel: Channel = { id: "channel-a", client_id: "tenant-a", kind: "whatsapp",
  name: "Test WhatsApp", status: "active", external_id: "phone-a",
  credentials: { accessToken: "fixture-token", appSecret: "fixture-secret", phoneNumberId: "phone-a" },
  encrypted_credentials: "fixture-encrypted", credentials_encryption_nonce: "fixture-nonce",
  credentials_encryption_tag: "fixture-tag", settings: { verifyToken: "fixture-verify" },
  last_health_check_at: null, last_health_status: null, last_health_error: null,
  last_outbound_at: null, last_outbound_error: null };

describe("isolated Meta verification gate", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("requires both explicit test-account and read approval flags", () => {
    expect(metaReadAuthorized({})).toBe(false);
    expect(metaReadAuthorized({ PRONTO_META_TEST_ACCOUNT: "1" })).toBe(false);
    expect(metaReadAuthorized({ PRONTO_META_TEST_ACCOUNT: "1",
      PRONTO_META_READ_APPROVED: "1" })).toBe(true);
    expect(metaReadAuthorized({ PRONTO_META_TEST_ACCOUNT: "1",
      PRONTO_META_READ_APPROVED: "1", PRONTO_SKIP_LIVE_HEALTH: "1" })).toBe(false);
  });
  it("requires an active, encrypted, configured Meta channel", () => {
    expect(metaSandboxChannelIssue(channel)).toBeNull();
    expect(metaSandboxChannelIssue(channel, true)).toMatch(/plaintext/);
    expect(metaSandboxChannelIssue({ ...channel, status: "draft" })).toMatch(/active/);
    expect(metaSandboxChannelIssue({ ...channel, encrypted_credentials: null })).toMatch(/Encrypted/);
    expect(metaSandboxChannelIssue({ ...channel, credentials: {} })).toMatch(/token/);
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v20.0");
    expect(metaSandboxChannelIssue(channel)).toMatch(/version/);
  });
});
