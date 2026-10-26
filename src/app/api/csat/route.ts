import { publicAppUrl } from "@/lib/http/redirect";
import { NextResponse } from "next/server";
import { recordCsatResponse } from "@/lib/csat";
import { assertSameOrigin } from "@/lib/http/csrf";
import { logWarn } from "@/lib/logger";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "");
  const messageId = String(form.get("messageId") ?? "");
  const score = Number(String(form.get("score") ?? ""));
  const comment = String(form.get("comment") ?? "").trim();

  if (!conversationId || !Number.isInteger(score) || score < 1 || score > 5) {
    logWarn("csat.invalid_submission", {
      conversationId: conversationId || null,
      score,
    });
    return NextResponse.json(
      { error: "conversationId and a score from 1 to 5 are required." },
      { status: 400 },
    );
  }

  const recorded = await recordCsatResponse({
    conversationId,
    messageId: messageId || null,
    score,
    comment,
  });
  if (!recorded) {
    logWarn("csat.conversation_not_found", {
      conversationId,
      messageId: messageId || null,
    });
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.redirect(
    publicAppUrl(`/csat/${conversationId}?submitted=1`, request.url),
    303,
  );
}
