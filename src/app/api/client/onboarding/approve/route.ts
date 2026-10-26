import { publicAppUrl } from "@/lib/http/redirect";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { changeOnboardingStage, isOnboardingStage } from "@/lib/onboarding";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Client assignment required." }, { status: 403 });
  const form = await request.formData();
  const stage = String(form.get("stage") ?? "");
  if (!isOnboardingStage(stage)) return NextResponse.json({ error: "Invalid stage." }, { status: 400 });
  try {
    await changeOnboardingStage({ actor, clientId: actor.clientId, stage, action: "approve",
      expectedRevision: Number(form.get("revision")) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval failed." }, { status: 409 });
  }
  return NextResponse.redirect(publicAppUrl("/client/approvals", request.url), 303);
}
