import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { getEscalationPolicy, saveEscalationPolicy } from "@/lib/staff-configuration";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Client assignment required." }, { status: 403 });
  const form = await request.formData();
  const existing = await getEscalationPolicy(actor.clientId);
  const target = String(form.get("targetMinutes") ?? "").trim();
  const timezone = String(form.get("timezone") ?? "").trim();
  try {
    await saveEscalationPolicy({ actor, clientId: actor.clientId,
      expectedVersion: Number(form.get("expectedVersion")),
      policy: { targetMinutes: target ? Number(target) : null, timezone,
        staffedHours: existing?.policy.staffedHours ?? {},
        initialDestinationId: existing?.policy.initialDestinationId ?? null,
        reminderMinutes: existing?.policy.reminderMinutes ?? [],
        backupDestinationId: existing?.policy.backupDestinationId ?? null,
        outOfHoursAcknowledgement: existing?.policy.outOfHoursAcknowledgement ?? null } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Policy update failed." }, { status: 409 });
  }
  return NextResponse.redirect(new URL("/client/settings", request.url), 303);
}
