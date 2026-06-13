import { NextResponse } from "next/server";
import { recordCsatResponse } from "@/lib/csat";
import { assertSameOrigin } from "@/lib/http/csrf";
import { checkRateLimit } from "@/lib/http-limits";
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

  const rateLimit = await checkRateLimit(
    `csat:${conversationId}:${clientIpKey(request)}`,
    10,
    60 * 60 * 1000,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many CSAT submissions. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
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
    new URL(`/csat/${conversationId}?submitted=1`, request.url),
    303,
  );
}

function clientIpKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
