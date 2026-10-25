import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http/csrf";
import { retryStaffNotification } from "@/lib/staff-notifications";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const actor = await requireUser("operator");
  const { jobId } = await context.params;
  const form = await request.formData();
  try { await retryStaffNotification({ clientId: String(form.get("clientId") ?? ""), jobId,
    actorUserId: actor.userId, reconciliation: String(form.get("reconciliation") ?? "") }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Retry failed." }, { status: 409 }); }
  return NextResponse.json({ ok: true });
}
