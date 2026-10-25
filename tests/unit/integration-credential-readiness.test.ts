import { afterEach, describe, expect, it, vi } from "vitest";
import { integrationCredentialEncryptionConfigured } from "@/lib/integrations/credentials";
import { credentialEncryptionConfigured } from "@/lib/llm/credentials";

afterEach(() => vi.unstubAllEnvs());
describe("independent integration encryption readiness", () => {
  it("rejects absent and insecure key material", () => {
    for (const value of ["", "short", "change-me"]) {
      vi.stubEnv("PRONTO_SECRETS_KEY", value);
      expect(integrationCredentialEncryptionConfigured()).toBe(false);
    }
  });
  it("recognizes the existing encrypted integration store while keeping LLM storage disabled", () => {
    vi.stubEnv("PRONTO_SECRETS_KEY", "synthetic-integration-encryption-test-key-32-plus");
    expect(integrationCredentialEncryptionConfigured()).toBe(true);
    expect(credentialEncryptionConfigured()).toBe(false);
  });
});
