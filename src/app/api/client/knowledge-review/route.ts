import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { suggestAnswerForReviewItem } from "@/lib/knowledge/review-items";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Business assignment required." }, { status: 403 });
  const form = await request.formData();
  try {
    await suggestAnswerForReviewItem({ actor, clientId: actor.clientId,
      reviewItemId: String(form.get("reviewItemId") ?? ""), title: String(form.get("title") ?? ""),
      content: String(form.get("content") ?? ""), reason: String(form.get("reason") ?? ""),
      sourceReference: String(form.get("sourceReference") ?? "") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit review." }, { status: 400 });
  }
  return NextResponse.redirect(new URL("/client/knowledge", request.url), 303);
}
