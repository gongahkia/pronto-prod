import { publicAppUrl } from "@/lib/http/redirect";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkChannelDraft, publishChannelDraft, saveChannelDraft } from "@/lib/client-channel-drafts";
import { assertSameOrigin } from "@/lib/http/csrf";
import type { ChannelStatus } from "@/lib/types";

export async function POST(request: Request, context: { params: Promise<{ channelId: string }> }) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const user = await requireUser("client");
  if (!user.clientId) return NextResponse.json({ error: "Client workspace missing." }, { status: 400 });
  const { channelId } = await context.params;
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const back = `/client/assistant/channels?channel=${encodeURIComponent(channelId)}`;
  try {
    if (action === "save") {
      const status = String(form.get("status") ?? "draft") as ChannelStatus;
      if (!["draft", "active", "disabled"].includes(status)) throw new Error("Invalid channel status.");
      const values = Object.fromEntries(
        [...form.entries()].filter(([key]) => key.startsWith("settings.") || key.startsWith("credentials."))
          .map(([key, value]) => [key, String(value)]),
      );
      await saveChannelDraft({
        clientId: user.clientId, channelId, actorUserId: user.userId, status,
        externalId: String(form.get("externalId") ?? "").trim() || null,
        values,
      });
      return NextResponse.redirect(publicAppUrl(`${back}&saved=1`, request.url), 303);
    }
    if (action === "check") {
      const result = await checkChannelDraft(user.clientId, channelId);
      return NextResponse.redirect(publicAppUrl(`${back}&checked=${result.status}`, request.url), 303);
    }
    if (action === "publish") {
      await publishChannelDraft({ clientId: user.clientId, channelId, actorUserId: user.userId });
      return NextResponse.redirect(publicAppUrl(`${back}&published=1`, request.url), 303);
    }
    throw new Error("Unsupported channel action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Channel action failed.";
    return NextResponse.redirect(publicAppUrl(`${back}&error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
