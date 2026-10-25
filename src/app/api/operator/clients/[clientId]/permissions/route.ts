import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { isStaffCapability, setStaffCapability } from "@/lib/staff-permissions";

export async function POST(request: Request, context: { params: Promise<{ clientId: string }> }) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const { clientId } = await context.params;
  const form = await request.formData();
  const capability = String(form.get("capability") ?? "");
  if (!isStaffCapability(capability)) return NextResponse.json({ error: "Invalid capability." }, { status: 400 });
  try {
    await setStaffCapability({ actor, clientId, userId: String(form.get("userId") ?? ""),
      capability, granted: form.get("action") === "grant", evidence: String(form.get("evidence") ?? "") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Permission update failed." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, clientId });
}
