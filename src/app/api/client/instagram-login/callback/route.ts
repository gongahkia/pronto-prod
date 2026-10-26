import { publicAppUrl } from "@/lib/http/redirect";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { saveChannelDraft } from "@/lib/client-channel-drafts";
import { exchangeInstagramLoginCode, instagramLoginConfig,
  verifyInstagramLoginState } from "@/lib/channels/instagram-login";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = instagramLoginConfig();
  const secret = process.env.AUTH_SECRET;
  const cookieNonce = /(?:^|;\s*)pronto_instagram_oauth_nonce=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
  const state = config && secret && secret.length >= 32 ? verifyInstagramLoginState(
    url.searchParams.get("state") ?? "", cookieNonce, secret) : null;
  const user = await getSessionUser();
  const response = (status: number, message: string) => NextResponse.json({ error: message }, { status });
  if (!state || !user || user.role !== "client" || user.userId !== state.userId ||
      user.clientId !== state.clientId) return response(403, "Instagram Login state or session mismatch.");
  const code = url.searchParams.get("code");
  if (!code || !config) return response(400, "Instagram Login did not return an authorization code.");
  const channel = await query<{ external_id: string | null }>(
    "select external_id from channels where id = $1 and client_id = $2 and kind = 'instagram'",
    [state.channelId, state.clientId]);
  if (!channel.rows[0]) return response(404, "Instagram channel not found.");
  try {
    const token = await exchangeInstagramLoginCode(code, config);
    if (channel.rows[0].external_id && channel.rows[0].external_id !== token.igUserId)
      return response(403, "Instagram account does not match the configured channel.");
    await saveChannelDraft({ clientId: state.clientId, channelId: state.channelId,
      actorUserId: user.userId, status: "draft", externalId: token.igUserId,
      values: { "settings.authMode": "instagram_login", "credentials.instagramAccessToken": token.accessToken,
        "credentials.igUserId": token.igUserId, "credentials.tokenExpiresAt": token.tokenExpiresAt } });
    const result = NextResponse.redirect(publicAppUrl(`/client/knowledge/channels?channel=${encodeURIComponent(state.channelId)}&saved=1`, request.url), 303);
    result.cookies.set("pronto_instagram_oauth_nonce", "", { maxAge: 0, path: "/api/client/instagram-login/callback" });
    return result;
  } catch {
    return response(502, "Instagram Login could not verify the account or token.");
  }
}
