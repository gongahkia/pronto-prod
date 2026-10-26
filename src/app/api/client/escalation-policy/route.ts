import { publicAppUrl } from "@/lib/http/redirect";
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
    const staffedHours = { ...(existing?.policy.staffedHours ?? {}) };
    if (form.has("staffedHoursProvided")) {
      for (let day = 0; day < 7; day += 1) {
        const start = String(form.get(`${day}.start`) ?? "").trim();
        const end = String(form.get(`${day}.end`) ?? "").trim();
        if (Boolean(start) !== Boolean(end)) throw new Error("Set both start and end for staffed days.");
        if (start && end) staffedHours[String(day)] = { start, end };
        else delete staffedHours[String(day)];
      }
    }
    const reminderMinutes = form.has("reminderMinutes")
      ? String(form.get("reminderMinutes") ?? "").split(",").map((item) => item.trim()).filter(Boolean).map(Number)
      : existing?.policy.reminderMinutes ?? [];
    await saveEscalationPolicy({ actor, clientId: actor.clientId,
      expectedVersion: Number(form.get("expectedVersion")),
      policy: { targetMinutes: target ? Number(target) : null, timezone,
        staffedHours,
        initialDestinationId: form.has("initialDestinationId") ? String(form.get("initialDestinationId") ?? "") || null : existing?.policy.initialDestinationId ?? null,
        reminderMinutes,
        backupDestinationId: form.has("backupDestinationId") ? String(form.get("backupDestinationId") ?? "") || null : existing?.policy.backupDestinationId ?? null,
        outOfHoursAcknowledgement: form.has("outOfHoursAcknowledgement") ? String(form.get("outOfHoursAcknowledgement") ?? "").trim() || null
          : existing?.policy.outOfHoursAcknowledgement ?? null } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Policy update failed." }, { status: 409 });
  }
  return NextResponse.redirect(publicAppUrl("/client/settings", request.url), 303);
}
