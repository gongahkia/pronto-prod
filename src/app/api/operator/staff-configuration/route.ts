import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { saveEscalationPolicy, saveStaffDestination, type EscalationPolicy } from "@/lib/staff-configuration";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  try {
    if (form.get("action") === "destination") {
      const kind = String(form.get("kind") ?? "");
      const audience = String(form.get("audience") ?? "");
      if (!(["email", "whatsapp", "telegram"] as string[]).includes(kind) ||
          !(["business", "operator"] as string[]).includes(audience))
        return NextResponse.json({ error: "Invalid destination type." }, { status: 400 });
      await saveStaffDestination({ actor, clientId, id: String(form.get("id") ?? "") || undefined,
        kind: kind as "email" | "whatsapp" | "telegram", audience: audience as "business" | "operator",
        destination: String(form.get("destination") ?? ""),
        recipientUserId: String(form.get("recipientUserId") ?? "") || null,
        verified: form.get("verified") === "yes", enabled: form.get("enabled") === "yes",
        verificationEvidence: String(form.get("verificationEvidence") ?? "") });
    } else if (form.get("action") === "policy") {
      let policy: EscalationPolicy;
      try { policy = JSON.parse(String(form.get("policy") ?? "")) as EscalationPolicy; }
      catch { return NextResponse.json({ error: "Valid policy JSON is required." }, { status: 400 }); }
      await saveEscalationPolicy({ actor, clientId,
        expectedVersion: Number(form.get("expectedVersion")), policy });
    } else return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Configuration failed." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, clientId });
}
