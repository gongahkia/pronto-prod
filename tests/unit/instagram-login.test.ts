import { describe, expect, it, vi } from "vitest";
import { createInstagramLoginState, exchangeInstagramLoginCode,
  instagramLoginAuthorizationUrl, verifyInstagramLoginState } from "@/lib/channels/instagram-login";

const secret = "instagram-oauth-test-secret-at-least-32-characters";
const config = { clientId: "ig-client", clientSecret: "secret", redirectUri: "http://localhost/callback" };

describe("Instagram Login without a linked Facebook Page", () => {
  it("uses current business scopes and rejects mismatched or expired CSRF state", () => {
    const created = createInstagramLoginState({ clientId: "tenant", channelId: "channel", userId: "user" }, secret, 1000);
    const url = new URL(instagramLoginAuthorizationUrl(config, created.state));
    expect(url.hostname).toBe("www.instagram.com");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages");
    expect(verifyInstagramLoginState(created.state, created.nonce, secret, 1001)).toMatchObject({ clientId: "tenant" });
    expect(verifyInstagramLoginState(created.state, "wrong", secret, 1001)).toBeNull();
    expect(verifyInstagramLoginState(created.state, created.nonce, secret, 601001)).toBeNull();
    expect(verifyInstagramLoginState(created.state, created.nonce, "wrong", 1001)).toBeNull();
  });

  it("checks the returned professional identity and expiry before accepting a token", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short", user_id: "ig-1" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "long", expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "ig-1", account_type: "BUSINESS" })));
    const result = await exchangeInstagramLoginCode("code", config, fetchFn);
    expect(result).toMatchObject({ accessToken: "long", igUserId: "ig-1", accountType: "BUSINESS" });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(String(fetchFn.mock.calls[2][0])).toContain("graph.instagram.com");
  });

  it("rejects revoked tokens, consumer accounts, and wrong account IDs", async () => {
    const revoked = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(exchangeInstagramLoginCode("code", config, revoked)).rejects.toThrow("rejected");
    const mismatch = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short", user_id: "ig-1" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "long", expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "ig-2", account_type: "PERSONAL" })));
    await expect(exchangeInstagramLoginCode("code", config, mismatch)).rejects.toThrow("professional account");
  });
});
