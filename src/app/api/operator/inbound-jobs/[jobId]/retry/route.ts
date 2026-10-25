import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { transaction } from "@/lib/db";
import { assertSameOrigin } from "@/lib/http/csrf";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const user = await requireUser("operator");
  const { jobId } = await context.params;
  const form = await request.formData();
  const clientId = String(form.get("clientId") ?? "");
  const outcome = await transaction(async (db) => {
    const job = await db.query<{ id: string }>(
      "select id from inbound_jobs where id = $1 and client_id = $2 and status = 'dead' for update",
      [jobId, clientId],
    );
    if (!job.rows[0]) return false;
    await db.query(
      `update inbound_jobs set status = 'pending', attempt_count = 0, available_at = now(),
       lease_expires_at = null, updated_at = now() where id = $1 and client_id = $2`,
      [jobId, clientId],
    );
    await recordAuditLog({ clientId, actorUserId: user.userId,
      action: "inbound_job.manual_retry", targetType: "inbound_job", targetId: jobId,
      metadata: {} }, db);
    return true;
  });
  if (!outcome) return NextResponse.json({ error: "Dead inbound job not found." }, { status: 404 });
  return NextResponse.json({ ok: true, clientId });
}
