import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin } from "@/lib/http/csrf";
import { createInstagramLoginState, instagramLoginAuthorizationUrl,
  instagramLoginConfig } from "@/lib/channels/instagram-login";

export async function POST(request: Request, context: { params: Promise<{ channelId: string }> }) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const user = await requireUser("client");
  const config = instagramLoginConfig();
  if (!config || !user.clientId) return NextResponse.json({ error: "Instagram Login is not configured." }, { status: 503 });
  const { channelId } = await context.params;
  const channel = await query("select id from channels where id = $1 and client_id = $2 and kind = 'instagram'",
    [channelId, user.clientId]);
  if (!channel.rows[0]) return NextResponse.json({ error: "Instagram channel not found." }, { status: 404 });
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: "OAuth state signing is not configured." }, { status: 503 });
  const { state, nonce } = createInstagramLoginState({ clientId: user.clientId,
    channelId, userId: user.userId }, secret);
  const response = NextResponse.redirect(instagramLoginAuthorizationUrl(config, state), 303);
  response.cookies.set("pronto_instagram_oauth_nonce", nonce, { httpOnly: true, sameSite: "lax",
    secure: new URL(request.url).protocol === "https:", maxAge: 600, path: "/api/client/instagram-login/callback" });
  return response;
}
