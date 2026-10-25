import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { changeOnboardingStage, isOnboardingStage } from "@/lib/onboarding";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const stage = String(form.get("stage") ?? "");
  const action = String(form.get("action") ?? "");
  if (!isOnboardingStage(stage) || !["save", "submit", "activate"].includes(action))
    return NextResponse.json({ error: "Invalid onboarding action." }, { status: 400 });
  const details = Object.fromEntries([...form.entries()].filter(([key]) => key.startsWith("detail."))
    .map(([key, value]) => [key.slice(7), String(value).trim()]));
  const evidence = Object.fromEntries([...form.entries()].filter(([key]) => key.startsWith("evidence."))
    .map(([key, value]) => [key.slice(9), String(value).trim()]));
  try {
    await changeOnboardingStage({ actor, clientId, stage,
      action: action as "save" | "submit" | "activate",
      expectedRevision: Number(form.get("revision")),
      details, evidence,
      blockers: String(form.get("blockers") ?? "").split("\n").map((item) => item.trim()).filter(Boolean),
      notApplicableReason: String(form.get("notApplicableReason") ?? "").trim() || null,
      responsibleUserId: String(form.get("responsibleUserId") ?? "").trim() || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Onboarding update failed." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, clientId });
}
