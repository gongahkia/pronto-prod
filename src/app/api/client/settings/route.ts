import { publicAppUrl } from "@/lib/http/redirect";
import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { saveStaffDestination } from "@/lib/staff-configuration";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Client assignment required." }, { status: 403 });
  const form = await request.formData();
  const action = String(form.get("action") ?? "location");
  if (action === "staff_destination") {
    const kind = String(form.get("kind") ?? "");
    if (!(["email", "whatsapp", "telegram"] as string[]).includes(kind))
      return NextResponse.json({ error: "Invalid staff channel." }, { status: 400 });
    try {
      await saveStaffDestination({ actor, clientId: actor.clientId,
        kind: kind as "email" | "whatsapp" | "telegram",
        destination: String(form.get("destination") ?? ""), audience: "business",
        verified: false, enabled: false });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save destination." }, { status: 403 });
    }
  } else if (action === "location") {
    return NextResponse.json({ error: "Suggest a business knowledge correction for Pronto review." }, { status: 403 });
  } else return NextResponse.json({ error: "Unsupported settings action." }, { status: 400 });
  return NextResponse.redirect(publicAppUrl("/client", request.url), 303);
}
