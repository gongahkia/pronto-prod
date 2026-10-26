import { publicAppUrl } from "@/lib/http/redirect";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { isStaffCapability, setStaffCapability } from "@/lib/staff-permissions";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("client");
  if (!actor.clientId) return NextResponse.json({ error: "Client assignment required." }, { status: 403 });
  const form = await request.formData();
  const capability = String(form.get("capability") ?? "");
  const action = String(form.get("action") ?? "");
  if (!isStaffCapability(capability) || !["grant", "revoke"].includes(action))
    return NextResponse.json({ error: "Invalid permission action." }, { status: 400 });
  try {
    await setStaffCapability({ actor, clientId: actor.clientId,
      userId: String(form.get("userId") ?? ""), capability,
      granted: action === "grant", evidence: String(form.get("evidence") ?? "") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Permission change failed." }, { status: 403 });
  }
  return NextResponse.redirect(publicAppUrl("/client/settings", request.url), 303);
}
