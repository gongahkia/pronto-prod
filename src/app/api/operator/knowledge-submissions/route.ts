import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { stageApprovedSourceSubmission } from "@/lib/knowledge/submissions";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const submissionId = String(form.get("submissionId") ?? "");
  const revision = Number(form.get("revision"));
  if (!clientId || !submissionId || !Number.isInteger(revision) || revision < 1)
    return NextResponse.json({ error: "Invalid source review request." }, { status: 400 });
  try {
    await stageApprovedSourceSubmission({ actor, clientId, submissionId, expectedRevision: revision });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not stage source." }, { status: 400 });
  }
  return NextResponse.redirect(new URL(`/operator/clients/${clientId}/knowledge`, request.url), 303);
}
