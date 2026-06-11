import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { updateClientLaunchAndCommercial } from "@/lib/pilot-metrics";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const returnTo = safeOperatorReturnPath(
    String(form.get("returnTo") ?? ""),
    clientId ? `/operator/clients/${clientId}` : "/operator",
  );

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  await updateClientLaunchAndCommercial({
    clientId,
    signedContractAt: dateOrNull(form.get("signedContractAt")),
    targetLiveAt: dateOrNull(form.get("targetLiveAt")),
    productionLiveAt: dateOrNull(form.get("productionLiveAt")),
    launchNotes: String(form.get("launchNotes") ?? "").trim() || null,
    monthlyRetainerSgd: numberField(form, "monthlyRetainerSgd", 1200),
    setupFeeSgd: numberField(form, "setupFeeSgd", 2500),
    amortizedSetupMonths: integerField(form, "amortizedSetupMonths", 6),
    hostingCostSgd: numberField(form, "hostingCostSgd", 80),
    integrationCostSgd: numberField(form, "integrationCostSgd", 150),
    includedConversations: integerField(form, "includedConversations", 500),
    llmCostBufferMultiplier: numberField(form, "llmCostBufferMultiplier", 2),
    actorUserId: user.userId,
  });

  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

function dateOrNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function numberField(form: FormData, name: string, fallback: number): number {
  const parsed = Number(String(form.get(name) ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function integerField(form: FormData, name: string, fallback: number): number {
  return Math.max(1, Math.floor(numberField(form, name, fallback)));
}

function safeOperatorReturnPath(value: string, fallback: string): string {
  return value.startsWith("/operator") && !value.startsWith("//") ? value : fallback;
}
