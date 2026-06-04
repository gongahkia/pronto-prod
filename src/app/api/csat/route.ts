import { NextResponse } from "next/server";
import { recordCsatResponse } from "@/lib/csat";

export async function POST(request: Request) {
  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "");
  const messageId = String(form.get("messageId") ?? "");
  const score = Number(String(form.get("score") ?? ""));
  const comment = String(form.get("comment") ?? "").trim();

  if (!conversationId || !Number.isInteger(score) || score < 1 || score > 5) {
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
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.redirect(
    new URL(`/csat/${conversationId}?submitted=1`, request.url),
    303,
  );
}
