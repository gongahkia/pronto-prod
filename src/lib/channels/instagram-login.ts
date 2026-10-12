import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appBaseUrl, metaGraphVersion } from "@/lib/env";

export const INSTAGRAM_LOGIN_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"] as const;
export type InstagramLoginState = { clientId: string; channelId: string; userId: string;
  nonce: string; expiresAt: number };

export function instagramLoginConfig(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  if (process.env.PRONTO_INSTAGRAM_LOGIN_ENABLED !== "1") return null;
  const clientId = process.env.INSTAGRAM_LOGIN_CLIENT_ID;
  const clientSecret = process.env.INSTAGRAM_LOGIN_CLIENT_SECRET;
  const redirectUri = process.env.INSTAGRAM_LOGIN_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri ||
      redirectUri !== `${appBaseUrl()}/api/client/instagram-login/callback`) return null;
  return { clientId, clientSecret, redirectUri };
}

export function createInstagramLoginState(input: Omit<InstagramLoginState, "nonce" | "expiresAt">,
  secret: string, now = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(24).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...input, nonce, expiresAt: now + 10 * 60_000 })).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return { state: `${body}.${mac}`, nonce };
}

export function verifyInstagramLoginState(state: string, cookieNonce: string | undefined,
  secret: string, now = Date.now()): InstagramLoginState | null {
  const [body, signature] = state.split(".");
  if (!body || !signature || !cookieNonce) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as InstagramLoginState;
    return parsed.nonce === cookieNonce && parsed.expiresAt > now &&
      typeof parsed.clientId === "string" && typeof parsed.channelId === "string" &&
      typeof parsed.userId === "string" ? parsed : null;
  } catch { return null; }
}

export function instagramLoginAuthorizationUrl(config: { clientId: string; redirectUri: string },
  state: string): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_LOGIN_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeInstagramLoginCode(code: string, config: {
  clientId: string; clientSecret: string; redirectUri: string }, fetchFn = fetch): Promise<{
  accessToken: string; igUserId: string; tokenExpiresAt: string; accountType: string;
}> {
  const params = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
    grant_type: "authorization_code", redirect_uri: config.redirectUri, code });
  const exchange = await oauthFetch("https://api.instagram.com/oauth/access_token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params,
  }, fetchFn);
  if (!exchange.ok) throw new Error("Instagram Login code exchange was rejected.");
  const short = await exchange.json() as { access_token?: unknown; user_id?: unknown };
  if (typeof short.access_token !== "string" || !short.access_token ||
      !["string", "number"].includes(typeof short.user_id)) throw new Error("Instagram Login returned an invalid token response.");
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", config.clientSecret);
  longUrl.searchParams.set("access_token", short.access_token);
  const long = await oauthFetch(longUrl.toString(), {}, fetchFn);
  if (!long.ok) throw new Error("Instagram Login long-lived token exchange was rejected.");
  const token = await long.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof token.access_token !== "string" || typeof token.expires_in !== "number" || token.expires_in <= 0)
    throw new Error("Instagram Login token expiry could not be verified.");
  const profile = await oauthFetch(`https://graph.instagram.com/${metaGraphVersion()}/me?fields=id,account_type`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }, fetchFn);
  if (!profile.ok) throw new Error("Instagram Login account identity check failed.");
  const identity = await profile.json() as { id?: unknown; account_type?: unknown };
  if (String(identity.id) !== String(short.user_id) ||
      !["BUSINESS", "CREATOR", "MEDIA_CREATOR"].includes(String(identity.account_type)))
    throw new Error("Instagram Login token is not owned by the expected professional account.");
  return { accessToken: token.access_token, igUserId: String(short.user_id),
    tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    accountType: String(identity.account_type) };
}

async function oauthFetch(url: string, init: RequestInit, fetchFn: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try { return await fetchFn(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
